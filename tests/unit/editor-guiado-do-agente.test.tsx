/**
 * O GUIA DENTRO DO EDITOR COMPLETO DO AGENTE: a tela, como o dono a usa.
 *
 * Quatro promessas, cada uma com o seu controle:
 *  1. a "Força do agente" diz quão pronto ele está e leva ao próximo passo;
 *  2. cada parte do editor leva um selo (Pronto / Revisar / Opcional);
 *  3. "Jeito de responder" tem uma prévia que muda com o formato e o tom, sem tocar no
 *     formulário até alguém pedir "Usar este tom";
 *  4. os campos de texto do perfil oferecem exemplos que se aplicam com um clique.
 *
 * A régua pura tem a prova própria em `lib/ai/agents/guia-do-editor.test.ts`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const ORG = "33333333-3333-4333-8333-333333333333";
const AGENTE = "44444444-4444-4444-8444-444444444444";
const CREDENCIAL = "11111111-1111-4111-8111-111111111111";
const CANAL = "22222222-2222-4222-8222-222222222222";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/app/ai/agents/${AGENTE}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/app/app/ai/agents/[id]/_actions", () => ({
  saveAgentDraftAction: vi.fn(),
  publishAgentAction: vi.fn(),
  createMcpAgentAction: vi.fn(),
}));

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";
import { MODELOS_DE_AGENTE } from "@/lib/ai/agents/modelos";

const AGENTE_ROW = {
  id: AGENTE,
  organization_id: ORG,
  name: "Recepção",
  description: null,
  priority: 0,
  model: "claude-sonnet-5",
  system_prompt: "x",
  is_active: true,
  is_default: false,
  config: {},
  guardrails: [],
  active_kb_version_id: null,
  kind: "mcp_agent",
  published_version_id: "v1",
  archived_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

/** Um agente com instruções próprias, número e saída para uma pessoa; sem material, sem ações. */
const VERSAO = {
  id: "v1",
  organization_id: ORG,
  agent_id: AGENTE,
  version_number: 1,
  status: "published",
  system_prompt: "Você é a recepção da clínica. Atenda com educação.",
  provider: "anthropic",
  model: "claude-sonnet-5",
  credential_id: CREDENCIAL,
  tool_ids: [],
  channel_session_id: CANAL,
  max_steps: 10,
  token_budget: 50000,
  cost_budget_cents: 50,
  history_message_window: 20,
  history_token_window: 8000,
  handoff_keywords: [],
  handoff_tool_enabled: true,
  cases_enabled: false,
  split_messages: false,
  split_max_chars: 600,
  followup: { enabled: false, flow_pointer_ids: [] },
  operator_enabled: false,
  operator_model: null,
  operator_tool_ids: [],
  pipeline_ids: [],
  knowledge_source_ids: [],
  external_tool_ids: [],
  trigger_config: null,
  published_at: "2026-01-01T00:00:00Z",
  superseded_at: null,
  created_at: "2026-01-01T00:00:00Z",
  created_by: null,
  profile_persona: null,
  profile_tone: "normal",
  profile_objective: null,
  profile_welcome: null,
  profile_language: null,
  temperature: null,
};

function abrirEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <AgentForm
        mode="edit"
        agent={AGENTE_ROW as never}
        credentials={
          [{ id: CREDENCIAL, provider: "anthropic", label: "chave", is_active: true }] as never
        }
        channelSessions={[{ id: CANAL, label: "WhatsApp da clínica", status: "WORKING" }] as never}
        draft={null}
        published={VERSAO as never}
        base={VERSAO as never}
        draftObsoleto={null}
      />
    </QueryClientProvider>,
  );
  return { container };
}

describe("editor completo do agente, com o guia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("a Força do agente soma o que está pronto e aponta o passo de maior peso", () => {
    abrirEditor();
    // nome 10 + personalidade 20 (instruções próprias) + pessoa 15 + número 10 + modelo 5
    expect(screen.getByTestId("forca-percentual")).toHaveTextContent("60%");
    expect(screen.getByTestId("forca-proximo")).toHaveAttribute("data-passo", "materiais");
    expect(screen.getByRole("progressbar", { name: /força do agente/i })).toHaveAttribute(
      "aria-valuenow",
      "60",
    );
    // O detalhe lista o que compõe a régua, com o que falta marcado.
    expect(screen.getByTestId("passo-materiais")).toHaveAttribute("data-feito", "nao");
    expect(screen.getByTestId("passo-nome")).toHaveAttribute("data-feito", "sim");
  });

  it("'Ir para lá' rola até a parte onde o passo se resolve", async () => {
    abrirEditor();
    fireEvent.click(screen.getByTestId("forca-ir"));
    await vi.waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    const alvo = vi.mocked(Element.prototype.scrollIntoView).mock.contexts.at(-1) as HTMLElement;
    expect(alvo.id).toBe("secao-conhecimento");
  });

  it("cada parte leva o seu selo: sem material pede revisão, retornos desligados são opcionais", () => {
    abrirEditor();
    const selo = (secao: string) =>
      within(document.getElementById(`secao-${secao}`) as HTMLElement).getByText(
        /^(Pronto|Revisar|Opcional)$/,
      );
    expect(selo("conhecimento")).toHaveTextContent("Revisar");
    expect(selo("quem")).toHaveTextContent("Pronto");
    expect(selo("respostas")).toHaveTextContent("Pronto");
    expect(selo("vendas")).toHaveTextContent("Opcional");
    // E a recomendação com motivo aparece onde falta o material.
    expect(screen.getByTestId("recomendado-conhecimento")).toHaveTextContent(/improvisa/i);
  });

  it("a prévia acompanha o formato: texto único vira mensagens curtas ao ligar a chave", () => {
    const { container } = abrirEditor();
    expect(screen.getAllByTestId("previa-bolha")).toHaveLength(1);
    fireEvent.click(container.querySelector("#split_messages") as HTMLElement);
    expect(screen.getAllByTestId("previa-bolha")).toHaveLength(3);
    // Ligou as mensagens curtas: a recomendação cumprida some.
    expect(screen.queryByTestId("recomendado-respostas")).toBeNull();
  });

  it("experimentar um tom na prévia não toca o formulário; 'Usar este tom' grava", () => {
    abrirEditor();
    const antes = screen.getAllByTestId("previa-bolha")[0]!.textContent;
    fireEvent.click(screen.getByTestId("previa-tom-descontraido"));
    expect(screen.getAllByTestId("previa-bolha")[0]!.textContent).not.toBe(antes);
    // O tom do formulário continua o normal.
    expect(screen.getByTestId("perfil-tom-normal")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("perfil-tom-descontraido")).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByTestId("previa-usar-tom"));
    expect(screen.getByTestId("perfil-tom-descontraido")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("previa-usar-tom")).toBeNull();
  });

  it("um exemplo do perfil preenche o campo com o texto do modelo, no idioma do agente", () => {
    const { container } = abrirEditor();
    fireEvent.click(screen.getByTestId("exemplo-persona-vendas"));
    const vendas = MODELOS_DE_AGENTE.find((m) => m.id === "vendas")!.conteudo["pt-BR"];
    expect((container.querySelector("#perfil_persona") as HTMLTextAreaElement).value).toBe(
      vendas.persona,
    );
  });
});
