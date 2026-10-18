/**
 * SERVIDORES MCP EXTERNOS DO AGENTE — O CHÃO DE DADOS (migration 0553, issue #96).
 *
 * `mcp_servers` guarda o endereço de um servidor de terceiro e a CREDENCIAL dele (cifrada). A anon key
 * vai para o browser; se o PostgREST servisse esta tabela, qualquer um com a página aberta leria a
 * credencial cifrada e o endereço de cada integração da organização. Mesma régua de
 * `ferramentas-externas-do-agente.test.ts`: privilégio NENHUM para anon e authenticated, RLS ligada,
 * zero policies.
 *
 * Mais o que a ferramenta que vem de um servidor precisa (`agent_external_tools.kind = 'mcp'`):
 *   - cada TIPO tem exatamente as suas colunas (CHECK de forma): `mcp` sem servidor, `mcp` com endereço
 *     ou chave de assinatura, `webhook` sem endereço — nenhuma existe;
 *   - a ferramenta nunca aponta para o servidor de OUTRA organização, nem por escrita direta com a
 *     service key (FK composta) — o isolamento entre organizações medido de verdade;
 *   - uma ferramenta do servidor entra uma vez só; apagar o servidor leva as ferramentas, apagar a
 *     organização leva tudo;
 *   - o motor só carrega a ferramenta MCP com TRÊS coisas ligadas (ela, o servidor e o interruptor da
 *     organização) e só da organização do turno; a credencial lida é a do SERVIDOR.
 */
import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { carregarFerramentasDoTurno, lerChaveNoBanco } from "@/lib/ai/ferramentas-externas/repositorio-do-turno";

import { motivoDoErro, sql } from "./psql-transporte";

const SERVIDORES = "mcp_servers";
const FERRAMENTAS = "agent_external_tools";
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 2,
});
afterAll(() => pool.end());

beforeAll(() => {
  // A cifra de OAuth levanta quando a chave da instalação não está semeada.
  sql(`
    insert into private.app_secrets (name, value)
    values ('integrations_oauth_key', 'chave-sintetica-do-invariante-com-32-mais-chars')
    on conflict (name) do nothing;
  `);
});

