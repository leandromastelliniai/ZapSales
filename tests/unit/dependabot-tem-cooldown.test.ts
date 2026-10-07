/**
 * TODA ENTRADA DO DEPENDABOT ESPERA ANTES DE PROPOR UMA VERSÃO RECÉM-PUBLICADA.
 *
 * ## Por que este arquivo existe (issue #41)
 *
 * Pacote comprometido no npm e ação comprometida no GitHub costumam ser
 * descobertos e retirados em poucos dias. Sem `cooldown`, o PR do Dependabot
 * chega no mesmo dia em que a versão sai, e quem confia no CI verde a mescla
 * antes de a comunidade notar. As imagens que saem da `main` são as que toda
 * VPS de cliente puxa.
 *
 * O prazo só vale para atualização de VERSÃO: os alertas de segurança do
 * Dependabot não esperam, então correção de vulnerabilidade não atrasa.
 *
 * O conserto sem esta cerca dura até a próxima entrada copiada da documentação
 * do Dependabot, que não traz `cooldown`.
 *
 * ## Não há parser YAML nas dependências
 *
 * Regex estreito + CONTROLE POSITIVO, NEGATIVO e de UNIVERSO: sem eles, um
 * regex que parou de casar devolve lista vazia e o gate fica verde vigiando nada.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ARQUIVO = join(process.cwd(), ".github/dependabot.yml");

const INICIO_DE_ENTRADA = /^(\s*)-\s+package-ecosystem:\s*["']?([\w-]+)["']?\s*$/;

interface Entrada {
  ecossistema: string;
  linha: number;
  /** `cooldown.default-days`, ou `null` quando não há prazo declarado. */
  dias: number | null;
}

function entradas(texto: string): Entrada[] {
  // Comentário não conta: um `# cooldown:` não pode satisfazer o gate.
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => (l.trimStart().startsWith("#") ? "" : l.replace(/\s+#.*$/, "")));
  const achadas: Entrada[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = INICIO_DE_ENTRADA.exec(linhas[i]!);
    if (!m) continue;
    const recuo = m[1]!.length;
    // O corpo vai até a próxima linha com recuo menor ou igual ao do `-`.
    let fim = linhas.length;
    for (let j = i + 1; j < linhas.length; j++) {
      const l = linhas[j]!;
      if (l.trim() === "") continue;
      if (l.length - l.trimStart().length <= recuo) {
        fim = j;
        break;
      }
    }
    const corpo = linhas.slice(i + 1, fim).join("\n");
    const cooldown = /^([ \t]+)cooldown:\s*\n((?:\1[ \t]+\S.*\n?|[ \t]*\n)+)/m.exec(corpo + "\n");
    const dias = cooldown ? /^[ \t]+default-days:\s*(\d+)\s*$/m.exec(cooldown[2]!) : null;
    achadas.push({ ecossistema: m[2]!, linha: i + 1, dias: dias ? Number(dias[1]) : null });
  }
  return achadas;
}

function semPrazo(texto: string): string[] {
  return entradas(texto)
    .filter((e) => e.dias === null || e.dias < 1)
    .map(
      (e) =>
        `linha ${e.linha}: entrada "${e.ecossistema}" sem prazo de espera — acrescente ` +
        "`cooldown:` com `default-days: 7` (o motivo está no comentário do dependabot.yml)",
    );
}

describe("a régua (controles)", () => {
  const COM_PRAZO = [
    "version: 2",
    "updates:",
    '  - package-ecosystem: "npm"',
    '    directory: "/"',
    "    cooldown:",
    "      default-days: 7",
    "    schedule:",
    '      interval: "weekly"',
    "  # comentário entre entradas, como o da #39",
    '  - package-ecosystem: "github-actions"',
    '    directories: ["/", "/.github/actions/*"]',
    "    schedule:",
    '      interval: "weekly"',
    "    cooldown:",
    "      default-days: 7",
  ].join("\n");

  it("aceita as duas entradas com prazo", () => {
    expect(entradas(COM_PRAZO).map((e) => e.ecossistema)).toEqual(["npm", "github-actions"]);
    expect(semPrazo(COM_PRAZO)).toEqual([]);
  });

  it("reprova a entrada sem `cooldown` — o estado de antes da issue #41 — e diz qual é", () => {
    const controle = COM_PRAZO.replace(/\n {4}cooldown:\n {6}default-days: 7$/, "");
    const r = semPrazo(controle);
    expect(r).toHaveLength(1);
    expect(r[0]).toContain('"github-actions"');
    expect(r[0]).toContain("default-days: 7");
  });

  it("reprova `default-days: 0` e `cooldown` sem `default-days`", () => {
    expect(semPrazo(COM_PRAZO.replace("default-days: 7", "default-days: 0"))).toHaveLength(1);
    expect(semPrazo(COM_PRAZO.replace("default-days: 7", "semver-major-days: 30"))).toHaveLength(1);
  });

  it("não aceita `cooldown` de outra entrada", () => {
    const vizinha = COM_PRAZO.replace("    cooldown:\n      default-days: 7\n", "");
    expect(semPrazo(vizinha)).toEqual([expect.stringContaining('"npm"')]);
  });

  it("não aceita `default-days` comentado", () => {
    const comentado = COM_PRAZO.replace(
      "    cooldown:\n      default-days: 7\n",
      "    cooldown:\n      # default-days: 7\n      semver-major-days: 30\n",
    );
    expect(semPrazo(comentado)).toEqual([expect.stringContaining('"npm"')]);
  });

  it("aceita comentário no fim da linha (é o que a limpeza de comentários compra)", () => {
    const anotado = COM_PRAZO.replace(
      "    cooldown:\n      default-days: 7\n",
      "    cooldown: # issue #41\n      default-days: 7 # uma semana\n",
    );
    expect(semPrazo(anotado)).toEqual([]);
  });
});

describe("o dependabot.yml deste repositório", () => {
  const texto = readFileSync(ARQUIVO, "utf8");

  it("alcança as entradas npm e github-actions (controle de universo)", () => {
    expect(entradas(texto).map((e) => e.ecossistema)).toEqual(
      expect.arrayContaining(["npm", "github-actions"]),
    );
  });

  it("lê toda entrada que o arquivo declara, nenhuma fica de fora do regex", () => {
    // Entrada escrita com outra chave antes de `package-ecosystem` não casa com
    // INICIO_DE_ENTRADA e sumiria da lista em silêncio, com o gate verde.
    const declaradas = texto
      .split(/\r?\n/)
      .filter((l) => /^\s*(?:-\s+)?package-ecosystem:/.test(l)).length;
    expect(entradas(texto)).toHaveLength(declaradas);
  });

  it("toda entrada espera antes de propor uma versão", () => {
    expect(semPrazo(texto)).toEqual([]);
  });
});
