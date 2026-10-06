import { describe, expect, it } from "vitest";

import { campanhaDaMarca, campanhaDaUltimaResposta } from "./origem-do-lead";

describe("campanhaDaMarca — o negócio que NASCEU da campanha", () => {
  it("lê o nome e o id da marca de origem", () => {
    expect(campanhaDaMarca("campanha", { campaign_id: "c1", campaign_name: "Outubro" })).toEqual({
      id: "c1",
      nome: "Outubro",
    });
  });

  it("outra origem, ou marca sem nome, não é campanha", () => {
    expect(campanhaDaMarca("whatsapp", { campaign_name: "Outubro" })).toBeNull();
    expect(campanhaDaMarca("campanha", {})).toBeNull();
  });
});

describe("campanhaDaUltimaResposta — o negócio que a campanha MOVEU (issue #11)", () => {
  const linha = (type: string, quando: string, payload: Record<string, unknown>) => ({
    type,
    performed_at: quando,
    payload,
  });

  it("a resposta mais recente diz a campanha", () => {
    expect(
      campanhaDaUltimaResposta([
        linha("campaign_replied", "2026-10-01T10:00:00Z", {
          campaign_id: "a",
          campaign_name: "Setembro",
        }),
        linha("stage_changed", "2026-10-03T10:00:00Z", {}),
        linha("campaign_replied", "2026-10-02T10:00:00Z", {
          campaign_id: "b",
          campaign_name: "Outubro",
        }),
      ]),
    ).toEqual({ id: "b", nome: "Outubro" });
  });

  it("sem resposta de campanha na timeline, nada", () => {
    expect(campanhaDaUltimaResposta([linha("note", "2026-10-01T10:00:00Z", {})])).toBeNull();
  });
});
