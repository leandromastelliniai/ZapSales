import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/ai/agents/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const criarAgente = vi.fn();
vi.mock("@/app/app/ai/agents/[id]/_actions", () => ({
  createMcpAgentAction: (payload: unknown) => criarAgente(payload),
}));

import { AssistenteDeAgente } from "@/app/app/ai/agents/new/_assistente/AssistenteDeAgente";
import { sugestaoDe } from "@/lib/ai/agents/assistente/compor";
import { CHAVE_DO_ASSISTENTE, estadoInicial } from "@/lib/ai/agents/assistente/estado";
import type { PadroesDeIa } from "@/lib/ai/agents/padroes-de-ia";

const PADROES_OK: PadroesDeIa = {
  ok: true,
  provider: "anthropic",
  model: "claude-modelo",
  credentialId: null,
};
const SEM_CHAVE: PadroesDeIa = {
  ok: false,
  motivo: "sem_chave",
  provider: "anthropic",
  chaveEmVerificacao: false,
};
const FUNIL = "6b0b7a52-0d0f-4c9a-9a39-2f1d3c5c8a11";
const CAPACIDADES = {
  vendas: { tool_ids: ["crm_move_lead_stage"], usa_funil: true },
  agendamento: { tool_ids: ["crm_move_lead_stage"], usa_funil: true },
  suporte: { tool_ids: ["crm_search_contacts"], usa_funil: false },
  atendimento: { tool_ids: ["crm_search_contacts"], usa_funil: false },
};

function montar(padroes: PadroesDeIa = PADROES_OK, idiomaDaTela = "pt-BR") {
  return render(
    <AssistenteDeAgente
      padroes={padroes}
      funilPadraoId={FUNIL}
      capacidades={CAPACIDADES}
      idiomaDaTela={idiomaDaTela}
    />,
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
  push.mockClear();
  criarAgente.mockReset();
});
afterEach(() => cleanup());

async function ate(estacao: number, usuario: ReturnType<typeof userEvent.setup>) {
  for (let i = 1; i < estacao; i++) await usuario.click(screen.getByTestId("continuar"));
}

