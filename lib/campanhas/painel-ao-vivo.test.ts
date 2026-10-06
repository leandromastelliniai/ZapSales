import { describe, expect, it } from "vitest";

import { painelAindaMuda, PAINEL_SEGUE_APOS_CONCLUIR_MS } from "./painel-ao-vivo";

const AGORA = new Date("2026-10-05T15:00:00Z");

function ha(ms: number): string {
  return new Date(AGORA.getTime() - ms).toISOString();
}

describe("o painel da campanha se atualiza sozinho?", () => {
  it("enquanto a campanha anda, sim", () => {
    for (const status of ["preparing", "scheduled", "running"] as const) {
      expect(painelAindaMuda({ status, completed_at: null }, AGORA)).toBe(true);
    }
  });

  it("concluída há pouco, sim: entregue e lido chegam depois do último envio", () => {
    expect(painelAindaMuda({ status: "completed", completed_at: ha(60_000) }, AGORA)).toBe(true);
  });

  it("concluída há mais que a janela, não", () => {
    expect(
      painelAindaMuda({ status: "completed", completed_at: ha(PAINEL_SEGUE_APOS_CONCLUIR_MS + 1) }, AGORA),
    ).toBe(false);
  });

  it("parada por decisão de alguém, não", () => {
    for (const status of ["draft", "ready", "paused", "cancelled", "failed"] as const) {
      expect(painelAindaMuda({ status, completed_at: null }, AGORA)).toBe(false);
    }
  });

  it("concluída sem data (linha antiga), não", () => {
    expect(painelAindaMuda({ status: "completed", completed_at: null }, AGORA)).toBe(false);
  });
});