function privilegiosDe(papel: string): string {
  return sql(`
    select coalesce(string_agg(distinct privilege_type, ',' order by privilege_type), 'NENHUM')
      from information_schema.role_table_grants
     where table_schema = 'public' and table_name = '${SERVIDORES}' and grantee = '${papel}';
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

function org(id: string, slug: string, settings = "{}"): string {
  return `insert into public.organizations (id, slug, display_name, legal_name, settings)
          values ('${id}', 'mcp-${slug}-${id.slice(0, 8)}', 'MCP ${slug}', 'MCP ${slug}', '${settings}'::jsonb);`;
}

const MCP_LIGADO = JSON.stringify({ mcp_externo: { ligado: true, aceite: { em: "2026-10-18T12:00:00.000Z", por: "11111111-1111-4111-8111-111111111111" } } });

function servidor(
  orgId: string,
  nome: string,
  extra: { id?: string; ativo?: boolean; url?: string; credencial?: string | null; cabecalho?: string } = {},
): string {
  const credencial =
    extra.credencial === null || extra.credencial === undefined
      ? "null, null"
      : `public.fn_encrypt_oauth('${extra.credencial}'), '${extra.credencial.slice(-4)}'`;
  return `insert into public.${SERVIDORES}
            (id, organization_id, name, url, auth_header, active, credential_encrypted, credential_last4)
          values ('${extra.id ?? randomUUID()}', '${orgId}', '${nome}', '${extra.url ?? "https://mcp.exemplo.com/mcp"}',
                  '${extra.cabecalho ?? "authorization"}', ${extra.ativo ?? true}, ${credencial});`;
}

function ferramentaMcp(
  orgId: string,
  servidorId: string,
  ferramenta: string,
  extra: { id?: string; efeito?: string; ativa?: boolean; slug?: string } = {},
): string {
  return `insert into public.${FERRAMENTAS}
            (id, organization_id, kind, name, slug, when_to_use, effect, active, mcp_server_id, mcp_tool_name)
          values ('${extra.id ?? randomUUID()}', '${orgId}', 'mcp', 'Ferramenta ${ferramenta}', '${extra.slug ?? ferramenta}',
                  'Quando o cliente perguntar por ${ferramenta}.', '${extra.efeito ?? "altera"}', ${extra.ativa ?? true},
                  '${servidorId}', '${ferramenta}');`;
}

function webhook(orgId: string, slug: string, id = randomUUID()): string {
  return `insert into public.${FERRAMENTAS}
            (id, organization_id, name, slug, when_to_use, url, signing_secret_encrypted, signing_secret_last4)
          values ('${id}', '${orgId}', 'Webhook ${slug}', '${slug}', 'Quando o cliente perguntar por ${slug}.',
                  'https://erp.exemplo.com/hook', '\\x01'::bytea, 'ab12');`;
}

describe("o PostgREST não serve os servidores MCP", () => {
  it("a tabela EXISTE no baseline — controle positivo da sonda", () => {
    expect(
      sql(`select count(*) from information_schema.tables where table_schema = 'public' and table_name = '${SERVIDORES}';`).trim(),
      "a 0553 não chegou ao baseline — o kit self-host não cria a tabela",
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
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.${SERVIDORES}'::regclass;`).trim()).toBe("t");
    expect(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = '${SERVIDORES}';`).trim()).toBe("0");
  });

  it("`organization_id` NOT NULL com FK em cascata", () => {
    expect(
      sql(`
        select is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = '${SERVIDORES}' and column_name = 'organization_id';
      `).trim(),
    ).toBe("NO");
    expect(
      sql(`
        select confdeltype from pg_constraint
         where conrelid = 'public.${SERVIDORES}'::regclass and contype = 'f'
           and confrelid = 'public.organizations'::regclass;
      `).trim(),
    ).toBe("c");
  });
});

describe("os CHECKs do servidor", () => {
  const dono = randomUUID();

  it("nome, endereço, cabeçalho e o par da credencial têm limites", () => {
    sql(org(dono, "check"));
    expect(erroDe(servidor(dono, "ab"))).toContain("mcp_servers_name_len");
    expect(erroDe(servidor(dono, "Servidor bom", { url: "http://" }))).toContain("mcp_servers_url_len");
    expect(erroDe(servidor(dono, "Servidor bom", { cabecalho: "X Key" }))).toContain("mcp_servers_auth_header_check");
    expect(erroDe(servidor(dono, "Servidor bom", { cabecalho: "1abc" }))).toContain("mcp_servers_auth_header_check");
    // Credencial sem os 4 últimos (ou os 4 últimos sem credencial) não existe.
    expect(
      erroDe(`insert into public.${SERVIDORES} (organization_id, name, url, credential_encrypted)
              values ('${dono}', 'Meio par', 'https://mcp.exemplo.com/mcp', '\\x01'::bytea);`),
    ).toContain("mcp_servers_credential_pair");
    expect(
      erroDe(`insert into public.${SERVIDORES} (organization_id, name, url, credential_last4)
              values ('${dono}', 'Outro meio par', 'https://mcp.exemplo.com/mcp', 'ab12');`),
    ).toContain("mcp_servers_credential_pair");
  });

  it("servidor sem credencial é válido, o cabeçalho padrão é `authorization` e nasce ativo", () => {
    expect(erroDe(servidor(dono, "Servidor aberto"))).toBeNull();
    expect(sql(`select auth_header, active from public.${SERVIDORES} where organization_id = '${dono}' and name = 'Servidor aberto';`).trim()).toBe(
      "authorization|t",
    );
  });

  it("o nome é único por organização, sem diferenciar maiúsculas", () => {
    expect(erroDe(servidor(dono, "servidor ABERTO"))).toMatch(/mcp_servers_org_name_uk|duplicate key/);
  });

  it("limpa a organização de prova", () => {
    sql(`delete from public.organizations where id = '${dono}';`);
    expect(sql(`select count(*) from public.${SERVIDORES} where organization_id = '${dono}';`).trim()).toBe("0");
  });
});

describe("a forma de cada tipo de ferramenta externa", () => {
  const dono = randomUUID();
  const srv = randomUUID();

  it("preparação", () => {
    sql(`${org(dono, "forma")} ${servidor(dono, "Servidor da forma", { id: srv })}`);
  });

  it("as linhas de antes são `webhook` (o default) e continuam válidas", () => {
    expect(erroDe(webhook(dono, "consultar_estoque"))).toBeNull();
    expect(sql(`select kind from public.${FERRAMENTAS} where organization_id = '${dono}' and slug = 'consultar_estoque';`).trim()).toBe("webhook");
  });

  it("`mcp` válido: servidor e nome no servidor, SEM endereço e SEM chave de assinatura", () => {
    expect(erroDe(ferramentaMcp(dono, srv, "criar_pedido"))).toBeNull();
    expect(
      sql(`select url is null, signing_secret_encrypted is null, signing_secret_last4 is null, effect from public.${FERRAMENTAS}
            where organization_id = '${dono}' and kind = 'mcp';`).trim(),
    ).toBe("t|t|t|altera");
  });

  it("o tipo só aceita o vocabulário conhecido", () => {
    expect(
      erroDe(`insert into public.${FERRAMENTAS} (organization_id, kind, name, slug, when_to_use, url, signing_secret_encrypted, signing_secret_last4)
              values ('${dono}', 'grpc', 'Tipo ruim', 'tipo_ruim', 'Quando o cliente perguntar.', 'https://x.com/h', '\\x01'::bytea, 'ab12');`),
    ).toContain("agent_external_tools_kind_check");
  });

  it("`mcp` SEM servidor, `mcp` com endereço e `mcp` com chave de assinatura não existem", () => {
    expect(
      erroDe(`insert into public.${FERRAMENTAS} (organization_id, kind, name, slug, when_to_use, mcp_tool_name)
              values ('${dono}', 'mcp', 'Sem servidor', 'sem_servidor', 'Quando o cliente perguntar.', 'x');`),
    ).toContain("agent_external_tools_kind_shape");
    expect(
      erroDe(`insert into public.${FERRAMENTAS} (organization_id, kind, name, slug, when_to_use, url, mcp_server_id, mcp_tool_name)
              values ('${dono}', 'mcp', 'Com endereço', 'com_endereco', 'Quando o cliente perguntar.', 'https://x.com/h', '${srv}', 'x');`),
    ).toContain("agent_external_tools_kind_shape");
    expect(
      erroDe(`insert into public.${FERRAMENTAS} (organization_id, kind, name, slug, when_to_use, signing_secret_encrypted, signing_secret_last4, mcp_server_id, mcp_tool_name)
              values ('${dono}', 'mcp', 'Com chave', 'com_chave', 'Quando o cliente perguntar.', '\\x01'::bytea, 'ab12', '${srv}', 'x');`),
    ).toContain("agent_external_tools_kind_shape");
  });

  it("`webhook` com servidor, ou sem endereço, ou sem chave, não existe", () => {
    expect(
      erroDe(`insert into public.${FERRAMENTAS} (organization_id, kind, name, slug, when_to_use, url, signing_secret_encrypted, signing_secret_last4, mcp_server_id, mcp_tool_name)
              values ('${dono}', 'webhook', 'Webhook com servidor', 'wh_servidor', 'Quando o cliente perguntar.', 'https://x.com/h', '\\x01'::bytea, 'ab12', '${srv}', 'x');`),
    ).toContain("agent_external_tools_kind_shape");
    expect(
      erroDe(`insert into public.${FERRAMENTAS} (organization_id, name, slug, when_to_use)
              values ('${dono}', 'Webhook sem nada', 'wh_nada', 'Quando o cliente perguntar.');`),
    ).toContain("agent_external_tools_kind_shape");
  });

  it("uma ferramenta do servidor entra no registro uma vez só", () => {
    const erro = erroDe(ferramentaMcp(dono, srv, "criar_pedido", { slug: "criar_pedido_2" }));
    expect(erro).toMatch(/agent_external_tools_mcp_uk|duplicate key/);
  });

  it("apagar o servidor leva as ferramentas dele — e só as dele", () => {
    sql(`${servidor(dono, "Outro servidor", { id: randomUUID() })}`);
    sql(`delete from public.${SERVIDORES} where id = '${srv}';`);
    expect(sql(`select count(*) from public.${FERRAMENTAS} where organization_id = '${dono}' and kind = 'mcp';`).trim()).toBe("0");
    expect(sql(`select count(*) from public.${FERRAMENTAS} where organization_id = '${dono}' and kind = 'webhook';`).trim()).toBe("1");
    sql(`delete from public.organizations where id = '${dono}';`);
  });
});

describe("isolamento entre organizações", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const srvA = randomUUID();
  const srvB = randomUUID();
  const ferrA = randomUUID();
  const ferrB = randomUUID();

  it("duas organizações têm o MESMO nome de servidor e a MESMA ferramenta sem colidir, e cada uma lê só a sua", () => {
    sql(`
      ${org(orgA, "a", MCP_LIGADO)}
      ${org(orgB, "b", MCP_LIGADO)}
      ${servidor(orgA, "ERP", { id: srvA, url: "https://a.exemplo.com/mcp", credencial: "credencial-da-A-1111" })}
      ${servidor(orgB, "ERP", { id: srvB, url: "https://b.exemplo.com/mcp", credencial: "credencial-da-B-2222" })}
      ${ferramentaMcp(orgA, srvA, "consultar_estoque", { id: ferrA })}
      ${ferramentaMcp(orgB, srvB, "consultar_estoque", { id: ferrB })}
    `);
    expect(sql(`select url from public.${SERVIDORES} where organization_id = '${orgA}';`).trim()).toBe("https://a.exemplo.com/mcp");
    expect(sql(`select url from public.${SERVIDORES} where organization_id = '${orgB}';`).trim()).toBe("https://b.exemplo.com/mcp");
    expect(sql(`select count(*) from public.${SERVIDORES} where organization_id = '${orgA}' and id = '${srvB}';`).trim()).toBe("0");
  });

  it("a ferramenta NUNCA aponta para o servidor de OUTRA organização — nem por escrita direta (FK composta)", () => {
    const erro = erroDe(ferramentaMcp(orgA, srvB, "roubada"));
    expect(erro, "uma ferramenta da A passou a usar o servidor (e a credencial) da B").not.toBeNull();
    expect(erro).toMatch(/agent_external_tools_mcp_server_fk|foreign key/);
    // E mudar o servidor de uma ferramenta existente para o de outra organização também é recusado.
    const troca = erroDe(`update public.${FERRAMENTAS} set mcp_server_id = '${srvB}' where id = '${ferrA}';`);
    expect(troca).not.toBeNull();
  });

  it("o motor só carrega o que é DA organização do turno", async () => {
    const doTurnoA = await carregarFerramentasDoTurno(pool, orgA, [ferrA, ferrB]);
    expect(doTurnoA.map((f) => f.id)).toEqual([ferrA]);
    expect(doTurnoA[0]).toMatchObject({
      url: "https://a.exemplo.com/mcp",
      mcp: { servidorId: srvA, cabecalho: "authorization", temCredencial: true, nomeNoServidor: "consultar_estoque" },
      effect: "altera",
    });
    const doTurnoB = await carregarFerramentasDoTurno(pool, orgB, [ferrA, ferrB]);
    expect(doTurnoB.map((f) => f.id)).toEqual([ferrB]);
  });

  it("a credencial lida é a do SERVIDOR da própria organização — e a da outra não vaza", async () => {
    expect(await lerChaveNoBanco(pool, orgA, ferrA)).toBe("credencial-da-A-1111");
    expect(await lerChaveNoBanco(pool, orgB, ferrB)).toBe("credencial-da-B-2222");
    expect(await lerChaveNoBanco(pool, orgA, ferrB)).toBeNull();
    expect(await lerChaveNoBanco(pool, orgB, ferrA)).toBeNull();
  });

  it("a ferramenta MCP SÓ sai com os três ligados: ela, o servidor e o interruptor da organização", async () => {
    // 1. Interruptor DESLIGADO: nada de MCP no turno (os webhooks seguem normais).
    sql(`update public.organizations set settings = '{}'::jsonb where id = '${orgA}';`);
    expect(await carregarFerramentasDoTurno(pool, orgA, [ferrA])).toEqual([]);
    // 2. Ligado SEM o aceite do administrador vale desligado (LGPD).
    sql(`update public.organizations set settings = '{"mcp_externo":{"ligado":true}}'::jsonb where id = '${orgA}';`);
    expect(await carregarFerramentasDoTurno(pool, orgA, [ferrA])).toEqual([]);
    // 3. Ligado com o aceite: volta.
    sql(`update public.organizations set settings = '${MCP_LIGADO}'::jsonb where id = '${orgA}';`);
    expect(await carregarFerramentasDoTurno(pool, orgA, [ferrA])).toHaveLength(1);
    // 4. Servidor desativado: some, sem apagar nada.
    sql(`update public.${SERVIDORES} set active = false where id = '${srvA}';`);
    expect(await carregarFerramentasDoTurno(pool, orgA, [ferrA])).toEqual([]);
    sql(`update public.${SERVIDORES} set active = true where id = '${srvA}';`);
    // 5. Ferramenta desativada: some.
    sql(`update public.${FERRAMENTAS} set active = false where id = '${ferrA}';`);
    expect(await carregarFerramentasDoTurno(pool, orgA, [ferrA])).toEqual([]);
    sql(`update public.${FERRAMENTAS} set active = true where id = '${ferrA}';`);
    // Nada foi apagado: tudo volta ao ligar de novo.
    expect(await carregarFerramentasDoTurno(pool, orgA, [ferrA])).toHaveLength(1);
    expect(sql(`select count(*) from public.${SERVIDORES} where id = '${srvA}';`).trim()).toBe("1");
  });

  it("servidor sem credencial: `temCredencial` é falso e a leitura devolve null (não é falha de leitura)", async () => {
    const aberto = randomUUID();
    const ferrAberto = randomUUID();
    sql(`
      ${servidor(orgA, "Aberto", { id: aberto })}
      ${ferramentaMcp(orgA, aberto, "listar_produtos", { id: ferrAberto })}
    `);
    const [f] = await carregarFerramentasDoTurno(pool, orgA, [ferrAberto]);
    expect(f?.mcp?.temCredencial).toBe(false);
    expect(await lerChaveNoBanco(pool, orgA, ferrAberto)).toBeNull();
  });

  it("webhook e MCP convivem no mesmo turno e cada um carrega o que é seu", async () => {
    const wh = randomUUID();
    sql(webhook(orgA, "consulta_webhook", wh));
    const carregadas = await carregarFerramentasDoTurno(pool, orgA, [ferrA, wh]);
    expect(carregadas.map((f) => ({ id: f.id, mcp: f.mcp !== undefined })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: ferrA, mcp: true },
        { id: wh, mcp: false },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("apagar a organização leva servidores e ferramentas junto — nenhuma credencial órfã", () => {
    sql(`delete from public.organizations where id = '${orgB}';`);
    expect(sql(`select count(*) from public.${SERVIDORES} where organization_id = '${orgB}';`).trim()).toBe("0");
    expect(sql(`select count(*) from public.${FERRAMENTAS} where organization_id = '${orgB}';`).trim()).toBe("0");
    expect(sql(`select count(*) from public.${SERVIDORES} where organization_id = '${orgA}' and id = '${srvA}';`).trim()).toBe("1");
    sql(`delete from public.organizations where id = '${orgA}';`);
  });
});

describe("a ferramenta MCP na versão do agente", () => {
  const dono = randomUUID();
  const agente = randomUUID();
  const versao = randomUUID();
  const srv = randomUUID();
  const ferr = randomUUID();

  it("a versão PUBLICADA é imutável também para as ferramentas MCP (mesma coluna `external_tool_ids`)", () => {
    sql(`
      ${org(dono, "versao", MCP_LIGADO)}
      ${servidor(dono, "Servidor da versão", { id: srv })}
      ${ferramentaMcp(dono, srv, "consultar_estoque", { id: ferr })}
      insert into public.ai_agents (id, organization_id, name, system_prompt) values ('${agente}', '${dono}', 'Agente', 'você atende');
      insert into public.ai_agent_versions (id, organization_id, agent_id, version_number, system_prompt, provider, model, status, external_tool_ids)
        values ('${versao}', '${dono}', '${agente}', 1, 'você atende', 'anthropic', 'claude-sonnet-4-6', 'draft', array['${ferr}']::uuid[]);
      update public.ai_agent_versions set status = 'published', published_at = now() where id = '${versao}';
    `);
    const erro = erroDe(`update public.ai_agent_versions set external_tool_ids = '{}'::uuid[] where id = '${versao}';`);
    expect(erro, "uma versão publicada trocou de ferramentas por baixo").not.toBeNull();
    expect(erro).toContain("imutável");
  });

  it("limpa", () => {
    sql(`delete from public.organizations where id = '${dono}';`);
  });
});
