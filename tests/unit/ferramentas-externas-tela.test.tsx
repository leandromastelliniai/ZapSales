/**
 * A tela de Ferramentas externas (issues #94 e #95), como a pessoa a usa: o formulário deixa
 * escolher "Altera dados" (que nasce pedindo aprovação, e desligar isso avisa o risco), pede o
 * que falta em português antes de enviar,
 * manda a MESMA chave de idempotência num clique duplo e entrega a chave de assinatura
 * uma vez; "Testar de verdade" manda os dados de exemplo no tipo declarado e explica a
 * falha em vez de dizer que funcionou.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { ChaveDaFerramentaDialog, FormularioDaFerramentaDialog, TesteDaFerramentaDialog } from "@/app/app/ai/external-tools/_dialogs";
import { FerramentasExternasClient } from "@/app/app/ai/external-tools/_client";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const toasts = vi.hoisted(() => ({ erro: vi.fn(), sucesso: vi.fn(), apiErro: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("sonner", () => ({ toast: { error: toasts.erro, success: toasts.sucesso } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: toasts.apiErro }));

const FERRAMENTA: FerramentaExterna = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  kind: "webhook",
  mcp: null,
  unavailable_reason: null,
  name: "Consultar estoque",
  slug: "consultar_estoque",
  agent_name: "ext_consultar_estoque",
  when_to_use: "Quando o cliente perguntar se um produto está disponível.",
  url: "https://erp.exemplo.com.br/hooks/estoque",
  parameters: [
    { nome: "produto", tipo: "texto", descricao: "Nome do produto", obrigatorio: true },
    { nome: "quantidade", tipo: "inteiro", descricao: "Quantas unidades", obrigatorio: false },
    { nome: "retirada", tipo: "booleano", descricao: "Vai retirar na loja", obrigatorio: false },
  ],
  effect: "consulta",
  require_approval: null,
  approval_ttl_hours: 24,
  active: true,
  secret_last4: "cdef",
  created_at: "2026-10-17T12:00:00Z",
  updated_at: "2026-10-17T12:00:00Z",
};

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  api.delete.mockReset();
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

function digitar(rotulo: string | RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

describe("formulário da ferramenta", () => {
  it("nasce em «Só consulta», sem pedir aprovação; escolher «Altera dados» liga a aprovação sozinho", () => {
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={() => undefined} />));
    const altera = screen.getByLabelText(/Altera dados/) as HTMLInputElement;
    expect(altera.disabled).toBe(false);
    expect((screen.getByLabelText(/Só consulta/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("pedir-aprovacao") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(altera);
    expect((screen.getByTestId("pedir-aprovacao") as HTMLInputElement).checked).toBe(true);
    // A validade do pedido aparece junto, com o padrão de 24 horas.
    expect((screen.getByTestId("validade-do-pedido") as HTMLInputElement).value).toBe("24");
    expect(screen.queryByTestId("aviso-sem-aprovacao")).toBeNull();
  });

  it("desligar a aprovação numa ação que altera avisa, com todas as letras, que o agente executa sozinho", () => {
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={() => undefined} />));
    fireEvent.click(screen.getByLabelText(/Altera dados/));
    fireEvent.click(screen.getByTestId("pedir-aprovacao"));
    const aviso = screen.getByTestId("aviso-sem-aprovacao");
    expect(aviso.textContent).toContain("executa esta ação sozinho");
    expect(aviso.textContent).toContain("não é repetida");
    expect(screen.queryByTestId("validade-do-pedido")).toBeNull();
    // E o aviso do modo Assistido está sempre à vista: a chave não vale lá.
    expect(screen.getByTestId("aprovacao-da-ferramenta").textContent).toContain("modo Assistido");
  });

  it("«Altera dados» sem tocar na chave NÃO manda `pedir_aprovacao` (o padrão do efeito decide); tocar manda a escolha", async () => {
    api.post.mockResolvedValue({ data: { signing_secret: "whsec_abc" } });
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={() => undefined} />));
    digitar("Nome", "Criar pedido");
    digitar("Quando o agente deve usar", "Quando o cliente confirmar que quer fechar o pedido.");
    digitar("Endereço (https)", "https://erp.exemplo.com.br/hook");
    fireEvent.click(screen.getByLabelText(/Altera dados/));
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const padrao = api.post.mock.calls[0]![1] as Record<string, unknown>;
    expect(padrao).toMatchObject({ efeito: "altera", validade_horas: 24 });
    expect(padrao).not.toHaveProperty("pedir_aprovacao");

    api.post.mockClear();
    fireEvent.click(screen.getByTestId("pedir-aprovacao"));
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const desligada = api.post.mock.calls[0]![1] as Record<string, unknown>;
    expect(desligada).toMatchObject({ efeito: "altera", pedir_aprovacao: false });
    expect(desligada).not.toHaveProperty("validade_horas");
  });

  it("validade fora de 1 a 168 horas é pedida em português antes de enviar", async () => {
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={() => undefined} />));
    digitar("Nome", "Criar pedido");
    digitar("Quando o agente deve usar", "Quando o cliente confirmar que quer fechar o pedido.");
    digitar("Endereço (https)", "https://erp.exemplo.com.br/hook");
    fireEvent.click(screen.getByLabelText(/Altera dados/));
    fireEvent.change(screen.getByTestId("validade-do-pedido"), { target: { value: "500" } });
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    expect((await screen.findByTestId("erro-do-formulario")).textContent).toContain("1 a 168 horas");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("o teste de uma ferramenta que ALTERA avisa que a alteração é de verdade", () => {
    render(
      envolver(
        <TesteDaFerramentaDialog ferramenta={{ ...FERRAMENTA, effect: "altera" }} onFechar={() => undefined} />,
      ),
    );
    expect(screen.getByTestId("aviso-altera-teste").textContent).toContain("ALTERA dados");
    expect(screen.getByTestId("executar-teste").textContent).toContain("Executar de verdade");
  });

  it("pede o que falta, em português, antes de enviar — e não chama a API", async () => {
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={() => undefined} />));
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    expect((await screen.findByTestId("erro-do-formulario")).textContent).toContain("Dê um nome à ferramenta");

    digitar("Nome", "Consultar estoque");
    digitar("Quando o agente deve usar", "Quando o cliente perguntar se um produto está disponível.");
    digitar("Endereço (https)", "erp.exemplo.com.br/hook");
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    await waitFor(() => expect(screen.getByTestId("erro-do-formulario").textContent).toContain("comece com https://"));

    digitar("Endereço (https)", "https://u:p@erp.exemplo.com.br/hook");
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    await waitFor(() => expect(screen.getByTestId("erro-do-formulario").textContent).toContain("sem usuário e senha"));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("exige nome de campo no padrão e descrição, e recusa campos repetidos", async () => {
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={() => undefined} />));
    digitar("Nome", "Consultar estoque");
    digitar("Quando o agente deve usar", "Quando o cliente perguntar se um produto está disponível.");
    digitar("Endereço (https)", "https://erp.exemplo.com.br/hook");
    fireEvent.click(screen.getByTestId("adicionar-campo"));
    digitar("Nome do campo", "Código do Produto");
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    expect((await screen.findByTestId("erro-do-formulario")).textContent).toContain("letras minúsculas sem acento");

    digitar("Nome do campo", "produto");
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    await waitFor(() => expect(screen.getByTestId("erro-do-formulario").textContent).toContain("Descreva cada campo"));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("cadastra com o payload do contrato e entrega a chave de assinatura que o servidor devolveu", async () => {
    api.post.mockResolvedValue({ data: { signing_secret: "whsec_abc" } });
    const salvo = vi.fn();
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={salvo} />));
    digitar("Nome", "Consultar estoque");
    digitar("Quando o agente deve usar", "Quando o cliente perguntar se um produto está disponível.");
    digitar("Endereço (https)", "https://erp.exemplo.com.br/hook");
    fireEvent.click(screen.getByTestId("adicionar-campo"));
    digitar("Nome do campo", "produto");
    digitar("O que o agente coloca aqui", "Nome do produto que o cliente citou");
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));

    await waitFor(() => expect(salvo).toHaveBeenCalledWith({ nome: "Consultar estoque", chave: "whsec_abc" }));
    const [rota, corpo, opcoes] = api.post.mock.calls[0]!;
    expect(rota).toBe("/api/v1/ai/external-tools");
    expect(corpo).toEqual({
      nome: "Consultar estoque",
      quando_usar: "Quando o cliente perguntar se um produto está disponível.",
      url: "https://erp.exemplo.com.br/hook",
      parametros: [{ nome: "produto", tipo: "texto", descricao: "Nome do produto que o cliente citou", obrigatorio: true }],
      efeito: "consulta",
    });
    // O corpo não leva organização nem chave: o servidor decide as duas.
    expect(JSON.stringify(corpo)).not.toMatch(/organization|secret/);
    expect(opcoes.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("editar manda PATCH na ferramenta e não pede a chave de novo", async () => {
    api.patch.mockResolvedValue({ data: FERRAMENTA });
    const salvo = vi.fn();
    render(envolver(<FormularioDaFerramentaDialog aberto editando={FERRAMENTA} onFechar={() => undefined} onSalvo={salvo} />));
    digitar("Nome", "Consultar estoque da loja");
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    await waitFor(() => expect(salvo).toHaveBeenCalledWith({ nome: "Consultar estoque da loja", chave: null }));
    expect(api.patch.mock.calls[0]![0]).toBe(`/api/v1/ai/external-tools/${FERRAMENTA.id}`);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("erro do servidor (endereço interno recusado) vai para o aviso e o diálogo não fecha como se tivesse salvo", async () => {
    api.post.mockRejectedValue(new Error("recusado"));
    const salvo = vi.fn();
    render(envolver(<FormularioDaFerramentaDialog aberto editando={null} onFechar={() => undefined} onSalvo={salvo} />));
    digitar("Nome", "Consultar estoque");
    digitar("Quando o agente deve usar", "Quando o cliente perguntar se um produto está disponível.");
    digitar("Endereço (https)", "https://localhost/hook");
    fireEvent.click(screen.getByTestId("salvar-ferramenta"));
    await waitFor(() => expect(toasts.apiErro).toHaveBeenCalled());
    expect(salvo).not.toHaveBeenCalled();
  });
});

describe("chave de assinatura", () => {
  it("aparece com a explicação de que é a única vez, e some ao fechar", () => {
    const fechar = vi.fn();
    render(envolver(<ChaveDaFerramentaDialog dados={{ nome: "Consultar estoque", chave: "whsec_0123" }} onFechar={fechar} />));
    expect((screen.getByTestId("chave-em-claro") as HTMLInputElement).value).toBe("whsec_0123");
    expect(screen.getByText(/aparece só agora/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("fechar-chave"));
    expect(fechar).toHaveBeenCalled();
  });

  it("sem dados, não desenha chave nenhuma", () => {
    render(envolver(<ChaveDaFerramentaDialog dados={null} onFechar={() => undefined} />));
    expect(screen.queryByTestId("chave-em-claro")).toBeNull();
  });
});

describe("Testar de verdade", () => {
  it("manda os dados de exemplo no TIPO declarado (texto, inteiro, sim/não) e omite o opcional vazio", async () => {
    api.post.mockResolvedValue({
      data: { ok: true, http_status: 200, content: '{"disponivel":true}', truncated: false, attempts: 1, duration_ms: 42, sent: {} },
    });
    render(envolver(<TesteDaFerramentaDialog ferramenta={FERRAMENTA} onFechar={() => undefined} />));
    fireEvent.change(screen.getByLabelText(/^produto/), { target: { value: "camiseta azul" } });
    fireEvent.change(screen.getByLabelText(/^quantidade/), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("executar-teste"));
    const resultado = await screen.findByTestId("resultado-do-teste");
    expect(resultado.getAttribute("data-ok")).toBe("sim");
    expect(resultado.textContent).toContain("Funcionou");
    expect(screen.getByTestId("conteudo-do-teste").textContent).toContain("disponivel");
    const [rota, corpo, opcoes] = api.post.mock.calls[0]!;
    expect(rota).toBe(`/api/v1/ai/external-tools/${FERRAMENTA.id}/test`);
    expect(corpo).toEqual({ arguments: { produto: "camiseta azul", quantidade: 2 } });
    // Duas tentativas de 8 s no servidor: o prazo do navegador é maior.
    expect(opcoes.timeoutMs).toBeGreaterThan(20_000);
  });

  it("falha do outro sistema: a tela diz 'Não funcionou' e a frase do que fazer — nunca 'Funcionou'", async () => {
    api.post.mockResolvedValue({
      data: {
        ok: false,
        reason: "timeout",
        message: "O outro sistema não respondeu a tempo.",
        http_status: null,
        attempts: 2,
        duration_ms: 16000,
        sent: { tool: "consultar_estoque" },
      },
    });
    render(envolver(<TesteDaFerramentaDialog ferramenta={FERRAMENTA} onFechar={() => undefined} />));
    fireEvent.change(screen.getByLabelText(/^produto/), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("executar-teste"));
    const resultado = await screen.findByTestId("resultado-do-teste");
    expect(resultado.getAttribute("data-ok")).toBe("nao");
    expect(resultado.textContent).toContain("Não funcionou");
    expect(resultado.textContent).toContain("não respondeu a tempo");
    expect(resultado.textContent).not.toContain("Funcionou.");
  });
});

describe("lista", () => {
  it("instalação sem nenhuma ferramenta: explica o que é e oferece cadastrar", () => {
    render(envolver(<FerramentasExternasClient inicial={[]} />));
    expect(screen.getByTestId("ferramentas-vazio").textContent).toContain("O agente ainda não consulta nenhum sistema");
    expect(screen.getByTestId("nova-ferramenta")).toBeTruthy();
  });

  it("mostra a ferramenta com o efeito, o endereço curto e SÓ os 4 últimos da chave; desativar manda `ativa:false`", async () => {
    api.get.mockResolvedValue({ data: [FERRAMENTA] });
    api.patch.mockResolvedValue({ data: { ...FERRAMENTA, active: false } });
    render(envolver(<FerramentasExternasClient inicial={[FERRAMENTA]} />));
    const cartao = screen.getByTestId(`ferramenta-${FERRAMENTA.id}`);
    expect(cartao.textContent).toContain("Só consulta");
    expect(cartao.textContent).toContain("erp.exemplo.com.br");
    expect(cartao.textContent).toContain("…cdef");
    expect(cartao.textContent).not.toContain("whsec_");
    fireEvent.click(screen.getByTestId(`ativar-${FERRAMENTA.id}`));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/api/v1/ai/external-tools/${FERRAMENTA.id}`, { ativa: false }));
  });

  it("'Gerar nova chave' mostra a chave nova uma vez", async () => {
    api.get.mockResolvedValue({ data: [FERRAMENTA] });
    api.post.mockResolvedValue({ data: { signing_secret: "whsec_nova" } });
    render(envolver(<FerramentasExternasClient inicial={[FERRAMENTA]} />));
    fireEvent.click(screen.getByTestId(`nova-chave-${FERRAMENTA.id}`));
    expect(((await screen.findByTestId("chave-em-claro")) as HTMLInputElement).value).toBe("whsec_nova");
    expect(api.post.mock.calls[0]![0]).toBe(`/api/v1/ai/external-tools/${FERRAMENTA.id}/rotate-secret`);
  });
});
