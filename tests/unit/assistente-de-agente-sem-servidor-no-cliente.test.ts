/**
 * CERCA: o assistente de criação de agente roda no NAVEGADOR, e `capacidades-do-modelo`
 * / `capacidades-padrao` leem os handlers das ferramentas (`allTools`), que são código de
 * servidor. Importar qualquer um dos dois de um arquivo de cliente arrasta o servidor —
 * e a validação de variáveis de ambiente — para o pacote do navegador.
 *
 * A página calcula `capacidadesPorModelo()` no servidor e entrega pronto; o que o
 * navegador precisa de texto e de mapa de pacotes mora em `o-que-o-modelo-faz.ts`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
/** Os módulos que só o servidor pode importar. */
const SO_SERVIDOR = [/capacidades-do-modelo["']/, /capacidades-padrao["']/, /padroes-de-ia["']/];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome) ? [caminho] : [];
  });
}

const CLIENTE = [
  ...arquivos(join(RAIZ, "lib/ai/agents/assistente")),
  ...arquivos(join(RAIZ, "app/app/ai/agents/new/_assistente")),
  join(RAIZ, "lib/ai/agents/o-que-o-modelo-faz.ts"),
];

describe("assistente de criação de agente: nada de servidor no navegador", () => {
  it("encontrou os arquivos de cliente (a cerca não pode olhar para o vazio)", () => {
    expect(CLIENTE.length).toBeGreaterThanOrEqual(12);
  });

  it.each(CLIENTE.map((c) => [c.replace(RAIZ, "").replace(/\\/g, "/"), c] as const))(
    "%s não importa módulo só de servidor",
    (_nome, caminho) => {
      const imports = readFileSync(caminho, "utf-8")
        .split(/\r?\n/)
        .filter((l) => /^\s*(import|export)\b.*from\s/.test(l) || /^\s*\} from /.test(l));
      for (const linha of imports) {
        for (const proibido of SO_SERVIDOR) {
          // `import type` não entra no pacote do navegador; só o valor importa.
          if (/^\s*import type\b/.test(linha)) continue;
          expect(linha, `${caminho}: ${linha}`).not.toMatch(proibido);
        }
      }
    },
  );
});
