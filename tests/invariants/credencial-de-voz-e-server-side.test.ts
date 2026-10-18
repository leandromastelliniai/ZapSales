/**
 * A CHAVE DE VOZ É SERVER-SIDE ONLY — E ISSO SE MEDE (migration 0548).
 *
 * `voice_provider_credentials` guarda a chave do provedor de voz da organização
 * (resposta em áudio do agente, issue #91). A anon key vai para o browser; se o
 * PostgREST servisse esta tabela, qualquer um com a página aberta leria a chave
 * cifrada — e a chave em claro sai por `fn_decrypt_oauth`, que é do service_role,
 * mas cifra lida é meio caminho.
 *
 * Mesmo desenho e mesma régua de `credencial-de-mapas-e-server-side.test.ts`:
 * RLS ligada, zero policies, grants revogados — e aqui se mede PRIVILÉGIO e
 * COMPORTAMENTO (`permission denied`), porque com RLS sem policy `anon` já
 * receberia zero linhas mesmo com o grant de volta, e contar linhas não veria.
 *
 * Mais duas provas que a tabela de mapas não precisava:
 *   - ISOLAMENTO ENTRE ORGANIZAÇÕES: duas organizações guardam uma chave para o
 *     MESMO provedor sem colidir, e quem lê com o filtro da organização A não vê
 *     a linha da B (o filtro à mão é a única cerca do service role);
 *   - o CHECK do provedor recusa o que o código não conhece.
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

const TABELA = "voice_provider_credentials";

function erroSob(papel: string, comando: string): string | null {
  try {
    sql(`set role ${papel};\n${comando};\nreset role;`);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function privilegiosDe(papel: string): string {
  return sql(`
    select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'NENHUM')
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = '${TABELA}' and grantee = '${papel}';
  `).trim();
}

describe("o PostgREST não serve a chave de voz", () => {
  it("a tabela EXISTE no baseline — controle positivo da sonda", () => {
    const existe = sql(`
      select count(*) from information_schema.tables where table_schema = 'public' and table_name = '${TABELA}';
    `).trim();
    expect(existe, "a 0548 não chegou ao baseline — o kit self-host não cria a tabela").toBe("1");
  });

  it("`anon` e `authenticated` não têm privilégio NENHUM", () => {
    expect(privilegiosDe("anon")).toBe("NENHUM");
    expect(privilegiosDe("authenticated")).toBe("NENHUM");
  });

  it("`service_role` CONTINUA com privilégio — controle positivo do papel que usa", () => {
    const p = privilegiosDe("service_role");
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(p).toContain(priv);
  });

  it("ler sob `anon` e sob `authenticated` é BARRADO — permission denied, não zero linhas", () => {
    for (const papel of ["anon", "authenticated"]) {
      const erro = erroSob(papel, `select api_key_encrypted from public.${TABELA}`);
      expect(erro, `\`${papel}\` leu a tabela SEM erro — a chave está exposta`).not.toBeNull();
      expect(erro).toContain("permission denied");
    }
  });

  it("RLS ligada e nenhuma policy", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.${TABELA}'::regclass;`).trim()).toBe("t");
    expect(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = '${TABELA}';`).trim()).toBe("0");
  });

  it("`organization_id` NOT NULL com FK em cascata, e uma chave por provedor por organização", () => {
    expect(
      sql(`
        select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = '${TABELA}' and column_name = 'organization_id';
      `).trim(),
    ).toBe("NO");
    expect(
      sql(`
        select confdeltype from pg_constraint
         where conrelid = 'public.${TABELA}'::regclass and contype = 'f'
           and confrelid = 'public.organizations'::regclass;
      `).trim(),
    ).toBe("c");
    expect(
      sql(`
        select count(*) from pg_indexes
         where schemaname = 'public' and tablename = '${TABELA}'
           and indexdef ilike '%unique%(organization_id, provider)%';
      `).trim(),
    ).toBe("1");
  });
});

describe("isolamento entre organizações", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();

  function org(id: string, slug: string): string {
    return `insert into public.organizations (id, slug, display_name, legal_name)
            values ('${id}', 'voz-${slug}-${id.slice(0, 8)}', 'Voz ${slug}', 'Voz ${slug}');`;
  }

  function chave(id: string, provedor: string, ultimos4: string): string {
    return `insert into public.${TABELA} (organization_id, provider, api_key_encrypted, api_key_last4)
            values ('${id}', '${provedor}', '\\x01'::bytea, '${ultimos4}');`;
  }

  it("duas organizações guardam chave do MESMO provedor sem colidir, e cada uma lê só a sua", () => {
    sql(`
      ${org(orgA, "a")}
      ${org(orgB, "b")}
      ${chave(orgA, "elevenlabs", "AAAA")}
      ${chave(orgB, "elevenlabs", "BBBB")}
    `);
    const daA = sql(`select api_key_last4 from public.${TABELA} where organization_id = '${orgA}';`).trim();
    const daB = sql(`select api_key_last4 from public.${TABELA} where organization_id = '${orgB}';`).trim();
    expect(daA).toBe("AAAA");
    expect(daB).toBe("BBBB");
  });

  it("a mesma organização não guarda duas chaves do mesmo provedor", () => {
    const erro = (() => {
      try {
        sql(chave(orgA, "elevenlabs", "ZZZZ"));
        return null;
      } catch (err) {
        return motivoDoErro(err);
      }
    })();
    expect(erro).not.toBeNull();
    expect(erro).toMatch(/duplicate key|voice_provider_credentials_org_provider_uk/);
  });

  it("o CHECK recusa provedor que o código não conhece", () => {
    const erro = (() => {
      try {
        sql(chave(orgB, "provedor_inventado", "CCCC"));
        return null;
      } catch (err) {
        return motivoDoErro(err);
      }
    })();
    expect(erro).not.toBeNull();
    expect(erro).toContain("voice_provider_credentials_provider_conhecido");
  });

  it("apagar a organização leva a chave junto (cascade) — nenhum segredo órfão", () => {
    sql(`delete from public.organizations where id = '${orgB}';`);
    expect(sql(`select count(*) from public.${TABELA} where organization_id = '${orgB}';`).trim()).toBe("0");
    expect(sql(`select count(*) from public.${TABELA} where organization_id = '${orgA}';`).trim()).toBe("1");
    sql(`delete from public.organizations where id = '${orgA}';`);
  });
});
