/**
 * TODA AÇÃO DE TERCEIROS ENTRA FIXADA PELO HASH DO COMMIT — COM A VERSÃO AO LADO.
 *
 * ## Por que este arquivo existe (issue #39)
 *
 * Uma etiqueta como `actions/checkout@v7` é um ponteiro que quem controla o
 * repositório da ação pode mover para qualquer commit, a qualquer hora, sem PR
 * nenhum deste lado. Ação comprometida já aconteceu (`tj-actions/changed-files`,
 * 2025). Aqui ela rodaria em jobs que têm `DEPLOY_SSH_KEY` (que chega à VPS da
 * produção), o token de publicação no GHCR e um token de GitHub App.
 *
 * Fixar pelo hash de 40 caracteres torna imutável o código executado. O
 * comentário `# vN.M.P` ao lado não é enfeite: é o que o Dependabot lê para
 * continuar propondo atualizações (ele reescreve hash E comentário juntos).
 *
 * Em 07/10/2026, 0 das 38 referências remotas estavam fixadas. O conserto sem esta cerca
 * dura até o próximo workflow: quem copia um exemplo da documentação de uma ação
 * copia `@v4`.
 *
 * ## O que fica de fora
 *
 * - ação local (`./.github/actions/...`): é código deste repositório, revisado
 *   no mesmo PR;
 * - `docker://imagem@sha256:<64 hex>`: já é imutável pelo digest. `docker://`
 *   SEM digest reprova — é a mesma etiqueta móvel com outro nome.
 *
 * ## Não há parser YAML nas dependências
 *
 * Regex estreito + CONTROLE POSITIVO e NEGATIVO: sem eles, um regex que parou
 * de casar devolve lista vazia e o gate fica verde vigiando nada.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

/** Os arquivos que o GitHub executa: os workflows e as ações compostas locais. */
function arquivosVigiados(): string[] {
  const workflows = readdirSync(join(RAIZ, ".github/workflows"))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => `.github/workflows/${f}`);
  const acoes = readdirSync(join(RAIZ, ".github/actions"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      ["action.yml", "action.yaml"]
        .map((f) => `.github/actions/${d.name}/${f}`)
        .filter((p) => {
          try {
            readFileSync(join(RAIZ, p));
            return true;
          } catch {
            return false;
          }
        }),
    );
  return [...workflows, ...acoes];
}

