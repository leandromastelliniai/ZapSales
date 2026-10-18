/**
 * A aba Propostas de um agente mostra o que é dele: as propostas da organização
 * (flywheel, `agent_id` nulo) e as correções DESTE agente — nunca a de outro
 * (issue #90). O botão "aplicar versão nova" ao lado de uma correção alheia
 * mudaria o prompt do agente errado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";

describe("GET /api/v1/ai/agents/:id/proposals", () => {
  const filtros: Array<[string, unknown[]]> = [];

  beforeEach(() => {
    filtros.length = 0;
    const user: AuthUser = {
      id: USER,
      email: "a@example.com",
      full_name: null,
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR" as const,
      organizations: [{ organization_id: ORG, organization_name: "Org", role: "agent" }],
    };
    vi.mocked(requireRole).mockImplementation(async (min: Role) =>
      ROLE_RANK["agent"] >= ROLE_RANK[min]
        ? { ok: true, user, org: { orgId: ORG, name: "Org", role: "agent" } }
        : ({ ok: false, response: null } as never),
    );
    vi.mocked(createAdminClient).mockReturnValue({
      from: (tabela: string) => {
        const cadeia: Record<string, unknown> = {};
        const registra =
          (nome: string) =>
          (...args: unknown[]) => {
            filtros.push([`${tabela}.${nome}`, args]);
            return cadeia;
          };
        for (const m of ["select", "eq", "or", "order", "limit", "is", "not"]) cadeia[m] = registra(m);
        cadeia.maybeSingle = async () => ({ data: { id: AGENT } });
        cadeia.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: [{ id: "p1", agent_id: AGENT, type: "response_correction" }], error: null });
        return cadeia;
      },
    } as never);
  });

  it("filtra por organização e por agente: as da organização (agent_id nulo) mais as deste agente", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/x?status=all`), {
      params: Promise.resolve({ id: AGENT }),
    });
    const corpo = (await res.json()) as { data: { items: Array<{ agent_id: string }> } };

    expect(res.status).toBe(200);
    expect(filtros).toContainEqual(["flywheel_distiller_proposals.eq", ["organization_id", ORG]]);
    expect(filtros).toContainEqual([
      "flywheel_distiller_proposals.or",
      [`agent_id.is.null,agent_id.eq.${AGENT}`],
    ]);
    expect(corpo.data.items[0]!.agent_id).toBe(AGENT);
    const colunas = filtros.find(([n]) => n === "flywheel_distiller_proposals.select")![1][0] as string;
    expect(colunas).toContain("agent_id");
  });
});
