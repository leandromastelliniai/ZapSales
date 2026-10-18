import { afterEach, describe, expect, it } from "vitest";

import { subirServidorMcp, TEXTO_DE_INJECAO, type ServidorMcpDeTeste } from "@/tests/helpers/servidor-mcp-de-teste";

import { resultadoParaOAgente } from "../chamar";
import { chamarFerramentaDoServidor, listarFerramentasDoServidor, type ServidorMcp } from "./cliente";

/**
 * O CLIENTE MCP contra um servidor MCP DE VERDADE (o do SDK oficial, em 127.0.0.1): o que o teste mede
 * é o que viaja pela rede — a abertura de sessão, o cabeçalho da credencial, o que o servidor devolve em
 * JSON ou em fluxo SSE — e o que acontece quando o servidor erra, demora, redireciona ou responde demais.
 */

let servidor: ServidorMcpDeTeste | null = null;
afterEach(async () => {
  await servidor?.fechar();
  servidor = null;
});

// O servidor de teste está em 127.0.0.1: a política da organização o recusaria.
const LIBERA_LOCAL = { politica: { permitirHttp: true, ipPermitido: () => true } };
const SEM_ESPERA = { ...LIBERA_LOCAL, dormir: async () => {} };

function conectar(url: string, extra: Partial<ServidorMcp> = {}): ServidorMcp {
  return { url, credencial: null, cabecalho: "authorization", ...extra };
}

