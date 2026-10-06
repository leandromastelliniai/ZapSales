import { describe, expect, it } from "vitest";

import { custoDaMensagem } from "./custo-real";
import { TABELA_INICIAL } from "./tabela-de-precos";

const BR = "5531988880001";

describe("custoDaMensagem — o custo real a partir do pricing do webhook", () => {
  it("marketing cobrável no Brasil custa o preço da tabela", () => {
    const c = custoDaMensagem({ billable: true, pricing_model: "PMP", type: "regular", category: "marketing" }, BR, TABELA_INICIAL);
    expect(c).toMatchObject({ billable: true, category: "marketing", country: "BR", cost_cents: 32.17, janela_gratis_de_anuncio: false });
  });

  it("o que a Meta diz que não é cobrável custa zero, mesmo com preço na tabela", () => {
    const c = custoDaMensagem({ billable: false, pricing_model: "PMP", type: "free_customer_service", category: "service" }, BR, TABELA_INICIAL);
    expect(c).toMatchObject({ billable: false, category: "service", cost_cents: 0, unit_price_cents: 3.5 });
  });

  it("conversa vinda de anúncio Click-to-WhatsApp fica marcada como janela grátis", () => {
    const c = custoDaMensagem({ billable: false, pricing_model: "PMP", type: "free_entry_point", category: "marketing" }, BR, TABELA_INICIAL);
    expect(c).toMatchObject({ cost_cents: 0, janela_gratis_de_anuncio: true, pricing_type: "free_entry_point" });
  });

  it("a categoria antiga de anúncio (referral_conversion) também é janela grátis", () => {
    const c = custoDaMensagem({ billable: false, category: "referral_conversion" }, BR, TABELA_INICIAL);
    expect(c).toMatchObject({ cost_cents: 0, janela_gratis_de_anuncio: true });
  });

  it("cobrável de país sem preço na tabela fica com custo desconhecido, não zero", () => {
    const c = custoDaMensagem({ billable: true, category: "marketing" }, "351912345678", TABELA_INICIAL);
    expect(c).toMatchObject({ billable: true, cost_cents: null, country: null });
  });

  it("sem pricing no evento não há custo a registrar", () => {
    expect(custoDaMensagem(undefined, BR, TABELA_INICIAL)).toBeNull();
    expect(custoDaMensagem({ pricing_model: "PMP" }, BR, TABELA_INICIAL)).toBeNull();
  });
});
