import { describe, expect, it } from "vitest";

import { alertaDoAtendimentoGratis, GRATIS_POR_MES, inicioDoMesNoFuso } from "./atendimento-gratis";

const SP = "America/Sao_Paulo";

describe("inicioDoMesNoFuso — o contador zera à meia-noite do dia 1 no fuso da conta", () => {
  it("23h30 de 31/10 em São Paulo ainda é outubro, mesmo já sendo novembro em UTC", () => {
    expect(inicioDoMesNoFuso(new Date("2026-11-01T02:30:00Z"), SP).toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("à meia-noite de 01/11 em São Paulo começa novembro", () => {
    expect(inicioDoMesNoFuso(new Date("2026-11-01T03:00:00Z"), SP).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("em outro fuso a virada é outra", () => {
    expect(inicioDoMesNoFuso(new Date("2026-11-01T02:30:00Z"), "UTC").toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });
});

describe("alertaDoAtendimentoGratis — avisa uma vez ao cruzar 80% e 100%", () => {
  it("as grátis são 1.000 por número no mês", () => {
    expect(GRATIS_POR_MES).toBe(1000);
  });

  it("cruzar 800 avisa 80%", () => {
    expect(alertaDoAtendimentoGratis(799, 800)).toBe(80);
  });

  it("cruzar 1.000 avisa 100%", () => {
    expect(alertaDoAtendimentoGratis(999, 1000)).toBe(100);
  });

  it("pular os dois de uma vez avisa o maior", () => {
    expect(alertaDoAtendimentoGratis(790, 1001)).toBe(100);
  });

  it("abaixo, entre ou depois dos limiares não avisa de novo", () => {
    expect(alertaDoAtendimentoGratis(10, 11)).toBeNull();
    expect(alertaDoAtendimentoGratis(800, 801)).toBeNull();
    expect(alertaDoAtendimentoGratis(1000, 1001)).toBeNull();
  });
});