describe("listarFerramentasDoServidor — descobrir o que o servidor oferece", () => {
  it.each([
    ["sem estado, JSON", { sessao: false, json: true }],
    ["sem estado, fluxo SSE", { sessao: false, json: false }],
    ["com sessão, JSON", { sessao: true, json: true }],
    ["com sessão, fluxo SSE", { sessao: true, json: false }],
  ])("apresenta-se, avisa e lista (%s)", async (_nome, opcoes) => {
    servidor = await subirServidorMcp(opcoes);
    const r = await listarFerramentasDoServidor(conectar(servidor.url), LIBERA_LOCAL);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.servidor).toMatchObject({ nome: "servidor-de-teste", versao: "1.2.3" });
    const nomes = r.ferramentas.map((f) => f.nome);
    expect(nomes).toEqual(
      expect.arrayContaining(["consultar_estoque", "criar_pedido", "tool_com_injecao", "com_lista_obrigatoria"]),
    );
    const estoque = r.ferramentas.find((f) => f.nome === "consultar_estoque")!;
    expect(estoque.descricao).toContain("estoque");
    expect(estoque.esquema).toMatchObject({ type: "object", properties: { produto: { type: "string" } } });

    // O que o servidor viu, na ordem do protocolo.
    const metodos = servidor.recebidos.map((x) => (x.corpo as { method?: string } | null)?.method).filter(Boolean);
    expect(metodos.slice(0, 3)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    // A sessão (quando existe) volta em toda requisição depois da primeira, e a versão negociada também.
    if (opcoes.sessao) {
      const depois = servidor.recebidos.filter((x) => (x.corpo as { method?: string } | null)?.method === "tools/list");
      expect(depois[0]!.headers["mcp-session-id"]).toBeTruthy();
      expect(servidor.recebidos.some((x) => x.metodo === "DELETE")).toBe(true);
    }
    expect(servidor.recebidos.find((x) => (x.corpo as { method?: string } | null)?.method === "tools/list")!.headers["mcp-protocol-version"]).toBeTruthy();
  });

  it("a dica do servidor («só lê») chega como dica, e a que MENTE também chega: quem decide é o administrador", async () => {
    servidor = await subirServidorMcp();
    const r = await listarFerramentasDoServidor(conectar(servidor.url), LIBERA_LOCAL);
    expect(r.ok && r.ferramentas.find((f) => f.nome === "criar_pedido")?.somenteLeituraDeclarado).toBe(true);
    expect(r.ok && r.ferramentas.find((f) => f.nome === "tool_com_injecao")?.somenteLeituraDeclarado).toBe(null);
  });

  it("manda a credencial como Authorization: Bearer — e a recusa vira uma frase de credencial, não de rede", async () => {
    servidor = await subirServidorMcp({ token: "segredo-123" });
    const certa = await listarFerramentasDoServidor(conectar(servidor.url, { credencial: "segredo-123" }), LIBERA_LOCAL);
    expect(certa.ok).toBe(true);
    expect(servidor.recebidos[0]!.headers.authorization).toBe("Bearer segredo-123");

    const errada = await listarFerramentasDoServidor(conectar(servidor.url, { credencial: "outra" }), LIBERA_LOCAL);
    expect(errada).toMatchObject({ ok: false, motivo: "credencial_recusada", httpStatus: 401 });
    const sem = await listarFerramentasDoServidor(conectar(servidor.url), LIBERA_LOCAL);
    expect(sem).toMatchObject({ ok: false, motivo: "credencial_recusada" });
  });

  it("a credencial pode ir em outro cabeçalho, sem «Bearer»", async () => {
    servidor = await subirServidorMcp({ token: "chave-xyz", cabecalho: "x-api-key" });
    const r = await listarFerramentasDoServidor(conectar(servidor.url, { credencial: "chave-xyz", cabecalho: "X-API-Key" }), LIBERA_LOCAL);
    expect(r.ok).toBe(true);
    expect(servidor.recebidos[0]!.headers["x-api-key"]).toBe("chave-xyz");
    expect(servidor.recebidos[0]!.headers.authorization).toBeUndefined();
  });

  it("cabeçalho de credencial que o protocolo controla (linha escrita por fora da tela): falha fechada, sem abrir conexão", async () => {
    servidor = await subirServidorMcp();
    const r = await listarFerramentasDoServidor(conectar(servidor.url, { credencial: "abc", cabecalho: "Content-Type" }), LIBERA_LOCAL);
    expect(r).toMatchObject({ ok: false, motivo: "protocolo_invalido" });
    expect(servidor.recebidos).toHaveLength(0);
  });

  it("quem colou «Bearer …» inteiro não manda «Bearer Bearer»", async () => {
    servidor = await subirServidorMcp({ token: "abc" });
    const r = await listarFerramentasDoServidor(conectar(servidor.url, { credencial: "Bearer abc" }), LIBERA_LOCAL);
    expect(r.ok).toBe(true);
  });

  it("endereço que não é um servidor MCP: diz que não é MCP", async () => {
    servidor = await subirServidorMcp({ statusDeTudo: 404 });
    const r = await listarFerramentasDoServidor(conectar(servidor.url), LIBERA_LOCAL);
    expect(r).toMatchObject({ ok: false, motivo: "recusada_pelo_outro_sistema", httpStatus: 404 });
  });

  it("servidor caído (5xx) é falha de servidor, e redirecionamento não é seguido", async () => {
    servidor = await subirServidorMcp({ statusDeTudo: 503 });
    expect(await listarFerramentasDoServidor(conectar(servidor.url), LIBERA_LOCAL)).toMatchObject({
      ok: false,
      motivo: "erro_do_outro_sistema",
      httpStatus: 503,
    });
    await servidor.fechar();
    servidor = await subirServidorMcp({ redirecionarPara: "http://127.0.0.1:1/outro" });
    expect(await listarFerramentasDoServidor(conectar(servidor.url), LIBERA_LOCAL)).toMatchObject({
      ok: false,
      motivo: "redirecionamento",
    });
  });

  it("endereço da rede interna é recusado pela política ANTES de qualquer conexão", async () => {
    const r = await listarFerramentasDoServidor(conectar("http://127.0.0.1:9/mcp"), { politica: { permitirHttp: true } });
    expect(r).toMatchObject({ ok: false, motivo: "recusada_pela_politica" });
    const privado = await listarFerramentasDoServidor(conectar("https://10.0.0.5/mcp"), {});
    expect(privado).toMatchObject({ ok: false, motivo: "recusada_pela_politica" });
  });

  it("nada que responda e não seja MCP passa por MCP", async () => {
    // Um servidor MCP só abaixo do prazo: o cliente desiste do que não responde.
    servidor = await subirServidorMcp({ atrasoDaChamadaMs: 0 });
    const r = await listarFerramentasDoServidor(conectar(servidor.url.replace("/mcp", "/mcp")), { ...LIBERA_LOCAL, timeoutMs: 5_000 });
    expect(r.ok).toBe(true);
  });
});

