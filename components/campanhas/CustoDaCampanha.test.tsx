/**
 * O custo da campanha oficial pela tela (issue #10): a estimativa antes do
 * disparo e o cartão de custo depois.
 *
 * O hook de dados é dublado com o relatório que a API devolve; o resto é o
 * componente de verdade.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { CampanhaDetalhada } from "@/hooks/campanhas/useCampanhas";
import type { RelatorioDeCusto } from "@/lib/custo/relatorio";

const dados = vi.hoisted(() => ({ relatorio: null as unknown }));
vi.mock("@/hooks/campanhas/useCampanhas", () => ({
  useCustoDaCampanha: () => ({ isPending: false, isError: false, data: dados.relatorio }),
}));

import { CustoDaCampanha, LinhaDaEstimativa } from "./CustoDaCampanha";

const CAMPANHA = {
  id: "c1",
  status: "running",
  completed_at: null,
  meta_template_id: "m1",
  pausa_motivo: null,
  pausa_detalhe: null,
} as unknown as CampanhaDetalhada;

function relatorio(extra: Partial<RelatorioDeCusto> = {}): RelatorioDeCusto {
  return {
    oficial: true,
    estimativa: {
      categoria: "marketing",
      mensagens: 3,
      total_cents: 96.51,
      currency: "BRL",
      sem_preco: 0,
      por_pais: [{ country: "BR", quantidade: 3, unit_price_cents: 32.17, subtotal_cents: 96.51 }],
    },
    estimativa_parcial: false,
    teto_gasto_cents: 7000,
    meta_cents: 0,
    meta_estimado_cents: 0,
    mensagens_com_custo: 0,
    mensagens_sem_preco: 0,
    ia_cents: 0,
    ia_usd_cents: 0,
    cotacao_usd_brl: 5.4,
    cotacao_de_referencia: true,
    total_cents: 0,
    responderam: 0,
    custo_por_lead_que_respondeu_cents: null,
    conversas_de_anuncio: 0,
    currency: "BRL",
    ...extra,
  };
}

describe("a estimativa antes do disparo", () => {
  it("mostra o total, a quantidade e o preço unitário da categoria", () => {
    render(<LinhaDaEstimativa estimativa={relatorio().estimativa!} />);
    const linha = screen.getByTestId("estimativa-de-custo");
    expect(linha.textContent).toContain("R$ 0,97");
    expect(linha.textContent).toContain("3 × R$ 0,3217");
    expect(linha.textContent).toContain("Marketing");
  });

  it("avisa quem ficou sem preço, sem somá-lo como zero", () => {
    const e = { ...relatorio().estimativa!, mensagens: 4, sem_preco: 1 };
    render(<LinhaDaEstimativa estimativa={e} />);
    expect(screen.getByText(/1 destinatários são de países sem preço/)).toBeTruthy();
  });

  it("o cartão de custo de campanha que ainda não enviou mostra a estimativa e o teto", () => {
    dados.relatorio = relatorio();
    render(<CustoDaCampanha campanha={CAMPANHA} />);
    const cartao = screen.getByTestId("custo-da-campanha");
    expect(cartao.textContent).toContain("Teto da campanha: R$ 70,00");
    expect(within(cartao).getByTestId("estimativa-de-custo")).toBeTruthy();
  });
});

describe("o relatório depois do disparo", () => {
  it("soma Meta e IA, mostra o custo por lead e as conversas de anúncio", () => {
    dados.relatorio = relatorio({
      mensagens_com_custo: 3,
      meta_cents: 64.34,
      ia_cents: 54,
      ia_usd_cents: 10,
      total_cents: 118.34,
      responderam: 2,
      custo_por_lead_que_respondeu_cents: 59.17,
      conversas_de_anuncio: 1,
    });
    render(<CustoDaCampanha campanha={CAMPANHA} />);
    const texto = screen.getByTestId("custo-da-campanha").textContent ?? "";
    expect(texto).toContain("Custo da MetaR$ 0,64");
    expect(texto).toContain("Custo de IA");
    expect(texto).toContain("TotalR$ 1,18");
    expect(texto).toContain("R$ 0,59");
    expect(texto).toContain("2 pessoas responderam");
    expect(texto).toContain("Conversas vindas de anúncio (janela grátis)");
  });

  it("sem resposta, o custo por lead é um traço, não zero", () => {
    dados.relatorio = relatorio({ mensagens_com_custo: 1, meta_cents: 32.17, total_cents: 32.17 });
    render(<CustoDaCampanha campanha={CAMPANHA} />);
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("campanha do modo de texto livre não tem cartão de custo", () => {
    dados.relatorio = relatorio();
    const { container } = render(<CustoDaCampanha campanha={{ ...CAMPANHA, meta_template_id: null }} />);
    expect(container.textContent).toBe("");
  });
});
