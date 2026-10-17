/**
 * A API das ferramentas externas do agente (issue #94): a chave de assinatura aparece
 * UMA vez e nunca vai para a auditoria nem para o recibo de idempotência; a organização
 * vem da sessão; "altera dados" é recusado com o motivo escrito; endereço interno é
 * recusado antes de gravar; id de outra organização é 404; apagar o que uma versão
 * cita é 409; e o botão de teste chama de verdade só consulta, com dados válidos.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  destino: vi.fn(),
  repo: {
    listarFerramentas: vi.fn(),
    criarFerramenta: vi.fn(),
    buscarFerramenta: vi.fn(),
    editarFerramenta: vi.fn(),
    apagarFerramenta: vi.fn(),
    rotacionarChave: vi.fn(),
    lerChaveDaFerramenta: vi.fn(),
  },
  chamar: vi.fn(),
  idempotencia: vi.fn(),
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
vi.mock("@/lib/ai/ferramentas-externas/repositorio", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/repositorio")>()),
  ...deps.repo,
}));
vi.mock("@/lib/ai/ferramentas-externas/chamar", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/chamar")>()),
  chamarFerramentaExterna: deps.chamar,
}));

import { GET, POST } from "@/app/api/v1/ai/external-tools/route";
import { DELETE, GET as GET_UMA, PATCH } from "@/app/api/v1/ai/external-tools/[id]/route";
import { POST as ROTACIONAR } from "@/app/api/v1/ai/external-tools/[id]/rotate-secret/route";
import { POST as TESTAR } from "@/app/api/v1/ai/external-tools/[id]/test/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const CHAVE = "whsec_0123456789abcdef0123456789abcdef0123456789abcdef";

const FERRAMENTA = {
  id: ID,
  name: "Consultar estoque",
  slug: "consultar_estoque",
  agent_name: "ext_consultar_estoque",
  when_to_use: "Quando o cliente perguntar se um produto está disponível.",
  url: "https://erp.exemplo.com.br/hooks/estoque?token=segredo-na-url",
  parameters: [{ nome: "produto", tipo: "texto", descricao: "Nome do produto", obrigatorio: true }],
  effect: "consulta",
  active: true,
  secret_last4: "cdef",
  created_at: "2026-10-17T12:00:00Z",
  updated_at: "2026-10-17T12:00:00Z",
};

const CORPO_VALIDO = {
  nome: "Consultar estoque",
  quando_usar: "Quando o cliente perguntar se um produto está disponível.",
  url: "https://erp.exemplo.com.br/hooks/estoque?token=segredo-na-url",
  parametros: FERRAMENTA.parameters,
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
  deps.repo.criarFerramenta.mockResolvedValue({ ok: true, ferramenta: FERRAMENTA, chave: CHAVE });
});

describe("GET — a lista, nunca a chave", () => {
  it("devolve só o que a tela precisa e filtra pela organização da sessão", async () => {
    deps.repo.listarFerramentas.mockResolvedValue([FERRAMENTA]);
    const texto = JSON.stringify(await (await GET()).json());
    expect(deps.repo.listarFerramentas).toHaveBeenCalledWith({}, ORG);
    expect(JSON.parse(texto).data[0]).toMatchObject({ slug: "consultar_estoque", secret_last4: "cdef" });
    expect(texto).not.toContain(CHAVE);
    expect(texto).not.toContain("signing_secret");
  });

  it("sem permissão, devolve a resposta do porteiro e não lê nada", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.role.mockResolvedValue({ ok: false, response: barrado });
    expect(await GET()).toBe(barrado);
    expect(deps.repo.listarFerramentas).not.toHaveBeenCalled();
  });
});

describe("POST — cadastrar", () => {
  it("cria com a organização e o ator da SESSÃO e devolve a chave UMA vez", async () => {
    const res = await POST(req("POST", "/api/v1/ai/external-tools", CORPO_VALIDO));
    expect(res.status).toBe(201);
    const corpo = (await res.json()).data;
    expect(corpo.signing_secret).toBe(CHAVE);
    expect(deps.repo.criarFerramenta).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ organizationId: ORG, atorId: EU }),
    );
  });

  it("o corpo não escolhe a organização nem a chave (schema estrito)", async () => {
    for (const intruso of [{ organization_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }, { signing_secret: "mine" }]) {
      const res = await POST(req("POST", "/api/v1/ai/external-tools", { ...CORPO_VALIDO, ...intruso }));
      expect(res.status).toBe(422);
    }
    expect(deps.repo.criarFerramenta).not.toHaveBeenCalled();
  });

  it("'altera dados' é recusado com o MOTIVO escrito e nada é gravado", async () => {
    const res = await POST(req("POST", "/api/v1/ai/external-tools", { ...CORPO_VALIDO, efeito: "altera" }));
    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.code).toBe("external_tool_mutating_blocked");
    expect(corpo.error.message).toContain("etapa de aprovação");
    expect(deps.repo.criarFerramenta).not.toHaveBeenCalled();
  });

  it("endereço da rede interna é recusado ANTES de gravar", async () => {
    deps.destino.mockResolvedValue("unsafe_url:private_host");
    const res = await POST(req("POST", "/api/v1/ai/external-tools", { ...CORPO_VALIDO, url: "https://10.0.0.5/x" }));
    expect(res.status).toBe(422);
    expect(deps.destino).toHaveBeenCalledWith("https://10.0.0.5/x", "organizacao");
    expect(deps.repo.criarFerramenta).not.toHaveBeenCalled();
  });

  it("cifra do servidor indisponível: recusa com instrução, não grava chave em claro", async () => {
    deps.repo.criarFerramenta.mockResolvedValue({ ok: false, erro: "cifra_indisponivel" });
    const res = await POST(req("POST", "/api/v1/ai/external-tools", CORPO_VALIDO));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("encryption_unavailable");
  });

  it("a auditoria registra o fato — sem a chave e sem o endereço inteiro (o token da URL não vaza)", async () => {
    await POST(req("POST", "/api/v1/ai/external-tools", CORPO_VALIDO));
    expect(deps.audit).toHaveBeenCalledTimes(1);
    const entrada = deps.audit.mock.calls[0]![0];
    expect(entrada).toMatchObject({ action: "ai.external_tool_created", organizationId: ORG, actorUserId: EU, resourceId: ID });
    const texto = JSON.stringify(entrada);
    expect(texto).not.toContain(CHAVE);
    expect(texto).not.toContain("segredo-na-url");
    expect(entrada.metadata).toMatchObject({ host: "erp.exemplo.com.br", effect: "consulta" });
  });

  it("guarda de suporte antes de qualquer efeito", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.support.mockResolvedValue(barrado);
    expect(await POST(req("POST", "/api/v1/ai/external-tools", CORPO_VALIDO))).toBe(barrado);
    expect(deps.repo.criarFerramenta).not.toHaveBeenCalled();
  });

  it("Idempotency-Key: quem executa recebe a chave; o REPLAY não — o recibo nunca guarda o segredo", async () => {
    const chave = "44444444-4444-4444-8444-444444444444";
    // Primeira execução: o helper chama o efeito e devolve o recibo.
    deps.idempotencia.mockImplementationOnce(async (e: { executar: () => Promise<{ resposta: unknown; status: number }> }) => {
      const r = await e.executar();
      expect(JSON.stringify(r.resposta)).not.toContain(CHAVE);
      return { tipo: "executou", ...r };
    });
    const primeira = await POST(req("POST", "/api/v1/ai/external-tools", CORPO_VALIDO, { "Idempotency-Key": chave }));
    expect((await primeira.json()).data.signing_secret).toBe(CHAVE);

    // Segunda: o recibo volta SEM a chave.
    deps.idempotencia.mockResolvedValueOnce({ tipo: "replay", resposta: FERRAMENTA, status: 201 });
    const segunda = await POST(req("POST", "/api/v1/ai/external-tools", CORPO_VALIDO, { "Idempotency-Key": chave }));
    expect((await segunda.json()).data.signing_secret).toBeNull();
    expect(deps.repo.criarFerramenta).toHaveBeenCalledTimes(1);
  });

  it("Idempotency-Key que não é uuid é recusada", async () => {
    const res = await POST(req("POST", "/api/v1/ai/external-tools", CORPO_VALIDO, { "Idempotency-Key": "qualquer-coisa" }));
    expect(res.status).toBe(400);
  });
});

describe("/:id — ler, editar, apagar", () => {
  it("id de OUTRA organização é 404, nunca 403 (não confirma que existe)", async () => {
    deps.repo.buscarFerramenta.mockResolvedValue(null);
    expect((await GET_UMA(req("GET", `/x/${ID}`), ctx())).status).toBe(404);
    expect(deps.repo.buscarFerramenta).toHaveBeenCalledWith({}, ORG, ID);
    deps.repo.editarFerramenta.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", `/x/${ID}`, { ativa: false }), ctx())).status).toBe(404);
  });

  it("id que não é uuid é 400 antes de tocar no banco", async () => {
    expect((await GET_UMA(req("GET", "/x/abc"), ctx("abc"))).status).toBe(400);
    expect(deps.repo.buscarFerramenta).not.toHaveBeenCalled();
  });

  it("desativar audita os NOMES dos campos que mudaram, nunca os valores", async () => {
    deps.repo.editarFerramenta.mockResolvedValue({ ...FERRAMENTA, active: false });
    const res = await PATCH(req("PATCH", `/x/${ID}`, { ativa: false }), ctx());
    expect(res.status).toBe(200);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.external_tool_updated",
        metadata: expect.objectContaining({ fields: ["ativa"], active: false }),
      }),
    );
  });

  it("não deixa editar para 'altera dados'", async () => {
    const res = await PATCH(req("PATCH", `/x/${ID}`, { efeito: "altera" }), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("external_tool_mutating_blocked");
    expect(deps.repo.editarFerramenta).not.toHaveBeenCalled();
  });

  it("trocar o endereço passa pela rede segura de novo", async () => {
    deps.destino.mockResolvedValue("unsafe_url:private_ip");
    const res = await PATCH(req("PATCH", `/x/${ID}`, { url: "https://interno.exemplo.com/x" }), ctx());
    expect(res.status).toBe(422);
    expect(deps.repo.editarFerramenta).not.toHaveBeenCalled();
  });

  it("apagar uma ferramenta que uma versão cita é 409 — desative em vez de apagar", async () => {
    deps.repo.buscarFerramenta.mockResolvedValue(FERRAMENTA);
    deps.repo.apagarFerramenta.mockResolvedValue("em_uso");
    const res = await DELETE(req("DELETE", `/x/${ID}`), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("external_tool_in_use");
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("apagar a que ninguém cita funciona e audita", async () => {
    deps.repo.buscarFerramenta.mockResolvedValue(FERRAMENTA);
    deps.repo.apagarFerramenta.mockResolvedValue("apagada");
    expect((await DELETE(req("DELETE", `/x/${ID}`), ctx())).status).toBe(200);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.external_tool_deleted" }));
  });
});

describe("POST /:id/rotate-secret", () => {
  it("devolve a chave nova UMA vez e audita sem ela, nem os 4 últimos", async () => {
    deps.repo.rotacionarChave.mockResolvedValue({ ok: true, ferramenta: FERRAMENTA, chave: CHAVE });
    const res = await ROTACIONAR(req("POST", `/x/${ID}/rotate-secret`), ctx());
    expect((await res.json()).data.signing_secret).toBe(CHAVE);
    const texto = JSON.stringify(deps.audit.mock.calls[0]![0]);
    expect(texto).toContain("ai.external_tool_secret_rotated");
    expect(texto).not.toContain(CHAVE);
    expect(texto).not.toContain("cdef");
  });

  it("ferramenta de outra organização: 404", async () => {
    deps.repo.rotacionarChave.mockResolvedValue({ ok: false, erro: "nao_encontrada" });
    expect((await ROTACIONAR(req("POST", `/x/${ID}/rotate-secret`), ctx())).status).toBe(404);
  });
});

describe("POST /:id/test — Testar de verdade", () => {
  beforeEach(() => {
    deps.repo.buscarFerramenta.mockResolvedValue(FERRAMENTA);
    deps.repo.lerChaveDaFerramenta.mockResolvedValue(CHAVE);
  });

  it("chama de verdade com os dados de exemplo e mostra o que o outro sistema devolveu e o que foi enviado", async () => {
    deps.chamar.mockResolvedValue({
      ok: true,
      httpStatus: 200,
      conteudo: '{"disponivel":true}',
      truncado: false,
      tentativas: 1,
      duracaoMs: 42,
    });
    const res = await TESTAR(req("POST", `/x/${ID}/test`, { arguments: { produto: "camiseta" } }), ctx());
    const corpo = (await res.json()).data;
    expect(corpo).toMatchObject({ ok: true, http_status: 200, content: '{"disponivel":true}', duration_ms: 42 });
    expect(corpo.sent).toMatchObject({ tool: "consultar_estoque", arguments: { produto: "camiseta" } });
    expect(deps.chamar).toHaveBeenCalledWith(
      expect.objectContaining({
        ferramenta: expect.objectContaining({ efeito: "consulta" }),
        segredo: CHAVE,
        argumentos: { produto: "camiseta" },
      }),
    );
    // A chave nunca está na resposta nem na auditoria.
    expect(JSON.stringify(corpo)).not.toContain(CHAVE);
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain(CHAVE);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.external_tool_tested" }));
  });

  it("falha do outro sistema é resultado do TESTE (200 com ok:false e a frase do que fazer), não erro da rota", async () => {
    deps.chamar.mockResolvedValue({ ok: false, motivo: "timeout", httpStatus: null, tentativas: 2, duracaoMs: 16000 });
    const res = await TESTAR(req("POST", `/x/${ID}/test`, { arguments: { produto: "camiseta" } }), ctx());
    expect(res.status).toBe(200);
    const corpo = (await res.json()).data;
    expect(corpo).toMatchObject({ ok: false, reason: "timeout" });
    expect(corpo.message).toMatch(/não respondeu a tempo/);
  });

  it("dados de exemplo inválidos não saem (mesma conferência do que o agente preenche)", async () => {
    const res = await TESTAR(req("POST", `/x/${ID}/test`, { arguments: {} }), ctx());
    expect(res.status).toBe(422);
    expect(deps.chamar).not.toHaveBeenCalled();
  });

  it("ferramenta de outra organização: 404 e nenhuma chamada", async () => {
    deps.repo.buscarFerramenta.mockResolvedValue(null);
    expect((await TESTAR(req("POST", `/x/${ID}/test`, { arguments: { produto: "x" } }), ctx())).status).toBe(404);
    expect(deps.chamar).not.toHaveBeenCalled();
  });

  it("suporte temporário não dispara chamada para fora em nome da organização", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.support.mockResolvedValue(barrado);
    expect(await TESTAR(req("POST", `/x/${ID}/test`, { arguments: { produto: "x" } }), ctx())).toBe(barrado);
    expect(deps.chamar).not.toHaveBeenCalled();
  });
});
