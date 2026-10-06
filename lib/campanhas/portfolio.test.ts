import { describe, expect, it } from "vitest";

import { LIMITE_QUANDO_NAO_SE_SABE, portfolioDoNumero, type NumeroDoPortfolio } from "./portfolio";

const numero = (
  id: string,
  portfolio: string | null,
  limite: string | null,
  extra: Partial<NumeroDoPortfolio> = {},
): NumeroDoPortfolio => ({
  id,
  organization_id: "org-a",
  meta_waba_id: `waba-${id}`,
  meta_portfolio_id: portfolio,
  meta_limite_de_mensagens: limite,
  ...extra,
});

describe("portfolioDoNumero — quem divide o limite diário com o número da campanha", () => {
  it("números do mesmo portfólio dividem o limite, mesmo em WABAs e organizações diferentes", () => {
    const r = portfolioDoNumero(
      [
        numero("a", "P1", "TIER_2K"),
        numero("b", "P1", "TIER_2K", { organization_id: "org-b" }),
        numero("c", "P2", "TIER_10K"),
      ],
      "a",
    );
    expect(r.sessoes.sort()).toEqual(["a", "b"]);
    expect(r.teto).toBe(2000);
    expect(r.limite).toBe("TIER_2K");
  });

  it("portfólio desconhecido da MESMA organização ou da mesma WABA entra no grupo — errar para menos é o seguro", () => {
    const r = portfolioDoNumero(
      [
        numero("a", "P1", "TIER_2K", { meta_waba_id: "W1" }),
        numero("b", null, null),
        numero("c", null, null, { organization_id: "org-b", meta_waba_id: "W1" }),
        numero("d", null, null, { organization_id: "org-b" }),
        numero("e", "P2", null),
      ],
      "a",
    );
    expect(r.sessoes.sort()).toEqual(["a", "b", "c"]);
  });

  it("com o portfólio do número desconhecido, contam juntos os oficiais da organização e os da mesma WABA", () => {
    const r = portfolioDoNumero(
      [
        numero("a", null, "TIER_1K", { meta_waba_id: "W1" }),
        numero("b", "P1", "TIER_10K"),
        numero("c", "P9", "TIER_10K", { organization_id: "org-b", meta_waba_id: "W1" }),
        numero("d", "P9", "TIER_10K", { organization_id: "org-b" }),
      ],
      "a",
    );
    expect(r.sessoes.sort()).toEqual(["a", "b", "c"]);
    expect(r.teto).toBe(1000);
  });

  it("o teto é a MENOR faixa conhecida do grupo", () => {
    const r = portfolioDoNumero([numero("a", "P1", "TIER_10K"), numero("b", "P1", "TIER_2K")], "a");
    expect(r.teto).toBe(2000);
  });

  it("sem nenhuma faixa conhecida, vale a faixa inicial da Meta", () => {
    const r = portfolioDoNumero([numero("a", "P1", null), numero("b", "P1", "UM_VALOR_NOVO")], "a");
    expect(r.teto).toBe(LIMITE_QUANDO_NAO_SE_SABE);
    expect(r.limite).toBeNull();
  });

  it("ilimitado não tem teto", () => {
    const r = portfolioDoNumero([numero("a", "P1", "TIER_UNLIMITED")], "a");
    expect(r.teto).toBe(Number.POSITIVE_INFINITY);
  });

  it("número que não está na lista divide o limite só consigo, com a faixa inicial", () => {
    const r = portfolioDoNumero([numero("b", "P1", "TIER_2K")], "a");
    expect(r.sessoes).toEqual(["a"]);
    expect(r.teto).toBe(LIMITE_QUANDO_NAO_SE_SABE);
  });
});
