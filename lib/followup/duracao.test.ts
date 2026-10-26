import { describe, expect, it } from "vitest";

import { descreverMinutos, descreverMs } from "./duracao";

const pt = (s: string) => s;

describe("descreverMinutos", () => {
  it.each([
    [1440, "1 dia"],
    [2880, "2 dias"],
    [10_080, "7 dias"],
    [60, "1 hora"],
    [120, "2 horas"],
    [1500, "25 horas"], // não divide em dias exatos: a maior unidade que divide é a hora
    [45, "45 min"],
    [90, "90 min"],
    [5, "5 min"],
  ])("%i min → %s", (min, esperado) => {
    expect(descreverMinutos(min, pt)).toBe(esperado);
  });

  it("valor inválido vira 0 min, sem lançar", () => {
    expect(descreverMinutos(0, pt)).toBe("0 min");
    expect(descreverMinutos(-3, pt)).toBe("0 min");
    expect(descreverMinutos(Number.NaN, pt)).toBe("0 min");
  });

  it("traduz as palavras e mantém a sigla", () => {
    const es = (s: string) => ({ dia: "día", dias: "días", hora: "hora", horas: "horas" })[s] ?? s;
    expect(descreverMinutos(2880, es)).toBe("2 días");
    expect(descreverMinutos(45, es)).toBe("45 min");
  });
});

describe("descreverMs", () => {
  it("parte de milissegundos", () => {
    expect(descreverMs(86_400_000, pt)).toBe("1 dia");
    expect(descreverMs(600_000, pt)).toBe("10 min");
  });
});
