/**
 * As rotas do material do tipo SITE (issue #93): cadastrar a lista de páginas,
 * editar a lista, ver o estado de cada página e refazer a leitura à mão.
 *
 * Os efeitos que importam e como são medidos:
 *  - a forma da lista é recusada ALTO e com frase de gente (http, privado, vazia, demais);
 *  - a organização vem da sessão — a fonte de outra organização é 404, nunca é tocada;
 *  - toda mutação bem-sucedida grava auditoria, sem segredo (host e contagem, nunca a URL
 *    inteira: ela pode carregar `?token=`);
 *  - editar o NOME não dispara leitura de rede; editar a LISTA, sim; o re-treino é manual.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/types";
import { criarBancoEmMemoria, type Linha } from "../helpers/banco-em-memoria";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/ai/embeddings/chave", () => ({ temChaveDeEmbedding: vi.fn(async () => true) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "99999999-9999-4999-8999-999999999999";
const FONTE = "33333333-3333-4333-8333-333333333333";
const FONTE_ALHEIA = "44444444-4444-4444-8444-444444444444";
const FAQ = "55555555-5555-4555-8555-555555555555";

let banco: ReturnType<typeof criarBancoEmMemoria>;

function sessao(papel: "manager" | "viewer" = "manager"): void {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "user-1", email: "u@example.com", idioma: "pt-BR" } as unknown as AuthUser,
    org: { orgId: ORG, name: "Org", role: papel },
  } as never);
}

function fonte(id: string, org: string, tipo: string, extra: Linha = {}): Linha {
  return { id, organization_id: org, source_type: tipo, name: `Fonte ${id.slice(0, 4)}`, agent_id: null, status: "ready", is_active: true, ...extra };
}

function pagina(src: string, org: string, url: string, position: number, extra: Linha = {}): Linha {
  return {
    id: `pg-${position}-${src.slice(0, 2)}`, organization_id: org, knowledge_source_id: src, url, position,
    status: "pendente", error_code: null, error_message: null, title: null, content_hash: null,
    chunks_count: 0, last_read_at: null, last_changed_at: null, ...extra,
  };
}

function req(url: string, metodo: string, corpo?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
}

const contexto = (id: string) => ({ params: Promise.resolve({ id }) });
const eventos = () => banco.rpcs.filter((r) => r.nome === "emit_event");
const auditorias = () => vi.mocked(audit).mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  banco = criarBancoEmMemoria({
    ai_knowledge_sources: [
      fonte(FONTE, ORG, "site", { source_metadata: {} }),
      fonte(FONTE_ALHEIA, OUTRA_ORG, "site"),
      fonte(FAQ, ORG, "faq"),
    ],
    ai_knowledge_source_pages: [
      pagina(FONTE, ORG, "https://loja.com.br/planos", 0, { status: "lida", title: "Planos", content_hash: "h1", chunks_count: 2 }),
      pagina(FONTE, ORG, "https://loja.com.br/troca", 1, { status: "falhou", error_code: "resposta_http", error_message: "O site respondeu 404." }),
      pagina(FONTE_ALHEIA, OUTRA_ORG, "https://alheio.com/segredo", 0),
    ],
    ai_faq_items: [],
  });
  sessao();
  vi.mocked(createClient).mockResolvedValue(banco.client as never);
  vi.mocked(createAdminClient).mockReturnValue(banco.client as never);
});

describe("POST /sources — cadastrar um site", () => {
  async function criar(corpo: Record<string, unknown>) {
    const { POST } = await import("@/app/api/v1/ai/knowledge/sources/route");
    return POST(req("/api/v1/ai/knowledge/sources", "POST", corpo));
  }

  it("cria a fonte do tipo site, uma página por endereço (pendente), dispara a leitura e audita", async () => {
    banco.tabelas.ai_knowledge_sources = [];
    banco.tabelas.ai_knowledge_source_pages = [];

    const res = await criar({
      source_type: "site",
      name: "Site da Loja",
      urls: ["https://loja.com.br/planos", "https://loja.com.br/troca#prazo", "https://loja.com.br/planos"],
    });

    expect(res.status).toBe(201);
    const fontes = banco.tabelas.ai_knowledge_sources!;
    expect(fontes).toHaveLength(1);
    expect(fontes[0]).toMatchObject({ source_type: "site", name: "Site da Loja", organization_id: ORG });
    const paginas = banco.tabelas.ai_knowledge_source_pages!;
    expect(paginas.map((p) => [p.url, p.position, p.status, p.organization_id])).toEqual([
      ["https://loja.com.br/planos", 0, "pendente", ORG],
      ["https://loja.com.br/troca", 1, "pendente", ORG],
    ]);
    expect(eventos()).toHaveLength(1);
    expect(auditorias()).toEqual([
      expect.objectContaining({
        action: "ai.knowledge_site_created",
        organizationId: ORG,
        resourceType: "ai_knowledge_source",
        metadata: expect.objectContaining({ pages: 2, hosts: ["loja.com.br"] }),
      }),
    ]);
  });

  it("a auditoria não leva a URL inteira (pode carregar token na query)", async () => {
    banco.tabelas.ai_knowledge_sources = [];
    await criar({ source_type: "site", name: "Com token", urls: ["https://loja.com.br/p?token=SEGREDO123"] });
    expect(JSON.stringify(auditorias())).not.toContain("SEGREDO123");
  });

  it.each([
    [["http://loja.com.br/x"], "https"],
    [["https://10.0.0.5/x"], "interno"],
    [["https://localhost/x"], "interno"],
    [[], "ao menos um"],
    [["não é url"], "inválido"],
  ])("lista %j é recusada com 422 e frase de gente (%s)", async (urls, trecho) => {
    banco.tabelas.ai_knowledge_sources = [];
    const res = await criar({ source_type: "site", name: "Site", urls });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message.toLowerCase()).toContain(trecho.toLowerCase());
    expect(banco.tabelas.ai_knowledge_sources).toHaveLength(0);
    expect(auditorias()).toEqual([]);
  });

  it("mais páginas que o limite (20 por padrão) é recusado", async () => {
    const urls = Array.from({ length: 21 }, (_, i) => `https://loja.com.br/p${i}`);
    const res = await criar({ source_type: "site", name: "Grande", urls });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { message: string } }).error.message).toContain("20");
  });

  it("site sem a lista de endereços é recusado — não nasce fonte vazia", async () => {
    const res = await criar({ source_type: "site", name: "Sem lista" });
    expect(res.status).toBe(422);
    expect(banco.tabelas.ai_knowledge_sources!.filter((f) => f.name === "Sem lista")).toHaveLength(0);
  });

  it("site não recebe conteúdo colado", async () => {
    const res = await criar({ source_type: "site", name: "Colado", urls: ["https://loja.com.br/x"], markdown_blob: "texto" });
    expect(res.status).toBe(422);
  });

  it("endereços em material que não é site são recusados — não são descartados em silêncio", async () => {
    const res = await criar({ source_type: "faq", name: "FAQ", markdown_blob: "## Pergunta: a\n## Resposta: b", urls: ["https://loja.com.br/x"] });
    expect(res.status).toBe(422);
  });
});

describe("PATCH /sources/:id — editar o site", () => {
  async function editar(id: string, corpo: Record<string, unknown>) {
    const { PATCH } = await import("@/app/api/v1/ai/knowledge/sources/[id]/route");
    return PATCH(req(`/api/v1/ai/knowledge/sources/${id}`, "PATCH", corpo), contexto(id));
  }

  it("troca a lista: cria as novas, remove as que saíram, mantém o estado das que ficam, dispara a leitura e audita", async () => {
    const res = await editar(FONTE, { urls: ["https://loja.com.br/planos", "https://loja.com.br/contato"] });

    expect(res.status).toBe(200);
    const doOrg = banco.tabelas.ai_knowledge_source_pages!.filter((p) => p.organization_id === ORG);
    expect(doOrg.map((p) => p.url).sort()).toEqual(["https://loja.com.br/contato", "https://loja.com.br/planos"]);
    // A que ficou não perde o que já se sabia dela.
    expect(doOrg.find((p) => p.url === "https://loja.com.br/planos")).toMatchObject({ status: "lida", title: "Planos", content_hash: "h1" });
    expect(doOrg.find((p) => p.url === "https://loja.com.br/contato")).toMatchObject({ status: "pendente" });
    expect(eventos()).toHaveLength(1);
    expect(auditorias()).toEqual([
      expect.objectContaining({
        action: "ai.knowledge_site_pages_changed",
        metadata: expect.objectContaining({ added: 1, removed: 1, pages: 2 }),
      }),
    ]);
  });

  it("não toca as páginas de outra organização", async () => {
    await editar(FONTE, { urls: ["https://loja.com.br/nova"] });
    expect(banco.tabelas.ai_knowledge_source_pages!.find((p) => p.organization_id === OUTRA_ORG)).toMatchObject({
      url: "https://alheio.com/segredo",
    });
  });

  it("lista inválida na edição: 422 e a lista antiga continua", async () => {
    const res = await editar(FONTE, { urls: ["http://inseguro.com/x"] });
    expect(res.status).toBe(422);
    expect(banco.tabelas.ai_knowledge_source_pages!.filter((p) => p.knowledge_source_id === FONTE)).toHaveLength(2);
    expect(eventos()).toHaveLength(0);
  });

  it("só renomear NÃO dispara leitura de rede", async () => {
    const res = await editar(FONTE, { name: "Novo nome" });
    expect(res.status).toBe(200);
    expect(eventos()).toHaveLength(0);
    expect(auditorias()).toEqual([]);
  });

  it("fonte de OUTRA organização: 404, sem tocar nada", async () => {
    const res = await editar(FONTE_ALHEIA, { urls: ["https://loja.com.br/x"] });
    expect(res.status).toBe(404);
    expect(eventos()).toHaveLength(0);
    expect(banco.tabelas.ai_knowledge_source_pages!.filter((p) => p.organization_id === OUTRA_ORG)).toHaveLength(1);
  });

  it("endereços numa fonte que não é site: 422", async () => {
    const res = await editar(FAQ, { urls: ["https://loja.com.br/x"] });
    expect(res.status).toBe(422);
  });
});

describe("GET /sources/:id/paginas — o estado de cada página", () => {
  async function ver(id: string) {
    const { GET } = await import("@/app/api/v1/ai/knowledge/sources/[id]/paginas/route");
    return GET(req(`/api/v1/ai/knowledge/sources/${id}/paginas`, "GET"), contexto(id));
  }

  it("lista as páginas na ordem, com estado, motivo e título — e nada de outra organização", async () => {
    const res = await ver(FONTE);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(body.data.map((p) => [p.url, p.status, p.error_message, p.title])).toEqual([
      ["https://loja.com.br/planos", "lida", null, "Planos"],
      ["https://loja.com.br/troca", "falhou", "O site respondeu 404.", null],
    ]);
    expect(JSON.stringify(body)).not.toContain("alheio.com");
  });

  it("fonte de outra organização: 404", async () => {
    expect((await ver(FONTE_ALHEIA)).status).toBe(404);
  });

  it("fonte que não é site: 404 (não há páginas a mostrar)", async () => {
    expect((await ver(FAQ)).status).toBe(404);
  });
});

describe("POST /sources/:id/reindex — o re-treino manual", () => {
  async function retreinar(id: string) {
    const { POST } = await import("@/app/api/v1/ai/knowledge/sources/[id]/reindex/route");
    return POST(req(`/api/v1/ai/knowledge/sources/${id}/reindex`, "POST"), contexto(id));
  }

  it("dispara a leitura da fonte do site e audita o re-treino", async () => {
    const res = await retreinar(FONTE);
    expect(res.status).toBe(200);
    expect(eventos()).toHaveLength(1);
    expect(auditorias()).toEqual([
      expect.objectContaining({ action: "ai.knowledge_site_retrained", resourceId: FONTE, organizationId: ORG }),
    ]);
  });

  it("o re-treino de um material que não é site segue sem auditoria de site", async () => {
    const res = await retreinar(FAQ);
    expect(res.status).toBe(200);
    expect(auditorias()).toEqual([]);
  });

  it("fonte de outra organização: 404", async () => {
    expect((await retreinar(FONTE_ALHEIA)).status).toBe(404);
    expect(eventos()).toHaveLength(0);
  });
});
