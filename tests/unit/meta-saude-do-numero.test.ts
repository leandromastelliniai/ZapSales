/**
 * A SAÚDE DO NÚMERO OFICIAL (issue #5): o que a Meta empurra pelo webhook vira
 * estado do número e, na QUEDA, aviso na Central.
 *
 * Duas fontes de formato, as duas medidas aqui porque a própria documentação da
 * Meta se contradiz (pesquisa de 05/10/2026):
 *  - `phone_number_quality_update` traz `event` e o limite — `current_limit`
 *    (descontinuado em fev/2026) ou `max_daily_conversations_per_business`;
 *  - `business_capability_update` traz `max_daily_conversations_per_business`
 *    como NÚMERO no exemplo (2000) e como `TIER_2K` no texto.
 */
import { describe, expect, it } from "vitest";

import { avisoDeSaude, limiteDoPortfolio } from "@/lib/channels/meta/saude-do-numero";
import { parseMetaWebhook } from "@/lib/channels/meta/webhook";

const WABA = "102290129340398";

function envelope(field: string, value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: WABA, time: 1748454394, changes: [{ field, value }] }],
  };
}

describe("parseMetaWebhook — eventos de saúde", () => {
  it("phone_number_quality_update vira evento do número, com o limite do portfólio", () => {
    const eventos = parseMetaWebhook(
      envelope("phone_number_quality_update", {
        display_phone_number: "15550783881",
        event: "FLAGGED",
        max_daily_conversations_per_business: "TIER_10K",
      }),
    );
    expect(eventos).toEqual([
      { kind: "number_quality", wabaId: WABA, displayPhoneNumber: "15550783881", event: "FLAGGED", limite: "TIER_10K" },
    ]);
  });

  it("aceita o formato antigo (current_limit)", () => {
    const [e] = parseMetaWebhook(
      envelope("phone_number_quality_update", {
        display_phone_number: "15550783881",
        event: "DOWNGRADE",
        current_limit: "TIER_250",
      }),
    );
    expect(e).toMatchObject({ kind: "number_quality", event: "DOWNGRADE", limite: "TIER_250" });
  });

  it("business_capability_update com o limite em número ou em faixa", () => {
    const [comNumero] = parseMetaWebhook(
      envelope("business_capability_update", { max_daily_conversations_per_business: 2000, max_phone_numbers_per_waba: 25 }),
    );
    expect(comNumero).toEqual({ kind: "business_capability", wabaId: WABA, limite: "TIER_2K" });

    const [comFaixa] = parseMetaWebhook(
      envelope("business_capability_update", { max_daily_conversations_per_business: "TIER_100K" }),
    );
    expect(comFaixa).toMatchObject({ limite: "TIER_100K" });

    const [legado] = parseMetaWebhook(envelope("business_capability_update", { max_daily_conversation_per_phone: -1 }));
    expect(legado).toMatchObject({ limite: "TIER_UNLIMITED" });
  });

  it("evento de saúde capenga é ignorado, não vira linha meia-boca", () => {
    expect(parseMetaWebhook(envelope("business_capability_update", { max_phone_numbers_per_waba: 25 }))).toEqual([]);
  });
});

describe("limiteDoPortfolio — número e faixa no mesmo vocabulário", () => {
  it.each([
    [250, "TIER_250"],
    [2000, "TIER_2K"],
    [10000, "TIER_10K"],
    [100000, "TIER_100K"],
    [-1, "TIER_UNLIMITED"],
    ["TIER_2K", "TIER_2K"],
    ["tier_unlimited", "TIER_UNLIMITED"],
    [null, null],
    ["", null],
    [{}, null],
  ])("%j → %j", (entrada, saida) => {
    expect(limiteDoPortfolio(entrada)).toBe(saida);
  });

  it("número fora das faixas vira faixa sintética, sem perder o valor", () => {
    expect(limiteDoPortfolio(5000)).toBe("TIER_5000");
  });
});

describe("avisoDeSaude — só a QUEDA avisa", () => {
  const apelido = "Loja (+55 31 90000-0000)";

  it("verde → amarela avisa (warn)", () => {
    const a = avisoDeSaude({ qualidade: "GREEN", limite: "TIER_2K" }, { qualidade: "YELLOW", limite: "TIER_2K" }, apelido);
    expect(a).toMatchObject({ severity: "warn" });
    expect(a!.title).toContain(apelido);
    expect(a!.title).toMatch(/qualidade/i);
  });

  it("qualquer → vermelha é crítico", () => {
    expect(avisoDeSaude({ qualidade: "YELLOW", limite: null }, { qualidade: "RED", limite: null }, apelido)).toMatchObject({
      severity: "critical",
    });
    expect(avisoDeSaude({ qualidade: null, limite: null }, { qualidade: "RED", limite: null }, apelido)).toMatchObject({
      severity: "critical",
    });
  });

  it("limite que cai avisa", () => {
    const a = avisoDeSaude({ qualidade: "GREEN", limite: "TIER_10K" }, { qualidade: "GREEN", limite: "TIER_2K" }, apelido);
    expect(a).toMatchObject({ severity: "warn" });
    expect(a!.title).toMatch(/limite/i);
  });

  it("subir, ficar igual ou não saber NÃO avisa — aviso repetido ensina a ignorar", () => {
    expect(avisoDeSaude({ qualidade: "RED", limite: null }, { qualidade: "GREEN", limite: null }, apelido)).toBeNull();
    expect(avisoDeSaude({ qualidade: "YELLOW", limite: "TIER_2K" }, { qualidade: "YELLOW", limite: "TIER_2K" }, apelido)).toBeNull();
    expect(avisoDeSaude({ qualidade: "GREEN", limite: "TIER_2K" }, { qualidade: "UNKNOWN", limite: null }, apelido)).toBeNull();
    expect(avisoDeSaude({ qualidade: "GREEN", limite: "TIER_2K" }, { qualidade: "GREEN", limite: "TIER_10K" }, apelido)).toBeNull();
  });
});
