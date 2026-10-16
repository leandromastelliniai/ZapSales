import { describe, expect, it } from "vitest";

import {
  buscarFunisDosContatos,
  funisPorContato,
  type LinhaDeLeadComFunil,
} from "@/lib/inbox/funil-da-conversa";

function etapa(id: string, position: number, extra: Partial<{ is_lost: boolean; is_archived: boolean }> = {}) {
  return { id, name: `Etapa ${id}`, position, is_won: false, is_lost: false, is_archived: false, ...extra };
}

function lead(contact_id: string, stage_id: string, updated_at: string, etapas = [etapa("a", 1), etapa("b", 2)]): LinhaDeLeadComFunil {
  return { contact_id, stage_id, updated_at, crm_pipelines: { name: "Vendas", etapas } };
}

describe("funisPorContato — a mesma regra da ficha (crm-summary), em lote", () => {
  it("escolhe o lead MAIS RECENTE de cada contato, mesmo que a consulta venha fora de ordem", () => {
    const m = funisPorContato([
      lead("c1", "a", "2026-10-01T00:00:00Z"),
      lead("c1", "b", "2026-10-09T00:00:00Z"),
      lead("c2", "a", "2026-10-05T00:00:00Z"),
    ]);
    expect(m.get("c1")?.etapa_atual_id).toBe("b");
    expect(m.get("c2")?.etapa_atual_id).toBe("a");
    expect(m.size).toBe(2);
  });

  it("devolve só as etapas ATIVAS, na ordem do quadro, com a perdida marcada", () => {
    const m = funisPorContato([
      lead("c1", "b", "2026-10-01T00:00:00Z", [
        etapa("z", 3, { is_lost: true }),
        etapa("b", 2),
        etapa("x", 1, { is_archived: true }),
        etapa("a", 1),
      ]),
    ]);
    expect(m.get("c1")).toEqual({
      nome: "Vendas",
      etapa_atual_id: "b",
      etapas: [
        { id: "a", nome: "Etapa a", perdida: false },
        { id: "b", nome: "Etapa b", perdida: false },
        { id: "z", nome: "Etapa z", perdida: true },
      ],
    });
  });

  it("contato cujo funil não tem etapa ativa fica de fora (a linha não desenha trilho vazio)", () => {
    const m = funisPorContato([
      lead("c1", "x", "2026-10-01T00:00:00Z", [etapa("x", 1, { is_archived: true })]),
    ]);
    expect(m.has("c1")).toBe(false);
  });

  it("aceita o embed do PostgREST como lista de um elemento", () => {
    const linha = { ...lead("c1", "a", "2026-10-01T00:00:00Z") };
    linha.crm_pipelines = [linha.crm_pipelines as never] as never;
    expect(funisPorContato([linha]).get("c1")?.nome).toBe("Vendas");
  });
});

interface Chamada {
  tabela: string;
  metodo: string;
  args: unknown[];
}

function dubleDoBanco(resposta: { data: unknown; error: unknown }) {
  const chamadas: Chamada[] = [];
  const client = {
    from: (tabela: string) => {
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") return (ok: (v: unknown) => unknown) => ok(resposta);
            return (...args: unknown[]) => {
              chamadas.push({ tabela, metodo: String(prop), args });
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
  return { client: client as never, chamadas };
}

describe("buscarFunisDosContatos — uma consulta só, filtrada pela organização", () => {
  it("sem contatos, não consulta o banco", async () => {
    const { client, chamadas } = dubleDoBanco({ data: [], error: null });
    const m = await buscarFunisDosContatos(client, "org-1", []);
    expect(m.size).toBe(0);
    expect(chamadas).toHaveLength(0);
  });

  it("filtra organização, contatos e funil arquivado explicitamente", async () => {
    const { client, chamadas } = dubleDoBanco({
      data: [lead("c1", "a", "2026-10-01T00:00:00Z")],
      error: null,
    });
    const m = await buscarFunisDosContatos(client, "org-1", ["c1", "c1", "c2"]);
    expect(m.get("c1")?.etapa_atual_id).toBe("a");
    expect(chamadas.every((c) => c.tabela === "crm_leads")).toBe(true);
    expect(chamadas).toContainEqual({ tabela: "crm_leads", metodo: "eq", args: ["organization_id", "org-1"] });
    expect(chamadas).toContainEqual({ tabela: "crm_leads", metodo: "in", args: ["contact_id", ["c1", "c2"]] });
    expect(chamadas).toContainEqual({
      tabela: "crm_leads",
      metodo: "eq",
      args: ["crm_pipelines.is_archived", false],
    });
  });

  it("erro do banco degrada para mapa vazio: a lista de conversas não cai por causa do funil", async () => {
    const { client } = dubleDoBanco({ data: null, error: { message: "boom" } });
    const m = await buscarFunisDosContatos(client, "org-1", ["c1"]);
    expect(m.size).toBe(0);
  });
});
