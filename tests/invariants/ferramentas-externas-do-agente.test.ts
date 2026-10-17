/**
 * FERRAMENTAS EXTERNAS DO AGENTE — O CHÃO DE DADOS (migration 0551, issue #94).
 *
 * `agent_external_tools` guarda o webhook de consulta que o agente chama no meio da
 * conversa e a CHAVE DE ASSINATURA dele (cifrada). A anon key vai para o browser; se
 * o PostgREST servisse esta tabela, qualquer um com a página aberta leria a chave
 * cifrada e o endereço de cada integração da organização. Mesma régua de
 * `credencial-de-voz-e-server-side.test.ts`: privilégio NENHUM para anon e
 * authenticated, RLS ligada, zero policies.
 *
 * Mais o que esta tabela precisa e a de voz não:
 *   - ISOLAMENTO entre duas organizações (mesmo identificador, uma linha cada), e a
 *     leitura com o filtro da organização A não vê a linha da B — o filtro à mão é a
 *     única cerca do service role;
 *   - "ALTERA DADOS" só existe INATIVA (a terceira trava, depois da rota e do motor);
 *   - a coluna nova da VERSÃO é coberta pela trava de imutabilidade (versão publicada
 *     não muda de ferramentas por baixo) e o aviso `external_tool_failed` entra na
 *     Central, UM aberto por ferramenta;
 *   - o motor só carrega o que está ATIVO e é CONSULTA, e só da organização do turno.
 */
import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { abrirAvisoDeFalha, carregarFerramentasDoTurno, lerChaveNoBanco } from "@/lib/ai/ferramentas-externas/repositorio-do-turno";

import { motivoDoErro, sql } from "./psql-transporte";

const TABELA = "agent_external_tools";
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 2,
});
afterAll(() => pool.end());

function privilegiosDe(papel: string): string {
  return sql(`
    select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'NENHUM')
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = '${TABELA}' and grantee = '${papel}';
  `).trim();
}

function erroDe(comando: string): string | null {
  try {
    sql(comando);
    return null;
  } catch (err) {
    return motivoDoErro(err);
  }
}

function org(id: string, slug: string): string {
  return `insert into public.organizations (id, slug, display_name, legal_name)
          values ('${id}', 'ft-${slug}-${id.slice(0, 8)}', 'Ferramentas ${slug}', 'Ferramentas ${slug}');`;
}

function ferramenta(
  orgId: string,
  slug: string,
  extra: { id?: string; efeito?: string; ativa?: boolean; url?: string } = {},
): string {
  return `insert into public.${TABELA}
            (id, organization_id, name, slug, when_to_use, url, effect, active, signing_secret_encrypted, signing_secret_last4)
          values ('${extra.id ?? randomUUID()}', '${orgId}', 'Consultar ${slug}', '${slug}',
                  'Quando o cliente perguntar por ${slug}.', '${extra.url ?? "https://erp.exemplo.com/hook"}',
                  '${extra.efeito ?? "consulta"}', ${extra.ativa ?? true}, '\\x01'::bytea, 'ab12');`;
}

describe("o PostgREST não serve as ferramentas externas", () => {
  it("a tabela EXISTE no baseline — controle positivo da sonda", () => {
    expect(
      sql(`select count(*) from information_schema.tables where table_schema = 'public' and table_name = '${TABELA}';`).trim(),
      "a 0551 não chegou ao baseline — o kit self-host não cria a tabela",
    ).toBe("1");
  });

  it("`anon` e `authenticated` não têm privilégio NENHUM", () => {
    expect(privilegiosDe("anon")).toBe("NENHUM");
    expect(privilegiosDe("authenticated")).toBe("NENHUM");
  });

  it("`service_role` CONTINUA com privilégio — controle positivo do papel que usa", () => {
    const p = privilegiosDe("service_role");
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(p).toContain(priv);
  });

  it("RLS ligada e nenhuma policy", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.${TABELA}'::regclass;`).trim()).toBe("t");
    expect(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = '${TABELA}';`).trim()).toBe("0");
  });

  it("`organization_id` NOT NULL com FK em cascata, e um identificador por organização", () => {
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
           and indexdef ilike '%unique%(organization_id, slug)%';
      `).trim(),
    ).toBe("1");
  });
});

