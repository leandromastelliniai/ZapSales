import { describe, expect, it } from "vitest";

import { GRATIS_POR_MES, inicioDoMesNoFuso, limiarAtingido } from "./atendimento-gratis";

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

describe("limiarAtingido — o maior limiar já alcançado, para avisar uma vez cada", () => {
  it("as grátis são 1.000 por número no mês", () => {
    expect(GRATIS_POR_MES).toBe(1000);
  });

  it("abaixo de 800 não há limiar", () => {
    expect(limiarAtingido(0)).toBeNull();
    expect(limiarAtingido(799)).toBeNull();
  });

  it("de 800 a 999 é o de 80%", () => {
    expect(limiarAtingido(800)).toBe(80);
    expect(limiarAtingido(999)).toBe(80);
  });

  it("de 1.000 em diante é o de 100%", () => {
    expect(limiarAtingido(1000)).toBe(100);
    expect(limiarAtingido(5000)).toBe(100);
  });

  it("não depende de ter visto o número exato: dois webhooks juntos que leem 801 ainda acham o 80%", () => {
    expect(limiarAtingido(801)).toBe(80);
  });
});
