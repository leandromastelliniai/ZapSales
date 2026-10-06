import { describe, expect, it } from "vitest";

import { fraseDaPausa, motivoDoEventoDeModelo, motivoDoStatusDoModelo } from "./pausa-automatica";

describe("motivoDoStatusDoModelo — o status do modelo que pede pausa", () => {
  it.each([
    ["REJECTED", "modelo_rejeitado"],
    ["PAUSED", "modelo_pausado"],
    ["DISABLED", "modelo_desativado"],
    ["DELETED", "modelo_desativado"],
    ["rejected", "modelo_rejeitado"],
  ])("%s → %s", (status, motivo) => {
    expect(motivoDoStatusDoModelo(status)).toBe(motivo);
  });

  it.each(["APPROVED", "PENDING", "IN_APPEAL", "FLAGGED", "REINSTATED", ""])("%s não pausa", (status) => {
    expect(motivoDoStatusDoModelo(status)).toBeNull();
  });
});

describe("motivoDoEventoDeModelo — o evento do webhook que pede pausa", () => {
  const base = { wabaId: "w", templateName: "promo", templateLanguage: "pt_BR" };

  it("status rejeitado, pausado e desativado pausam", () => {
    expect(motivoDoEventoDeModelo({ ...base, kind: "template_status", event: "REJECTED", reason: null })).toBe(
      "modelo_rejeitado",
    );
    expect(motivoDoEventoDeModelo({ ...base, kind: "template_status", event: "PAUSED", reason: null })).toBe(
      "modelo_pausado",
    );
    expect(motivoDoEventoDeModelo({ ...base, kind: "template_status", event: "DISABLED", reason: null })).toBe(
      "modelo_desativado",
    );
  });

  it("recategorização EFETIVA pausa; o aviso prévio não (nada mudou ainda)", () => {
    expect(
      motivoDoEventoDeModelo({
        ...base,
        kind: "template_category",
        previous: "UTILITY",
        category: "MARKETING",
        efetiva: true,
      }),
    ).toBe("modelo_recategorizado");
    expect(
      motivoDoEventoDeModelo({ ...base, kind: "template_category", previous: null, category: "MARKETING", efetiva: false }),
    ).toBeNull();
  });

  it("qualidade do modelo não pausa — a Meta pausa o modelo quando é o caso, e esse evento vem", () => {
    expect(
      motivoDoEventoDeModelo({ ...base, kind: "template_quality", previous: "GREEN", quality: "RED" }),
    ).toBeNull();
  });
});

describe("fraseDaPausa — o que o operador lê na campanha", () => {
  it("qualidade vermelha nomeia o número", () => {
    const f = fraseDaPausa("qualidade_vermelha", { numero: "Loja +55 31 90000-0000" });
    expect(f).toContain("Loja +55 31 90000-0000");
    expect(f).toContain("vermelha");
  });

  it("modelo nomeia o modelo e traz o motivo da Meta quando há", () => {
    const f = fraseDaPausa("modelo_rejeitado", { modelo: "promo (pt_BR)", motivoDaMeta: "INVALID_FORMAT" });
    expect(f).toContain("promo (pt_BR)");
    expect(f).toContain("INVALID_FORMAT");
  });

  it("recategorização diz de qual categoria para qual", () => {
    const f = fraseDaPausa("modelo_recategorizado", { modelo: "promo (pt_BR)", de: "UTILITY", para: "MARKETING" });
    expect(f).toContain("utilidade");
    expect(f).toContain("marketing");
  });
});
