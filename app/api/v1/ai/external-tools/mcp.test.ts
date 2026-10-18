/**
 * A ferramenta que vem de um servidor MCP (issue #96) passa pelas MESMAS rotas das ferramentas
 * por webhook — com as diferenças que importam: só administrador mexe, o que vem do servidor não
 * se edita aqui, não tem chave de assinatura, e o teste real chama o servidor com a credencial DELE.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  destino: vi.fn(),
  config: vi.fn(),
  servidor: vi.fn(),
  mcpChamar: vi.fn(),
  repo: {
    buscarFerramenta: vi.fn(),
    editarFerramenta: vi.fn(),
    apagarFerramenta: vi.fn(),
    rotacionarChave: vi.fn(),
    lerChaveDaFerramenta: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/automation/destinos-internos-autorizados", () => ({ motivoDaRecusaDeDestino: deps.destino }));
vi.mock("@/lib/ai/ferramentas-externas/repositorio", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/repositorio")>()),
  ...deps.repo,
}));
vi.mock("@/lib/ai/ferramentas-externas/mcp/cliente", () => ({ chamarFerramentaDoServidor: deps.mcpChamar }));
vi.mock("@/lib/ai/ferramentas-externas/mcp/config", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/mcp/config")>()),
  lerConfigDeMcpDaOrganizacao: deps.config,
}));
vi.mock("@/lib/ai/ferramentas-externas/mcp/repositorio", () => ({ carregarServidorParaChamar: deps.servidor }));

import { DELETE, PATCH } from "@/app/api/v1/ai/external-tools/[id]/route";
import { POST as ROTACIONAR } from "@/app/api/v1/ai/external-tools/[id]/rotate-secret/route";
import { POST as TESTAR } from "@/app/api/v1/ai/external-tools/[id]/test/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const SERVIDOR = "66666666-6666-4666-8666-666666666666";
const CREDENCIAL = "tok_do_servidor_secreto_7777";

const FERRAMENTA_MCP = {
  id: ID,
  kind: "mcp" as const,
  name: "Consultar estoque",
  slug: "consultar_estoque",
  agent_name: "ext_consultar_estoque",
  when_to_use: "Quando o cliente perguntar se um produto está disponível.",
  url: null,
  mcp: { server_id: SERVIDOR, server_name: "ERP", tool_name: "consultar_estoque", hint_read_only: true },
  unavailable_reason: null,
  parameters: [{ nome: "produto", tipo: "texto" as const, descricao: "Nome do produto", obrigatorio: true }],
  effect: "altera" as const,
  require_approval: null,
  approval_ttl_hours: 24,
  active: true,
  secret_last4: null,
  created_at: "2026-10-18T12:00:00Z",
  updated_at: "2026-10-18T12:00:00Z",
};

const req = (metodo: string, corpo?: unknown) =>
  new NextRequest(`http://localhost/api/v1/ai/external-tools/${ID}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
const ctx = () => ({ params: Promise.resolve({ id: ID }) });

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  // O porteiro responde conforme o papel pedido: manager passa, admin passa — o teste muda isto onde precisa.
  deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } });
  deps.admin.mockReturnValue({});
  deps.destino.mockResolvedValue(null);
  deps.repo.buscarFerramenta.mockResolvedValue(FERRAMENTA_MCP);
  deps.config.mockResolvedValue({ ligado: true, aceite: { em: "2026-10-18T12:00:00.000Z", por: EU } });
  deps.servidor.mockResolvedValue({
    nome: "ERP",
    ativo: true,
    servidor: { url: "https://mcp.exemplo.com/mcp", credencial: CREDENCIAL, cabecalho: "authorization" },
    temCredencial: true,
    credencialLegivel: true,
  });
  deps.mcpChamar.mockResolvedValue({ ok: true, httpStatus: 200, conteudo: '{"disponivel":7}', truncado: false, tentativas: 1, duracaoMs: 33 });
});

/** Manager passa, admin NÃO: o porteiro nega a quem pede admin. */
function soManager() {
  const barrado = new Response("{}", { status: 403 });
  deps.role.mockImplementation(async (minimo: string) =>
    minimo === "admin" ? { ok: false, response: barrado } : { ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } },
  );
  return barrado;
}

