import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";

/**
 * TREINO DO AGENTE POR SITE — o que o banco garante (migration 0549, issue #93).
 *
 * Contra um Postgres real com o `baseline.sql` aplicado, que é o arquivo que o
 * self-hoster recebe. Cada garantia vem em PAR (o que passa E o que é barrado): um
 * teste só com a metade negativa fica verde se a tabela sumir ou se a fixture não
 * existir.
 *
 *  1. **`source_type` tem vocabulário fechado de novo** — `site` entra; valor
 *     desconhecido não. (A 0181 tinha tirado o CHECK; a #93 o devolve.)
 *  2. **Re-aplicar a migration cura o dado velho sem derrubar** — nome legado é
 *     traduzido; valor desconhecido deixa a constraint `NOT VALID` em vez de
 *     abortar a atualização do clone.
 *  3. **Duas organizações não se enxergam** nas páginas, e quem autentica não escreve
 *     nelas (a escrita é do servidor).
 *  4. **Apagar a fonte apaga as páginas**, e o endereço não repete dentro da fonte.
 */

const ORG_A = "e0e0e0e0-0000-4000-8000-00000000000a";
const ORG_B = "e0e0e0e0-0000-4000-8000-00000000000b";
const USER_A = "e0e0e0e0-1111-4000-8000-00000000000a";
const USER_B = "e0e0e0e0-1111-4000-8000-00000000000b";
const FONTE_A = "e0e0e0e0-2222-4000-8000-00000000000a";
const FONTE_B = "e0e0e0e0-2222-4000-8000-00000000000b";
const FONTE_DESCARTAVEL = "e0e0e0e0-2222-4000-8000-00000000000c";

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/20261017150000_0549_treino_do_agente_por_site.sql"),
  "utf8",
);

function existe(id: string, tabela = "ai_knowledge_sources"): boolean {
  return sql(`select count(*) from public.${tabela} where id = '${id}';`).split("\n").pop() === "1";
}

/** UUID determinístico por número — cada sonda tem o seu, e o nome (único por organização) acompanha. */
const uuid = (n: number) => `e0e0e0e0-3333-4000-8000-${String(n).padStart(12, "0")}`;