describe("os CHECKs do cadastro", () => {
  const dono = randomUUID();

  it("o efeito só aceita o vocabulário conhecido", () => {
    sql(org(dono, "check"));
    const erro = erroDe(ferramenta(dono, "efeito_ruim", { efeito: "executa", ativa: false }));
    expect(erro).not.toBeNull();
    expect(erro).toContain("agent_external_tools_effect_check");
  });

  it('"altera dados" só pode existir INATIVA nesta etapa (terceira trava)', () => {
    const ativa = erroDe(ferramenta(dono, "altera_ativa", { efeito: "altera", ativa: true }));
    expect(ativa).not.toBeNull();
    expect(ativa).toContain("agent_external_tools_altera_so_inativa");
    // Controle: inativa passa — o vocabulário já tem o valor que a etapa da aprovação vai ligar.
    expect(erroDe(ferramenta(dono, "altera_inativa", { efeito: "altera", ativa: false }))).toBeNull();
  });

  it("recusa identificador fora do padrão e campos demais", () => {
    expect(erroDe(ferramenta(dono, "Tem Espaco"))).toContain("agent_external_tools_slug_check");
    const onze = JSON.stringify(Array.from({ length: 11 }, (_, i) => ({ nome: `c${i}` })));
    const erro = erroDe(`
      insert into public.${TABELA} (organization_id, name, slug, when_to_use, url, parameters, signing_secret_encrypted, signing_secret_last4)
      values ('${dono}', 'Muitos campos', 'muitos_campos', 'Quando o cliente perguntar.', 'https://erp.exemplo.com/h',
              '${onze}'::jsonb, '\\x01'::bytea, 'ab12');
    `);
    expect(erro).toContain("agent_external_tools_parameters_check");
  });

  it("limpa a organização de prova (cascade leva as linhas)", () => {
    sql(`delete from public.organizations where id = '${dono}';`);
    expect(sql(`select count(*) from public.${TABELA} where organization_id = '${dono}';`).trim()).toBe("0");
  });
});

