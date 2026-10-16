/**
 * O PERFIL GUIADO NO EDITOR DO AGENTE (issue #89) — a tela, como o dono a usa.
 *
 * Três promessas da tela, cada uma com o seu controle:
 *  1. agente que existia SEM perfil abre sem perfil e, se ninguém mexe, nada vira
 *     "alteração" (não suja o rascunho) e o envio leva tudo nulo — o que o motor
 *     lê como "o prompt de sempre";
 *  2. preencher o formulário leva os campos (e a temperatura) ao servidor, e a
 *     visão "como o agente recebe" mostra o perfil composto com as instruções
 *     livres — a mesma composição que o motor aplica;
 *  3. temperatura fora de 0..1 não sai da tela.
 *
 * O servidor e o motor têm as provas deles
 * (`tests/invariants/perfil-guiado-do-agente-no-turno.test.ts`); aqui se prova só
 * o que a tela decide.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const ORG = "33333333-3333-4333-8333-333333333333";
const AGENTE = "44444444-4444-4444-8444-444444444444";
const CREDENCIAL = "11111111-1111-4111-8111-111111111111";
const CANAL = "22222222-2222-4222-8222-222222222222";

const acoes = vi.hoisted(() => ({ salvar: vi.fn(), publicar: vi.fn(), criar: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/app/ai/agents/${AGENTE}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/app/app/ai/agents/[id]/_actions", () => ({
  saveAgentDraftAction: acoes.salvar,
  publishAgentAction: acoes.publicar,
  createMcpAgentAction: acoes.criar,
}));

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";

const PROMPT = "Você é a recepção da clínica. Atenda com educação.";

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

/** Uma versão de ANTES desta funcionalidade: nenhum campo de perfil, sem temperatura. */
const VERSAO_ANTIGA = {
  id: "v1",
  organization_id: ORG,
  agent_id: AGENTE,
  version_number: 1,
  status: "published",
  system_prompt: PROMPT,
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
  trigger_config: null,
  published_at: "2026-01-01T00:00:00Z",
  superseded_at: null,
  created_at: "2026-01-01T00:00:00Z",
  created_by: null,
  profile_persona: null,
  profile_tone: null,
  profile_objective: null,
  profile_welcome: null,
  profile_language: null,
  temperature: null,
};

function abrirEditor(versao: Record<string, unknown> = VERSAO_ANTIGA) {
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
        published={versao as never}
        base={versao as never}
        draftObsoleto={null}
      />
    </QueryClientProvider>,
  );
  const campo = (id: string) => {
    const el = container.querySelector(`#${id}`);
    if (!el) throw new Error(`campo #${id} não existe na tela`);
    return el as HTMLInputElement | HTMLTextAreaElement;
  };
  return { campo, container };
}

async function salvarRascunho() {
  fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));
  await waitFor(() => expect(acoes.salvar).toHaveBeenCalled());
  return acoes.salvar.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe("perfil guiado no editor do agente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acoes.salvar.mockResolvedValue({ ok: true, data: { version_id: "v2", version_number: 2 } });
  });

  it("agente antigo abre sem perfil, não suja o rascunho e mostra só as instruções livres", () => {
    abrirEditor();
    expect(screen.getByRole("button", { name: /salvar rascunho/i })).toBeDisabled();
    // O modo avançado fica ABERTO: sem perfil, as instruções livres são tudo o que o agente tem.
    expect(screen.getByTestId("modo-avancado")).toHaveAttribute("open");
    // E a visão "como o agente recebe" é exatamente o prompt, byte a byte.
    expect(screen.getByTestId("perfil-composicao").textContent).toBe(PROMPT);
    for (const tom of ["formal", "normal", "descontraido"]) {
      expect(screen.getByTestId(`perfil-tom-${tom}`)).toHaveAttribute("aria-checked", "false");
    }
  });

  it("editar o prompt de um agente sem perfil leva o perfil TODO NULO — o motor lê 'só o prompt'", async () => {
    const { campo } = abrirEditor();
    fireEvent.change(campo("name"), { target: { value: "Recepção 2" } });
    const versao = await salvarRascunho();
    expect(versao).toMatchObject({
      system_prompt: PROMPT,
      profile_persona: null,
      profile_tone: null,
      profile_objective: null,
      profile_welcome: null,
      profile_language: null,
      temperature: null,
    });
  });

  it("preencher o formulário leva os campos e a temperatura ao servidor", async () => {
    const { campo } = abrirEditor();
    fireEvent.change(campo("perfil_persona"), { target: { value: "  Marina, da recepção  " } });
    fireEvent.click(screen.getByTestId("perfil-tom-descontraido"));
    fireEvent.change(campo("perfil_objetivo"), { target: { value: "Marcar a avaliação" } });
    fireEvent.change(campo("perfil_boas_vindas"), { target: { value: "Oi! Eu sou a Marina." } });
    fireEvent.change(campo("temperature"), { target: { value: "0.3" } });

    const versao = await salvarRascunho();
    expect(versao).toMatchObject({
      profile_persona: "Marina, da recepção",
      profile_tone: "descontraido",
      profile_objective: "Marcar a avaliação",
      profile_welcome: "Oi! Eu sou a Marina.",
      temperature: 0.3,
    });
  });

  it("a visão 'como o agente recebe' compõe o perfil com as instruções livres", () => {
    const { campo } = abrirEditor();
    fireEvent.change(campo("perfil_persona"), { target: { value: "Marina" } });
    fireEvent.click(screen.getByTestId("perfil-tom-formal"));
    const texto = screen.getByTestId("perfil-composicao").textContent ?? "";
    expect(texto).toContain("## Perfil do agente");
    expect(texto).toContain("- Persona: Marina");
    expect(texto).toContain("- Tom de voz: formal");
    expect(texto.endsWith(`## Instruções\n${PROMPT}`)).toBe(true);
  });

  it("clicar no tom já marcado o desmarca (volta a 'sem tom')", () => {
    abrirEditor();
    const normal = screen.getByTestId("perfil-tom-normal");
    fireEvent.click(normal);
    expect(normal).toHaveAttribute("aria-checked", "true");
    fireEvent.click(normal);
    expect(normal).toHaveAttribute("aria-checked", "false");
  });

  it("agente que já tem perfil abre com o modo avançado fechado e os campos preenchidos", () => {
    const { campo } = abrirEditor({
      ...VERSAO_ANTIGA,
      profile_persona: "Marina",
      profile_tone: "formal",
      profile_language: "es",
      temperature: 0.2,
    });
    expect(campo("perfil_persona").value).toBe("Marina");
    expect(screen.getByTestId("perfil-tom-formal")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("modo-avancado")).not.toHaveAttribute("open");
    expect(campo("temperature").value).toBe("0.2");
  });

  it("temperatura fora de 0..1 não sai da tela", async () => {
    const { campo } = abrirEditor();
    fireEvent.change(campo("temperature"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));
    await waitFor(() => expect(screen.getByText(/temperatura vai de 0 a 1/i)).toBeInTheDocument());
    expect(acoes.salvar).not.toHaveBeenCalled();
  });
});
