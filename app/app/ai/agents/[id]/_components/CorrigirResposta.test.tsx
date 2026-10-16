import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

import { CorrigirResposta } from "./CorrigirResposta";

vi.mock("@/lib/api/client");
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));

const conversa = [
  { role: "customer" as const, text: "Quanto custa?" },
  { role: "agent" as const, text: "Não sei." },
];

function renderizar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("CorrigirResposta", () => {
  beforeEach(() => vi.clearAllMocks());

  it("antes de enviar, diz que o agente só muda depois de aprovar", async () => {
    renderizar(<CorrigirResposta agentId="a1" origem={{ origem: "teste", conversa }} />);
    await userEvent.click(screen.getByTestId("corrigir-resposta"));
    expect(screen.getByText(/O agente só muda depois que você aprovar/)).toBeInTheDocument();
  });

  it("envia a conversa e o texto corrigido para a rota de correções, e confirma que virou proposta", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { proposal_id: "p1", status: "pending" } } as never);
    renderizar(<CorrigirResposta agentId="a1" origem={{ origem: "teste", conversa }} />);

    await userEvent.click(screen.getByTestId("corrigir-resposta"));
    await userEvent.type(screen.getByRole("textbox"), "O Pro custa R$ 99.");
    await userEvent.click(screen.getByRole("button", { name: "Enviar como proposta" }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(apiClient.post).toHaveBeenCalledWith(
      "/api/v1/ai/agents/a1/corrections",
      { origem: "teste", conversa, texto_corrigido: "O Pro custa R$ 99." },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(await screen.findByTestId("correcao-enviada")).toHaveTextContent("só muda o agente depois que você aprovar");
  });

  it("na execução real, manda o id da chamada — nunca o texto da conversa, que o servidor relê", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { proposal_id: "p1", status: "pending" } } as never);
    renderizar(<CorrigirResposta agentId="a1" origem={{ origem: "execucao", chamadaId: "c1" }} />);

    await userEvent.click(screen.getByTestId("corrigir-resposta"));
    await userEvent.type(screen.getByRole("textbox"), "Diga o preço.");
    await userEvent.click(screen.getByRole("button", { name: "Enviar como proposta" }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(vi.mocked(apiClient.post).mock.calls[0]![1]).toEqual({
      origem: "execucao",
      chamada_id: "c1",
      texto_corrigido: "Diga o preço.",
    });
  });

  it("sem texto, não há o que enviar", async () => {
    renderizar(<CorrigirResposta agentId="a1" origem={{ origem: "teste", conversa }} />);
    await userEvent.click(screen.getByTestId("corrigir-resposta"));
    expect(screen.getByRole("button", { name: "Enviar como proposta" })).toBeDisabled();
  });

  it("somente leitura ou conversa ainda não lida: o botão nem aparece", () => {
    const { container, rerender } = renderizar(
      <CorrigirResposta agentId="a1" origem={{ origem: "teste", conversa }} readOnly />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CorrigirResposta agentId="a1" origem={null} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
