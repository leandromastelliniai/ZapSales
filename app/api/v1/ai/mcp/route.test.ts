/**
 * O interruptor dos servidores MCP (issue #96): desligado por padrão, restrito a administrador,
 * com guarda de suporte e auditoria; ligar exige o aceite e a rota é quem confere.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  ler: vi.fn(),
  gravar: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/ai/ferramentas-externas/mcp/config", async (importar) => ({
  ...(await importar<typeof import("@/lib/ai/ferramentas-externas/mcp/config")>()),
  lerConfigDeMcpDaOrganizacao: deps.ler,
  gravarConfigDeMcp: deps.gravar,
}));

import { GET, PUT } from "@/app/api/v1/ai/mcp/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const ACEITE = { em: "2026-10-18T12:00:00.000Z", por: EU };

const contagem = { count: 2 };
function admin() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ eq: async () => contagem }), then: (f: (v: unknown) => unknown) => f(contagem) }),
      }),
    }),
  };
}

const put = (corpo: unknown) =>
  new NextRequest("http://localhost/api/v1/ai/mcp", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } });
  deps.admin.mockReturnValue(admin());
  deps.ler.mockResolvedValue({ ligado: false, aceite: null });
  deps.gravar.mockResolvedValue({ ok: true, config: { ligado: true, aceite: ACEITE } });
});

describe("GET — o estado", () => {
  it("instalação nova: desligado, sem aceite", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ligado: false, aceite: null });
    expect(deps.role).toHaveBeenCalledWith("manager", expect.anything());
    expect(deps.ler).toHaveBeenCalledWith(expect.anything(), ORG);
  });

  it("falha na leitura é 500, nunca «desligado» inventado", async () => {
    deps.ler.mockResolvedValue(null);
    expect((await GET()).status).toBe(500);
  });
});

describe("PUT — ligar e desligar", () => {
  it("só administrador; suporte temporário não liga recurso que envia dados a terceiros", async () => {
    const barrado = new Response("{}", { status: 403 });
    deps.role.mockResolvedValue({ ok: false, response: barrado });
    expect(await PUT(put({ ligado: true, aceitar: true }))).toBe(barrado);
    expect(deps.role).toHaveBeenCalledWith("admin", expect.anything());
    expect(deps.gravar).not.toHaveBeenCalled();

    deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } });
    const suporte = new Response("{}", { status: 403 });
    deps.support.mockResolvedValue(suporte);
    expect(await PUT(put({ ligado: true, aceitar: true }))).toBe(suporte);
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  it("ligar SEM aceite é 422 (a rota confere, não só a tela) e nada é gravado", async () => {
    const res = await PUT(put({ ligado: true }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.details).toMatchObject({ motivo: "sem_aceite" });
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  it("ligar COM aceite grava com a organização e o ator da SESSÃO e audita", async () => {
    const res = await PUT(put({ ligado: true, aceitar: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ligado: true, aceite: ACEITE });
    expect(deps.gravar).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, actorUserId: EU, mudanca: { ligado: true, aceitar: true } }),
    );
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.mcp_switch_changed",
        organizationId: ORG,
        actorUserId: EU,
        metadata: expect.objectContaining({ ligado: true, mudou: true, aceite_novo: true }),
      }),
    );
  });

  it("religar não pede o aceite de novo (ele já está gravado)", async () => {
    deps.ler.mockResolvedValue({ ligado: false, aceite: ACEITE });
    const res = await PUT(put({ ligado: true }));
    expect(res.status).toBe(200);
  });

  it("desligar funciona sem aceite e audita", async () => {
    deps.ler.mockResolvedValue({ ligado: true, aceite: ACEITE });
    deps.gravar.mockResolvedValue({ ok: true, config: { ligado: false, aceite: ACEITE } });
    const res = await PUT(put({ ligado: false }));
    expect(res.status).toBe(200);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ ligado: false, mudou: true }) }),
    );
  });

  it("o corpo não escolhe a organização e não aceita campo desconhecido", async () => {
    expect((await PUT(put({ ligado: true, aceitar: true, organization_id: ORG }))).status).toBe(422);
    expect((await PUT(put({}))).status).toBe(422);
    expect((await PUT(put({ aceitar: false }))).status).toBe(422);
    expect(deps.gravar).not.toHaveBeenCalled();
  });
});
