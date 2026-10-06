import { describe, expect, it } from "vitest";

import { centavosDoTexto, emReais, precoUnitario, textoDosCentavos } from "./formato";

describe("formato de dinheiro", () => {
  it("centavos viram reais com espaço comum", () => {
    expect(emReais(70)).toBe("R$ 0,70");
    expect(emReais(123456)).toBe("R$ 1.234,56");
    expect(precoUnitario(32.17)).toBe("R$ 0,3217");
  });

  it("o que a pessoa digita vira centavos, nos dois jeitos de escrever", () => {
    expect(centavosDoTexto("1.234,56")).toBe(123456);
    expect(centavosDoTexto("R$ 50")).toBe(5000);
    expect(centavosDoTexto("0,3217")).toBe(32.17);
    expect(centavosDoTexto("12.5")).toBe(1250);
  });

  it("vazio, zero ou lixo não é teto", () => {
    expect(centavosDoTexto("")).toBeNull();
    expect(centavosDoTexto("0")).toBeNull();
    expect(centavosDoTexto("abc")).toBeNull();
  });

  it("volta para o campo do jeito que se digita", () => {
    expect(textoDosCentavos(5000)).toBe("50,00");
    expect(textoDosCentavos(null)).toBe("");
  });
});