/** Tenta o INSERT e diz se a linha existe DEPOIS — presença é o que decide, não a mensagem de erro. */
function tentarFonte(id: string, tipo: string): boolean {
  sql(`
    do $$ begin
      insert into public.ai_knowledge_sources (id, organization_id, source_type, name, status, is_active)
      values ('${id}', '${ORG_A}', '${tipo}', 'Sonda ${id}', 'ready', true);
    exception when others then null; end $$;
    select 1;
  `);
  return existe(id);
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'site-a@invariant.test'), ('${USER_B}', 'site-b@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'site-inv-a', 'Site Inv A', 'Site A'), ('${ORG_B}', 'site-inv-b', 'Site Inv B', 'Site B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'manager', now()), ('${USER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;
    insert into public.ai_knowledge_sources (id, organization_id, source_type, name, status, is_active) values
      ('${FONTE_A}', '${ORG_A}', 'site', 'Site da A', 'ready', true),
      ('${FONTE_B}', '${ORG_B}', 'site', 'Site da B', 'ready', true)
      on conflict do nothing;
    insert into public.ai_knowledge_source_pages (organization_id, knowledge_source_id, url, position) values
      ('${ORG_A}', '${FONTE_A}', 'https://a.example/planos', 0),
      ('${ORG_A}', '${FONTE_A}', 'https://a.example/troca', 1),
      ('${ORG_B}', '${FONTE_B}', 'https://b.example/segredo', 0)
      on conflict do nothing;
  `);
});

describe("ai_knowledge_sources.source_type — o vocabulário fechado", () => {
  it("'site' entra (controle positivo: sem ele os negativos abaixo não provam nada)", () => {
    expect(tentarFonte(uuid(1), "site")).toBe(true);
  });

  it.each([
    [11, "faq"],
    [12, "documento"],
    [13, "conversas"],
    [14, "catalogo"],
  ] as const)("(%i) '%s', os tipos de sempre, continuam entrando", (n, tipo) => {
    expect(tentarFonte(uuid(n), tipo)).toBe(true);
  });

  it.each([
    [21, "banana"],
    [22, "pdf"],
    [23, "Site"],
    [24, ""],
  ] as const)("(%i) '%s' é barrado", (n, tipo) => {
    expect(tentarFonte(uuid(n), tipo)).toBe(false);
  });
});

describe("a migration 0549 re-aplicada sobre dado velho", () => {
  it("traduz o nome legado e recoloca a constraint (clone que parou no meio do update)", () => {
    sql(`
      alter table public.ai_knowledge_sources drop constraint if exists ai_knowledge_sources_source_type_check;
      insert into public.ai_knowledge_sources (id, organization_id, source_type, name, status, is_active)
        values ('${FONTE_DESCARTAVEL}', '${ORG_A}', 'policy', 'Legada', 'ready', true)
        on conflict (id) do update set source_type = 'policy';
    `);
    sql(MIGRATION);
    const tipo = sql(`select source_type from public.ai_knowledge_sources where id = '${FONTE_DESCARTAVEL}';`);
    expect(tipo).toBe("documento");
    const validada = sql(
      `select convalidated from pg_constraint where conname = 'ai_knowledge_sources_source_type_check';`,
    );
    expect(validada).toBe("t");
    // E a restrição voltou a valer.
    expect(tentarFonte("e0e0e0e0-4444-4000-8000-0000000003ff", "banana")).toBe(false);
  });

  it("valor DESCONHECIDO no banco não derruba a migration: a constraint fica NOT VALID e vale para o que entra", () => {
    sql(`
      alter table public.ai_knowledge_sources drop constraint if exists ai_knowledge_sources_source_type_check;
      insert into public.ai_knowledge_sources (id, organization_id, source_type, name, status, is_active)
        values ('${FONTE_DESCARTAVEL}', '${ORG_A}', 'tipo_do_clone_antigo', 'Estranha', 'ready', true)
        on conflict (id) do update set source_type = 'tipo_do_clone_antigo';
    `);
    // ON_ERROR_STOP=1 do helper: se a migration abortasse, esta linha lançaria.
    expect(() => sql(MIGRATION)).not.toThrow();
    const validada = sql(
      `select convalidated from pg_constraint where conname = 'ai_knowledge_sources_source_type_check';`,
    );
    expect(validada).toBe("f");
    expect(tentarFonte("e0e0e0e0-4444-4000-8000-0000000003fe", "banana")).toBe(false);

    // Limpeza: o dado estranho sai e a constraint volta a ser validada.
    sql(`
      delete from public.ai_knowledge_sources where id = '${FONTE_DESCARTAVEL}';
      alter table public.ai_knowledge_sources validate constraint ai_knowledge_sources_source_type_check;
    `);
    expect(
      sql(`select convalidated from pg_constraint where conname = 'ai_knowledge_sources_source_type_check';`),
    ).toBe("t");
  });
});

describe("ai_knowledge_source_pages — isolamento entre organizações", () => {
  it("cada organização vê SÓ as suas páginas (par: A vê as 2 dela, B vê a 1 dela)", () => {
    expect(countAs(USER_A, "select count(*) from public.ai_knowledge_source_pages;")).toBe(2);
    expect(countAs(USER_B, "select count(*) from public.ai_knowledge_source_pages;")).toBe(1);
    expect(
      countAs(USER_A, "select count(*) from public.ai_knowledge_source_pages where url like 'https://b.example%';"),
    ).toBe(0);
  });

  it("quem autentica NÃO escreve nas páginas — nem nas da própria organização (a escrita é do servidor)", () => {
    // Negação provada pelo PRIVILÉGIO, e não por um statement que falha: erro dentro de uma sessão
    // de teste embaralha o que vem depois, e "permission denied" é o que o PostgREST devolveria.
    for (const privilegio of ["insert", "update", "delete", "truncate"]) {
      expect(
        sql(`select has_table_privilege('authenticated', 'public.ai_knowledge_source_pages', '${privilegio}');`),
        `authenticated tem ${privilegio} em ai_knowledge_source_pages`,
      ).toBe("f");
    }
    expect(sql(`select count(*) from public.ai_knowledge_source_pages where organization_id = '${ORG_A}';`)).toBe("2");
  });

  it("o papel anon não alcança a tabela", () => {
    expect(sql(`select has_table_privilege('anon', 'public.ai_knowledge_source_pages', 'select');`)).toBe("f");
    expect(sql(`select has_table_privilege('authenticated', 'public.ai_knowledge_source_pages', 'insert');`)).toBe("f");
    expect(sql(`select has_table_privilege('authenticated', 'public.ai_knowledge_source_pages', 'select');`)).toBe("t");
  });
});

describe("ai_knowledge_source_pages — integridade", () => {
  it("o mesmo endereço não repete dentro da fonte", () => {
    sql(`
      do $$ begin
        insert into public.ai_knowledge_source_pages (id, organization_id, knowledge_source_id, url)
        values ('e0e0e0e0-5555-4000-8000-000000000001', '${ORG_A}', '${FONTE_A}', 'https://a.example/planos');
      exception when unique_violation then null; end $$;
      select 1;
    `);
    expect(existe("e0e0e0e0-5555-4000-8000-000000000001", "ai_knowledge_source_pages")).toBe(false);
  });

  it("estado fora do vocabulário é barrado", () => {
    sql(`
      do $$ begin
        insert into public.ai_knowledge_source_pages (id, organization_id, knowledge_source_id, url, status)
        values ('e0e0e0e0-5555-4000-8000-000000000002', '${ORG_A}', '${FONTE_A}', 'https://a.example/estado', 'talvez');
      exception when check_violation then null; end $$;
      select 1;
    `);
    expect(existe("e0e0e0e0-5555-4000-8000-000000000002", "ai_knowledge_source_pages")).toBe(false);
  });

  it("apagar a fonte apaga as páginas dela — e só as dela", () => {
    sql(`
      insert into public.ai_knowledge_sources (id, organization_id, source_type, name, status, is_active)
        values ('e0e0e0e0-2222-4000-8000-0000000000dd', '${ORG_A}', 'site', 'Para apagar', 'ready', true);
      insert into public.ai_knowledge_source_pages (organization_id, knowledge_source_id, url)
        values ('${ORG_A}', 'e0e0e0e0-2222-4000-8000-0000000000dd', 'https://apagar.example/x');
      delete from public.ai_knowledge_sources where id = 'e0e0e0e0-2222-4000-8000-0000000000dd';
    `);
    expect(sql(`select count(*) from public.ai_knowledge_source_pages where url = 'https://apagar.example/x';`)).toBe("0");
    expect(sql(`select count(*) from public.ai_knowledge_source_pages where organization_id = '${ORG_A}';`)).toBe("2");
  });
});

describe("a busca devolve o NOME DA PÁGINA junto do trecho (a citação)", () => {
  const VERSAO = "e0e0e0e0-6666-4000-8000-000000000001";
  const VETOR = "(select array_fill(0.1::real, array[1536])::vector)";

  it("trecho de site volta com o nome do material e a metadata {pagina, endereco} — como o documento leva `arquivo`", () => {
    sql(`
      insert into public.ai_knowledge_versions (id, organization_id, knowledge_source_id, version_number, status, is_active, embedding_model)
        values ('${VERSAO}', '${ORG_A}', '${FONTE_A}', 1, 'ready', true, 'openai/text-embedding-3-small')
        on conflict (id) do nothing;
      insert into public.ai_chunks (organization_id, knowledge_source_id, kb_version_id, position, content, content_hash, token_count, embedding, metadata)
        select '${ORG_A}', '${FONTE_A}', '${VERSAO}', 0, 'Plano Básico: R$ 49 por mês.', 'hs1', 8, ${VETOR},
               '{"source_type":"site","pagina":"Planos e preços","endereco":"https://a.example/planos"}'::jsonb
        where not exists (select 1 from public.ai_chunks where kb_version_id = '${VERSAO}');
      update public.ai_knowledge_sources set active_kb_version_id = '${VERSAO}' where id = '${FONTE_A}';
    `);
    const linha = sql(`
      select source_name || '|' || (metadata->>'pagina') || '|' || (metadata->>'endereco') || '|' || content
        from public.fn_buscar_trechos_das_fontes('${ORG_A}', array['${FONTE_A}']::uuid[], ${VETOR}, 5, -1);
    `);
    expect(linha).toBe("Site da A|Planos e preços|https://a.example/planos|Plano Básico: R$ 49 por mês.");
  });

  it("a busca da OUTRA organização não alcança o trecho do site, nem pedindo a fonte pelo id", () => {
    const n = sql(`
      select count(*) from public.fn_buscar_trechos_das_fontes('${ORG_B}', array['${FONTE_A}']::uuid[], ${VETOR}, 5, -1);
    `);
    expect(n).toBe("0");
  });
});
