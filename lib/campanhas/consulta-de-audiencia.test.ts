// @vitest-environment node
/**
 * A lista subida por planilha entra no público como `incluir_contatos` — e é o
 * único critério do filtro. Sem recorte nenhum, a consulta principal não tem
 * predicado e devolveria os primeiros contatos da ORGANIZAÇÃO INTEIRA: o disparo
 * sairia para quem não estava na planilha. Estes casos prendem isso.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { FILTRO_VAZIO, filtroDeAudienciaSchema, temRecorte, type FiltroDeAudiencia } from "./audiencia";
import { buscarCandidatos } from "./consulta-de-audiencia";

const ORG = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DA_ORG_INTEIRA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Chamada = { metodo: string; args: unknown[] };

/** Um banco de mentira que lembra cada consulta e responde pelo que ela filtrou. */
function bancoDeMentira(todos: string[]) {
  /** Só as consultas que de fato foram EXECUTADAS (montar um builder não vai ao banco). */
  const consultas: Chamada[][] = [];
  const admin = {
    from(tabela: string) {
      expect(tabela).toBe("contacts");
      const chamadas: Chamada[] = [];
      const consulta: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "is", "not", "order", "limit", "contains", "overlaps", "or", "gte", "lte"]) {
        consulta[metodo] = (...args: unknown[]) => {
          chamadas.push({ metodo, args });
          return consulta;
        };
      }
      consulta.in = (...args: unknown[]) => {
        chamadas.push({ metodo: "in", args });
        return consulta;
      };
      consulta.then = (resolver: (v: unknown) => unknown) => {
        consultas.push(chamadas);
        const porId = chamadas.find((c) => c.metodo === "in" && c.args[0] === "id");
        const ids = porId ? (porId.args[1] as string[]) : todos;
        return Promise.resolve({
          data: ids.map((id) => ({
            id,
            name: `Pessoa ${id.slice(0, 2)}`,
            display_name: null,
            phone_number: "+5511999998888",
            email: null,
            custom_fields: null,
            is_blocked: false,
            is_anonymized: false,
            consent: {},
          })),
          error: null,
        }).then(resolver);
      };
      return consulta;
    },
  };
  return { admin: admin as unknown as SupabaseClient, consultas };
}

function filtro(parcial: Partial<FiltroDeAudiencia>): FiltroDeAudiencia {
  return { ...FILTRO_VAZIO, ...parcial };
}

const AGORA = new Date("2026-10-15T12:00:00Z");

describe("público montado só pela lista subida (incluir_contatos)", () => {
  it("não puxa a organização inteira: a consulta principal nem roda", async () => {
    const banco = bancoDeMentira([A, B, DA_ORG_INTEIRA]);
    const achados = await buscarCandidatos(banco.admin, {
      organizationId: ORG,
      filtro: filtro({ incluir_contatos: [A, B] }),
      agora: AGORA,
    });

    expect(achados.map((c) => c.contactId).sort()).toEqual([A, B]);
    expect(achados.map((c) => c.contactId)).not.toContain(DA_ORG_INTEIRA);
    // Uma única ida a `contacts`: a dos incluídos, sempre com a organização e o id.
    expect(banco.consultas).toHaveLength(1);
    expect(banco.consultas[0]).toContainEqual({ metodo: "eq", args: ["organization_id", ORG] });
    expect(banco.consultas[0]).toContainEqual({ metodo: "in", args: ["id", [A, B]] });
  });

  it("cadastro mesclado não entra nem por nome: a consulta dos incluídos o recusa", async () => {
    const banco = bancoDeMentira([A]);
    await buscarCandidatos(banco.admin, {
      organizationId: ORG,
      filtro: filtro({ incluir_contatos: [A] }),
      agora: AGORA,
    });

    expect(banco.consultas[0]).toContainEqual({ metodo: "is", args: ["is_merged_into", null] });
  });

  it("quem está em excluir_contatos sai também da lista subida", async () => {
    const banco = bancoDeMentira([A, B]);
    const achados = await buscarCandidatos(banco.admin, {
      organizationId: ORG,
      filtro: filtro({ incluir_contatos: [A, B], excluir_contatos: [B] }),
      agora: AGORA,
    });

    expect(achados.map((c) => c.contactId)).toEqual([A]);
  });

  it("com recorte E lista, as duas consultas rodam e a lista soma ao recorte", async () => {
    const banco = bancoDeMentira([DA_ORG_INTEIRA]);
    const achados = await buscarCandidatos(banco.admin, {
      organizationId: ORG,
      filtro: filtro({ com_alguma_tag: ["vip"], incluir_contatos: [A] }),
      agora: AGORA,
    });

    expect(banco.consultas).toHaveLength(2);
    expect(banco.consultas[0]).toContainEqual({ metodo: "overlaps", args: ["tags", ["vip"]] });
    expect(achados.map((c) => c.contactId).sort()).toEqual([A, DA_ORG_INTEIRA].sort());
  });
});

describe("temRecorte", () => {
  it("lista de contatos sozinha NÃO é recorte; qualquer outro critério é", () => {
    expect(temRecorte(filtro({ incluir_contatos: [A] }))).toBe(false);
    expect(temRecorte(filtro({ com_alguma_tag: ["vip"] }))).toBe(true);
    expect(temRecorte(filtro({ sem_interacao_ha_dias: 30 }))).toBe(true);
    expect(temRecorte(filtro({ origens: ["import_csv"] }))).toBe(true);
  });

  it("o filtro com só a lista continua válido; sem nada, continua recusado", () => {
    expect(filtroDeAudienciaSchema.safeParse({ incluir_contatos: [A] }).success).toBe(true);
    expect(filtroDeAudienciaSchema.safeParse({}).success).toBe(false);
  });
});