describe("isolamento entre organizações", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const idA = randomUUID();
  const idB = randomUUID();

  it("duas organizações têm o MESMO identificador sem colidir, e cada uma lê só a sua", () => {
    sql(`
      ${org(orgA, "a")}
      ${org(orgB, "b")}
      ${ferramenta(orgA, "consultar_estoque", { id: idA, url: "https://a.exemplo.com/h" })}
      ${ferramenta(orgB, "consultar_estoque", { id: idB, url: "https://b.exemplo.com/h" })}
    `);
    expect(sql(`select url from public.${TABELA} where organization_id = '${orgA}';`).trim()).toBe("https://a.exemplo.com/h");
    expect(sql(`select url from public.${TABELA} where organization_id = '${orgB}';`).trim()).toBe("https://b.exemplo.com/h");
    // O id de uma NÃO aparece na consulta da outra (o filtro da organização é a cerca).
    expect(sql(`select count(*) from public.${TABELA} where organization_id = '${orgA}' and id = '${idB}';`).trim()).toBe("0");
  });

  it("a mesma organização não repete o identificador", () => {
    const erro = erroDe(ferramenta(orgA, "consultar_estoque"));
    expect(erro).not.toBeNull();
    expect(erro).toMatch(/duplicate key|agent_external_tools_org_slug_uk/);
  });

  it("o motor carrega só o que é DA organização do turno, ATIVO e CONSULTA", async () => {
    const inativa = randomUUID();
    const altera = randomUUID();
    sql(`
      ${ferramenta(orgA, "desativada", { id: inativa, ativa: false })}
      ${ferramenta(orgA, "muda_algo", { id: altera, efeito: "altera", ativa: false })}
    `);
    const doTurnoA = await carregarFerramentasDoTurno(pool, orgA, [idA, idB, inativa, altera]);
    expect(doTurnoA.map((f) => f.id)).toEqual([idA]);
    // O id da B, citado por um turno da A, não vaza: só a organização do turno responde.
    const doTurnoB = await carregarFerramentasDoTurno(pool, orgB, [idA, idB]);
    expect(doTurnoB.map((f) => f.id)).toEqual([idB]);
  });

  it("chave que não decifra vira `null`, sem lançar — a chamada falha fechada", async () => {
    expect(await lerChaveNoBanco(pool, orgA, idA)).toBeNull();
    // Linha de OUTRA organização: nada.
    expect(await lerChaveNoBanco(pool, orgA, idB)).toBeNull();
  });

  it("a falha abre UM aviso por ferramenta na Central, e o segundo igual não duplica", async () => {
    const aviso = { titulo: "A consulta «Consultar estoque» falhou", corpo: "O outro sistema não respondeu a tempo." };
    await abrirAvisoDeFalha(pool, orgA, aviso);
    await abrirAvisoDeFalha(pool, orgA, aviso);
    await abrirAvisoDeFalha(pool, orgB, aviso);
    const contagem = (o: string) =>
      sql(
        `select count(*) from public.agent_inbox_items where organization_id = '${o}' and kind = 'external_tool_failed' and status = 'open';`,
      ).trim();
    expect(contagem(orgA)).toBe("1");
    expect(contagem(orgB)).toBe("1");
  });

  it("apagar a organização leva as ferramentas junto (cascade) — nenhuma chave órfã", () => {
    sql(`delete from public.organizations where id = '${orgB}';`);
    expect(sql(`select count(*) from public.${TABELA} where organization_id = '${orgB}';`).trim()).toBe("0");
    expect(sql(`select count(*) from public.${TABELA} where organization_id = '${orgA}' and id = '${idA}';`).trim()).toBe("1");
    sql(`delete from public.organizations where id = '${orgA}';`);
  });
});

describe("a versão do agente carrega as ferramentas", () => {
  const dono = randomUUID();
  const agente = randomUUID();
  const versao = randomUUID();
  const ferramentaId = randomUUID();

  it("`external_tool_ids` nasce vazio — agente que já existia não muda", () => {
    sql(`
      ${org(dono, "versao")}
      insert into public.ai_agents (id, organization_id, name, system_prompt) values ('${agente}', '${dono}', 'Agente', 'você atende');
      insert into public.ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt, provider, model, status)
        values ('${versao}', '${dono}', '${agente}', 1, 'você atende', 'anthropic', 'claude-sonnet-4-6', 'draft');
    `);
    expect(sql(`select external_tool_ids from public.ai_agent_versions where id = '${versao}';`).trim()).toBe("{}");
  });

  it("a versão PUBLICADA é imutável também para as ferramentas externas", () => {
    sql(`
      ${ferramenta(dono, "consultar_estoque", { id: ferramentaId })}
      update public.ai_agent_versions set external_tool_ids = array['${ferramentaId}']::uuid[] where id = '${versao}';
      update public.ai_agent_versions set status = 'published', published_at = now() where id = '${versao}';
    `);
    const erro = erroDe(
      `update public.ai_agent_versions set external_tool_ids = '{}'::uuid[] where id = '${versao}';`,
    );
    expect(erro, "uma versão publicada trocou de ferramentas por baixo").not.toBeNull();
    expect(erro).toContain("imutável");
    // E o conteúdo que valia continua valendo.
    expect(sql(`select external_tool_ids[1] from public.ai_agent_versions where id = '${versao}';`).trim()).toBe(ferramentaId);
  });

  it("a trava não impede o que não é conteúdo (a versão publicada pode virar superseded)", () => {
    expect(erroDe(`update public.ai_agent_versions set status = 'superseded' where id = '${versao}';`)).toBeNull();
    sql(`delete from public.organizations where id = '${dono}';`);
  });
});
