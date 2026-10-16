import { describe, expect, it } from "vitest";

import { tabelaAusente } from "./tabela-ausente";

describe("tabelaAusente", () => {
  it("42P01 (Postgres) e PGRST205 (PostgREST, o que o supabase-js devolve) são tabela ausente", () => {
    expect(tabelaAusente({ code: "42P01" })).toBe(true);
    expect(tabelaAusente({ code: "PGRST205" })).toBe(true);
  });

  it("outro erro, ou nenhum, não é tabela ausente", () => {
    expect(tabelaAusente({ code: "57014" })).toBe(false);
    expect(tabelaAusente({ code: "23505" })).toBe(false);
    expect(tabelaAusente({})).toBe(false);
    expect(tabelaAusente(null)).toBe(false);
    expect(tabelaAusente(undefined)).toBe(false);
  });
});
