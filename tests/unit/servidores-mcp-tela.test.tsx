/**
 * A aba «Servidores MCP» (issue #96), como a pessoa a usa: instalação nova (recurso desligado, com o
 * aceite exigido), quem não é administrador, o cadastro do servidor com o teste de conexão que
 * acompanha (e a causa em português quando falha), e a escolha das ferramentas — com o risco padrão
 * «Altera dados» e a aprovação ligada, a dica do servidor como dica, e a ferramenta que o agente não
 * sabe preencher explicada em vez de escondida.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { ServidoresMcpClient } from "@/app/app/ai/external-tools/_mcp";
import { EscolherFerramentasDialog, FormularioDoServidorDialog } from "@/app/app/ai/external-tools/_mcp-dialogs";
import type { ServidorCadastrado } from "@/lib/ai/ferramentas-externas/mcp/repositorio";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }));
const toasts = vi.hoisted(() => ({ erro: vi.fn(), sucesso: vi.fn(), apiErro: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("sonner", () => ({ toast: { error: toasts.erro, success: toasts.sucesso } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: toasts.apiErro }));

const SERVIDOR: ServidorCadastrado = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "ERP da loja",
  url: "https://mcp.exemplo.com.br/mcp",
  auth_header: "authorization",
  active: true,
  has_credential: true,
  credential_last4: "9999",
  server_name: "ERP",
  server_version: "1.2.3",
  last_check_at: "2026-10-18T12:00:00Z",
  last_check_ok: true,
  last_check_reason: null,
  tools_enabled: 0,
  created_at: "2026-10-18T12:00:00Z",
  updated_at: "2026-10-18T12:00:00Z",
};

const DESCOBERTA = {
  ok: true,
  server: { name: "ERP", version: "1.2.3" },
  list_incomplete: false,
  tools: [
    {
      ferramenta: "consultar_estoque",
      titulo: "Consultar estoque",
      descricao: "Consulta o estoque de um produto.",
      suportada: true,
      motivo_nao_suportada: null,
      frase_nao_suportada: null,
      campos: [{ nome: "produto", tipo: "texto", descricao: "Nome do produto", obrigatorio: true }],
      campos_ignorados: [],
      dica_somente_leitura: true,
      escolhida: false,
      id_da_ferramenta: null,
      efeito: "altera",
      pedir_aprovacao: null,
      validade_horas: 24,
      quando_usar: "Consulta o estoque de um produto.",
      mudou_no_servidor: false,
      sumiu_do_servidor: false,
    },
    {
      ferramenta: "com_lista",
      titulo: null,
      descricao: "Pede uma lista obrigatória.",
      suportada: false,
      motivo_nao_suportada: "campo_obrigatorio_complexo",
      frase_nao_suportada: "x",
      campos: [],
      campos_ignorados: [],
      dica_somente_leitura: null,
      escolhida: false,
      id_da_ferramenta: null,
      efeito: "altera",
      pedir_aprovacao: null,
      validade_horas: 24,
      quando_usar: "Pede uma lista obrigatória.",
      mudou_no_servidor: false,
      sumiu_do_servidor: false,
    },
  ],
};

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const f of Object.values(api)) f.mockReset();
  for (const f of Object.values(toasts)) f.mockReset();
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

/** A API por caminho: o que a aba pede é o estado, a lista de servidores e a lista de ferramentas. */
function respostas(opcoes: { ligado: boolean; aceite?: boolean; servidores?: ServidorCadastrado[]; ferramentas?: unknown[] }) {
  api.get.mockImplementation(async (caminho: string) => {
    if (caminho === "/api/v1/ai/mcp") {
      return {
        data: {
          ligado: opcoes.ligado,
          aceite: opcoes.aceite ? { em: "2026-10-18T12:00:00Z", por: "u" } : null,
          servidores: opcoes.servidores?.length ?? 0,
          ferramentas_ativas: 0,
        },
      };
    }
    if (caminho === "/api/v1/ai/mcp-servers") return { data: opcoes.servidores ?? [] };
    if (caminho === "/api/v1/ai/external-tools") return { data: opcoes.ferramentas ?? [] };
    throw new Error(`caminho inesperado ${caminho}`);
  });
}

