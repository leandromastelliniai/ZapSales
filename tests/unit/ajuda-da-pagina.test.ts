/**
 * O "Como funciona" tem texto nos três idiomas, e o texto cita os nomes que a tela mostra.
 *
 * Texto de ajuda que só existe em português é o jeito de a tradução parecer pronta e não estar: quem
 * escolheu espanhol clica em "Cómo funciona" e lê português. O dicionário de `t()` tem um guarda para
 * isso; a ajuda mora em outro lugar (`lib/ajuda/conteudo/`, carregada só ao abrir), então ela tem o
 * guarda dela, aqui.
 */
import { describe, expect, it } from "vitest";

import { INDICE_DE_AJUDA } from "@/lib/ajuda/indice";
import { conteudoNoIdioma, type AjudaDaPagina } from "@/lib/ajuda/tipos";

const IDIOMAS_OBRIGATORIOS = ["pt-BR", "es", "en"] as const;

describe("ajuda das telas", () => {
  const entradas = Object.entries(INDICE_DE_AJUDA);

  it("guarda de vacuidade: há telas com ajuda", () => {
    expect(entradas.length).toBeGreaterThanOrEqual(2);
  });

  it.each(entradas)("%s tem os três idiomas, com o mesmo número de passos e de termos", async (_chave, carregar) => {
    const { default: ajuda } = await carregar();
    const pt = ajuda["pt-BR"];
    for (const idioma of IDIOMAS_OBRIGATORIOS) {
      const c = ajuda[idioma];
      expect(c, `falta ${idioma}`).toBeDefined();
      expect(c!.oQueMostra.trim().length, `${idioma}: oQueMostra vazio`).toBeGreaterThan(20);
      expect(c!.passos.length, `${idioma}: passos`).toBe(pt.passos.length);
      expect(c!.termos?.length ?? 0, `${idioma}: termos`).toBe(pt.termos?.length ?? 0);
      for (const passo of c!.passos) expect(passo.trim().length).toBeGreaterThan(10);
    }
  });

  it.each(entradas)("%s não deixa português vazar nas versões em outro idioma", async (_chave, carregar) => {
    const { default: ajuda } = await carregar();
    const pt = ajuda["pt-BR"];
    for (const idioma of ["es", "en"] as const) {
      const c = ajuda[idioma]!;
      expect(c.oQueMostra, `${idioma} copia o português`).not.toBe(pt.oQueMostra);
      c.passos.forEach((passo, i) => expect(passo, `${idioma} passo ${i + 1} copia o português`).not.toBe(pt.passos[i]));
    }
  });

  it("idioma sem entrada cai em inglês, depois em português, nunca em erro", () => {
    const so_pt: AjudaDaPagina = { "pt-BR": { oQueMostra: "pt", passos: [] } };
    const com_en: AjudaDaPagina = { "pt-BR": { oQueMostra: "pt", passos: [] }, en: { oQueMostra: "en", passos: [] } };
    expect(conteudoNoIdioma(so_pt, "es").oQueMostra).toBe("pt");
    expect(conteudoNoIdioma(so_pt, "en").oQueMostra).toBe("pt");
    expect(conteudoNoIdioma(com_en, "es").oQueMostra).toBe("en");
    expect(conteudoNoIdioma(com_en, "pt-BR").oQueMostra).toBe("pt");
  });
});