/** `uses:` como CHAVE do YAML (com ou sem `- `). Linha de comentário não conta. */
const LINHA_USES = /^\s*(?:-\s+)?uses:\s*["']?([^\s"'#]+)["']?\s*(#.*)?$/;
const FIXADA = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/;
const COMENTARIO_DE_VERSAO = /^#\s*v\d+\.\d+\.\d+\b/;
const DOCKER_COM_DIGEST = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/;

interface Referencia {
  linha: number;
  ref: string;
  comentario: string;
}

function referencias(texto: string): Referencia[] {
  return texto.split(/\r?\n/).flatMap((l, i) => {
    const m = LINHA_USES.exec(l);
    return m ? [{ linha: i + 1, ref: m[1]!, comentario: (m[2] ?? "").trim() }] : [];
  });
}

/** O motivo da reprovação, ou `null` quando a referência está em ordem. */
function problema(r: Referencia): string | null {
  if (r.ref.startsWith("./")) return null;
  if (r.ref.startsWith("docker://")) {
    return DOCKER_COM_DIGEST.test(r.ref) ? null : "imagem docker:// sem @sha256:<digest>";
  }
  if (!FIXADA.test(r.ref)) return "referência não é um hash de commit de 40 caracteres";
  if (!COMENTARIO_DE_VERSAO.test(r.comentario)) {
    return "falta o comentário `# vN.M.P` (é o que o Dependabot lê)";
  }
  return null;
}

function reprovadas(texto: string): string[] {
  return referencias(texto).flatMap((r) => {
    const p = problema(r);
    return p ? [`linha ${r.linha}: ${r.ref} — ${p}`] : [];
  });
}

const HASH = "3d3c42e5aac5ba805825da76410c181273ba90b1";

describe("a régua (controles)", () => {
  it("reprova etiqueta móvel — o estado de antes da issue #39", () => {
    const controle = [
      "jobs:",
      "  x:",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "      - name: cache",
      "        uses: actions/cache/save@v4",
      '      - uses: "docker/login-action@v4"',
    ].join("\n");
    expect(reprovadas(controle)).toHaveLength(3);
  });

  it("reprova hash sem o comentário de versão, branch e hash abreviado", () => {
    expect(reprovadas(`      - uses: actions/checkout@${HASH}`)).toHaveLength(1);
    expect(reprovadas("      - uses: actions/checkout@main # v7")).toHaveLength(1);
    // Só o major no comentário não diz qual versão o hash é.
    expect(reprovadas(`      - uses: actions/checkout@${HASH} # v7`)).toHaveLength(1);
    expect(reprovadas("      - uses: actions/checkout@3d3c42e # v7.0.1")).toHaveLength(1);
  });

  it("reprova docker:// sem digest e aceita com digest", () => {
    expect(reprovadas("      - uses: docker://alpine:3.20")).toHaveLength(1);
    expect(reprovadas(`      - uses: docker://alpine@sha256:${"a".repeat(64)}`)).toEqual([]);
  });

  it("aceita hash + versão, ação em subpasta e ação local", () => {
    const controle = [
      `      - uses: actions/checkout@${HASH} # v7.0.1`,
      `        uses: actions/cache/restore@${HASH} # v4.3.0`,
      "      - uses: ./.github/actions/preparar-node",
    ].join("\n");
    expect(referencias(controle)).toHaveLength(3);
    expect(reprovadas(controle)).toEqual([]);
  });

  it("não confunde `uses:` dentro de comentário com a chave do YAML", () => {
    expect(referencias("# ele vai no `uses:` de cada job — actions/checkout@v7")).toEqual([]);
  });
});

describe("os workflows e as ações compostas deste repositório", () => {
  const arquivos = arquivosVigiados();

  it("alcança os workflows E a ação composta (controle de universo)", () => {
    expect(arquivos).toContain(".github/workflows/implantar.yml");
    expect(arquivos).toContain(".github/actions/preparar-node/action.yml");
    const total = arquivos.reduce(
      (n, a) => n + referencias(readFileSync(join(RAIZ, a), "utf8")).length,
      0,
    );
    // Eram 46 (38 remotas + 8 locais) em 07/10/2026. O piso só
    // impede que um regex quebrado devolva zero e o gate fique verde no vazio.
    expect(total).toBeGreaterThanOrEqual(40);
  });

  it.each(arquivos)("%s: toda ação remota está fixada por hash com `# vN.M.P`", (arquivo) => {
    expect(reprovadas(readFileSync(join(RAIZ, arquivo), "utf8"))).toEqual([]);
  });
});

describe("o Dependabot segue atualizando o que está fixado", () => {
  // Hash fixado sem quem o atualize é ação congelada — com as correções de
  // segurança dela de fora. `directory: "/"` só lê .github/workflows/.
  it("a entrada github-actions alcança os workflows E as ações compostas", () => {
    const texto = readFileSync(join(RAIZ, ".github/dependabot.yml"), "utf8");
    const bloco = /-\s+package-ecosystem:\s*"github-actions"\n((?:[ \t]+\S.*\n?)+)/.exec(texto);
    expect(bloco, "entrada github-actions no dependabot.yml").not.toBeNull();
    const dirs = /directories:\s*\[([^\]]*)\]/.exec(bloco![1]!);
    expect(dirs, "`directories: [...]` na entrada github-actions").not.toBeNull();
    const lista = dirs![1]!.split(",").map((d) => d.trim().replace(/^["']|["']$/g, ""));
    expect(lista).toEqual(expect.arrayContaining(["/", "/.github/actions/*"]));
  });
});
