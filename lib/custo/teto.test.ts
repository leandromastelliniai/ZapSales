import { describe, expect, it } from "vitest";

import { mensagensQueCabem } from "./teto";

describe("mensagensQueCabem — o teto nunca é ultrapassado", () => {
  it("sem teto, não há limite de custo", () => {
    expect(mensagensQueCabem(null, 500, 32.17)).toBe(Infinity);
  });

  it("R$ 1,00 de teto cabe 3 marketing de R$ 0,3217, e não 4", () => {
    expect(mensagensQueCabem(100, 0, 32.17)).toBe(3);
  });

  it("o comprometido sai da folga", () => {
    expect(mensagensQueCabem(100, 32.17, 32.17)).toBe(2);
  });

  it("exatamente no teto cabe a última, sem erro de arredondamento", () => {
    expect(mensagensQueCabem(96.51, 64.34, 32.17)).toBe(1);
  });

  it("no teto ou acima dele não cabe nenhuma", () => {
    expect(mensagensQueCabem(100, 100, 32.17)).toBe(0);
    expect(mensagensQueCabem(100, 130, 32.17)).toBe(0);
  });

  it("mensagem sem preço não consome teto", () => {
    expect(mensagensQueCabem(100, 0, 0)).toBe(Infinity);
  });
});
