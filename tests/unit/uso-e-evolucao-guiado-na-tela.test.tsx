/**
 * As faixas de Uso de IA e de Evolução da IA na tela — o que mostram, quando pedem atenção e a
 * recomendação (só a do limite, só para quem pode editá-lo).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResumoDaEvolucaoFaixa } from "@/components/ai/ResumoDaEvolucao";
import { ResumoDoUso } from "@/components/ai/ResumoDoUso";
import type { BudgetStatus } from "@/hooks/ai/useAiBudget";
import { resumoDaEvolucao } from "@/lib/ai/evolution/resumo-da-evolucao";

vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(() => new Promise(() => {})) } }));

afterEach(cleanup);

const status = (extra: Partial<BudgetStatus> = {}): BudgetStatus =>
  ({
    organization_id: "org",
    monthly_limit_cents: 5000,
    current_month_consumed_cents: 0,
    pct: 0,
    alarm_threshold_pct: 80,
    enforcement_mode: "off",
    enforcement_effective_at: null,
    gasto_incompleto: false,
    enforcement_env: "on",
    blocked_now: false,
    current_period_start: "2026-10-01",
    last_alarm_sent_at: null,
    updated_at: "2026-10-28T00:00:00Z",
    ...extra,
  }) as BudgetStatus;

function uso(s: BudgetStatus, isAdmin = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ResumoDoUso initialData={s} isAdmin={isAdmin} />
    </QueryClientProvider>,
  );
}

const texto = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, " ").trim();

describe("a faixa Seu uso de IA", () => {
  it("mostra gasto, limite, proteção e medição", () => {
    uso(status({ current_month_consumed_cents: 1250, pct: 25, enforcement_mode: "avisar" }));
    expect(texto("resumo-uso-gasto")).toContain("12,50");
    expect(texto("resumo-uso-limite")).toContain("50,00");
    expect(texto("resumo-uso-limite")).toContain("25% usado");
    expect(texto("resumo-uso-protecao")).toContain("Avisa");
    expect(texto("resumo-uso-protecao")).toContain("ao passar de 80%");
    expect(texto("resumo-uso-medicao")).toContain("Completa");
    expect(screen.getByTestId("uso-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("medição incompleta e IA parada pedem atenção", () => {
    uso(status({ gasto_incompleto: true, blocked_now: true, pct: 100 }));
    expect(screen.getByTestId("uso-esta-certo-estado")).toHaveAttribute("data-estado", "atencao");
    expect(texto("uso-esta-certo-estado")).toContain("3 pedem atenção");
    expect(texto("resumo-uso-medicao")).toContain("Incompleta");
    fireEvent.click(screen.getByTestId("uso-esta-certo-botao"));
    expect(texto("conferencia-uso-medicao")).toContain("o número é menor que o real");
    expect(texto("conferencia-uso-parada")).toContain("A IA está parada por gasto");
  });

  it("sem limite: recomenda definir um, com o motivo, a quem é administrador", () => {
    uso(status({ monthly_limit_cents: 0 }));
    expect(texto("resumo-uso-limite")).toContain("sem limite");
    expect(screen.getByTestId("uso-recomenda-limite").textContent).toContain("Motivo:");
    expect(screen.getByTestId("uso-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("sem limite e sem poder editar: não recomenda, só manda pedir a um administrador", () => {
    uso(status({ monthly_limit_cents: 0 }), false);
    expect(screen.queryByTestId("uso-recomenda-limite")).toBeNull();
    expect(document.body.textContent).toContain("Só um administrador define o limite");
  });

  it("com limite definido não há recomendação", () => {
    uso(status());
    expect(screen.queryByTestId("uso-recomenda-limite")).toBeNull();
  });
});

describe("a faixa Sua evolução no período", () => {
  const base = { aprendeu: 3, usos: 10, fechados: 2, perdidos: 1, travas: 0 };

  it("mostra as quatro respostas", () => {
    render(<ResumoDaEvolucaoFaixa resumo={resumoDaEvolucao(base)} />);
    expect(texto("resumo-evolucao-aprendeu")).toContain("3");
    expect(texto("resumo-evolucao-usou")).toContain("10");
    expect(texto("resumo-evolucao-negocios")).toContain("2 / 1");
    expect(texto("resumo-evolucao-travando")).toContain("nenhuma lacuna neste período");
    expect(screen.getByTestId("evolucao-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("lacunas pedem atenção e a conferência leva a O que está travando", () => {
    render(<ResumoDaEvolucaoFaixa resumo={resumoDaEvolucao({ ...base, travas: 2 })} />);
    expect(texto("evolucao-esta-certo-estado")).toContain("1 pede atenção");
    fireEvent.click(screen.getByTestId("evolucao-esta-certo-botao"));
    expect(texto("conferencia-evolucao-travando")).toContain("2 lacunas estão limitando o agente");
    expect(screen.getByTestId("evolucao-ir-travando")).toHaveAttribute("href", "#bloco-travando");
  });

  it("período vazio não é erro: aprender e usar nada ficam como informação", () => {
    render(<ResumoDaEvolucaoFaixa resumo={resumoDaEvolucao({ aprendeu: 0, usos: 0, fechados: 0, perdidos: 0, travas: 0 })} />);
    expect(screen.getByTestId("evolucao-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
    fireEvent.click(screen.getByTestId("evolucao-esta-certo-botao"));
    expect(screen.getByTestId("conferencia-evolucao-aprendizado")).toHaveAttribute("data-estado", "info");
  });
});
