/**
 * O DEPLOY AUTOMÁTICO SÓ LEVA À PRODUÇÃO O QUE AS QUATRO VERIFICAÇÕES APROVARAM.
 *
 * Três peças, e este arquivo vigia a junção delas:
 *
 *   scripts/deploy/pode-implantar.mjs  — a regra (implantar / esperar / pular)
 *   .github/workflows/deploy.yml       — quem acorda a regra e chama a VPS
 *   .github/workflows/publish-image.yml — quem publica a imagem `sha-<commit>`
 *                                          que a VPS puxa
 *
 * A junção é onde isto quebra em silêncio. Se um workflow for renomeado, o
 * `workflow_run` deixa de acordar o deploy e a regra espera para sempre uma
 * verificação que não existe mais — nada fica vermelho, a produção só para de
 * andar. Se a etiqueta `sha-` sair da publicação, toda VPS recusa o deploy
 * ("imagem não publicada"). Os dois casos são cobertos aqui com controle
 * positivo: o nome tem de existir como `name:` de um workflow de verdade.
 *
 * O lado da VPS (porta.sh e as funções puras de implantar.sh) é provado em
 * tests/shell/deploy.test.sh.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VERIFICACOES_EXIGIDAS, decidir } from "../../scripts/deploy/pode-implantar.mjs";

const SHA = "a".repeat(40);
const OUTRO = "b".repeat(40);
const DIR = join(process.cwd(), ".github/workflows");
const ler = (arq: string) => readFileSync(join(DIR, arq), "utf8");

type Execucao = {
  id: number;
  name: string;
  event: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
};

let proximoId = 1;
const exec = (name: string, conclusion: string | null, extra: Partial<Execucao> = {}): Execucao => ({
  id: proximoId++,
  name,
  event: "push",
  head_sha: SHA,
  status: conclusion === null ? "in_progress" : "completed",
  conclusion,
  ...extra,
});
const todasVerdes = () => VERIFICACOES_EXIGIDAS.map((n) => exec(n, "success"));

describe("pode-implantar: a regra", () => {
  it("as quatro verdes → implantar", () => {
    expect(decidir({ sha: SHA, execucoes: todasVerdes() }).veredito).toBe("implantar");
  });

  it("uma ainda rodando → esperar (e diz qual)", () => {
    const execucoes = [...todasVerdes().slice(1), exec(VERIFICACOES_EXIGIDAS[0]!, null)];
    const r = decidir({ sha: SHA, execucoes });
    expect(r.veredito).toBe("esperar");
    expect(r.motivo).toContain(VERIFICACOES_EXIGIDAS[0]);
  });

  it("uma que nem começou → esperar, nunca implantar", () => {
    expect(decidir({ sha: SHA, execucoes: todasVerdes().slice(1) }).veredito).toBe("esperar");
  });

  it.each(["failure", "cancelled", "timed_out", "skipped", "neutral", "action_required"])(
    "uma terminada em '%s' → pular (a produção fica onde está)",
    (conclusao) => {
      const execucoes = [...todasVerdes().slice(1), exec("e2e", conclusao)].filter(
        (e, i, a) => !(e.name === "e2e" && a.findLastIndex((x) => x.name === "e2e") !== i),
      );
      expect(decidir({ sha: SHA, execucoes }).veredito).toBe("pular");
    },
  );

  it("a re-execução mais nova vence: falhou e depois passou → implantar", () => {
    const execucoes = [exec("ci", "failure"), ...todasVerdes()];
    expect(decidir({ sha: SHA, execucoes }).veredito).toBe("implantar");
  });

  it("a re-execução mais nova vence: passou e está rodando de novo → esperar", () => {
    const execucoes = [...todasVerdes(), exec("ci", null)];
    expect(decidir({ sha: SHA, execucoes }).veredito).toBe("esperar");
  });

  it("verificação de PR, ou de outro commit, não conta", () => {
    const execucoes = [
      ...todasVerdes().filter((e) => e.name !== "e2e"),
      exec("e2e", "success", { event: "pull_request" }),
      exec("e2e", "success", { head_sha: OUTRO }),
    ];
    expect(decidir({ sha: SHA, execucoes }).veredito).toBe("esperar");
  });

  it("SHA que não é de 40 hex é recusado antes de qualquer decisão", () => {
    expect(() => decidir({ sha: "d3c0ddd", execucoes: todasVerdes() })).toThrow(/SHA inválido/);
  });
});

describe("deploy.yml ↔ a regra ↔ os workflows de verdade", () => {
  const deploy = ler("deploy.yml");

  it("as verificações exigidas são as quatro que hoje rodam no push da main", () => {
    expect([...VERIFICACOES_EXIGIDAS].sort()).toEqual(
      ["Publicar imagem Docker (GHCR)", "ci", "e2e", "perf"].sort(),
    );
  });

  it("cada verificação exigida é o `name:` de um workflow que existe (controle positivo)", () => {
    const nomes = readdirSync(DIR)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => ler(f).match(/^name:\s*(.+?)\s*$/m)?.[1]?.replace(/^["']|["']$/g, ""));
    for (const n of VERIFICACOES_EXIGIDAS) expect(nomes).toContain(n);
  });

  it("o workflow_run acorda o deploy exatamente pelas verificações exigidas", () => {
    const linha = deploy.match(/^ {4}workflows:\s*(\[.*\])\s*$/m)?.[1];
    expect(linha).toBeDefined();
    expect(JSON.parse(linha!).sort()).toEqual([...VERIFICACOES_EXIGIDAS].sort());
    expect(deploy).toMatch(/^ {4}branches:\s*\[main\]\s*$/m);
  });

  it("um deploy por vez e nunca cancelado no meio", () => {
    expect(deploy).toMatch(/^ {6}group: deploy-producao$/m);
    expect(deploy).toMatch(/^ {6}cancel-in-progress: false$/m);
  });

  it("o SSH confere a chave do host — nunca aceita host desconhecido", () => {
    expect(deploy).toContain("StrictHostKeyChecking=yes");
    expect(deploy).not.toMatch(/StrictHostKeyChecking=(no|accept-new)/);
    expect(deploy).toContain('UserKnownHostsFile="$HOME/.ssh/known_hosts_deploy"');
  });

  it("a chave privada só entra por env do passo e é apagada depois do uso", () => {
    expect(deploy).toMatch(/^ {10}SSH_KEY: \$\{\{ secrets\.DEPLOY_SSH_KEY \}\}$/m);
    // Interpolar o segredo dentro do `run:` o poria no script gerado do runner.
    const corposRun = deploy.split(/\n {8}run: \|\n/).slice(1).join("\n");
    expect(corposRun).not.toContain("secrets.DEPLOY_SSH_KEY");
    expect(deploy).toContain('rm -f "$HOME/.ssh/deploy"');
  });

  it("a VPS recebe o sha decidido pela regra, não o do evento", () => {
    expect(deploy).toContain("SHA: ${{ steps.gate.outputs.sha }}");
    expect(deploy).not.toContain("workflow_run.head_sha");
  });

  it("o comando enviado é exatamente o que a porta aceita", () => {
    expect(deploy).toContain('"zapsales-deploy@${HOST}" "implantar ${SHA}"');
    const porta = readFileSync(join(process.cwd(), "kit/deploy/porta.sh"), "utf8");
    expect(porta).toContain('"implantar "*) sha="${pedido#implantar }"');
  });
});

describe("publish-image.yml publica a etiqueta imutável que a VPS puxa", () => {
  const publicar = ler("publish-image.yml");
  const linhaSha =
    "type=sha,format=long,enable=${{ github.ref_type == 'branch' && github.ref_name == 'main' }}";

  it("`sha-<commit>` sai nos builds por arquitetura E na junção dos manifestos", () => {
    const ocorrencias = publicar.split("\n").filter((l) => l.trim() === linhaSha);
    expect(ocorrencias).toHaveLength(2);
  });

  it("o implantar.sh puxa por essa etiqueta e confere a revisão gravada na imagem", () => {
    const implantar = readFileSync(join(process.cwd(), "kit/deploy/implantar.sh"), "utf8");
    expect(implantar).toContain('ref="$REGISTRO/$img:sha-$SHA"');
    expect(implantar).toContain("org.opencontainers.image.revision");
  });
});
