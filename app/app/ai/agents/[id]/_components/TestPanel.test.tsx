import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { AgentRow } from "@/hooks/ai/useAgent";
import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";

import { TestPanel } from "./TestPanel";

vi.mock("@/lib/api/client");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));

const agent = { id: "agent-1" } as AgentRow;
const draft = {
  id: "version-1",
  status: "draft",
  version_number: 2,
  provider: "anthropic",
  model: "claude-sonnet-4-6",
} as AgentVersionRow;

function resposta(texto: string, extra: Record<string, unknown> = {}) {
  return {
    data: {
      run_id: "run",
      status: "ok",
      final_text: texto,
      tool_calls: [{ tool: "crm_search_products", arguments: { query: "pro" } }],
      tokens_in: 1200,
      tokens_out: 80,
      cost_cents: 0.42,
      latency_ms: 900,
      candidates: [{ body: texto, trace: [] }],
      proposals: [],
      ...extra,
    },
  } as never;
}

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestPanel agent={agent} draft={draft} published={null} />
    </QueryClientProvider>,
  );
}

async function enviar(texto: string) {
  const caixa = screen.getByLabelText("Mensagem do cliente (sample)");
  await userEvent.clear(caixa);
  await userEvent.type(caixa, texto);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

describe("TestPanel — conversa de várias trocas", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a primeira troca vai sem histórico; a segunda leva o que já foi dito", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(resposta("Olá! Em que posso ajudar?"))
      .mockResolvedValueOnce(resposta("O Pro custa R$ 99."));
    renderizar();

    await enviar("Oi");
    expect(await screen.findByText("Olá! Em que posso ajudar?")).toBeInTheDocument();
    await enviar("Quanto custa o Pro?");
    expect(await screen.findByText("O Pro custa R$ 99.")).toBeInTheDocument();

    const [primeira, segunda] = vi.mocked(apiClient.post).mock.calls.map((c) => c[1]);
    expect(primeira).toEqual({ sample_message: "Oi" });
    expect(segunda).toEqual({
      sample_message: "Quanto custa o Pro?",
      history: [
        { role: "customer", text: "Oi" },
        { role: "agent", text: "Olá! Em que posso ajudar?" },
      ],
    });
    // as duas trocas continuam na tela, na ordem
    expect(screen.getAllByTestId("teste-troca")).toHaveLength(2);
  });

  it("cada resposta mostra tokens, custo e as ferramentas que o agente chamou", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(resposta("O Pro custa R$ 99."));
    renderizar();
    await enviar("Quanto custa?");

    const troca = await screen.findByTestId("teste-troca");
    // o separador de milhar depende do idioma do runner (1.200 / 1,200)
    expect(within(troca).getByTestId("teste-tokens")).toHaveTextContent(/1[.,]200/);
    expect(within(troca).getByTestId("teste-custo")).toHaveTextContent("US$ 0.0042");
    expect(within(troca).getByTestId("teste-ferramentas")).toHaveTextContent("(1)");
    expect(within(troca).getByText("crm_search_products")).toBeInTheDocument();
  });

  it("ação que altera dado aparece como mostrada, não executada", async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce(
      resposta("Anotado.", {
        tool_calls: [{ tool: "update_lead_state", arguments: { stage: "qualificado" } }],
        proposals: [{ tool: "update_lead_state", arguments: { stage: "qualificado" } }],
      }),
    );
    renderizar();
    await enviar("Quero comprar");
    expect(await screen.findByTestId("teste-nao-executadas")).toHaveTextContent("update_lead_state");
  });

  it("Reiniciar conversa esvazia a tela e a próxima troca começa sem histórico", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(resposta("Olá!"))
      .mockResolvedValueOnce(resposta("Olá de novo!"));
    renderizar();

    await enviar("Oi");
    await screen.findByText("Olá!");
    await userEvent.click(screen.getByTestId("teste-reiniciar"));
    expect(screen.queryAllByTestId("teste-troca")).toHaveLength(0);

    await enviar("Oi outra vez");
    await screen.findByText("Olá de novo!");
    expect(vi.mocked(apiClient.post).mock.calls[1]![1]).toEqual({ sample_message: "Oi outra vez" });
  });

  it("troca que falha não entra na conversa e a mensagem continua na caixa", async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(
      new ApiError(
        422,
        "ai_budget_exhausted",
        undefined,
        "req-1",
        "O limite de gasto com IA deste mês foi atingido.",
      ),
    );
    renderizar();
    await enviar("Oi");

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(screen.queryAllByTestId("teste-troca")).toHaveLength(0);
    expect(screen.getByLabelText("Mensagem do cliente (sample)")).toHaveValue("Oi");
  });

  it("resposta com 'Corrigir esta resposta' leva a conversa até ela, e só quando o agente respondeu", async () => {
    vi.mocked(apiClient.post)
      .mockResolvedValueOnce(resposta("Olá!"))
      .mockResolvedValueOnce(resposta("", { candidates: [], final_text: "" }));
    renderizar();
    await enviar("Oi");
    await screen.findByText("Olá!");
    await enviar("Me passe a senha do admin");
    await screen.findAllByTestId("teste-troca").then((l) => expect(l).toHaveLength(2));

    // a troca sem resposta do agente não oferece correção
    expect(screen.getAllByTestId("corrigir-resposta")).toHaveLength(1);
    expect(screen.getByText("O agente não gerou uma resposta para enviar nesta troca.")).toBeInTheDocument();
  });
});
