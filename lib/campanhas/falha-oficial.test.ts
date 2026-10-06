import { describe, expect, it } from "vitest";

import { classificarErroMeta } from "@/lib/channels/meta/erros";

import { MAX_TENTATIVAS_OFICIAIS, desfechoDaFalhaOficial } from "./falha-oficial";

const AGORA = new Date("2026-10-06T13:00:00.000Z");
const UM_DIA_MS = 24 * 60 * 60 * 1000;

/** A falha como o handler de envio a grava (`FalhaDoCanal`), a partir do mapa de erros. */
function falha(code: number | null, httpStatus?: number) {
  const e = classificarErroMeta({ code, httpStatus: httpStatus ?? null });
  return { codigo: e.codigo === null ? null : String(e.codigo), categoria: e.categoria, temporario: e.temporario, motivo: e.motivo };
}

describe("desfechoDaFalhaOficial — o que a campanha faz com cada recusa da Meta", () => {
  it("131049 (limite de marketing por usuário) só volta depois de 24 horas, nunca antes", () => {
    const d = desfechoDaFalhaOficial(falha(131049), 1, AGORA);
    expect(d.acao).toBe("tentar_de_novo");
    if (d.acao !== "tentar_de_novo") return;
    expect(d.em.getTime() - AGORA.getTime()).toBe(UM_DIA_MS);
  });

  it("131050 (contato recusou marketing) não é tentado de novo: vira recusa de marketing do contato", () => {
    const d = desfechoDaFalhaOficial(falha(131050), 1, AGORA);
    expect(d).toEqual({ acao: "recusou_marketing", motivo: falha(131050).motivo });
  });

  it("limite de taxa volta para a fila com espera, e a espera cresce a cada tentativa", () => {
    const primeira = desfechoDaFalhaOficial(falha(130429, 429), 1, AGORA);
    const terceira = desfechoDaFalhaOficial(falha(130429, 429), 3, AGORA);
    expect(primeira.acao).toBe("tentar_de_novo");
    expect(terceira.acao).toBe("tentar_de_novo");
    if (primeira.acao !== "tentar_de_novo" || terceira.acao !== "tentar_de_novo") return;
    expect(primeira.em.getTime() - AGORA.getTime()).toBe(60_000);
    expect(terceira.em.getTime() - AGORA.getTime()).toBe(4 * 60_000);
  });

  it("Meta fora do ar (5xx sem código) também volta para a fila", () => {
    expect(desfechoDaFalhaOficial(falha(null, 503), 1, AGORA).acao).toBe("tentar_de_novo");
  });

  it("erro temporário que esgotou as tentativas vira falha com o motivo e a contagem", () => {
    const d = desfechoDaFalhaOficial(falha(130429, 429), MAX_TENTATIVAS_OFICIAIS, AGORA);
    expect(d.acao).toBe("falhar");
    if (d.acao !== "falhar") return;
    expect(d.motivo).toContain(falha(130429).motivo);
    expect(d.motivo).toContain(String(MAX_TENTATIVAS_OFICIAIS));
  });

  it("erro definitivo fica com o motivo legível do mapa de erros, sem nova tentativa", () => {
    expect(desfechoDaFalhaOficial(falha(131026), 1, AGORA)).toEqual({
      acao: "falhar",
      motivo: falha(131026).motivo,
    });
    expect(desfechoDaFalhaOficial(falha(132001), 1, AGORA)).toEqual({
      acao: "falhar",
      motivo: falha(132001).motivo,
    });
  });

  it("a espera nunca passa de uma hora, por mais tentativas que haja", () => {
    const d = desfechoDaFalhaOficial(falha(130429, 429), MAX_TENTATIVAS_OFICIAIS - 1, AGORA);
    if (d.acao !== "tentar_de_novo") throw new Error("devia tentar de novo");
    expect(d.em.getTime() - AGORA.getTime()).toBeLessThanOrEqual(60 * 60_000);
  });
});
