/**
 * A DECISÃO sobre o pedido de uma ação externa (issue #95): aprovar executa a ação UMA vez,
 * recusar a cancela. O que se mede aqui é o contrato da rota — quem pode, o que impede o
 * segundo efeito, o que vai à auditoria — com o receptor trocado por um dublê da chamada
 * (o receptor HTTP de verdade é medido no teste de ponto A, `ferramenta-externa-no-turno`).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  repo: {
    buscarPedido: vi.fn(),
    reivindicar: vi.fn(),
    finalizar: vi.fn(),
    recusar: vi.fn(),
    marcarExpirado: vi.fn(),
    resolverAviso: vi.fn(),
    abrirAvisoDeFalhaDoPedido: vi.fn(),
  },
  lerChave: vi.fn(),
  chamar: vi.fn(),
  // Servidor MCP (#96)
  mcpChamar: vi.fn(),
  mcpConfig: vi.fn(),
  mcpServidor: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/ai/ferramentas-externas/pedidos-api", () => deps.repo);
vi.mock("@/lib/ai/ferramentas-externas/repositorio", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/repositorio")>()),
  lerChaveDaFerramenta: deps.lerChave,
}));
vi.mock("@/lib/ai/ferramentas-externas/chamar", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/chamar")>()),
  chamarFerramentaExterna: deps.chamar,
}));

vi.mock("@/lib/ai/ferramentas-externas/mcp/cliente", () => ({ chamarFerramentaDoServidor: deps.mcpChamar }));
vi.mock("@/lib/ai/ferramentas-externas/mcp/config", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/mcp/config")>()),
  lerConfigDeMcpDaOrganizacao: deps.mcpConfig,
}));
vi.mock("@/lib/ai/ferramentas-externas/mcp/repositorio", () => ({ carregarServidorParaChamar: deps.mcpServidor }));

import { POST } from "@/app/api/v1/ai/external-tool-requests/[id]/decide/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const AVISO = "44444444-4444-4444-8444-444444444444";

const PEDIDO = {
  id: ID,
  tool_id: "55555555-5555-4555-8555-555555555555",
  tool_name: "Criar pedido",
  tool_slug: "criar_pedido",
  effect: "altera" as const,
  status: "pending" as const,
  origin: "live" as const,
  arguments: { produto: "camiseta azul", senha: "xyz-segredo" },
  uncertain: false,
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  created_at: new Date().toISOString(),
  decided_at: null,
  executed_at: null,
  outcome_http_status: null,
  outcome_reason: null,
  inbox_item_id: AVISO,
  conversation_id: null,
  agent_id: null,
  tool_active: true,
  tool_parameters: [
    { nome: "produto", tipo: "texto", descricao: "Nome do produto", obrigatorio: true },
    { nome: "senha", tipo: "texto", descricao: "Senha do cliente", obrigatorio: false },
  ],
  tool_url: "https://erp.exemplo.com/hook",
};

const req = (corpo: unknown) =>
  new NextRequest(`http://localhost/api/v1/ai/external-tool-requests/${ID}/decide`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } });
  deps.admin.mockReturnValue({});
  deps.repo.buscarPedido.mockResolvedValue(PEDIDO);
  deps.repo.reivindicar.mockResolvedValue(true);
  deps.repo.recusar.mockResolvedValue(true);
  deps.repo.marcarExpirado.mockResolvedValue(true);
  deps.lerChave.mockResolvedValue("whsec_chave");
  deps.mcpConfig.mockResolvedValue({ ligado: true, aceite: { em: "2026-10-18T12:00:00.000Z", por: EU } });
  deps.mcpServidor.mockResolvedValue({
    nome: "ERP",
    ativo: true,
    servidor: { url: "https://mcp.exemplo.com/mcp", credencial: "tok-do-servidor", cabecalho: "authorization" },
    temCredencial: true,
    credencialLegivel: true,
  });
  deps.mcpChamar.mockResolvedValue({ ok: true, httpStatus: 200, conteudo: '{"pedido":"P-1"}', truncado: false, tentativas: 1, duracaoMs: 20 });
  deps.chamar.mockResolvedValue({ ok: true, httpStatus: 201, conteudo: "{}", truncado: false, tentativas: 1, duracaoMs: 12 });
});

const acoesAuditadas = () => deps.audit.mock.calls.map(([a]) => (a as { action: string }).action);

describe("quem pode decidir", () => {
  it("suporte temporário não decide (é efeito no mundo, em nome da organização)", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.support.mockResolvedValue(barrado);
    expect(await POST(req({ decision: "approve" }), ctx())).toBe(barrado);
    expect(deps.repo.buscarPedido).not.toHaveBeenCalled();
    expect(deps.chamar).not.toHaveBeenCalled();
  });

  it("exige manager; sem permissão devolve a resposta do porteiro e não toca em nada", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.role.mockResolvedValue({ ok: false, response: barrado });
    expect(await POST(req({ decision: "approve" }), ctx())).toBe(barrado);
    expect(deps.role).toHaveBeenCalledWith("manager", expect.anything());
    expect(deps.repo.buscarPedido).not.toHaveBeenCalled();
  });

  it("id inválido é 400, corpo inválido é 422, e o corpo não escolhe a organização", async () => {
    expect((await POST(req({ decision: "approve" }), ctx("nao-e-uuid"))).status).toBe(400);
    expect((await POST(req({ decision: "talvez" }), ctx())).status).toBe(422);
    expect((await POST(req({ decision: "approve", organization_id: ORG }), ctx())).status).toBe(422);
  });

  it("o pedido é procurado na organização da SESSÃO; de outra organização é 404", async () => {
    deps.repo.buscarPedido.mockResolvedValue(null);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(404);
    expect(deps.repo.buscarPedido).toHaveBeenCalledWith({}, ORG, ID);
    expect(deps.chamar).not.toHaveBeenCalled();
  });
});

describe("aprovar executa UMA vez", () => {
  it("reivindica, chama com o id do pedido como id de entrega, fecha o pedido, resolve o aviso e audita", async () => {
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({
      id: ID,
      status: "executed",
      ok: true,
      http_status: 201,
      // O que o outro sistema devolveu volta à tela de quem aprovou (a consulta aprovada não some no ar).
      content: "{}",
    });

    expect(deps.repo.reivindicar).toHaveBeenCalledWith({}, ORG, ID, EU);
    expect(deps.chamar).toHaveBeenCalledTimes(1);
    const [entrada] = deps.chamar.mock.calls[0]!;
    expect(entrada).toMatchObject({
      ferramenta: { slug: "criar_pedido", url: "https://erp.exemplo.com/hook", efeito: "altera" },
      segredo: "whsec_chave",
      idDeEntrega: ID,
      argumentos: { produto: "camiseta azul", senha: "xyz-segredo" },
    });
    expect(deps.repo.finalizar).toHaveBeenCalledWith({}, ORG, ID, expect.objectContaining({ ok: true }));
    expect(deps.repo.resolverAviso).toHaveBeenCalledWith({}, ORG, AVISO);
    expect(acoesAuditadas()).toEqual(["ai.external_tool_request_approved", "ai.external_tool_request_executed"]);
  });

  it("a auditoria leva o ator, a ferramenta e um resumo SEM segredos", async () => {
    await POST(req({ decision: "approve" }), ctx());
    const aprovada = deps.audit.mock.calls[0]![0] as { actorUserId: string; organizationId: string; resourceId: string; metadata: unknown };
    expect(aprovada).toMatchObject({ actorUserId: EU, organizationId: ORG, resourceId: ID });
    const texto = JSON.stringify(deps.audit.mock.calls);
    expect(texto).toContain("criar_pedido");
    expect(texto).toContain("camiseta azul");
    expect(texto).not.toContain("xyz-segredo");
    expect(texto).not.toContain("whsec_chave");
  });

  it("clique duplo: quem perde a reivindicação recebe 409 e NADA é chamado", async () => {
    deps.repo.reivindicar.mockResolvedValue(false);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("request_not_pending");
    expect(deps.chamar).not.toHaveBeenCalled();
    expect(deps.repo.finalizar).not.toHaveBeenCalled();
    expect(acoesAuditadas()).toEqual([]);
  });

  it.each([
    ["executed", /já foi executado/i],
    ["rejected", /já foi recusado/i],
    ["expired", /expirou/i],
    ["executing", /sendo executado/i],
    ["failed", /já foi tentado/i],
  ] as const)("pedido %s não é decidido de novo", async (status, frase) => {
    deps.repo.buscarPedido.mockResolvedValue({ ...PEDIDO, status });
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.message).toMatch(frase);
    expect(deps.repo.reivindicar).not.toHaveBeenCalled();
    expect(deps.chamar).not.toHaveBeenCalled();
  });

  it("pendente vencido: marca como expirado, resolve o aviso e recusa executar", async () => {
    deps.repo.buscarPedido.mockResolvedValue({ ...PEDIDO, expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("request_expired");
    expect(deps.repo.marcarExpirado).toHaveBeenCalledWith({}, ORG, ID);
    expect(deps.repo.resolverAviso).toHaveBeenCalledWith({}, ORG, AVISO);
    expect(deps.chamar).not.toHaveBeenCalled();
    expect(acoesAuditadas()).toEqual(["ai.external_tool_request_expired"]);
  });

  it("ferramenta desativada não executa; o pedido continua pendente para ser recusado", async () => {
    deps.repo.buscarPedido.mockResolvedValue({ ...PEDIDO, tool_active: false });
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("tool_inactive");
    expect(deps.repo.reivindicar).not.toHaveBeenCalled();
    expect(deps.chamar).not.toHaveBeenCalled();
  });

  it("dados que não cabem mais no esquema atual da ferramenta (ela foi editada) não são enviados", async () => {
    deps.repo.buscarPedido.mockResolvedValue({
      ...PEDIDO,
      tool_parameters: [{ nome: "codigo", tipo: "inteiro", descricao: "Código do produto", obrigatorio: true }],
    });
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("request_arguments_outdated");
    expect(deps.repo.reivindicar).not.toHaveBeenCalled();
    expect(deps.chamar).not.toHaveBeenCalled();
  });

  it("falha incerta: UMA chamada, o pedido fecha como falha incerta, a Central é avisada e a resposta diz que não foi repetida", async () => {
    deps.chamar.mockResolvedValue({
      ok: false,
      motivo: "erro_do_outro_sistema",
      httpStatus: 503,
      tentativas: 1,
      duracaoMs: 30,
      desfechoIncerto: true,
    });
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(200);
    const corpo = (await res.json()).data;
    expect(corpo).toMatchObject({ status: "failed", ok: false, uncertain: true, reason: "erro_do_outro_sistema" });
    expect(corpo.message).toMatch(/não foi repetida/i);
    expect(deps.chamar).toHaveBeenCalledTimes(1);
    expect(deps.repo.finalizar).toHaveBeenCalledWith({}, ORG, ID, expect.objectContaining({ ok: false, desfechoIncerto: true }));
    expect(deps.repo.abrirAvisoDeFalhaDoPedido).toHaveBeenCalledTimes(1);
    expect(acoesAuditadas()).toEqual(["ai.external_tool_request_approved", "ai.external_tool_request_executed"]);
    expect(JSON.stringify(deps.audit.mock.calls[1])).toContain('"ok":false');
  });

  it("exceção entre a reivindicação e o desfecho: o pedido NÃO fica preso em «executando» — fecha como falha incerta", async () => {
    deps.lerChave.mockRejectedValue(new Error("cifra caiu"));
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ status: "failed", ok: false, uncertain: true });
    expect(deps.chamar).not.toHaveBeenCalled();
    expect(deps.repo.finalizar).toHaveBeenCalledWith({}, ORG, ID, expect.objectContaining({ ok: false, desfechoIncerto: true }));
  });

  it("a falha de uma segunda aprovação da MESMA ferramenta também gera aviso (o título leva o pedido)", async () => {
    deps.chamar.mockResolvedValue({
      ok: false,
      motivo: "timeout",
      httpStatus: null,
      tentativas: 1,
      duracaoMs: 8000,
      desfechoIncerto: true,
    });
    await POST(req({ decision: "approve" }), ctx());
    expect(deps.repo.abrirAvisoDeFalhaDoPedido.mock.calls[0]![2].titulo).toContain(`#${ID.slice(0, 4)}`);
  });

  it("sem a chave de assinatura a chamada não sai e o pedido fecha como falha CERTA", async () => {
    deps.lerChave.mockResolvedValue(null);
    deps.chamar.mockResolvedValue({
      ok: false,
      motivo: "segredo_indisponivel",
      httpStatus: null,
      tentativas: 0,
      duracaoMs: 0,
      desfechoIncerto: false,
    });
    const corpo = (await (await POST(req({ decision: "approve" }), ctx())).json()).data;
    expect(corpo).toMatchObject({ status: "failed", ok: false, uncertain: false });
  });
});

describe("recusar cancela", () => {
  it("recusa o pendente, resolve o aviso, audita com o motivo e nunca chama o outro sistema", async () => {
    const res = await POST(req({ decision: "reject", reason: "Cliente desistiu" }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: ID, status: "rejected" });
    expect(deps.repo.recusar).toHaveBeenCalledWith({}, ORG, ID, EU, "Cliente desistiu");
    expect(deps.repo.resolverAviso).toHaveBeenCalledWith({}, ORG, AVISO);
    expect(deps.chamar).not.toHaveBeenCalled();
    expect(acoesAuditadas()).toEqual(["ai.external_tool_request_rejected"]);
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain("xyz-segredo");
  });

  it("recusar duas vezes (ou depois de aprovado) é 409", async () => {
    deps.repo.recusar.mockResolvedValue(false);
    const res = await POST(req({ decision: "reject" }), ctx());
    expect(res.status).toBe(409);
    expect(acoesAuditadas()).toEqual([]);
  });
});

describe("ferramenta de servidor MCP (#96)", () => {
  const SERVIDOR = "66666666-6666-4666-8666-666666666666";
  const PEDIDO_MCP = {
    ...PEDIDO,
    tool_slug: "criar_pedido_erp",
    tool_url: null,
    tool_mcp: { servidor_id: SERVIDOR, nome_no_servidor: "criar_pedido" },
  };

  it("aprovar executa pelo cliente MCP, com a credencial do SERVIDOR, o nome da ferramenta NO servidor e o id do pedido", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: ID, status: "executed", ok: true, content: '{"pedido":"P-1"}' });
    expect(deps.chamar).not.toHaveBeenCalled();
    expect(deps.mcpChamar).toHaveBeenCalledTimes(1);
    const [entrada] = deps.mcpChamar.mock.calls[0]!;
    expect(entrada).toMatchObject({
      servidor: { url: "https://mcp.exemplo.com/mcp", credencial: "tok-do-servidor", cabecalho: "authorization" },
      ferramenta: "criar_pedido",
      efeito: "altera",
      idDeEntrega: ID,
    });
    expect(deps.mcpServidor).toHaveBeenCalledWith({}, ORG, SERVIDOR);
    expect(deps.repo.finalizar).toHaveBeenCalledWith({}, ORG, ID, expect.objectContaining({ ok: true }));
  });

  it("a auditoria diz que é MCP, de qual servidor e qual ferramenta — e nunca a credencial", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    await POST(req({ decision: "approve" }), ctx());
    const texto = JSON.stringify(deps.audit.mock.calls);
    expect(texto).toContain('"kind":"mcp"');
    expect(texto).toContain(SERVIDOR);
    expect(texto).toContain("criar_pedido");
    expect(texto).not.toContain("tok-do-servidor");
    expect(texto).not.toContain("xyz-segredo");
  });

  it("com o recurso DESLIGADO a aprovação não executa, o pedido continua pendente e nada é chamado", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    deps.mcpConfig.mockResolvedValue({ ligado: false, aceite: null });
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("mcp_disabled");
    expect(deps.repo.reivindicar).not.toHaveBeenCalled();
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });

  it("falha na leitura do interruptor vale desligado (falha fechada)", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    deps.mcpConfig.mockResolvedValue(null);
    expect((await POST(req({ decision: "approve" }), ctx())).status).toBe(409);
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });

  it("servidor desativado (ou apagado) não executa; o pedido continua pendente", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    deps.mcpServidor.mockResolvedValue({ nome: "ERP", ativo: false, servidor: { url: "https://x.com/mcp", credencial: null, cabecalho: "authorization" }, temCredencial: false, credencialLegivel: true });
    const res = await POST(req({ decision: "approve" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("mcp_server_inactive");
    expect(deps.repo.reivindicar).not.toHaveBeenCalled();
    deps.mcpServidor.mockResolvedValue(null);
    expect((await POST(req({ decision: "approve" }), ctx())).status).toBe(409);
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });

  it("credencial gravada e ilegível: a chamada NÃO sai (nada de «tentar sem autenticação») e o pedido fecha como falha certa", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    deps.mcpServidor.mockResolvedValue({
      nome: "ERP",
      ativo: true,
      servidor: { url: "https://mcp.exemplo.com/mcp", credencial: null, cabecalho: "authorization" },
      temCredencial: true,
      credencialLegivel: false,
    });
    const corpo = (await (await POST(req({ decision: "approve" }), ctx())).json()).data;
    expect(corpo).toMatchObject({ status: "failed", ok: false, uncertain: false, reason: "segredo_indisponivel" });
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });

  it("falha incerta no servidor: UMA chamada, fecha como incerta e não é repetida", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    deps.mcpChamar.mockResolvedValue({ ok: false, motivo: "timeout", httpStatus: null, tentativas: 1, duracaoMs: 15000, desfechoIncerto: true });
    const corpo = (await (await POST(req({ decision: "approve" }), ctx())).json()).data;
    expect(corpo).toMatchObject({ status: "failed", ok: false, uncertain: true, reason: "timeout" });
    expect(deps.mcpChamar).toHaveBeenCalledTimes(1);
  });

  it("recusar um pedido de MCP funciona mesmo com o recurso desligado (dá para limpar a fila)", async () => {
    deps.repo.buscarPedido.mockResolvedValue(PEDIDO_MCP);
    deps.mcpConfig.mockResolvedValue({ ligado: false, aceite: null });
    const res = await POST(req({ decision: "reject" }), ctx());
    expect(res.status).toBe(200);
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });
});
