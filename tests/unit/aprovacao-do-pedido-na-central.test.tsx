/**
 * O CARTÃO DO PEDIDO NA CENTRAL DE AVISOS (issue #95), como a pessoa o usa: mostra o que o
 * agente quer executar e os dados; só gerente decide; aprovar pede confirmação e manda UMA
 * decisão; recusar não pede confirmação (nada é enviado); a falha incerta é dita com todas as
 * letras e o cartão decidido segue na tela até a pessoa ler; estados finais lidos do
 * servidor explicam o que aconteceu.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { AprovacaoDoPedido } from "@/app/app/ai/inbox/_components/AprovacaoDoPedido";
import type { PedidoDoAviso } from "@/hooks/ai/useAgentInbox";

const api = vi.hoisted(() => ({ post: vi.fn() }));
const toasts = vi.hoisted(() => ({ erro: vi.fn(), sucesso: vi.fn(), apiErro: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("sonner", () => ({ toast: { error: toasts.erro, success: toasts.sucesso } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: toasts.apiErro }));

const PEDIDO: PedidoDoAviso = {
  request_id: "aaaaaaaa-0000-4000-8000-000000000001",
  tool_name: "Criar pedido",
  effect: "altera",
  origin: "live",
  status: "pending",
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  summary: [
    { campo: "produto", valor: "camiseta azul" },
    { campo: "senha", valor: "•••" },
  ],
};

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  api.post.mockReset();
  toasts.erro.mockReset();
  toasts.sucesso.mockReset();
  toasts.apiErro.mockReset();
});
afterEach(() => {
  cleanup();
  client.clear();
});

const envolver = (el: React.ReactElement) => (
  <IdiomaProvider locale="pt-BR">
    <QueryClientProvider client={client}>{el}</QueryClientProvider>
  </IdiomaProvider>
);

describe("AprovacaoDoPedido", () => {
  it("mostra a ferramenta, o efeito e os dados que o agente preencheu — o segredo já vem escondido", () => {
    render(envolver(<AprovacaoDoPedido pedido={PEDIDO} podeDecidir />));
    const cartao = screen.getByTestId("aprovacao-do-pedido");
    expect(cartao.textContent).toContain("Criar pedido");
    expect(cartao.textContent).toContain("Altera dados");
    const dados = screen.getByTestId("dados-do-pedido").textContent ?? "";
    expect(dados).toContain("camiseta azul");
    expect(dados).toContain("•••");
    expect(cartao.textContent).toContain("Nada foi enviado ao outro sistema");
  });

  it("quem não é gerente lê o pedido, mas não tem botão para decidir", () => {
    render(envolver(<AprovacaoDoPedido pedido={PEDIDO} podeDecidir={false} />));
    expect(screen.queryByTestId("aprovar-pedido")).toBeNull();
    expect(screen.queryByTestId("recusar-pedido")).toBeNull();
    expect(screen.getByTestId("aprovacao-do-pedido").textContent).toContain("Peça a um gerente");
  });

  it("aprovar PEDE confirmação, manda uma decisão só e conta o resultado", async () => {
    api.post.mockResolvedValue({
      data: { id: PEDIDO.request_id, status: "executed", ok: true, http_status: 201, content: '{"pedido":"A-77"}', truncated: false },
    });
    const decidido = vi.fn();
    render(envolver(<AprovacaoDoPedido pedido={PEDIDO} podeDecidir onDecidido={decidido} />));
    fireEvent.click(screen.getByTestId("aprovar-pedido"));
    // Antes de confirmar, nada foi enviado.
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByTestId("confirmar-aprovacao").textContent).toContain("uma única vez");
    fireEvent.click(screen.getByTestId("confirmar-aprovar"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [rota, corpo] = api.post.mock.calls[0]!;
    expect(rota).toBe(`/api/v1/ai/external-tool-requests/${PEDIDO.request_id}/decide`);
    expect(corpo).toEqual({ decision: "approve" });
    expect((await screen.findByTestId("desfecho-do-pedido")).textContent).toContain("executada");
    expect(screen.getByTestId("estado-do-pedido").textContent).toContain("Executada");
    // O que o outro sistema devolveu aparece para quem aprovou.
    expect(screen.getByTestId("resposta-do-outro-sistema").textContent).toContain("A-77");
    expect(decidido).toHaveBeenCalledTimes(1);
    // Decidido, os botões somem: não há segundo clique possível.
    expect(screen.queryByTestId("aprovar-pedido")).toBeNull();
  });

  it("falha INCERTA: a tela diz que não foi possível confirmar e que a ação NÃO foi repetida", async () => {
    api.post.mockResolvedValue({
      data: {
        id: PEDIDO.request_id,
        status: "failed",
        ok: false,
        uncertain: true,
        reason: "timeout",
        message: "Não foi possível confirmar se a ação foi feita no outro sistema. Ela não foi repetida: confira lá antes de refazer.",
      },
    });
    render(envolver(<AprovacaoDoPedido pedido={PEDIDO} podeDecidir />));
    fireEvent.click(screen.getByTestId("aprovar-pedido"));
    fireEvent.click(screen.getByTestId("confirmar-aprovar"));
    const desfecho = await screen.findByTestId("desfecho-do-pedido");
    expect(desfecho.textContent).toContain("Não foi possível confirmar");
    expect(desfecho.textContent).toContain("não foi repetida");
    expect(desfecho.getAttribute("role")).toBe("alert");
  });

  it("recusar não pede confirmação (nada é enviado) e fica «Recusada»", async () => {
    api.post.mockResolvedValue({ data: { id: PEDIDO.request_id, status: "rejected" } });
    render(envolver(<AprovacaoDoPedido pedido={PEDIDO} podeDecidir />));
    fireEvent.click(screen.getByTestId("recusar-pedido"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0]![1]).toEqual({ decision: "reject" });
    expect((await screen.findByTestId("desfecho-do-pedido")).textContent).toContain("Nada foi enviado");
    expect(screen.getByTestId("estado-do-pedido").textContent).toContain("Recusada");
  });

  it("erro do servidor (já decidido por outra pessoa) vai para o aviso e o cartão continua decidível", async () => {
    api.post.mockRejectedValue(new Error("409"));
    render(envolver(<AprovacaoDoPedido pedido={PEDIDO} podeDecidir />));
    fireEvent.click(screen.getByTestId("recusar-pedido"));
    await waitFor(() => expect(toasts.apiErro).toHaveBeenCalled());
    expect(screen.queryByTestId("desfecho-do-pedido")).toBeNull();
  });

  it("estados finais lidos do servidor explicam o que aconteceu, sem botões", () => {
    for (const [status, frase] of [
      ["expired", "expirou sem decisão"],
      ["rejected", "Pedido recusado"],
      ["executed", "foi executada"],
      ["failed", "não foi concluída"],
    ] as const) {
      const { unmount } = render(envolver(<AprovacaoDoPedido pedido={{ ...PEDIDO, status }} podeDecidir />));
      expect(screen.getByTestId("situacao-do-pedido").textContent, status).toContain(frase);
      expect(screen.queryByTestId("aprovar-pedido"), status).toBeNull();
      unmount();
    }
  });
});
