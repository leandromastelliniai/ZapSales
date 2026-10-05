/**
 * O USO DECLARADO do número (issue #5): o administrador diz se o número é de
 * atendimento, de campanha ou de ambos, e a declaração fica salva na conexão.
 *
 * O dublê do banco aplica os filtros de verdade: um `eq("organization_id", …)`
 * apagado da rota faria "canal de outra organização → 404" falhar aqui, em vez de
 * passar medindo o dublê.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { PATCH } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const CANAL = "44444444-4444-4444-8444-444444444444";
const CANAL_DA_OUTRA = "55555555-5555-4555-8555-555555555555";

type Linha = Record<string, unknown>;

function bancoCom(linhas: Linha[]) {
  return {
    linhas,
    from(tabela: string) {
      expect(tabela).toBe("channel_sessions");
      const filtros: Array<(l: Linha) => boolean> = [];
      let patch: Linha | null = null;
      const q = {
        update(p: Linha) {
          patch = p;
          return q;
        },
        eq(col: string, v: unknown) {
          filtros.push((l) => l[col] === v);
          return q;
        },
        is(col: string, v: unknown) {
          filtros.push((l) => (l[col] ?? null) === v);
          return q;
        },
        select() {
          const alvo = linhas.filter((l) => filtros.every((f) => f(l)));
          if (patch) for (const l of alvo) Object.assign(l, patch);
          return Promise.resolve({ data: alvo.map((l) => ({ id: l.id })), error: null });
        },
      };
      return q;
    },
  };
}

function pedir(corpo: unknown, id = CANAL) {
  return PATCH(
    new NextRequest(`http://localhost/api/v1/channel-sessions/${id}/uso`, {
      method: "PATCH",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) },
  );
}

let banco: ReturnType<typeof bancoCom>;

beforeEach(() => {
  vi.clearAllMocks();
  banco = bancoCom([
    { id: CANAL, organization_id: ORG, archived_at: null, uso_declarado: null },
    { id: CANAL_DA_OUTRA, organization_id: OUTRA_ORG, archived_at: null, uso_declarado: null },
  ]);
  vi.mocked(createAdminClient).mockReturnValue(banco as never);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "user-1" },
    org: { orgId: ORG },
  } as never);
});

describe("PATCH /api/v1/channel-sessions/[id]/uso", () => {
  it("grava o uso declarado e devolve o que ficou salvo", async () => {
    const res = await pedir({ uso: "campanha" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { uso: "campanha" } });
    expect(banco.linhas[0]!.uso_declarado).toBe("campanha");
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "channel.usage_declared", resourceId: CANAL, organizationId: ORG }),
    );
  });

  it("recusa uso fora do vocabulário sem escrever", async () => {
    const res = await pedir({ uso: "spam" });
    expect(res.status).toBe(422);
    expect(banco.linhas[0]!.uso_declarado).toBeNull();
  });

  it("canal de outra organização é 404 e não é tocado", async () => {
    const res = await pedir({ uso: "ambos" }, CANAL_DA_OUTRA);
    expect(res.status).toBe(404);
    expect(banco.linhas[1]!.uso_declarado).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("só administrador declara o uso", async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    const res = await pedir({ uso: "ambos" });
    expect(res.status).toBe(403);
    expect(banco.linhas[0]!.uso_declarado).toBeNull();
  });
});
