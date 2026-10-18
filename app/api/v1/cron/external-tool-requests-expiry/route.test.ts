/**
 * O cron de expiração dos pedidos de ações externas (issue #95): sem o segredo do cron é 403;
 * rodada vazia não audita; rodada que expirou audita uma linha por pedido, na organização dele.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  cron: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  expirar: vi.fn(),
  recuperar: vi.fn(),
  aviso: vi.fn(),
  podar: vi.fn(),
}));

vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: deps.cron }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/ai/ferramentas-externas/pedidos-api", () => ({
  expirarVencidos: deps.expirar,
  recuperarTravados: deps.recuperar,
  podarDadosAntigos: deps.podar,
  abrirAvisoDeFalhaDoPedido: deps.aviso,
}));

import { GET, POST } from "./route";

const req = () => new NextRequest("http://localhost/api/v1/cron/external-tool-requests-expiry", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  deps.cron.mockReturnValue(true);
  deps.admin.mockReturnValue({});
  deps.expirar.mockResolvedValue([]);
  deps.recuperar.mockResolvedValue([]);
  deps.podar.mockResolvedValue(0);
});

describe("external-tool-requests-expiry", () => {
  it("sem o segredo do cron, 403 e nada é lido", async () => {
    deps.cron.mockReturnValue(false);
    expect((await POST(req())).status).toBe(403);
    expect(deps.expirar).not.toHaveBeenCalled();
  });

  it("rodada que não expirou nada: 200, e a auditoria fica quieta", async () => {
    deps.expirar.mockResolvedValue([]);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ expired: 0, recovered: 0 });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("rodada que expirou: uma linha de auditoria por pedido, na organização DELE", async () => {
    deps.expirar.mockResolvedValue([
      { id: "p1", organization_id: "org-a", tool_id: "t1", inbox_item_id: null },
      { id: "p2", organization_id: "org-b", tool_id: "t2", inbox_item_id: "i2" },
    ]);
    const res = await POST(req());
    expect((await res.json()).data).toEqual({ expired: 2, recovered: 0 });
    expect(deps.audit).toHaveBeenCalledTimes(2);
    expect(deps.audit.mock.calls.map(([a]) => [(a as { organizationId: string }).organizationId, (a as { resourceId: string }).resourceId])).toEqual([
      ["org-a", "p1"],
      ["org-b", "p2"],
    ]);
    expect(deps.audit.mock.calls[0]![0]).toMatchObject({ action: "ai.external_tool_request_expired" });
  });

  it("pedido preso em «executando» (o processo caiu no meio): vira falha INCERTA, avisa a Central e audita", async () => {
    deps.recuperar.mockResolvedValue([{ id: "p9", organization_id: "org-a", tool_id: "t9", tool_name: "Criar pedido" }]);
    const res = await POST(req());
    expect((await res.json()).data).toEqual({ expired: 0, recovered: 1 });
    expect(deps.aviso).toHaveBeenCalledTimes(1);
    expect(deps.aviso.mock.calls[0]![1]).toBe("org-a");
    expect(deps.aviso.mock.calls[0]![2].corpo).toMatch(/não sabemos se foi/i);
    expect(deps.audit).toHaveBeenCalledTimes(1);
    expect(deps.audit.mock.calls[0]![0]).toMatchObject({
      action: "ai.external_tool_request_executed",
      organizationId: "org-a",
      metadata: expect.objectContaining({ ok: false, uncertain: true, by: "cron" }),
    });
  });

  it("dados de pedido concluído há mais de 90 dias são podados, e só então a rodada audita", async () => {
    deps.podar.mockResolvedValue(3);
    await POST(req());
    expect(deps.audit).toHaveBeenCalledTimes(1);
    expect(deps.audit.mock.calls[0]![0]).toMatchObject({ action: "ai.external_tool_request_pruned", metadata: { pruned: 3 } });
  });

  it("falha ao expirar vira 500 sem auditar", async () => {
    deps.expirar.mockRejectedValue(new Error("banco fora"));
    expect((await POST(req())).status).toBe(500);
    expect(deps.audit).not.toHaveBeenCalled();
  });
});
