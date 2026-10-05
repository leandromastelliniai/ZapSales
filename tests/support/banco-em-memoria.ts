/**
 * Um `SupabaseClient` em memória, com a superfície mínima que os módulos de
 * modelo do canal oficial usam (issue #6): `select`/`update`/`insert` com `eq`,
 * `is`, `limit` e `select` de volta.
 *
 * Existe porque esta superfície roda nos testes de unidade, sem Postgres. O
 * que exige banco de verdade (RLS, constraint, o baseline) fica no invariante
 * `tests/invariants/modelos-do-canal-oficial.test.ts`.
 *
 * Método que não está aqui ESTOURA (`TypeError: ... is not a function`) em vez
 * de ser ignorado: filtro ignorado deixaria teste verde medindo nada.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Linha = Record<string, unknown>;

export function bancoEmMemoria(tabelas: Record<string, Linha[]>): SupabaseClient {
  function consulta(tabela: string, modo: "select" | "update", patch?: Linha) {
    const filtros: Array<(l: Linha) => boolean> = [];
    let devolve = modo === "select";
    let teto: number | null = null;
    const alvo = {
      eq(c: string, v: unknown) {
        filtros.push((l) => l[c] === v);
        return alvo;
      },
      is(c: string, v: unknown) {
        filtros.push((l) => (l[c] ?? null) === v);
        return alvo;
      },
      limit(n: number) {
        teto = n;
        return alvo;
      },
      select() {
        devolve = true;
        return alvo;
      },
      async maybeSingle() {
        const casam = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
        if (casam.length > 1)
          return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
        return { data: casam[0] ? { ...casam[0] } : null, error: null };
      },
      then(resolve: (r: { data: Linha[] | null; error: null }) => unknown) {
        const casam = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
        if (modo === "update") for (const l of casam) Object.assign(l, patch);
        const linhas = teto === null ? casam : casam.slice(0, teto);
        return Promise.resolve({
          data: devolve ? linhas.map((l) => ({ ...l })) : null,
          error: null,
        }).then(resolve);
      },
    };
    return alvo;
  }
  return {
    from(tabela: string) {
      return {
        select: () => consulta(tabela, "select"),
        update: (patch: Linha) => consulta(tabela, "update", patch),
        insert: async (linha: Linha) => {
          (tabelas[tabela] ??= []).push({ status: "open", ...linha });
          return { data: null, error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
}
