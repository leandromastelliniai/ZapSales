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
}));

vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: deps.cron }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/ai/ferramentas-externas/pedidos-api", () => ({ expirarVencidos: deps.expirar }));

import { GET, POST } from "./route";

const req = () => new NextRequest("http://localhost/api/v1/cron/external-tool-requests-expiry", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  deps.cron.mockReturnValue(true);
  deps.admin.mockReturnValue({});
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
    expect((await res.json()).data).toEqual({ expired: 0 });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("rodada que expirou: uma linha de auditoria por pedido, na organização DELE", async () => {
    deps.expirar.mockResolvedValue([
      { id: "p1", organization_id: "org-a", tool_id: "t1", inbox_item_id: null },
      { id: "p2", organization_id: "org-b", tool_id: "t2", inbox_item_id: "i2" },
    ]);
    const res = await POST(req());
    expect((await res.json()).data).toEqual({ expired: 2 });
    expect(deps.audit).toHaveBeenCalledTimes(2);
    expect(deps.audit.mock.calls.map(([a]) => [(a as { organizationId: string }).organizationId, (a as { resourceId: string }).resourceId])).toEqual([
      ["org-a", "p1"],
      ["org-b", "p2"],
    ]);
    expect(deps.audit.mock.calls[0]![0]).toMatchObject({ action: "ai.external_tool_request_expired" });
  });

  it("falha ao expirar vira 500 sem auditar", async () => {
    deps.expirar.mockRejectedValue(new Error("banco fora"));
    expect((await POST(req())).status).toBe(500);
    expect(deps.audit).not.toHaveBeenCalled();
  });
});
