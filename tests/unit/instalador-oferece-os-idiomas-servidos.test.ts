import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IDIOMAS } from "@/lib/i18n/idiomas";

/**
 * O INSTALADOR OFERECE EXATAMENTE OS IDIOMAS QUE O PRODUTO SERVE (issue #12).
 *
 * A pergunta "Idioma do sistema" do `kit/instalar.sh` é shell, e o shell não
 * importa o registro de idiomas. Então a lista mora duas vezes — em
 * `idioma_valido` (`kit/lib/comum.sh`) e em `lib/i18n/registro.ts` — e este
 * arquivo é o que impede as duas de divergirem: um idioma promovido no registro
 * sem entrar no instalador é um idioma que quem instala não consegue escolher;
 * um idioma no instalador que o registro não serve faria o `bootstrap-owner`
 * gravar português em silêncio.
 */
const COMUM = readFileSync(join(__dirname, "..", "..", "kit", "lib", "comum.sh"), "utf8");

function codigosDoInstalador(): string[] {
  const inicio = COMUM.indexOf("idioma_valido() {");
  expect(inicio, "idioma_valido sumiu de kit/lib/comum.sh").toBeGreaterThan(-1);
  const corpo = COMUM.slice(inicio, COMUM.indexOf("\n}\n", inicio));
  // Só o que cada ramo do `case` devolve (`… ) printf 'en' ;;`), não o
  // `printf '%s'` que normaliza a resposta.
  return [...corpo.matchAll(/\) printf '([^']+)' ;;/g)].map((m) => m[1] ?? "");
}

describe("a pergunta de idioma do instalador", () => {
  it("devolve exatamente os códigos servidos, na ordem do registro", () => {
    expect(codigosDoInstalador()).toEqual([...IDIOMAS]);
  });

  it("a pergunta numera as opções na mesma ordem", () => {
    const instalar = readFileSync(join(__dirname, "..", "..", "kit", "instalar.sh"), "utf8");
    expect(instalar).toContain("1) Português  2) Español  3) English");
  });
});
