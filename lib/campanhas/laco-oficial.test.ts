import { describe, expect, it, vi } from "vitest";

import type { Logger } from "@/lib/agent-engine/obs/logger";

import { rodarLacoDaCampanhaOficial, type DepsDoLacoOficial } from "./laco-oficial";
import type { ResultadoDaRodadaOficial } from "./rodada-oficial";

const VAZIA: ResultadoDaRodadaOficial = {
  enviadas: 0,
  pulados: 0,
  reenfileirados: 0,
  falharam: 0,
  concluidas: 0,
  promovidas: 0,
  detalhe: "nada_a_fazer",
};

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger & {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

/** Roda o laço com uma sequência de resultados e devolve as esperas pedidas. */
async function rodarCom(resultados: Array<ResultadoDaRodadaOficial | Error>) {
  const controle = new AbortController();
  const esperas: number[] = [];
  const log = logger();
  const auditadas: ResultadoDaRodadaOficial[] = [];
  let i = 0;
  const deps: DepsDoLacoOficial = {
    admin: {} as DepsDoLacoOficial["admin"],
    auditar: async (r) => {
      auditadas.push(r);
    },
    rodar: async () => {
      const r = resultados[i++];
      if (i >= resultados.length) controle.abort();
      if (r instanceof Error) throw r;
      return r ?? VAZIA;
    },
  };
  await rodarLacoDaCampanhaOficial({ intervaloMs: 2_000, ociosoMs: 15_000 }, log, controle.signal, {
    carregar: async () => deps,
    dormir: async (ms) => {
      esperas.push(ms);
    },
  });
  return { esperas, log, rodadas: i, auditadas };
}

describe("rodarLacoDaCampanhaOficial — o worker contínuo da campanha oficial", () => {
  it("volta logo quando a rodada trabalhou e espaça quando não havia nada", async () => {
    const { esperas } = await rodarCom([{ ...VAZIA, enviadas: 50 }, VAZIA, { ...VAZIA, reenfileirados: 1 }]);
    expect(esperas).toEqual([2_000, 15_000, 2_000]);
  });

  it("audita só a rodada que mexeu em campanha — a vazia não ocupa o log", async () => {
    const { auditadas } = await rodarCom([VAZIA, { ...VAZIA, enviadas: 3 }, VAZIA]);
    expect(auditadas.map((r) => r.enviadas)).toEqual([3]);
  });

  it("uma rodada que lança não derruba o laço: registra e segue", async () => {
    const { rodadas, log } = await rodarCom([new Error("banco caiu"), { ...VAZIA, enviadas: 1 }]);
    expect(rodadas).toBe(2);
    expect(log.error).toHaveBeenCalledWith("campanha oficial: rodada falhou", { error: "banco caiu" });
  });

  it("dependência que não carrega desliga o laço sem lançar — o worker sobe e o cron segue", async () => {
    const log = logger();
    await expect(
      rodarLacoDaCampanhaOficial({ intervaloMs: 1, ociosoMs: 1 }, log, new AbortController().signal, {
        carregar: async () => {
          throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
        },
      }),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
