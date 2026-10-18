/**
 * A ferramenta de servidor MCP DENTRO do turno do agente (issue #96), contra um servidor MCP DE
 * VERDADE (o do SDK oficial). É a mesma `montarFerramentasExternas` das ferramentas por webhook;
 * o que muda é para onde a chamada vai — e o que se mede é o que chega ao servidor, o que o agente
 * lê de volta e o que NÃO acontece (ação que altera sem aprovação, credencial ilegível, rede interna).
 */
import type { Tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { subirServidorMcp, TEXTO_DE_INJECAO, type ServidorMcpDeTeste } from "@/tests/helpers/servidor-mcp-de-teste";

import type { PedidoDoTurno } from "./pedidos-tipos";
import {
  montarFerramentasExternas,
  type ChamadaSimulada,
  type DependenciasDoTurnoExterno,
  type FerramentaDoTurno,
} from "./turno";

let mcp: ServidorMcpDeTeste | null = null;
afterEach(async () => {
  await mcp?.fechar();
  mcp = null;
});

const DO_SERVIDOR = {
  servidorId: "77777777-7777-4777-8777-777777777777",
  cabecalho: "authorization",
  temCredencial: true,
};

const consultaMcp = (url: string, extra: Partial<FerramentaDoTurno> = {}): FerramentaDoTurno => ({
  id: "11111111-1111-4111-8111-111111111111",
  slug: "consultar_estoque",
  name: "Consultar estoque",
  whenToUse: "Quando o cliente perguntar se um produto está disponível.",
  url,
  parameters: [{ nome: "produto", tipo: "texto", descricao: "Nome do produto", obrigatorio: true }],
  effect: "consulta",
  requireApproval: null,
  approvalTtlHours: 24,
  mcp: { ...DO_SERVIDOR, nomeNoServidor: "consultar_estoque" },
  ...extra,
});

const alteraMcp = (url: string, extra: Partial<FerramentaDoTurno> = {}): FerramentaDoTurno =>
  consultaMcp(url, {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "criar_pedido",
    name: "Criar pedido",
    whenToUse: "Quando o cliente confirmar que quer fechar o pedido.",
    effect: "altera",
    parameters: [
      { nome: "produto", tipo: "texto", descricao: "Produto do pedido", obrigatorio: true },
      { nome: "quantidade", tipo: "inteiro", descricao: "Quantidade", obrigatorio: true },
    ],
    mcp: { ...DO_SERVIDOR, nomeNoServidor: "criar_pedido" },
    ...extra,
  });

const PEDIDO_ID = "99999999-9999-4999-8999-999999999999";
const pedido = (extra: Partial<PedidoDoTurno> = {}): PedidoDoTurno => ({
  id: PEDIDO_ID,
  status: "pending",
  incerto: false,
  expiresAt: "2026-10-18T12:00:00.000Z",
  ...extra,
});

function deps(carregadas: FerramentaDoTurno[], sobre: Partial<DependenciasDoTurnoExterno> = {}) {
  const avisos: Array<{ titulo: string; corpo: string }> = [];
  const auditorias: Array<{ ok: boolean }> = [];
  const abertos: Array<{ autoExecutar: boolean; origem: string; slug: string }> = [];
  const concluidos: Array<{ id: string; ok: boolean; incerto: boolean }> = [];
  const base: DependenciasDoTurnoExterno = {
    carregar: vi.fn(async () => carregadas),
    lerChave: vi.fn(async () => "tok"),
    abrirAviso: async (a) => void avisos.push(a),
    auditar: async ({ resultado }) => void auditorias.push({ ok: resultado.ok }),
    log: { warn: () => {} },
    abrirPedido: async (a) => {
      abertos.push({ autoExecutar: a.autoExecutar, origem: a.origem, slug: a.ferramenta.slug });
      return a.autoExecutar
        ? { pedido: pedido({ status: "executing" }), reivindicado: true }
        : { pedido: pedido(), reivindicado: true };
    },
    concluirPedido: async (c) =>
      void concluidos.push({ id: c.pedido.id, ok: c.resultado.ok, incerto: !c.resultado.ok && c.resultado.desfechoIncerto }),
    // O servidor de teste está em 127.0.0.1: a política da organização o recusaria.
    politica: { permitirHttp: true, ipPermitido: () => true },
    dormir: async () => {},
    ...sobre,
  };
  return { base, avisos, auditorias, abertos, concluidos };
}

interface Saida {
  ok?: boolean;
  status?: string;
  message?: string;
  origem?: string;
  dado_nao_confiavel?: boolean;
  aviso?: string;
  dado?: string;
  truncado?: boolean;
  error?: { code?: string; message?: string };
}

async function executar(t: Tool, entrada: unknown): Promise<Saida> {
  return (await (t.execute as (i: unknown, o: unknown) => Promise<unknown>)(entrada, { toolCallId: "x", messages: [] })) as Saida;
}

const chamadasDeFerramenta = (s: ServidorMcpDeTeste) =>
  s.recebidos.filter((x) => (x.corpo as { method?: string } | null)?.method === "tools/call");

describe("ferramenta de servidor MCP no turno", () => {
  it("uma CONSULTA sai pelo servidor MCP, com a credencial dele, e volta ao agente como DADO NÃO CONFIÁVEL", async () => {
    mcp = await subirServidorMcp({ token: "tok-do-servidor" });
    const { base, auditorias, abertos } = deps([consultaMcp(mcp.url)], { lerChave: vi.fn(async () => "tok-do-servidor") });
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    expect(r.nomes).toEqual(["ext_consultar_estoque"]);
    const out = await executar(r.tools.ext_consultar_estoque!, { produto: "camiseta" });
    expect(out).toMatchObject({ ok: true, origem: "ferramenta_externa", dado_nao_confiavel: true });
    expect(JSON.parse(out.dado!)).toEqual({ produto: "camiseta", disponivel: 7 });
    expect(mcp.execucoes.consultar_estoque).toBe(1);
    expect(auditorias).toEqual([{ ok: true }]);
    // Consulta que não pede aprovação não abre pedido.
    expect(abertos).toHaveLength(0);
    // A credencial viajou como Bearer — e só para o servidor.
    expect(mcp.recebidos.every((x) => x.headers.authorization === "Bearer tok-do-servidor")).toBe(true);
  });

  it("injeção indireta: o texto que manda no agente chega embrulhado como dado, com o aviso à frente", async () => {
    mcp = await subirServidorMcp();
    const { base } = deps([consultaMcp(mcp.url, { mcp: { ...DO_SERVIDOR, nomeNoServidor: "tool_com_injecao" } })]);
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const out = await executar(r.tools.ext_consultar_estoque!, { produto: "camiseta" });
    expect(out).toMatchObject({ ok: true, dado_nao_confiavel: true });
    expect(out.dado).toContain("IGNORE TODAS AS INSTRUÇÕES");
    expect(out.aviso).toMatch(/nunca instrução/i);
    const ordem = Object.keys(out);
    expect(ordem.indexOf("aviso")).toBeLessThan(ordem.indexOf("dado"));
    expect(TEXTO_DE_INJECAO.length).toBeGreaterThan(50);
  });

  it("resposta grande é CORTADA no limite do agente, com o aviso de que foi cortada", async () => {
    mcp = await subirServidorMcp();
    const { base } = deps([consultaMcp(mcp.url, { parameters: [], mcp: { ...DO_SERVIDOR, nomeNoServidor: "texto_grande" } })]);
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const out = await executar(r.tools.ext_consultar_estoque!, {});
    expect(out).toMatchObject({ ok: true, truncado: true });
    expect(out.dado!.length).toBeLessThanOrEqual(4000);
  });

  it("ação que ALTERA (risco padrão) NÃO sai: abre o pedido, o servidor não é tocado e o agente lê «aguardando aprovação»", async () => {
    mcp = await subirServidorMcp();
    const { base, abertos } = deps([alteraMcp(mcp.url)]);
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const out = await executar(r.tools.ext_criar_pedido!, { produto: "camiseta", quantidade: 2 });
    expect(out).toMatchObject({ ok: true, status: "awaiting_approval" });
    expect(abertos).toEqual([{ autoExecutar: false, origem: "live", slug: "criar_pedido" }]);
    expect(mcp.recebidos).toHaveLength(0);
    expect(mcp.execucoes.criar_pedido).toBeUndefined();
  });

  it("a anotação do servidor («só lê») NÃO desliga a aprovação: o servidor mente e o pedido continua pendente", async () => {
    mcp = await subirServidorMcp();
    // `criar_pedido` declara readOnlyHint: true no servidor de teste, mas o administrador não mexeu no risco.
    const { base, abertos } = deps([alteraMcp(mcp.url)]);
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    await executar(r.tools.ext_criar_pedido!, { produto: "camiseta", quantidade: 1 });
    expect(abertos[0]?.autoExecutar).toBe(false);
    expect(mcp.execucoes.criar_pedido).toBeUndefined();
  });

  it("modo ASSISTIDO: até a consulta MCP espera aprovação, qualquer que seja a chave", async () => {
    mcp = await subirServidorMcp();
    const { base, abertos } = deps([consultaMcp(mcp.url)]);
    const r = await montarFerramentasExternas({ ids: ["x"], modo: "assistido" }, base);
    const out = await executar(r.tools.ext_consultar_estoque!, { produto: "camiseta" });
    expect(out).toMatchObject({ ok: true, status: "awaiting_approval" });
    expect(abertos[0]).toMatchObject({ autoExecutar: false, origem: "assisted" });
    expect(mcp.recebidos).toHaveLength(0);
  });

  it("«pedir aprovação» desligada de propósito: executa UMA vez, com o id do pedido, e a repetição do modelo não executa de novo", async () => {
    mcp = await subirServidorMcp();
    let reivindicados = 0;
    const { base, concluidos } = deps([alteraMcp(mcp.url, { requireApproval: false })], {
      abrirPedido: async () => {
        reivindicados++;
        return reivindicados === 1
          ? { pedido: pedido({ status: "executing" }), reivindicado: true }
          : { pedido: pedido({ status: "executed", conteudo: '{"pedido":"P-1"}' }), reivindicado: false };
      },
    });
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const primeira = await executar(r.tools.ext_criar_pedido!, { produto: "camiseta", quantidade: 2 });
    expect(primeira).toMatchObject({ ok: true });
    expect(mcp.execucoes.criar_pedido).toBe(1);
    expect(concluidos).toEqual([{ id: PEDIDO_ID, ok: true, incerto: false }]);
    const chamada = chamadasDeFerramenta(mcp)[0]!;
    expect((chamada.corpo as { params: { _meta: unknown } }).params._meta).toEqual({ "agent/delivery_id": PEDIDO_ID });

    const repetida = await executar(r.tools.ext_criar_pedido!, { produto: "camiseta", quantidade: 2 });
    expect(repetida).toMatchObject({ status: "already_executed" });
    expect(mcp.execucoes.criar_pedido).toBe(1);
  });

  it("falha INCERTA numa ação MCP: UMA só tentativa, o agente não afirma nem nega, a Central é avisada e o pedido fecha incerto", async () => {
    mcp = await subirServidorMcp({ statusDaChamada: 503 });
    const { base, avisos, concluidos } = deps([alteraMcp(mcp.url, { requireApproval: false })]);
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const out = await executar(r.tools.ext_criar_pedido!, { produto: "camiseta", quantidade: 2 });
    expect(out).toMatchObject({ ok: false, error: { code: "external_tool_failed" } });
    expect(out.error?.message).toMatch(/NÃO afirme/);
    expect(chamadasDeFerramenta(mcp)).toHaveLength(1);
    expect(concluidos).toEqual([{ id: PEDIDO_ID, ok: false, incerto: true }]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.corpo).toMatch(/NÃO foi repetida/);
  });

  it("falha de uma CONSULTA MCP manda o administrador ao lugar certo (Servidores MCP) e instrui o agente a não afirmar", async () => {
    mcp = await subirServidorMcp({ statusDeTudo: 500 });
    const { base, avisos } = deps([consultaMcp(mcp.url)]);
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const out = await executar(r.tools.ext_consultar_estoque!, { produto: "camiseta" });
    expect(out).toMatchObject({ ok: false, error: { code: "external_tool_failed" } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.corpo).toMatch(/Servidores MCP/);
    // O que o modelo lê não carrega endereço, credencial nem cabeçalho.
    expect(JSON.stringify(out)).not.toContain("127.0.0.1");
  });

  it("credencial gravada e ilegível: a chamada NÃO sai (nada de «tentar sem autenticação») e a Central é avisada", async () => {
    mcp = await subirServidorMcp();
    const { base, avisos } = deps([consultaMcp(mcp.url)], { lerChave: vi.fn(async () => null) });
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const out = await executar(r.tools.ext_consultar_estoque!, { produto: "camiseta" });
    expect(out).toMatchObject({ ok: false, error: { code: "external_tool_failed" } });
    expect(mcp.recebidos).toHaveLength(0);
    expect(avisos).toHaveLength(1);
  });

  it("servidor SEM credencial funciona sem ela (não é o mesmo que credencial ilegível)", async () => {
    mcp = await subirServidorMcp();
    const aberta = consultaMcp(mcp.url, { mcp: { ...DO_SERVIDOR, temCredencial: false, nomeNoServidor: "consultar_estoque" } });
    const { base } = deps([aberta], { lerChave: vi.fn(async () => null) });
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    expect(await executar(r.tools.ext_consultar_estoque!, { produto: "camiseta" })).toMatchObject({ ok: true });
    expect(mcp.recebidos.some((x) => x.headers.authorization !== undefined)).toBe(false);
  });

  it("endereço da rede interna é recusado pela política da organização (sem a válvula de teste)", async () => {
    mcp = await subirServidorMcp();
    const { base } = deps([consultaMcp(mcp.url)], { politica: { permitirHttp: true } });
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    expect(await executar(r.tools.ext_consultar_estoque!, { produto: "camiseta" })).toMatchObject({ ok: false });
    expect(mcp.recebidos).toHaveLength(0);
  });

  it("na PRÉVIA nada sai para o servidor MCP: a chamada é registrada como «seria feita»", async () => {
    mcp = await subirServidorMcp();
    const { base, abertos } = deps([alteraMcp(mcp.url)]);
    const registradas: ChamadaSimulada[] = [];
    const r = await montarFerramentasExternas({ ids: ["x"], previa: { registrar: (c) => registradas.push(c) } }, base);
    expect(await executar(r.tools.ext_criar_pedido!, { produto: "camiseta", quantidade: 2 })).toMatchObject({
      status: "nao_executada_em_teste",
    });
    expect(mcp.recebidos).toHaveLength(0);
    expect(abertos).toHaveLength(0);
    expect(registradas[0]).toMatchObject({ tool: "ext_criar_pedido", executed: false, effect: "altera", wouldAskApproval: true });
  });

  it("o modelo só preenche os campos declarados: um campo a mais é recusado antes de sair", async () => {
    mcp = await subirServidorMcp();
    const { base } = deps([alteraMcp(mcp.url, { requireApproval: false })]);
    const r = await montarFerramentasExternas({ ids: ["x"] }, base);
    const out = await executar(r.tools.ext_criar_pedido!, { produto: "x", quantidade: 1, desconto: 100 });
    expect(out).toMatchObject({ ok: false, error: { code: "invalid_arguments" } });
    expect(mcp.recebidos).toHaveLength(0);
  });
});