describe("editar e apagar: só administrador", () => {
  it("manager NÃO edita nem apaga ferramenta de servidor MCP", async () => {
    const barrado = soManager();
    expect(await PATCH(req("PATCH", { ativa: false }), ctx())).toBe(barrado);
    expect(await DELETE(req("DELETE"), ctx())).toBe(barrado);
    expect(deps.repo.editarFerramenta).not.toHaveBeenCalled();
    expect(deps.repo.apagarFerramenta).not.toHaveBeenCalled();
  });

  it("administrador liga, desliga e muda o risco e a aprovação; a auditoria diz que é MCP", async () => {
    deps.repo.editarFerramenta.mockResolvedValue({ ...FERRAMENTA_MCP, effect: "consulta" });
    const res = await PATCH(req("PATCH", { efeito: "consulta", pedir_aprovacao: false, ativa: true }), ctx());
    expect(res.status).toBe(200);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.external_tool_updated", metadata: expect.objectContaining({ kind: "mcp" }) }),
    );
  });

  it("o endereço e os campos vêm do SERVIDOR: não se editam aqui", async () => {
    const url = await PATCH(req("PATCH", { url: "https://outro.exemplo.com/mcp" }), ctx());
    expect(url.status).toBe(422);
    const campos = await PATCH(req("PATCH", { parametros: [] }), ctx());
    expect(campos.status).toBe(422);
    expect(deps.repo.editarFerramenta).not.toHaveBeenCalled();
  });

  it("ferramenta de OUTRA organização é 404", async () => {
    deps.repo.buscarFerramenta.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { ativa: false }), ctx())).status).toBe(404);
    expect((await DELETE(req("DELETE"), ctx())).status).toBe(404);
  });
});

describe("não tem chave de assinatura", () => {
  it("gerar nova chave é «não se aplica» (a credencial é do servidor)", async () => {
    const res = await ROTACIONAR(req("POST", {}), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("not_applicable");
    expect(deps.repo.rotacionarChave).not.toHaveBeenCalled();
  });
});

describe("Testar de verdade", () => {
  it("só administrador; manager é barrado antes de qualquer chamada", async () => {
    const barrado = soManager();
    expect(await TESTAR(req("POST", { arguments: { produto: "camiseta" } }), ctx())).toBe(barrado);
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });

  it("chama o servidor MCP com a credencial dele e o nome da ferramenta NO servidor, e mostra o que foi enviado", async () => {
    const res = await TESTAR(req("POST", { arguments: { produto: "camiseta" } }), ctx());
    const corpo = (await res.json()).data;
    expect(corpo).toMatchObject({ ok: true, http_status: 200, content: '{"disponivel":7}' });
    expect(corpo.sent).toMatchObject({ method: "tools/call", tool: "consultar_estoque", arguments: { produto: "camiseta" } });
    const [entrada] = deps.mcpChamar.mock.calls[0]!;
    expect(entrada).toMatchObject({
      servidor: { url: "https://mcp.exemplo.com/mcp", credencial: CREDENCIAL, cabecalho: "authorization" },
      ferramenta: "consultar_estoque",
      efeito: "altera",
      argumentos: { produto: "camiseta" },
    });
    // A credencial nunca está na resposta nem na auditoria.
    expect(JSON.stringify(corpo)).not.toContain(CREDENCIAL);
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain(CREDENCIAL);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.external_tool_tested", metadata: expect.objectContaining({ kind: "mcp", mcp_tool: "consultar_estoque" }) }),
    );
  });

  it("com o recurso desligado ou o servidor desativado, não chama", async () => {
    deps.config.mockResolvedValue({ ligado: false, aceite: null });
    expect((await TESTAR(req("POST", { arguments: { produto: "x" } }), ctx())).status).toBe(409);
    deps.config.mockResolvedValue({ ligado: true, aceite: null });
    deps.servidor.mockResolvedValue({ nome: "ERP", ativo: false, servidor: { url: "https://x.com/mcp", credencial: null, cabecalho: "authorization" }, temCredencial: false, credencialLegivel: true });
    expect((await TESTAR(req("POST", { arguments: { produto: "x" } }), ctx())).status).toBe(409);
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });

  it("os dados de exemplo passam pela MESMA conferência do que o agente preenche", async () => {
    const res = await TESTAR(req("POST", { arguments: { produto: 123 } }), ctx());
    expect(res.status).toBe(422);
    expect(deps.mcpChamar).not.toHaveBeenCalled();
  });

  it("o texto do erro da ferramenta (de terceiro) só aparece para quem testa, e a frase explica o que fazer", async () => {
    deps.mcpChamar.mockResolvedValue({
      ok: false,
      motivo: "ferramenta_com_erro",
      httpStatus: 200,
      tentativas: 1,
      duracaoMs: 10,
      desfechoIncerto: true,
      detalhe: "banco do ERP fora do ar",
    });
    const corpo = (await (await TESTAR(req("POST", { arguments: { produto: "x" } }), ctx())).json()).data;
    expect(corpo).toMatchObject({ ok: false, reason: "ferramenta_com_erro", detail: "banco do ERP fora do ar" });
    expect(corpo.message).toMatch(/respondeu com erro/i);
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain("banco do ERP");
  });
});