describe("chamarFerramentaDoServidor — a chamada de verdade", () => {
  it("chama a ferramenta com os dados que o agente preencheu e devolve o texto", async () => {
    servidor = await subirServidorMcp();
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "consultar_estoque", efeito: "consulta", argumentos: { produto: "camiseta" } },
      LIBERA_LOCAL,
    );
    expect(r).toMatchObject({ ok: true, httpStatus: 200, tentativas: 1 });
    expect(r.ok && JSON.parse(r.conteudo)).toEqual({ produto: "camiseta", disponivel: 7 });
    expect(servidor.execucoes.consultar_estoque).toBe(1);
    const chamada = servidor.recebidos.find((x) => (x.corpo as { method?: string } | null)?.method === "tools/call")!;
    expect((chamada.corpo as { params: unknown }).params).toMatchObject({ name: "consultar_estoque", arguments: { produto: "camiseta" } });
  });

  it("leva o id do pedido em `_meta`, para o servidor poder deduplicar", async () => {
    servidor = await subirServidorMcp();
    await chamarFerramentaDoServidor(
      {
        servidor: conectar(servidor.url),
        ferramenta: "criar_pedido",
        efeito: "altera",
        argumentos: { produto: "camiseta", quantidade: 2 },
        idDeEntrega: "11111111-2222-4333-8444-555555555555",
      },
      LIBERA_LOCAL,
    );
    const chamada = servidor.recebidos.find((x) => (x.corpo as { method?: string } | null)?.method === "tools/call")!;
    expect((chamada.corpo as { params: { _meta: unknown } }).params._meta).toEqual({
      "agent/delivery_id": "11111111-2222-4333-8444-555555555555",
    });
  });

  it("funciona em fluxo SSE e com sessão", async () => {
    servidor = await subirServidorMcp({ sessao: true, json: false });
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "consultar_estoque", efeito: "consulta", argumentos: { produto: "boné" } },
      LIBERA_LOCAL,
    );
    expect(r.ok && JSON.parse(r.conteudo)).toMatchObject({ produto: "boné" });
  });

  it("NUNCA repete uma chamada que altera: 503 dá UMA tentativa e o desfecho fica incerto", async () => {
    servidor = await subirServidorMcp({ statusDaChamada: 503 });
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "criar_pedido", efeito: "altera", argumentos: { produto: "x", quantidade: 1 } },
      SEM_ESPERA,
    );
    expect(r).toMatchObject({ ok: false, motivo: "erro_do_outro_sistema", httpStatus: 503, tentativas: 1, desfechoIncerto: true });
    expect(servidor.recebidos.filter((x) => (x.corpo as { method?: string } | null)?.method === "tools/call")).toHaveLength(1);
  });

  it("uma CONSULTA repete uma vez em falha de servidor", async () => {
    servidor = await subirServidorMcp({ statusDaChamada: 503 });
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "consultar_estoque", efeito: "consulta", argumentos: { produto: "x" } },
      SEM_ESPERA,
    );
    expect(r).toMatchObject({ ok: false, tentativas: 2 });
    expect(servidor.recebidos.filter((x) => (x.corpo as { method?: string } | null)?.method === "tools/call")).toHaveLength(2);
  });

  it("ação que altera sem resposta a tempo é incerta e não é repetida", async () => {
    servidor = await subirServidorMcp({ atrasoDaChamadaMs: 3_000 });
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "criar_pedido", efeito: "altera", argumentos: { produto: "x", quantidade: 1 } },
      { ...SEM_ESPERA, timeoutMs: 400 },
    );
    expect(r).toMatchObject({ ok: false, motivo: "timeout", tentativas: 1, desfechoIncerto: true });
  });

  it("credencial recusada na CHAMADA é falha certa (nada foi executado)", async () => {
    servidor = await subirServidorMcp({ token: "certo" });
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url, { credencial: "errado" }), ferramenta: "criar_pedido", efeito: "altera", argumentos: { produto: "x", quantidade: 1 } },
      SEM_ESPERA,
    );
    expect(r).toMatchObject({ ok: false, motivo: "credencial_recusada", desfechoIncerto: false });
    expect(servidor.execucoes.criar_pedido).toBeUndefined();
  });

  it("falha ANTES de a chamada sair (a apresentação) é certa mesmo que o motivo seja de servidor", async () => {
    servidor = await subirServidorMcp({ statusDeTudo: 500 });
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "criar_pedido", efeito: "altera", argumentos: { produto: "x", quantidade: 1 } },
      SEM_ESPERA,
    );
    expect(r).toMatchObject({ ok: false, motivo: "erro_do_outro_sistema", tentativas: 1, desfechoIncerto: false });
    expect(servidor.recebidos.every((x) => (x.corpo as { method?: string } | null)?.method !== "tools/call")).toBe(true);
  });

  it("a ferramenta que responde «deu erro» é falha INCERTA, e o texto do erro NÃO vai ao agente", async () => {
    servidor = await subirServidorMcp();
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "com_erro", efeito: "altera", argumentos: { produto: "x" } },
      SEM_ESPERA,
    );
    expect(r).toMatchObject({ ok: false, motivo: "ferramenta_com_erro", desfechoIncerto: true });
    // O administrador pode ler (ao testar); o modelo não.
    expect(!r.ok && r.detalhe).toContain("falha interna");
    const paraOAgente = JSON.stringify(resultadoParaOAgente(r, "altera"));
    expect(paraOAgente).not.toContain("senha=123");
    expect(paraOAgente).not.toContain("banco do ERP");
  });

  it("resposta enorme é descartada (teto de bytes), e a ação não é repetida", async () => {
    servidor = await subirServidorMcp();
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "resposta_gigante", efeito: "altera", argumentos: {} },
      SEM_ESPERA,
    );
    expect(r).toMatchObject({ ok: false, motivo: "resposta_grande_demais", tentativas: 1, desfechoIncerto: true });
  });

  it("texto grande (abaixo do teto de leitura) chega cortado, com o aviso de que foi cortado", async () => {
    servidor = await subirServidorMcp();
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "texto_grande", efeito: "consulta", argumentos: {} },
      SEM_ESPERA,
    );
    expect(r.ok && r.truncado).toBe(true);
    expect(r.ok && r.conteudo.length).toBeLessThanOrEqual(4_000);
  });

  it("o resultado é DADO NÃO CONFIÁVEL: a tentativa de comandar o agente chega embrulhada com o aviso", async () => {
    servidor = await subirServidorMcp();
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "tool_com_injecao", efeito: "consulta", argumentos: { produto: "x" } },
      SEM_ESPERA,
    );
    expect(r.ok).toBe(true);
    const lido = resultadoParaOAgente(r, "consulta");
    expect(lido).toMatchObject({ ok: true, origem: "ferramenta_externa", dado_nao_confiavel: true });
    expect(lido.ok && lido.dado).toContain("IGNORE TODAS AS INSTRUÇÕES");
    expect(lido.ok && lido.aviso).toMatch(/nunca instrução/i);
    expect(TEXTO_DE_INJECAO).toContain("ext_consultar_estoque");
  });

  it("ferramenta que o servidor não conhece é recusa certa do servidor", async () => {
    servidor = await subirServidorMcp();
    const r = await chamarFerramentaDoServidor(
      { servidor: conectar(servidor.url), ferramenta: "nao_existe", efeito: "altera", argumentos: {} },
      SEM_ESPERA,
    );
    expect(r.ok).toBe(false);
  });
});
