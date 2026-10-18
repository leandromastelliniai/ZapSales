/**
 * A API dos servidores MCP (issue #96): quem pode, o que nunca volta (a credencial), o que a
 * auditoria não leva, o que acontece com o recurso desligado e com endereço interno, e que a
 * escolha das ferramentas sai da lista do SERVIDOR — nunca do corpo.
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
  conectar: vi.fn(),
  idempotencia: vi.fn(),
  repo: {
    listarServidores: vi.fn(),
    buscarServidor: vi.fn(),
    criarServidor: vi.fn(),
    editarServidor: vi.fn(),
    apagarServidor: vi.fn(),
    aplicarSelecao: vi.fn(),
    ferramentasEscolhidasDoServidor: vi.fn(),
  },
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/automation/destinos-internos-autorizados", () => ({ motivoDaRecusaDeDestino: deps.destino }));
vi.mock("@/lib/api/idempotency", async (importar) => ({
  ...(await importar<typeof import("@/lib/api/idempotency")>()),
  comIdempotencia: deps.idempotencia,
}));
vi.mock("@/lib/ai/ferramentas-externas/mcp/config", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/mcp/config")>()),
  lerConfigDeMcpDaOrganizacao: deps.config,
}));
vi.mock("@/lib/ai/ferramentas-externas/mcp/conexao", () => ({ conectarAoServidor: deps.conectar }));
vi.mock("@/lib/ai/ferramentas-externas/mcp/repositorio", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/mcp/repositorio")>()),
  ...deps.repo,
}));

import { GET, POST } from "@/app/api/v1/ai/mcp-servers/route";
import { DELETE, GET as GET_UM, PATCH } from "@/app/api/v1/ai/mcp-servers/[id]/route";
import { POST as TESTAR } from "@/app/api/v1/ai/mcp-servers/[id]/test/route";
import { GET as DESCOBRIR, PUT as ESCOLHER } from "@/app/api/v1/ai/mcp-servers/[id]/tools/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const CREDENCIAL = "tok_super_secreto_do_servidor_9999";

const SERVIDOR = {
  id: ID,
  name: "ERP da loja",
  url: "https://mcp.exemplo.com/mcp?x=1",
  auth_header: "authorization",
  active: true,
  has_credential: true,
  credential_last4: "9999",
  server_name: null,
  server_version: null,
  last_check_at: null,
  last_check_ok: null,
  last_check_reason: null,
  tools_enabled: 0,
  created_at: "2026-10-18T12:00:00Z",
  updated_at: "2026-10-18T12:00:00Z",
};
const CONEXAO_OK = {
  ok: true,
  servidor: { nome: "ERP", versao: "1.0", protocolo: "2025-06-18" },
  ferramentas: [
    {
      nome: "consultar_estoque",
      titulo: "Consultar estoque",
      descricao: "Consulta o estoque de um produto.",
      esquema: { type: "object", properties: { produto: { type: "string", description: "Produto" } }, required: ["produto"] },
      somenteLeituraDeclarado: true,
    },
    {
      nome: "com_lista",
      titulo: null,
      descricao: "Pede uma lista obrigatória.",
      esquema: { type: "object", properties: { itens: { type: "array" } }, required: ["itens"] },
      somenteLeituraDeclarado: null,
    },
  ],
  listaIncompleta: false,
};

const req = (metodo: string, url: string, corpo?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: { "content-type": "application/json", ...headers },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } });
  deps.admin.mockReturnValue({});
  deps.destino.mockResolvedValue(null);
  deps.config.mockResolvedValue({ ligado: true, aceite: { em: "2026-10-18T12:00:00.000Z", por: EU } });
  deps.conectar.mockResolvedValue(CONEXAO_OK);
  deps.idempotencia.mockImplementation(async ({ executar }: { executar: () => Promise<{ resposta: unknown; status: number }> }) => ({
    tipo: "executou",
    resposta: (await executar()).resposta,
  }));
  deps.repo.criarServidor.mockResolvedValue({ ok: true, servidor: SERVIDOR });
  deps.repo.buscarServidor.mockResolvedValue(SERVIDOR);
  deps.repo.ferramentasEscolhidasDoServidor.mockResolvedValue([]);
  deps.repo.aplicarSelecao.mockResolvedValue({ criadas: 1, atualizadas: 0, desativadas: 0, removidas: 0 });
});

const CORPO_VALIDO = { nome: "ERP da loja", url: "https://mcp.exemplo.com/mcp?x=1", credencial: CREDENCIAL };

describe("quem pode", () => {
  it.each([
    ["GET lista", () => GET()],
    ["POST cadastra", () => POST(req("POST", "/x", CORPO_VALIDO))],
    ["GET um", () => GET_UM(req("GET", "/x"), ctx())],
    ["PATCH", () => PATCH(req("PATCH", "/x", { ativo: false }), ctx())],
    ["DELETE", () => DELETE(req("DELETE", "/x"), ctx())],
    ["POST testar", () => TESTAR(req("POST", "/x", {}), ctx())],
    ["GET descobrir", () => DESCOBRIR(req("GET", "/x"), ctx())],
    ["PUT escolher", () => ESCOLHER(req("PUT", "/x", { ferramentas: [] }), ctx())],
  ])("%s exige administrador e nada é lido nem gravado sem ele", async (_nome, chamar) => {
    const barrado = new Response("{}", { status: 403 });
    deps.role.mockResolvedValue({ ok: false, response: barrado });
    expect(await chamar()).toBe(barrado);
    expect(deps.role).toHaveBeenCalledWith("admin", expect.anything());
    expect(deps.repo.listarServidores).not.toHaveBeenCalled();
    expect(deps.repo.criarServidor).not.toHaveBeenCalled();
    expect(deps.conectar).not.toHaveBeenCalled();
  });

  it.each([
    ["POST cadastra", () => POST(req("POST", "/x", CORPO_VALIDO))],
    ["PATCH", () => PATCH(req("PATCH", "/x", { ativo: false }), ctx())],
    ["DELETE", () => DELETE(req("DELETE", "/x"), ctx())],
    ["POST testar", () => TESTAR(req("POST", "/x", {}), ctx())],
    ["GET descobrir (sai para fora e grava o teste)", () => DESCOBRIR(req("GET", "/x"), ctx())],
    ["PUT escolher", () => ESCOLHER(req("PUT", "/x", { ferramentas: [] }), ctx())],
  ])("%s: suporte temporário não faz (guarda de efeito antes de qualquer coisa)", async (_nome, chamar) => {
    const barrado = new Response("{}", { status: 403 });
    deps.support.mockResolvedValue(barrado);
    expect(await chamar()).toBe(barrado);
    expect(deps.role).not.toHaveBeenCalled();
    expect(deps.conectar).not.toHaveBeenCalled();
  });
});

describe("GET — a lista nunca leva a credencial", () => {
  it("filtra pela organização da sessão e devolve só os 4 últimos caracteres", async () => {
    deps.repo.listarServidores.mockResolvedValue([SERVIDOR]);
    const texto = JSON.stringify(await (await GET()).json());
    expect(deps.repo.listarServidores).toHaveBeenCalledWith({}, ORG);
    expect(JSON.parse(texto).data[0]).toMatchObject({ name: "ERP da loja", has_credential: true, credential_last4: "9999" });
    expect(texto).not.toContain(CREDENCIAL);
    expect(texto).not.toContain("credential_encrypted");
  });
});

describe("POST — cadastrar e testar a conexão", () => {
  it("grava com a organização e o ator da SESSÃO, testa na hora e NUNCA devolve nem audita a credencial", async () => {
    const res = await POST(req("POST", "/api/v1/ai/mcp-servers", CORPO_VALIDO));
    expect(res.status).toBe(201);
    const texto = JSON.stringify(await res.json());
    expect(JSON.parse(texto).data).toMatchObject({ id: ID, conexao: { ok: true, ferramentas_oferecidas: 2 } });
    expect(texto).not.toContain(CREDENCIAL);
    expect(deps.repo.criarServidor).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ organizationId: ORG, atorId: EU, dados: expect.objectContaining({ nome: "ERP da loja", credencial: CREDENCIAL }) }),
    );
    expect(deps.conectar).toHaveBeenCalledWith({}, ORG, ID);
    const auditoria = JSON.stringify(deps.audit.mock.calls);
    expect(auditoria).toContain("ai.mcp_server_created");
    expect(auditoria).toContain("ai.mcp_server_tested");
    expect(auditoria).toContain("mcp.exemplo.com");
    expect(auditoria).not.toContain(CREDENCIAL);
    // Nem o caminho nem a query do endereço (podem levar um token).
    expect(auditoria).not.toContain("x=1");
  });

  it("servidor que não responde é cadastrado MESMO ASSIM e a resposta diz a causa, em português", async () => {
    deps.conectar.mockResolvedValue({ ok: false, motivo: "credencial_recusada", httpStatus: 401, frase: "O servidor recusou a credencial (erro 401)." });
    const res = await POST(req("POST", "/api/v1/ai/mcp-servers", CORPO_VALIDO));
    expect(res.status).toBe(201);
    expect((await res.json()).data.conexao).toMatchObject({ ok: false, motivo: "credencial_recusada", message: expect.stringContaining("recusou a credencial") });
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.mcp_server_tested", metadata: expect.objectContaining({ ok: false, reason: "credencial_recusada" }) }),
    );
  });

  it("com o recurso DESLIGADO é 409 e nada é gravado nem chamado", async () => {
    deps.config.mockResolvedValue({ ligado: false, aceite: null });
    const res = await POST(req("POST", "/api/v1/ai/mcp-servers", CORPO_VALIDO));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("mcp_disabled");
    expect(deps.repo.criarServidor).not.toHaveBeenCalled();
    expect(deps.conectar).not.toHaveBeenCalled();
  });

  it("falha ao ler o interruptor vale desligado (falha fechada)", async () => {
    deps.config.mockResolvedValue(null);
    expect((await POST(req("POST", "/api/v1/ai/mcp-servers", CORPO_VALIDO))).status).toBe(409);
    expect(deps.repo.criarServidor).not.toHaveBeenCalled();
  });

  it("endereço da rede interna passa pela rede segura ANTES de gravar e é recusado com a causa certa", async () => {
    deps.destino.mockResolvedValue("unsafe_url:private_ip");
    const res = await POST(req("POST", "/api/v1/ai/mcp-servers", { ...CORPO_VALIDO, url: "https://10.0.0.5/mcp" }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/rede interna, privada ou local/i);
    expect(deps.destino).toHaveBeenCalledWith("https://10.0.0.5/mcp", "organizacao");
    expect(deps.repo.criarServidor).not.toHaveBeenCalled();
  });

  it("corpo estrito: não aceita organization_id, campo desconhecido, http em produção nem cabeçalho reservado", async () => {
    expect((await POST(req("POST", "/x", { ...CORPO_VALIDO, organization_id: ORG }))).status).toBe(422);
    expect((await POST(req("POST", "/x", { ...CORPO_VALIDO, url: "ftp://x.com/mcp" }))).status).toBe(422);
    expect((await POST(req("POST", "/x", { ...CORPO_VALIDO, url: "https://user:senha@x.com/mcp" }))).status).toBe(422);
    expect((await POST(req("POST", "/x", { ...CORPO_VALIDO, cabecalho: "Content-Type" }))).status).toBe(422);
    expect((await POST(req("POST", "/x", { ...CORPO_VALIDO, cabecalho: "X Key" }))).status).toBe(422);
    expect((await POST(req("POST", "/x", { nome: "ab", url: CORPO_VALIDO.url }))).status).toBe(422);
    expect(deps.repo.criarServidor).not.toHaveBeenCalled();
  });

  it("sem credencial é permitido (servidor aberto), e outro cabeçalho é aceito", async () => {
    const res = await POST(req("POST", "/x", { nome: "Aberto", url: "https://aberto.exemplo.com/mcp", cabecalho: "X-API-Key" }));
    expect(res.status).toBe(201);
    expect(deps.repo.criarServidor).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ dados: expect.objectContaining({ cabecalho: "X-API-Key" }) }),
    );
  });

  it("nome repetido é 409; sem cifra no servidor é 422 com a instrução", async () => {
    deps.repo.criarServidor.mockResolvedValue({ ok: false, erro: "nome_em_uso" });
    expect((await POST(req("POST", "/x", CORPO_VALIDO))).status).toBe(409);
    deps.repo.criarServidor.mockResolvedValue({ ok: false, erro: "cifra_indisponivel" });
    const res = await POST(req("POST", "/x", CORPO_VALIDO));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("encryption_unavailable");
  });

  it("Idempotency-Key que não é uuid é recusada", async () => {
    expect((await POST(req("POST", "/x", CORPO_VALIDO, { "Idempotency-Key": "qualquer-coisa" }))).status).toBe(400);
  });

  it("com Idempotency-Key a criação passa pelo recibo (e o recibo não leva a credencial)", async () => {
    const chave = "44444444-4444-4444-8444-444444444444";
    const res = await POST(req("POST", "/x", CORPO_VALIDO, { "Idempotency-Key": chave }));
    expect(res.status).toBe(201);
    expect(deps.idempotencia).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await res.json())).not.toContain(CREDENCIAL);
  });
});

describe("/:id — editar, apagar", () => {
  it("id de OUTRA organização é 404, nunca 403", async () => {
    deps.repo.editarServidor.mockResolvedValue({ ok: false, erro: "nao_encontrado" });
    expect((await PATCH(req("PATCH", "/x", { ativo: false }), ctx())).status).toBe(404);
    deps.repo.buscarServidor.mockResolvedValue(null);
    expect((await GET_UM(req("GET", "/x"), ctx())).status).toBe(404);
    expect((await DELETE(req("DELETE", "/x"), ctx())).status).toBe(404);
    expect((await DESCOBRIR(req("GET", "/x"), ctx())).status).toBe(404);
    expect(deps.repo.buscarServidor).toHaveBeenCalledWith({}, ORG, ID);
  });

  it("editar audita os NOMES dos campos e diz se a credencial foi trocada ou removida — nunca o valor", async () => {
    deps.repo.editarServidor.mockResolvedValue({ ok: true, servidor: SERVIDOR });
    await PATCH(req("PATCH", "/x", { credencial: "outra-credencial-nova-1234", nome: "Novo nome" }), ctx());
    await PATCH(req("PATCH", "/x", { credencial: null }), ctx());
    const auditoria = JSON.stringify(deps.audit.mock.calls);
    expect(auditoria).toContain("ai.mcp_server_updated");
    expect(auditoria).toContain("credential_replaced");
    expect(auditoria).toContain("credential_removed");
    expect(auditoria).not.toContain("outra-credencial-nova-1234");
  });

  it("trocar o endereço passa pela rede segura de novo", async () => {
    deps.destino.mockResolvedValue("unsafe_url:private_ip");
    const res = await PATCH(req("PATCH", "/x", { url: "https://interno.exemplo.com/mcp" }), ctx());
    expect(res.status).toBe(422);
    expect(deps.repo.editarServidor).not.toHaveBeenCalled();
  });

  it("corpo vazio ou com campo desconhecido é 422", async () => {
    expect((await PATCH(req("PATCH", "/x", {}), ctx())).status).toBe(422);
    expect((await PATCH(req("PATCH", "/x", { organization_id: ORG, ativo: true }), ctx())).status).toBe(422);
  });

  it("apagar servidor cujas ferramentas uma versão cita é 409; o que ninguém cita é apagado e auditado", async () => {
    deps.repo.apagarServidor.mockResolvedValue("em_uso");
    const barrado = await DELETE(req("DELETE", "/x"), ctx());
    expect(barrado.status).toBe(409);
    expect((await barrado.json()).error.code).toBe("mcp_server_in_use");
    expect(deps.audit).not.toHaveBeenCalled();

    deps.repo.apagarServidor.mockResolvedValue("apagado");
    expect((await DELETE(req("DELETE", "/x"), ctx())).status).toBe(200);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.mcp_server_deleted" }));
  });
});

describe("POST /:id/test — testar conexão", () => {
  it("com o recurso desligado nenhuma chamada sai", async () => {
    deps.config.mockResolvedValue({ ligado: false, aceite: null });
    const res = await TESTAR(req("POST", "/x", {}), ctx());
    expect(res.status).toBe(409);
    expect(deps.conectar).not.toHaveBeenCalled();
  });

  it("falha do servidor é RESULTADO do teste (200, ok:false e a frase), não erro da rota", async () => {
    deps.conectar.mockResolvedValue({ ok: false, motivo: "timeout", httpStatus: null, frase: "O outro sistema não respondeu a tempo." });
    const res = await TESTAR(req("POST", "/x", {}), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ok: false, reason: "timeout", message: expect.stringContaining("não respondeu") });
  });

  it("sucesso devolve o nome e a versão que o servidor deu e quantas ferramentas oferece — e só isso", async () => {
    const corpo = (await (await TESTAR(req("POST", "/x", {}), ctx())).json()).data;
    expect(corpo).toMatchObject({ ok: true, server: { name: "ERP", version: "1.0" }, tools_offered: 2 });
    expect(JSON.stringify(corpo)).not.toContain("consultar_estoque");
  });

  it("servidor de outra organização é 404", async () => {
    deps.conectar.mockResolvedValue({ ok: false, motivo: "servidor_nao_encontrado", httpStatus: null, frase: "Servidor não encontrado." });
    expect((await TESTAR(req("POST", "/x", {}), ctx())).status).toBe(404);
  });
});

describe("GET/PUT /:id/tools — descobrir e escolher", () => {
  it("a descoberta diz o que o agente consegue usar, a dica do servidor e o risco padrão («altera dados»)", async () => {
    const res = await DESCOBRIR(req("GET", "/x"), ctx());
    const corpo = (await res.json()).data;
    expect(corpo.ok).toBe(true);
    const [estoque, lista] = corpo.tools;
    expect(estoque).toMatchObject({
      ferramenta: "consultar_estoque",
      suportada: true,
      dica_somente_leitura: true,
      efeito: "altera",
      escolhida: false,
    });
    expect(lista).toMatchObject({ ferramenta: "com_lista", suportada: false, motivo_nao_suportada: "campo_obrigatorio_complexo" });
  });

  it("servidor que não conecta: 200 com ok:false e a causa", async () => {
    deps.conectar.mockResolvedValue({ ok: false, motivo: "rede", httpStatus: null, frase: "Não foi possível alcançar o outro sistema." });
    expect((await (await DESCOBRIR(req("GET", "/x"), ctx())).json()).data).toMatchObject({ ok: false, reason: "rede" });
  });

  it("escolher grava a definição que o SERVIDOR devolveu agora, não o que o corpo diz", async () => {
    const res = await ESCOLHER(
      req("PUT", "/x", { ferramentas: [{ ferramenta: "consultar_estoque", efeito: "consulta", quando_usar: "Use quando perguntarem se tem estoque." }] }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const [, entrada] = deps.repo.aplicarSelecao.mock.calls[0]!;
    expect(entrada).toMatchObject({ organizationId: ORG, atorId: EU, servidorId: ID });
    expect(entrada.itens).toHaveLength(1);
    expect(entrada.itens[0]).toMatchObject({
      nomeNoServidor: "consultar_estoque",
      efeito: "consulta",
      quandoUsar: "Use quando perguntarem se tem estoque.",
      parametros: [{ nome: "produto", tipo: "texto", descricao: "Produto", obrigatorio: true }],
    });
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.mcp_tools_selected",
        metadata: expect.objectContaining({ selected: 1, tools: [expect.objectContaining({ tool: "consultar_estoque", effect: "consulta" })] }),
      }),
    );
  });

  it("o padrão do risco é «altera dados» quando o corpo não diz", async () => {
    await ESCOLHER(req("PUT", "/x", { ferramentas: [{ ferramenta: "consultar_estoque" }] }), ctx());
    expect(deps.repo.aplicarSelecao.mock.calls[0]![1].itens[0]).toMatchObject({ efeito: "altera", pedirAprovacao: null });
  });

  it("recusa ferramenta que o servidor não oferece e a que o agente não sabe preencher — sem gravar nada", async () => {
    const inexistente = await ESCOLHER(req("PUT", "/x", { ferramentas: [{ ferramenta: "apagar_tudo" }] }), ctx());
    expect(inexistente.status).toBe(422);
    const complexa = await ESCOLHER(req("PUT", "/x", { ferramentas: [{ ferramenta: "com_lista" }] }), ctx());
    expect(complexa.status).toBe(422);
    expect((await complexa.json()).error.message).toMatch(/lista ou objeto/i);
    expect(deps.repo.aplicarSelecao).not.toHaveBeenCalled();
  });

  it("o corpo não traz esquema, descrição nem organização", async () => {
    for (const intruso of [{ esquema: {} }, { descricao: "x" }, { organization_id: ORG }, { mcp_definition_hash: "x" }]) {
      const res = await ESCOLHER(req("PUT", "/x", { ferramentas: [{ ferramenta: "consultar_estoque", ...intruso }] }), ctx());
      expect(res.status).toBe(422);
    }
    expect((await ESCOLHER(req("PUT", "/x", { ferramentas: [], organization_id: ORG }), ctx())).status).toBe(422);
    expect(deps.repo.aplicarSelecao).not.toHaveBeenCalled();
  });

  it("a mesma ferramenta duas vezes é 422", async () => {
    const res = await ESCOLHER(
      req("PUT", "/x", { ferramentas: [{ ferramenta: "consultar_estoque" }, { ferramenta: "consultar_estoque" }] }),
      ctx(),
    );
    expect(res.status).toBe(422);
  });

  it("com o recurso desligado ou o servidor fora do ar, nada é gravado", async () => {
    deps.config.mockResolvedValue({ ligado: false, aceite: null });
    expect((await ESCOLHER(req("PUT", "/x", { ferramentas: [] }), ctx())).status).toBe(409);
    expect((await DESCOBRIR(req("GET", "/x"), ctx())).status).toBe(409);
    deps.config.mockResolvedValue({ ligado: true, aceite: null });
    deps.conectar.mockResolvedValue({ ok: false, motivo: "timeout", httpStatus: null, frase: "O outro sistema não respondeu a tempo." });
    expect((await ESCOLHER(req("PUT", "/x", { ferramentas: [{ ferramenta: "consultar_estoque" }] }), ctx())).status).toBe(422);
    expect(deps.repo.aplicarSelecao).not.toHaveBeenCalled();
  });
});