describe("instalação nova: o recurso está DESLIGADO", () => {
  it("explica o que é, que o sistema funciona sem isto, e não chama nenhum servidor nem lista nada", async () => {
    respostas({ ligado: false });
    render(envolver(<ServidoresMcpClient souAdmin />));
    const card = await screen.findByTestId("mcp-desligado");
    expect(card.textContent).toContain("sistema de terceiro que oferece ferramentas ao agente");
    expect(card.textContent).toContain("funciona normalmente sem isto");
    expect(screen.getByTestId("mcp-estado").textContent).toBe("Desligado");
    // Desligado: nenhuma lista de servidores é pedida.
    expect(api.get.mock.calls.map((c) => c[0])).toEqual(["/api/v1/ai/mcp"]);
  });

  it("ligar exige o aceite do administrador: sem marcar, o botão não funciona; marcando, liga com `aceitar`", async () => {
    respostas({ ligado: false });
    api.put.mockResolvedValue({ data: { ligado: true } });
    render(envolver(<ServidoresMcpClient souAdmin />));
    const ligar = (await screen.findByTestId("mcp-ligar")) as HTMLButtonElement;
    expect(ligar.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("mcp-aceite"));
    expect(ligar.disabled).toBe(false);
    fireEvent.click(ligar);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/api/v1/ai/mcp", { ligado: true, aceitar: true }));
  });

  it("quem já deu o aceite antes liga sem marcar de novo, e a chamada não repete o aceite", async () => {
    respostas({ ligado: false, aceite: true });
    api.put.mockResolvedValue({ data: { ligado: true } });
    render(envolver(<ServidoresMcpClient souAdmin />));
    const ligar = (await screen.findByTestId("mcp-ligar")) as HTMLButtonElement;
    expect(ligar.disabled).toBe(false);
    fireEvent.click(ligar);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/api/v1/ai/mcp", { ligado: true }));
  });

  it("quem não é administrador vê o porquê, sem botão de ligar", async () => {
    respostas({ ligado: false });
    render(envolver(<ServidoresMcpClient souAdmin={false} />));
    expect((await screen.findByTestId("mcp-so-admin")).textContent).toContain("Só um administrador");
    expect(screen.queryByTestId("mcp-ligar")).toBeNull();
  });
});

