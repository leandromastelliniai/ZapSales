import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DICIONARIO, temTraducao, traduzir } from "@/lib/i18n/dicionario";
import { IDIOMAS, normalizarIdioma, parseAcceptLanguage } from "@/lib/i18n/idiomas";
import { REGISTRO_DE_IDIOMAS } from "@/lib/i18n/registro";

/**
 * O INGLÊS É SERVIDO, E VEM DO CATÁLOGO (issue #12).
 *
 * O catálogo `lib/i18n/traducoes/en.json` existia sem leitor: o idioma estava
 * registrado como `em_construcao`, e `traduzir(k, "en")` nem compilava. Estes
 * casos prendem o contrato da promoção pelo comportamento de quem usa —
 * escolher inglês muda a tela — e não pela forma do arquivo.
 *
 * O oráculo é o JSON lido do disco, não o módulo importado pelo dicionário: se
 * o leitor apontasse para outro objeto (ou para o espanhol), implementação e
 * teste errariam juntos.
 */
const CATALOGO_EN = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "lib", "i18n", "traducoes", "en.json"), "utf8"),
) as Record<string, string>;

describe("o inglês é um idioma servido", () => {
  it("o registro declara o inglês `completo`", () => {
    expect(REGISTRO_DE_IDIOMAS.find((idioma) => idioma.codigo === "en")?.nivel).toBe("completo");
  });

  it("a lista servida o inclui, e o valor salvo e o navegador chegam a ele", () => {
    expect(IDIOMAS).toContain("en");
    expect(normalizarIdioma("en")).toBe("en");
    expect(parseAcceptLanguage("en-US,en;q=0.9")).toBe("en");
  });
});

describe("traduzir() em inglês lê o catálogo", () => {
  it("toda entrada do catálogo sai como está escrita nele", () => {
    const divergentes = Object.entries(CATALOGO_EN)
      .filter(([chave, valor]) => traduzir(chave, "en") !== valor)
      .map(([chave]) => chave);
    expect(divergentes).toEqual([]);
  });

  it("frase sem inglês cai no português, nunca na chave do espanhol nem no vazio", () => {
    const inventada = "Frase que nenhum catálogo conhece — teste da issue 12";
    expect(traduzir(inventada, "en")).toBe(inventada);
  });

  it("o inglês não vaza para o espanhol nem para o português", () => {
    const chave = "Arquivo";
    expect(traduzir(chave, "en")).toBe(CATALOGO_EN[chave]);
    expect(traduzir(chave, "es")).toBe(DICIONARIO[chave]?.es);
    expect(traduzir(chave, "pt-BR")).toBe(chave);
  });
});

describe("temTraducao()", () => {
  it("responde pela fonte de cada idioma", () => {
    expect(temTraducao("Arquivo", "en")).toBe(true);
    expect(temTraducao("Arquivo", "es")).toBe(true);
    expect(temTraducao("Frase que nenhum catálogo conhece", "en")).toBe(false);
    expect(temTraducao("Frase que nenhum catálogo conhece", "es")).toBe(false);
  });

  it("em português toda frase está traduzida: a chave é o texto", () => {
    expect(temTraducao("Frase que nenhum catálogo conhece", "pt-BR")).toBe(true);
  });
});
