/**
 * MODELOS POR RAMO E RESTRINGIR TEMAS NO EDITOR DO AGENTE (issue #92) — a tela,
 * como o dono a usa.
 *
 * Promessas da tela, cada uma com o seu controle:
 *  1. na CRIAÇÃO há uma galeria com os três ramos; escolher um preenche o perfil e as
 *     instruções (sem escrever prompt), no idioma da tela, e tudo segue editável;
 *  2. num agente que JÁ EXISTE não há galeria — trocar de modelo apagaria a configuração;
 *  3. restringir temas leva chave, lista (uma por linha) e resposta ao servidor; agente
 *     antigo, sem tocar nisso, leva "sem restrição" — o que o motor lê como o prompt de sempre;
 *  4. a visão "como o agente recebe" compõe a seção de assuntos com a MESMA função do motor;
 *  5. chave ligada com lista vazia avisa, e a lista não passa do teto.
 *
 * O servidor e o motor têm as provas deles
 * (`tests/invariants/restringir-temas-no-turno.test.ts`); aqui se prova só o que a tela decide.
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
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { aplicarModelo } from "@/lib/ai/agents/modelos";

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

/** Uma versão de ANTES desta funcionalidade: sem as colunas de restrição de temas. */
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

const CREDENCIAIS = [
  { id: CREDENCIAL, provider: "anthropic", label: "chave", is_active: true },
] as never;
const CANAIS = [{ id: CANAL, label: "WhatsApp da clínica", status: "WORKING" }] as never;

function campoDe(container: HTMLElement) {
  return (id: string) => {
    const el = container.querySelector(`#${id}`);
    if (!el) throw new Error(`campo #${id} não existe na tela`);
    return el as HTMLInputElement | HTMLTextAreaElement;
  };
}

function abrirEditor(versao: Record<string, unknown> = VERSAO_ANTIGA) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={qc}>
      <AgentForm
        mode="edit"
        agent={AGENTE_ROW as never}
        credentials={CREDENCIAIS}
        channelSessions={CANAIS}
        draft={null}
        published={versao as never}
        base={versao as never}
        draftObsoleto={null}
      />
    </QueryClientProvider>,
  );
  return { campo: campoDe(container), container };
}

function abrirCriacao(locale: string | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <IdiomaProvider locale={locale}>
      <QueryClientProvider client={qc}>
        <AgentForm
          mode="create"
          credentials={CREDENCIAIS}
          provedoresDaInstalacao={[]}
          channelSessions={CANAIS}
          organizationTimezone="America/Sao_Paulo"
        />
      </QueryClientProvider>
    </IdiomaProvider>,
  );
  return { campo: campoDe(container), container };
}

async function salvarRascunho() {
  fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));
  await waitFor(() => expect(acoes.salvar).toHaveBeenCalled());
  return acoes.salvar.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe("galeria de modelos na criação do agente", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra os três ramos, sem nenhum marcado", () => {
    abrirCriacao();
    for (const id of ["vendas", "suporte", "agendamento"]) {
      expect(screen.getByTestId(`modelo-${id}`)).toHaveAttribute("aria-checked", "false");
    }
    expect(screen.queryByTestId("modelo-aviso")).not.toBeInTheDocument();
  });

  it("escolher um ramo preenche perfil e instruções — sem escrever prompt — e o dono ainda edita", () => {
    const { campo } = abrirCriacao();
    fireEvent.click(screen.getByTestId("modelo-agendamento"));

    const esperado = aplicarModelo("agendamento", "pt-BR");
    expect(screen.getByTestId("modelo-agendamento")).toHaveAttribute("aria-checked", "true");
    expect(campo("name").value).toBe(esperado.name);
    expect(campo("perfil_persona").value).toBe(esperado.profile_persona);
    expect(campo("perfil_objetivo").value).toBe(esperado.profile_objective);
    expect(campo("perfil_boas_vindas").value).toBe(esperado.profile_welcome);
    expect(screen.getByTestId(`perfil-tom-${esperado.profile_tone}`)).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // As instruções livres já vêm escritas: a visão composta termina nelas.
    const composto = screen.getByTestId("perfil-composicao").textContent ?? "";
    expect(composto.endsWith(`## Instruções\n${esperado.system_prompt}`)).toBe(true);
    // Os assuntos vêm SUGERIDOS, mas a chave nasce desligada: o dono é quem liga.
    expect(campo("perfil_temas").value).toBe(esperado.allowed_topics.join("\n"));
    expect(campo("perfil_restringir_temas")).toHaveAttribute("aria-checked", "false");
    expect(composto).not.toContain("## Assuntos permitidos");

    // E tudo segue editável.
    fireEvent.change(campo("perfil_persona"), { target: { value: "Júlia, da recepção" } });
    expect(campo("perfil_persona").value).toBe("Júlia, da recepção");
  });

  it("não sobrescreve o nome que o dono já digitou", () => {
    const { campo } = abrirCriacao();
    fireEvent.change(campo("name"), { target: { value: "Minha Sofia" } });
    fireEvent.click(screen.getByTestId("modelo-vendas"));
    expect(campo("name").value).toBe("Minha Sofia");
  });

  it("trocar de ramo troca o conteúdo", () => {
    const { campo } = abrirCriacao();
    fireEvent.click(screen.getByTestId("modelo-vendas"));
    const vendas = campo("perfil_persona").value;
    fireEvent.click(screen.getByTestId("modelo-suporte"));
    expect(campo("perfil_persona").value).not.toBe(vendas);
    expect(campo("perfil_persona").value).toBe(aplicarModelo("suporte", "pt-BR").profile_persona);
  });

  it("no idioma da tela: em espanhol, a galeria e o que ela preenche vêm em espanhol", () => {
    const { campo } = abrirCriacao("es");
    expect(screen.getByTestId("modelo-vendas")).toHaveTextContent("Ventas");
    fireEvent.click(screen.getByTestId("modelo-vendas"));
    const esperado = aplicarModelo("vendas", "es");
    expect(campo("perfil_boas_vindas").value).toBe(esperado.profile_welcome);
    expect(screen.getByTestId("perfil-composicao").textContent).toContain("responda sempre em español");
  });

  it("agente que JÁ existe não tem galeria", () => {
    abrirEditor();
    expect(screen.queryByTestId("galeria-de-modelos")).not.toBeInTheDocument();
  });
});