describe("recurso ligado", () => {
  it("sem servidor: diz o que fazer; só administrador vê o cadastro", async () => {
    respostas({ ligado: true, aceite: true });
    const { unmount } = render(envolver(<ServidoresMcpClient souAdmin />));
    expect((await screen.findByTestId("mcp-sem-servidor")).textContent).toContain("Adicione o endereço do servidor");
    expect(screen.getByTestId("novo-servidor")).toBeTruthy();
    unmount();
    cleanup();
    respostas({ ligado: true, aceite: true });
    render(envolver(<ServidoresMcpClient souAdmin={false} />));
    expect((await screen.findByTestId("mcp-so-admin")).textContent).toContain("cadastrados e escolhidos por um administrador");
    expect(screen.queryByTestId("novo-servidor")).toBeNull();
  });

  it("lista o servidor com a credencial mascarada, o resultado do último teste e quantas ferramentas foram escolhidas", async () => {
    respostas({ ligado: true, aceite: true, servidores: [{ ...SERVIDOR, tools_enabled: 2 }] });
    render(envolver(<ServidoresMcpClient souAdmin />));
    const cartao = await screen.findByTestId(`servidor-${SERVIDOR.id}`);
    expect(cartao.textContent).toContain("ERP da loja");
    expect(cartao.textContent).toContain("mcp.exemplo.com.br");
    expect(cartao.textContent).toContain("credencial …9999");
    expect(cartao.textContent).toContain("2 ferramentas escolhidas");
    // A credencial NUNCA aparece.
    expect(document.body.textContent).not.toContain("tok_");
    expect(screen.getByTestId(`conexao-${SERVIDOR.id}`).getAttribute("data-ok")).toBe("sim");
  });

  it("«Testar conexão» mostra a causa em português quando o servidor não responde", async () => {
    respostas({ ligado: true, aceite: true, servidores: [SERVIDOR] });
    api.post.mockResolvedValue({
      data: { ok: false, reason: "credencial_recusada", message: "O servidor recusou a credencial. Confira a credencial e o cabeçalho em que ela é enviada." },
    });
    render(envolver(<ServidoresMcpClient souAdmin />));
    fireEvent.click(await screen.findByTestId(`testar-conexao-${SERVIDOR.id}`));
    const resultado = await screen.findByTestId(`resultado-conexao-${SERVIDOR.id}`);
    expect(resultado.getAttribute("data-ok")).toBe("nao");
    expect(resultado.textContent).toContain("recusou a credencial");
  });

  it("desligar pede confirmação e avisa que nada é apagado", async () => {
    respostas({ ligado: true, aceite: true });
    api.put.mockResolvedValue({ data: { ligado: false } });
    render(envolver(<ServidoresMcpClient souAdmin />));
    fireEvent.click(await screen.findByTestId("mcp-desligar"));
    expect(document.body.textContent).toContain("Nada é apagado");
    fireEvent.click(screen.getByTestId("confirmar-desligar-mcp"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/api/v1/ai/mcp", { ligado: false }));
  });
});

describe("cadastrar o servidor", () => {
  const abrir = (extra: Partial<React.ComponentProps<typeof FormularioDoServidorDialog>> = {}) =>
    render(
      envolver(
        <FormularioDoServidorDialog
          aberto
          editando={null}
          onFechar={() => undefined}
          onSalvo={() => undefined}
          onEscolherFerramentas={() => undefined}
          {...extra}
        />,
      ),
    );

  it("pede o que falta em português antes de enviar (nome curto, endereço sem https, cabeçalho reservado)", async () => {
    abrir();
    fireEvent.change(screen.getByTestId("servidor-nome"), { target: { value: "ab" } });
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    expect((await screen.findByTestId("erro-do-servidor")).textContent).toContain("pelo menos 3 letras");

    fireEvent.change(screen.getByTestId("servidor-nome"), { target: { value: "ERP da loja" } });
    fireEvent.change(screen.getByTestId("servidor-url"), { target: { value: "ftp://x.com/mcp" } });
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    expect((await screen.findByTestId("erro-do-servidor")).textContent).toContain("começando com https://");

    fireEvent.change(screen.getByTestId("servidor-url"), { target: { value: "https://mcp.exemplo.com.br/mcp" } });
    fireEvent.click(screen.getByTestId("outro-cabecalho"));
    fireEvent.change(screen.getByTestId("nome-do-cabecalho"), { target: { value: "Content-Type" } });
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    expect((await screen.findByTestId("erro-do-servidor")).textContent).toContain("usado pelo próprio protocolo");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envia nome, endereço, credencial e cabeçalho, com a MESMA chave de idempotência num clique duplo", async () => {
    api.post.mockResolvedValue({ data: { ...SERVIDOR, conexao: { ok: true, ferramentas_oferecidas: 2, lista_incompleta: false } } });
    abrir();
    fireEvent.change(screen.getByTestId("servidor-nome"), { target: { value: "ERP da loja" } });
    fireEvent.change(screen.getByTestId("servidor-url"), { target: { value: "https://mcp.exemplo.com.br/mcp" } });
    fireEvent.change(screen.getByTestId("servidor-credencial"), { target: { value: "tok_secreto_1234" } });
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [caminho, corpo, opcoes] = api.post.mock.calls[0]!;
    expect(caminho).toBe("/api/v1/ai/mcp-servers");
    expect(corpo).toEqual({
      nome: "ERP da loja",
      url: "https://mcp.exemplo.com.br/mcp",
      credencial: "tok_secreto_1234",
      cabecalho: "authorization",
    });
    expect(typeof (opcoes as { idempotencyKey: string }).idempotencyKey).toBe("string");
  });

  it("depois do cadastro mostra o teste de conexão NA HORA: conectou (com o atalho para escolher ferramentas)", async () => {
    api.post.mockResolvedValue({ data: { ...SERVIDOR, conexao: { ok: true, ferramentas_oferecidas: 2, lista_incompleta: false } } });
    const escolher = vi.fn();
    abrir({ onEscolherFerramentas: escolher });
    fireEvent.change(screen.getByTestId("servidor-nome"), { target: { value: "ERP da loja" } });
    fireEvent.change(screen.getByTestId("servidor-url"), { target: { value: "https://mcp.exemplo.com.br/mcp" } });
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    expect((await screen.findByTestId("cadastro-conectou")).textContent).toContain("2 ferramentas oferecidas");
    // A credencial digitada não fica na tela do resultado.
    fireEvent.click(screen.getByTestId("ir-escolher-ferramentas"));
    expect(escolher).toHaveBeenCalledWith(expect.objectContaining({ id: SERVIDOR.id }));
  });

  it("…ou NÃO conectou: o servidor foi salvo e a causa vem em português, sem o atalho de escolher ferramentas", async () => {
    api.post.mockResolvedValue({
      data: {
        ...SERVIDOR,
        conexao: { ok: false, motivo: "recusada_pela_politica", http_status: null, message: "Este endereço não pode ser usado: endereços da rede interna, privada ou local são recusados por segurança." },
      },
    });
    abrir();
    fireEvent.change(screen.getByTestId("servidor-nome"), { target: { value: "ERP da loja" } });
    fireEvent.change(screen.getByTestId("servidor-url"), { target: { value: "https://mcp.exemplo.com.br/mcp" } });
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    const falha = await screen.findByTestId("cadastro-nao-conectou");
    expect(falha.textContent).toContain("foi salvo, mas a conexão não deu certo");
    expect(falha.textContent).toContain("rede interna, privada ou local");
    expect(screen.queryByTestId("ir-escolher-ferramentas")).toBeNull();
  });

  it("editar: a credencial guardada aparece só como os 4 últimos e só é enviada se a pessoa digitar outra; remover manda null", async () => {
    api.patch.mockResolvedValue({ data: SERVIDOR });
    abrir({ editando: SERVIDOR });
    const campo = screen.getByTestId("servidor-credencial") as HTMLInputElement;
    expect(campo.value).toBe("");
    expect(campo.placeholder).toContain("…9999");
    fireEvent.click(screen.getByTestId("remover-credencial"));
    expect(campo.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith(`/api/v1/ai/mcp-servers/${SERVIDOR.id}`, { credencial: null });
  });

  it("editar sem mudar nada não chama a API", async () => {
    const fechar = vi.fn();
    abrir({ editando: SERVIDOR, onFechar: fechar });
    fireEvent.click(screen.getByTestId("salvar-servidor"));
    await waitFor(() => expect(fechar).toHaveBeenCalled());
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe("escolher as ferramentas", () => {
  const abrir = (onSalvo: () => void = () => undefined) =>
    render(envolver(<EscolherFerramentasDialog servidor={SERVIDOR} onFechar={() => undefined} onSalvo={onSalvo} />));

  it("mostra o que o servidor oferece; a que o agente não sabe preencher aparece DESABILITADA com o porquê", async () => {
    api.get.mockResolvedValue({ data: DESCOBERTA });
    abrir();
    const estoque = await screen.findByTestId("oferecida-consultar_estoque");
    expect(estoque.textContent).toContain("Consultar estoque");
    expect(screen.getByTestId("dica-consultar_estoque").textContent).toBe("O servidor diz: só lê");
    const lista = screen.getByTestId("oferecida-com_lista");
    expect((within(lista).getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId("nao-suportada-com_lista").textContent).toContain("campo obrigatório que não é texto, número ou sim/não");
  });

  it("marcar uma ferramenta: o risco PADRÃO é «Altera dados» e a aprovação já vem ligada — mesmo com a dica «só lê»", async () => {
    api.get.mockResolvedValue({ data: DESCOBERTA });
    abrir();
    const caixa = within(await screen.findByTestId("oferecida-consultar_estoque")).getByRole("checkbox", { name: "Consultar estoque" });
    fireEvent.click(caixa);
    expect((screen.getByTestId("efeito-altera-consultar_estoque") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("efeito-consulta-consultar_estoque") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("pede-aprovacao-consultar_estoque") as HTMLInputElement).checked).toBe(true);
  });

  it("«Só consulta» é escolha do administrador e tira a aprovação do padrão; salvar manda só o que ele decidiu", async () => {
    api.get.mockResolvedValue({ data: DESCOBERTA });
    api.put.mockResolvedValue({ data: { ok: true } });
    const aoSalvar = vi.fn();
    abrir(aoSalvar);
    fireEvent.click(within(await screen.findByTestId("oferecida-consultar_estoque")).getByRole("checkbox", { name: "Consultar estoque" }));
    fireEvent.click(screen.getByTestId("efeito-consulta-consultar_estoque"));
    expect((screen.getByTestId("pede-aprovacao-consultar_estoque") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByTestId("salvar-escolha"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [caminho, corpo] = api.put.mock.calls[0]!;
    expect(caminho).toBe(`/api/v1/ai/mcp-servers/${SERVIDOR.id}/tools`);
    expect(corpo).toEqual({
      ferramentas: [{ ferramenta: "consultar_estoque", efeito: "consulta", quando_usar: "Consulta o estoque de um produto." }],
    });
    // Nada de `pedir_aprovacao` quando vale o padrão do efeito.
    expect(JSON.stringify(corpo)).not.toContain("pedir_aprovacao");
    await waitFor(() => expect(aoSalvar).toHaveBeenCalled());
  });

  it("desligar a aprovação numa ação que altera avisa o risco e manda a escolha explícita", async () => {
    api.get.mockResolvedValue({ data: DESCOBERTA });
    api.put.mockResolvedValue({ data: { ok: true } });
    abrir();
    fireEvent.click(within(await screen.findByTestId("oferecida-consultar_estoque")).getByRole("checkbox", { name: "Consultar estoque" }));
    fireEvent.click(screen.getByTestId("pede-aprovacao-consultar_estoque"));
    expect(document.body.textContent).toContain("o agente executa esta ação sozinho");
    fireEvent.click(screen.getByTestId("salvar-escolha"));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0]![1]).toEqual({
      ferramentas: [
        { ferramenta: "consultar_estoque", efeito: "altera", pedir_aprovacao: false, quando_usar: "Consulta o estoque de um produto." },
      ],
    });
  });

  it("o texto «quando usar» vem do servidor, é editável e o aviso diz para revisar", async () => {
    api.get.mockResolvedValue({ data: DESCOBERTA });
    abrir();
    fireEvent.click(within(await screen.findByTestId("oferecida-consultar_estoque")).getByRole("checkbox", { name: "Consultar estoque" }));
    const quando = screen.getByTestId("quando-usar-consultar_estoque") as HTMLTextAreaElement;
    expect(quando.value).toBe("Consulta o estoque de um produto.");
    expect(document.body.textContent).toContain("vem do servidor");
  });

  it("servidor que mudou a ferramenta depois da escolha: avisa", async () => {
    const mudou = { ...DESCOBERTA, tools: [{ ...DESCOBERTA.tools[0]!, escolhida: true, mudou_no_servidor: true }] };
    api.get.mockResolvedValue({ data: mudou });
    abrir();
    expect((await screen.findByTestId("mudou-consultar_estoque")).textContent).toBe("Mudou no servidor");
    expect(document.body.textContent).toContain("O agente continua com a definição de antes");
  });

  it("servidor que não responde: mostra a causa e deixa tentar de novo — sem lista inventada", async () => {
    api.get.mockResolvedValue({ data: { ok: false, reason: "timeout", message: "O outro sistema não respondeu a tempo." } });
    abrir();
    expect((await screen.findByTestId("descoberta-falhou")).textContent).toContain("não respondeu a tempo");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeTruthy();
  });
});
