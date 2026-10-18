import { describe, expect, it } from "vitest";

import {
  IDS_DE_TIPO_DE_FONTE,
  TIPOS_DE_FONTE,
  aceitaArquivo,
  aceitaEnderecos,
  aceitaTextoColado,
  canonizarTipoDeFonte,
  ePerguntaEResposta,
  ePreenchidoPorRotina,
} from "./tipos-de-fonte";

describe("tipos de fonte — o site (issue #93)", () => {
  it("'site' é um tipo que a tela oferece, e o que ele pede é uma LISTA DE ENDEREÇOS", () => {
    expect(IDS_DE_TIPO_DE_FONTE).toContain("site");
    expect(canonizarTipoDeFonte("site")).toBe("site");
    expect(canonizarTipoDeFonte(" SITE ")).toBe("site");
    expect(aceitaEnderecos("site")).toBe(true);
  });

  it("site não é texto colado, nem arquivo, nem rotina — ninguém cola conteúdo num site", () => {
    expect(aceitaTextoColado("site")).toBe(false);
    expect(aceitaArquivo("site")).toBe(false);
    expect(ePerguntaEResposta("site")).toBe(false);
    expect(ePreenchidoPorRotina("site")).toBe(false);
  });

  it("os outros tipos NÃO ganham 'endereços' (fontes existentes não mudam)", () => {
    for (const id of ["faq", "documento", "conversas", "catalogo"]) {
      expect(aceitaEnderecos(id), id).toBe(false);
    }
  });

  it("a lista de ids em literal é exatamente a de TIPOS_DE_FONTE (o invariante do banco lê a literal)", () => {
    expect([...IDS_DE_TIPO_DE_FONTE].sort()).toEqual(TIPOS_DE_FONTE.map((t) => t.id).sort());
  });

  it("os nomes legados continuam traduzidos", () => {
    expect(canonizarTipoDeFonte("policy")).toBe("documento");
    expect(canonizarTipoDeFonte("conversation")).toBe("conversas");
    expect(canonizarTipoDeFonte("catalog")).toBe("catalogo");
    expect(canonizarTipoDeFonte("inexistente")).toBeNull();
  });
});