describe("restringir temas no editor do agente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acoes.salvar.mockResolvedValue({ ok: true, data: { version_id: "v2", version_number: 2 } });
  });

  it("agente antigo abre sem restrição, não suja o rascunho e leva 'sem restrição' ao salvar", async () => {
    const { campo } = abrirEditor();
    expect(screen.getByRole("button", { name: /salvar rascunho/i })).toBeDisabled();
    expect(campo("perfil_restringir_temas")).toHaveAttribute("aria-checked", "false");
    fireEvent.change(campo("name"), { target: { value: "Recepção 2" } });
    const versao = await salvarRascunho();
    expect(versao).toMatchObject({ restrict_topics: false, allowed_topics: [], off_topic_reply: null });
  });

  it("ligar a chave com a lista e a resposta leva tudo ao servidor (um assunto por linha, aparado)", async () => {
    const { campo } = abrirEditor();
    fireEvent.click(campo("perfil_restringir_temas"));
    fireEvent.change(campo("perfil_temas"), {
      target: { value: "  Horários  \n\nValores de consulta\r\n   \nComo agendar" },
    });
    fireEvent.change(campo("perfil_resposta_fora"), {
      target: { value: "  Só ajudo com horários e valores.  " },
    });
    const versao = await salvarRascunho();
    expect(versao).toMatchObject({
      restrict_topics: true,
      allowed_topics: ["Horários", "Valores de consulta", "Como agendar"],
      off_topic_reply: "Só ajudo com horários e valores.",
    });
  });

  it("a visão 'como o agente recebe' compõe a seção de assuntos com as instruções livres", () => {
    const { campo } = abrirEditor();
    fireEvent.click(campo("perfil_restringir_temas"));
    fireEvent.change(campo("perfil_temas"), { target: { value: "Horários\nValores" } });
    const texto = screen.getByTestId("perfil-composicao").textContent ?? "";
    expect(texto).toContain("## Assuntos permitidos");
    expect(texto).toContain("- Horários");
    expect(texto).toContain("- Valores");
    expect(texto.endsWith(`## Instruções\n${PROMPT}`)).toBe(true);
  });

  it("chave ligada com a lista vazia avisa — e nada é restringido", () => {
    const { campo } = abrirEditor();
    expect(screen.queryByTestId("restringir-temas-vazio")).not.toBeInTheDocument();
    fireEvent.click(campo("perfil_restringir_temas"));
    expect(screen.getByTestId("restringir-temas-vazio")).toBeInTheDocument();
    expect(screen.getByTestId("perfil-composicao").textContent).toBe(PROMPT);
  });

  it("agente que já tem restrição abre com a chave ligada e a lista nas linhas", () => {
    const { campo } = abrirEditor({
      ...VERSAO_ANTIGA,
      restrict_topics: true,
      allowed_topics: ["Horários", "Valores"],
      off_topic_reply: "Só isso.",
    });
    expect(campo("perfil_restringir_temas")).toHaveAttribute("aria-checked", "true");
    expect(campo("perfil_temas").value).toBe("Horários\nValores");
    expect(campo("perfil_resposta_fora").value).toBe("Só isso.");
  });

  it("mais de 20 assuntos não sai da tela", async () => {
    const { campo } = abrirEditor();
    fireEvent.click(campo("perfil_restringir_temas"));
    fireEvent.change(campo("perfil_temas"), {
      target: { value: Array.from({ length: 21 }, (_, i) => `assunto ${i}`).join("\n") },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));
    await waitFor(() => expect(screen.getByText(/no máximo 20 assuntos/i)).toBeInTheDocument());
    expect(acoes.salvar).not.toHaveBeenCalled();
  });
});
