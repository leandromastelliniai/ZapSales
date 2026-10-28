/**
 * A faixa "Seus tipos de agendamento" na tela — o que mostra, quando pede atenção, a recomendação do
 * lembrete (com motivo) e a ordem da página (tipos primeiro, regras da agenda depois).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TiposDeAgendamentoClient, type TipoRow } from "@/app/app/settings/tenant/agenda/_client";
import type { HorariosDoResponsavel } from "@/lib/agenda/resumo-dos-tipos";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

afterEach(cleanup);

const tipo = (id: string, extra: Partial<TipoRow> = {}): TipoRow => ({
  id,
  name: `Tipo ${id}`,
  slug: `tipo-${id}`,
  description: null,
  category: "consulta",
  duration_minutes: 30,
  location_kind: "in_person",
  location_details: null,
  default_owner_user_id: "ana",
  requires_confirmation: false,
  is_active: true,
  reminder_enabled: false,
  reminder_minutes_before: 60,
  reminder_extra_offsets_minutes: [],
  reminder_body: null,
  reminder_bodies: null,
  default_price_cents: null,
  ...extra,
});

function montar(
  tipos: TipoRow[],
  horarios: Record<string, HorariosDoResponsavel> = { ana: "publicado" },
  props: Partial<React.ComponentProps<typeof TiposDeAgendamentoClient>> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TiposDeAgendamentoClient
        tiposIniciais={tipos}
        horarios={horarios}
        pessoas={[{ id: "ana", papel: "admin", nome: "Ana" }]}
        podeEditar
        usuarioAtualId="ana"
        podeConfigurarGoogle={false}
        clientePelaAgendaLigado={false}
        podeLigarClientePelaAgenda={false}
        colegasPodemMexerNaAgendaLigado
        podeMudarAgendaDosColegas={false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

const texto = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, " ").trim();

describe("a faixa Seus tipos de agendamento", () => {
  it("mostra as quatro respostas e marca cada tipo com a sua situação", () => {
    montar(
      [
        tipo("1", { reminder_enabled: true }),
        tipo("2", { default_owner_user_id: null }),
        tipo("3", { default_owner_user_id: "bia" }),
        tipo("4", { is_active: false }),
      ],
      { ana: "publicado", bia: "nao_publicado" },
    );
    expect(texto("resumo-tipos-ativos")).toContain("3");
    expect(texto("resumo-tipos-ativos")).toContain("1 desativado");
    expect(texto("resumo-tipos-prontos")).toContain("1/3");
    expect(texto("resumo-tipos-ajuste")).toContain("2");
    expect(texto("resumo-tipos-avisam")).toContain("1/3");
    expect(screen.getByTestId("pronto-1")).toBeTruthy();
    expect(screen.getByTestId("sem-dono-2")).toBeTruthy();
    expect(screen.getByTestId("sem-horarios-3")).toHaveAttribute("href", "/app/team?aba=atendimento");
    expect(screen.queryByTestId("pronto-4")).toBeNull();
  });

  it("tudo certo não pede atenção, e o lembrete é só sugestão", () => {
    montar([tipo("1")]);
    expect(screen.getByTestId("tipos-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
    expect(screen.getByTestId("tipos-recomenda-lembrete").textContent).toContain("Motivo:");
  });

  it("a recomendação some quando todo tipo ativo já avisa o cliente", () => {
    montar([tipo("1", { reminder_enabled: true })]);
    expect(screen.queryByTestId("tipos-recomenda-lembrete")).toBeNull();
  });

  it("sem responsável e sem horários pedem atenção, e as conferências dizem o porquê", () => {
    montar([tipo("1", { default_owner_user_id: null }), tipo("2", { default_owner_user_id: "bia" })], {
      bia: "nao_publicado",
    });
    expect(screen.getByTestId("tipos-esta-certo-estado")).toHaveAttribute("data-estado", "atencao");
    expect(texto("tipos-esta-certo-estado")).toContain("2 pedem atenção");
    expect(screen.queryByTestId("conferencia-tipos-horarios")).toBeNull();
    fireEvent.click(screen.getByTestId("tipos-esta-certo-botao"));
    expect(texto("conferencia-tipos-responsavel")).toContain("1 tipo ativo não tem responsável");
    expect(texto("conferencia-tipos-horarios")).toContain("não tem horários de atendimento publicados");
    expect(screen.getByTestId("tipos-ir-publicar-horarios")).toHaveAttribute("href", "/app/team?aba=atendimento");
  });

  it("horário que a leitura não alcançou não vira 'sem horários'", () => {
    montar([tipo("1")], {});
    expect(screen.getByTestId("horarios-nao-lidos-1")).toBeTruthy();
    expect(screen.queryByTestId("sem-horarios-1")).toBeNull();
    expect(texto("resumo-tipos-ajuste")).toContain("1 não consegui ler agora");
  });

  it("nenhum tipo ativo: a faixa avisa, sem inventar 'tudo certo'", () => {
    montar([tipo("1", { is_active: false })]);
    expect(screen.getByTestId("tipos-esta-certo-estado")).toHaveAttribute("data-estado", "atencao");
    expect(screen.queryByTestId("tipos-recomenda-lembrete")).toBeNull();
  });

  it("falha de leitura da lista: sem faixa (a tela não viu os tipos)", () => {
    montar([], {}, { erroDeLeitura: "falhou" });
    expect(screen.queryByTestId("resumo-dos-tipos")).toBeNull();
    expect(screen.getByTestId("erro-ao-ler-tipos")).toBeTruthy();
  });

  it("a ordem: faixa, lista de tipos e só depois as regras da agenda", () => {
    montar([tipo("1")]);
    const faixa = screen.getByTestId("resumo-dos-tipos");
    const lista = screen.getByTestId("lista-de-tipos");
    const regras = screen.getByTestId("regras-da-agenda");
    expect(faixa.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lista.compareDocumentPosition(regras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(regras.querySelector("h2")?.textContent).toBe("Regras da agenda");
  });
});
