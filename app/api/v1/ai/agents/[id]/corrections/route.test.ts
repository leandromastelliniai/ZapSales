/**
 * "Corrigir esta resposta" (issue #90): a rota cria PROPOSTA, e só isso.
 *
 * O que estes casos fixam é o comportamento de fora: o que fica gravado, o que
 * NÃO é tocado (versões do agente) e o que a auditoria guarda.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { respostaDaExecucao } from "@/lib/ai/agents/resposta-da-execucao";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/agents/resposta-da-execucao", () => ({ respostaDaExecucao: vi.fn() }));
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const AGENT = "33333333-3333-4333-8333-333333333333";
const PROPOSTA = "55555555-5555-4555-8555-555555555555";
const CHAMADA = "66666666-6666-4666-8666-666666666666";
const ctx = { params: Promise.resolve({ id: AGENT }) };

const conversa = [
  { role: "customer", text: "Quanto custa o plano Pro? Meu email é ana@exemplo.com" },
  { role: "agent", text: "Não sei informar." },
];

function admin(opts: { agenteExiste: boolean; inseridos: Array<{ tabela: string; linha: unknown }> }) {
  return {
    from: (tabela: string) => {
      if (tabela === "ai_agents") {
        const cadeia: Record<string, unknown> = {};
        cadeia.select = () => cadeia;
        cadeia.eq = () => cadeia;
        cadeia.maybeSingle = async () => ({ data: opts.agenteExiste ? { id: AGENT } : null });
        return cadeia;
      }
      return {
        insert: (linha: unknown) => {
          opts.inseridos.push({ tabela, linha });
          return { select: () => ({ single: async () => ({ data: { id: PROPOSTA }, error: null }) }) };
        },
      };
    },
  };
}

function requisicao(corpo: unknown) {
  return new NextRequest("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

describe("POST /api/v1/ai/agents/:id/corrections", () => {
  const inseridos: Array<{ tabela: string; linha: unknown }> = [];

  function comPapel(papel: Role) {
    const user: AuthUser = {
      id: USER,
      email: "a@example.com",
      full_name: null,
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR" as const,
      organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
    };
    vi.mocked(requireRole).mockImplementation(async (min: Role) =>
      ROLE_RANK[papel] >= ROLE_RANK[min]
        ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
        : ({ ok: false, response: NextResponse.json({ error: { code: "forbidden_role" } }, { status: 403 }) } as never),
    );
  }

  beforeEach(() => {
    inseridos.length = 0;
    vi.mocked(audit).mockClear();
    vi.mocked(respostaDaExecucao).mockReset();
    vi.mocked(createAdminClient).mockReturnValue(admin({ agenteExiste: true, inseridos }) as never);
    vi.mocked(createClient).mockResolvedValue({} as never);
    comPapel("manager");
  });

  it("origem teste: grava UMA proposta pendente presa ao agente, mascarada, e não toca em versão de agente", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      requisicao({ origem: "teste", conversa, texto_corrigido: "O Pro custa R$ 99 por mês." }),
      ctx,
    );
    const corpo = (await res.json()) as { data: { proposal_id: string; status: string } };

    expect(res.status).toBe(201);
    expect(corpo.data).toEqual({ proposal_id: PROPOSTA, status: "pending" });
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0]!.tabela).toBe("flywheel_distiller_proposals");
    const linha = inseridos[0]!.linha as Record<string, unknown>;
    expect(linha).toMatchObject({
      organization_id: ORG,
      agent_id: AGENT,
      type: "response_correction",
    });
    // pendente: nada marca a proposta como aplicada
    expect(linha).not.toHaveProperty("applied_at");
    expect(String(linha.content)).toContain("O Pro custa R$ 99 por mês.");
    expect(JSON.stringify(linha)).not.toContain("ana@exemplo.com");
    expect(inseridos.some((i) => i.tabela === "ai_agent_versions")).toBe(false);
  });

  it("audita a proposta sem levar o texto da conversa", async () => {
    const { POST } = await import("./route");
    await POST(requisicao({ origem: "teste", conversa, texto_corrigido: "O Pro custa R$ 99." }), ctx);
    expect(audit).toHaveBeenCalledTimes(1);
    const chamada = vi.mocked(audit).mock.calls[0]![0];
    expect(chamada).toMatchObject({
      action: "ai.response_correction_proposed",
      actorUserId: USER,
      organizationId: ORG,
      resourceId: PROPOSTA,
    });
    expect(JSON.stringify(chamada.metadata)).not.toContain("Pro");
    expect(JSON.stringify(chamada.metadata)).not.toContain("exemplo.com");
  });

  it("a organização vem da sessão: corpo com organization_id é recusado", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      requisicao({
        origem: "teste",
        conversa,
        texto_corrigido: "ok",
        organization_id: "99999999-9999-4999-8999-999999999999",
      }),
      ctx,
    );
    expect(res.status).toBe(422);
    expect(inseridos).toHaveLength(0);
  });

  it("agente de outra organização: 404 e nada gravado", async () => {
    vi.mocked(createAdminClient).mockReturnValue(admin({ agenteExiste: false, inseridos }) as never);
    const { POST } = await import("./route");
    const res = await POST(requisicao({ origem: "teste", conversa, texto_corrigido: "ok" }), ctx);
    expect(res.status).toBe(404);
    expect(inseridos).toHaveLength(0);
  });

  it("agente (papel abaixo de manager) não propõe correção", async () => {
    comPapel("agent");
    const { POST } = await import("./route");
    const res = await POST(requisicao({ origem: "teste", conversa, texto_corrigido: "ok" }), ctx);
    expect(res.status).toBe(403);
    expect(inseridos).toHaveLength(0);
  });

  it("conversa que não termina em resposta do agente não tem o que corrigir", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      requisicao({
        origem: "teste",
        conversa: [
          { role: "agent", text: "Olá!" },
          { role: "customer", text: "oi" },
        ],
        texto_corrigido: "ok",
      }),
      ctx,
    );
    const corpo = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(422);
    expect(corpo.error.code).toBe("correction_without_reply");
    expect(inseridos).toHaveLength(0);
  });

  it("origem execução: a conversa é relida no servidor (presa a org e agente) e o id da chamada fica na evidência", async () => {
    vi.mocked(respostaDaExecucao).mockResolvedValueOnce({ ok: true, conversa } as never);
    const { POST } = await import("./route");
    const res = await POST(
      requisicao({ origem: "execucao", chamada_id: CHAMADA, texto_corrigido: "O Pro custa R$ 99." }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(respostaDaExecucao).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      agentId: AGENT,
      chamadaId: CHAMADA,
    });
    const linha = inseridos[0]!.linha as { evidence: { llm_call_ids: string[] } };
    expect(linha.evidence.llm_call_ids).toEqual([CHAMADA]);
    expect(JSON.stringify(linha)).not.toContain("ana@exemplo.com");
  });

  it("origem execução de outro agente ou organização: 404", async () => {
    vi.mocked(respostaDaExecucao).mockResolvedValueOnce({ ok: false, motivo: "chamada_nao_encontrada" });
    const { POST } = await import("./route");
    const res = await POST(
      requisicao({ origem: "execucao", chamada_id: CHAMADA, texto_corrigido: "ok" }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect(inseridos).toHaveLength(0);
  });

  it("execução que não terminou em mensagem do agente: 422 com a causa", async () => {
    vi.mocked(respostaDaExecucao).mockResolvedValueOnce({ ok: false, motivo: "sem_resposta_do_agente" });
    const { POST } = await import("./route");
    const res = await POST(
      requisicao({ origem: "execucao", chamada_id: CHAMADA, texto_corrigido: "ok" }),
      ctx,
    );
    const corpo = (await res.json()) as { error: { code: string } };
    expect(res.status).toBe(422);
    expect(corpo.error.code).toBe("correction_without_reply");
  });
});