describe("assistente de criação de agente", () => {
  it("a estação 1 lista os grupos e filtra por digitação", async () => {
    const u = userEvent.setup();
    montar();
    expect(screen.getByText("Saúde e bem-estar")).toBeInTheDocument();
    expect(screen.getByTestId("ramo-advocacia")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Tipo de negócio", { selector: "input" }), "odonto");
    expect(screen.getByTestId("ramo-clinica-odontologica")).toBeInTheDocument();
    expect(screen.queryByTestId("ramo-advocacia")).not.toBeInTheDocument();
    expect(screen.getByTestId("ramo-outro")).toBeInTheDocument();
  });

  it("escolher um ramo e continuar leva à estação 2 com o modelo recomendado e o motivo", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByTestId("ramo-clinica-odontologica"));
    await u.click(screen.getByTestId("continuar"));
    expect(screen.getByTestId("passo-atual")).toHaveTextContent("2");
    expect(screen.getByTestId("modelo-agendamento")).toHaveAttribute("aria-checked", "true");
    expect(
      within(screen.getByTestId("modelo-agendamento")).getByText("Recomendado"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("motivo-da-recomendacao")).toHaveTextContent(
      /avaliação é o primeiro passo/,
    );
    expect(screen.getByTestId("frase-do-que-faz")).toBeInTheDocument();
  });

  it("ramo regulado mostra o aviso, sem bloquear", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByTestId("ramo-advocacia"));
    expect(screen.getByTestId("aviso-de-ramo-regulado")).toBeInTheDocument();
    expect(screen.getByTestId("continuar")).toBeEnabled();
    await u.click(screen.getByTestId("ramo-ecommerce"));
    expect(screen.queryByTestId("aviso-de-ramo-regulado")).not.toBeInTheDocument();
  });

  it("'Pular' e 'Outro' recomendam Atendimento", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByTestId("pular"));
    expect(screen.getByTestId("passo-atual")).toHaveTextContent("2");
    expect(screen.getByTestId("modelo-atendimento")).toHaveAttribute("aria-checked", "true");
  });

  it("na estação 3, editar a abertura e clicar em 'Voltar à sugestão' restaura o texto sugerido", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByTestId("ramo-salao"));
    await ate(3, u);
    const campo = screen.getByLabelText("Primeira frase da conversa");
    const sugestao = sugestaoDe(
      { ...estadoInicial("pt-BR").respostas, ramoId: "salao", modeloId: "agendamento" },
      "abertura",
    );
    expect(campo).toHaveValue(sugestao);
    await u.clear(campo);
    await u.type(campo, "Oi, meu bem!");
    expect(campo).toHaveValue("Oi, meu bem!");
    expect(screen.getByTestId("previa-abertura")).toHaveTextContent("Oi, meu bem!");
    await u.click(screen.getByRole("button", { name: "Voltar à sugestão" }));
    expect(campo).toHaveValue(sugestao);
  });

  it("a prévia das estações 1 a 4 nunca chama a IA", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByTestId("ramo-salao"));
    await ate(4, u);
    expect(criarAgente).not.toHaveBeenCalled();
    expect(screen.getByTestId("previa-do-agente")).toHaveTextContent(
      /A resposta de verdade você vê no teste/,
    );
  });

  it("'Prefiro o editor completo' leva ao editor e guarda o que já foi respondido", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByTestId("ramo-salao"));
    const link = screen.getByTestId("ir-para-o-editor");
    expect(link).toHaveAttribute("href", "/app/ai/agents/new?de=assistente");
    await waitFor(() => {
      const guardado = JSON.parse(window.sessionStorage.getItem(CHAVE_DO_ASSISTENTE) ?? "{}");
      expect(guardado.respostas?.ramoId).toBe("salao");
    });
  });

  it("sem chave de IA a estação 5 explica, linka as chaves e não cria nada; as respostas sobrevivem", async () => {
    const u = userEvent.setup();
    const { unmount } = montar(SEM_CHAVE);
    await u.click(screen.getByTestId("ramo-salao"));
    await ate(5, u);
    expect(screen.getByTestId("falta-de-ia")).toHaveTextContent(/Falta a chave de acesso/);
    expect(screen.getByRole("link", { name: "Abrir Chaves de acesso à IA" })).toHaveAttribute(
      "href",
      "/app/ai/credentials",
    );
    expect(screen.queryByTestId("criar-agente")).not.toBeInTheDocument();
    expect(criarAgente).not.toHaveBeenCalled();

    unmount();
    montar(SEM_CHAVE);
    await waitFor(() => expect(screen.getByTestId("passo-atual")).toHaveTextContent("5"));
    expect(screen.getByTestId("resumo-do-agente")).toHaveTextContent("Salão de beleza");
  });

  it("criar chama a ação UMA vez mesmo com dois cliques e abre o teste do agente criado", async () => {
    const u = userEvent.setup();
    let resolver: (v: unknown) => void = () => undefined;
    criarAgente.mockReturnValue(new Promise((r) => (resolver = r)));
    montar();
    await u.click(screen.getByTestId("ramo-salao"));
    await ate(5, u);
    const botao = screen.getByTestId("criar-agente");
    await u.dblClick(botao);
    expect(criarAgente).toHaveBeenCalledTimes(1);
    const enviado = criarAgente.mock.calls[0]![0] as {
      version: { pipeline_ids: string[]; tool_ids: string[] };
    };
    expect(enviado.version.pipeline_ids).toEqual([FUNIL]);
    expect(enviado.version.tool_ids).toEqual(CAPACIDADES.agendamento.tool_ids);
    resolver({ ok: true, data: { agent_id: "agente-1" } });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/ai/agents/agente-1?aba=test"));
    expect(window.sessionStorage.getItem(CHAVE_DO_ASSISTENTE)).toBeNull();
  });

  it("recarregar volta à estação salva; 'Começar de novo' limpa", async () => {
    const u = userEvent.setup();
    const { unmount } = montar();
    await u.click(screen.getByTestId("ramo-psicologia"));
    await ate(3, u);
    unmount();
    montar();
    await waitFor(() => expect(screen.getByTestId("passo-atual")).toHaveTextContent("3"));
    await u.click(screen.getByRole("button", { name: "Começar de novo" }));
    expect(screen.getByTestId("passo-atual")).toHaveTextContent("1");
  });

  it("no idioma espanhol, o texto do ramo sai em espanhol", async () => {
    const u = userEvent.setup();
    montar(PADROES_OK, "es");
    await u.click(screen.getByTestId("ramo-clinica-medica"));
    await ate(3, u);
    const campo = screen.getByLabelText(
      /Primera frase de la conversación|Primeira frase da conversa/,
    );
    expect((campo as HTMLTextAreaElement).value).toContain("asistente virtual");
  });
});
