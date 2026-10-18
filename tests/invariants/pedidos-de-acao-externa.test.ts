/**
 * OS PEDIDOS DE EXECUÇÃO DAS FERRAMENTAS EXTERNAS (migration 0552, issue #95).
 *
 * `agent_external_tool_requests` é o que impede a ação do agente de alterar o mundo
 * sem uma pessoa: o pedido nasce PENDENTE, aparece na Central, e só um UPDATE
 * condicional (`pending → executing`) deixa UMA execução acontecer. Este arquivo prova
 * o que só o banco real prova:
 *
 *   - server-side only (a anon key vai para o browser): privilégio NENHUM para anon e
 *     authenticated, RLS ligada, zero policies, `organization_id` NOT NULL em cascata;
 *   - os CHECKs de vocabulário e o índice único da «mesma chamada viva»;
 *   - abrir um pedido cria a linha E o item da Central no mesmo comando, e a repetição
 *     da mesma chamada reencontra o pedido em vez de abrir outro;
 *   - a execução ÚNICA: duas reivindicações do mesmo pedido, só uma vence;
 *   - falha incerta não é repetida; recusado e falha certa permitem um pedido novo;
 *   - pendente vencido já não é lido como vivo, e um novo ocupa o lugar;
 *   - o ISOLAMENTO entre duas organizações: cada uma lê só os seus pedidos, e o id de
 *     uma não responde na consulta da outra.
 *
 * Caveat do PGlite (harness local): concorrência real não existe, então a corrida entre
 * dois turnos só é provada de verdade no `pnpm test:db` do CI.
 */
import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { hashDosArgumentos } from "@/lib/ai/ferramentas-externas/impressao-digital";
import {
  abrirPedidoNoBanco,
  concluirPedidoNoBanco,
  pedidosDaConversa,
  temPedidoPendenteNaConversa,
  type EntradaDoPedido,
} from "@/lib/ai/ferramentas-externas/repositorio-do-turno";

import { motivoDoErro, sql } from "./psql-transporte";

const TABELA = "agent_external_tool_requests";
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 2,
});
afterAll(() => pool.end());

function erroDe(comando: string): string | null {
  try {
    sql(comando);
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

interface Cenario {
  org: string;
  ferramenta: string;
  conversa: string;
}

function montaCenario(rotulo: string, efeito: "consulta" | "altera" = "altera"): Cenario {
  const org = randomUUID();
  const ferramenta = randomUUID();
  const sessao = randomUUID();
  const contato = randomUUID();
  const conversa = randomUUID();
  sql(`
    insert into public.organizations (id, slug, display_name, legal_name)
      values ('${org}', 'pd-${rotulo}-${org.slice(0, 8)}', 'Pedidos ${rotulo}', 'Pedidos ${rotulo}');
    insert into public.agent_external_tools
      (id, organization_id, name, slug, when_to_use, url, effect, active, signing_secret_encrypted, signing_secret_last4)
      values ('${ferramenta}', '${org}', 'Criar pedido', 'criar_pedido', 'Quando o cliente fechar o pedido.',
              'https://erp.exemplo.com/hook', '${efeito}', true, '\\x01'::bytea, 'ab12');
    insert into public.channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
      values ('${sessao}', '${org}', 'pd-${org.slice(0, 8)}', 'WORKING', '\\x01'::bytea);
    insert into public.contacts (id, organization_id, name, phone_number)
      values ('${contato}', '${org}', 'Cliente', '+5511${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}');
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
      values ('${conversa}', '${org}', '${contato}', '${sessao}', 'ai_handling', false);
  `);
  return { org, ferramenta, conversa };
}

const entrada = (c: Cenario, extra: Partial<EntradaDoPedido> = {}): EntradaDoPedido => ({
  ferramenta: { id: c.ferramenta, slug: "criar_pedido", name: "Criar pedido", effect: "altera", approvalTtlHours: 24 },
  argumentos: { produto: "camiseta azul" },
  origem: "live",
  autoExecutar: false,
  agentId: null,
  conversationId: c.conversa,
  jobId: null,
  ...extra,
});

const conta = (c: Cenario, onde = "true") =>
  Number(sql(`select count(*) from public.${TABELA} where organization_id = '${c.org}' and ${onde};`).trim());

describe("o PostgREST não serve os pedidos", () => {
  it("a tabela EXISTE no baseline — controle positivo da sonda", () => {
    expect(
      sql(`select count(*) from information_schema.tables where table_schema = 'public' and table_name = '${TABELA}';`).trim(),
      "a 0552 não chegou ao baseline — o kit self-host não cria a tabela",
    ).toBe("1");
  });

  it("`anon` e `authenticated` não têm privilégio NENHUM; `service_role` continua com o que usa", () => {
    expect(privilegiosDe("anon")).toBe("NENHUM");
    expect(privilegiosDe("authenticated")).toBe("NENHUM");
    const p = privilegiosDe("service_role");
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) expect(p).toContain(priv);
  });

  it("RLS ligada, nenhuma policy, `organization_id` NOT NULL com FK em cascata", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.${TABELA}'::regclass;`).trim()).toBe("t");
    expect(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = '${TABELA}';`).trim()).toBe("0");
    expect(
      sql(`select is_nullable from information_schema.columns where table_schema='public' and table_name='${TABELA}' and column_name='organization_id';`).trim(),
    ).toBe("NO");
    expect(
      sql(`select confdeltype from pg_constraint where conrelid='public.${TABELA}'::regclass and contype='f' and confrelid='public.organizations'::regclass;`).trim(),
    ).toBe("c");
  });
});

describe("os CHECKs", () => {
  const c = montaCenario("checks");
  const linha = (status: string, origem = "live") => `
    insert into public.${TABELA} (organization_id, tool_id, origin, status, arguments_hash, expires_at)
    values ('${c.org}', '${c.ferramenta}', '${origem}', '${status}', '${hashDosArgumentos({ x: randomUUID() })}', now() + interval '1 hour');`;

  it("o estado e a origem só aceitam o vocabulário conhecido", () => {
    expect(erroDe(linha("aprovado"))).toContain("agent_external_tool_requests_status_check");
    expect(erroDe(linha("pending", "api"))).toContain("agent_external_tool_requests_origin_check");
    expect(erroDe(linha("pending"))).toBeNull();
  });

  it("ação que ALTERA pode existir ATIVA (a trava provisória da 0551 saiu), e a validade tem teto", () => {
    expect(
      erroDe(`update public.agent_external_tools set active = true where id = '${c.ferramenta}';`),
    ).toBeNull();
    expect(erroDe(`update public.agent_external_tools set approval_ttl_hours = 0 where id = '${c.ferramenta}';`)).toContain(
      "agent_external_tools_ttl_check",
    );
    expect(erroDe(`update public.agent_external_tools set approval_ttl_hours = 169 where id = '${c.ferramenta}';`)).toContain(
      "agent_external_tools_ttl_check",
    );
    expect(
      sql(`select require_approval is null from public.agent_external_tools where id = '${c.ferramenta}';`).trim(),
      "a chave nasce NULA: o padrão do efeito é que decide",
    ).toBe("t");
  });

  it("apagar a organização leva os pedidos junto", () => {
    sql(`delete from public.organizations where id = '${c.org}';`);
    expect(conta(c)).toBe(0);
  });
});

describe("abrir o pedido", () => {
  it("cria o pedido PENDENTE e o item na Central no mesmo comando, e audita sem segredo", async () => {
    const c = montaCenario("abrir");
    const aberto = await abrirPedidoNoBanco(pool, c.org, entrada(c, { argumentos: { produto: "camiseta azul", senha: "xyz-segredo" } }));
    expect(aberto.reivindicado).toBe(true);
    expect(aberto.pedido.status).toBe("pending");

    const item = sql(`
      select kind || '|' || ref_kind || '|' || (ref_id = '${aberto.pedido.id}')::text || '|' || status
        from public.agent_inbox_items where organization_id = '${c.org}' and kind = 'external_tool_approval';
    `).trim();
    expect(item).toBe("external_tool_approval|external_tool_request|true|open");
    // O pedido aponta para o aviso dele.
    expect(
      sql(`select count(*) from public.${TABELA} r join public.agent_inbox_items i on i.id = r.inbox_item_id where r.id = '${aberto.pedido.id}';`).trim(),
    ).toBe("1");
    // O corpo do aviso mostra o que o agente quer fazer e os dados — sem o valor do segredo.
    const corpo = sql(`select body from public.agent_inbox_items where organization_id = '${c.org}' and kind='external_tool_approval';`);
    expect(corpo).toContain("camiseta azul");
    expect(corpo).not.toContain("xyz-segredo");

    const auditoria = sql(`select metadata::text from public.api_audit_log where organization_id = '${c.org}' and action = 'ai.external_tool_request_created';`);
    expect(auditoria).toContain("criar_pedido");
    expect(auditoria).not.toContain("xyz-segredo");
  });

  it("a MESMA chamada repetida reencontra o pedido: um pedido, um aviso", async () => {
    const c = montaCenario("repete");
    const a = await abrirPedidoNoBanco(pool, c.org, entrada(c));
    const b = await abrirPedidoNoBanco(pool, c.org, entrada(c));
    const mesmaEmOutraOrdem = await abrirPedidoNoBanco(pool, c.org, entrada(c));
    expect(a.reivindicado).toBe(true);
    expect(b.reivindicado).toBe(false);
    expect(mesmaEmOutraOrdem.reivindicado).toBe(false);
    expect(b.pedido.id).toBe(a.pedido.id);
    expect(conta(c)).toBe(1);
    expect(sql(`select count(*) from public.agent_inbox_items where organization_id='${c.org}' and kind='external_tool_approval';`).trim()).toBe("1");
  });

  it("dados diferentes, ou outra conversa, são OUTRO pedido", async () => {
    const c = montaCenario("outro");
    await abrirPedidoNoBanco(pool, c.org, entrada(c));
    const outroDado = await abrirPedidoNoBanco(pool, c.org, entrada(c, { argumentos: { produto: "camiseta verde" } }));
    const semConversa = await abrirPedidoNoBanco(pool, c.org, entrada(c, { conversationId: null }));
    expect(outroDado.reivindicado).toBe(true);
    expect(semConversa.reivindicado).toBe(true);
    expect(conta(c)).toBe(3);
  });

  it("duas aberturas SIMULTÂNEAS da mesma chamada: uma só vence", async () => {
    const c = montaCenario("corrida");
    const resultados = await Promise.all(Array.from({ length: 5 }, () => abrirPedidoNoBanco(pool, c.org, entrada(c))));
    expect(resultados.filter((r) => r.reivindicado)).toHaveLength(1);
    expect(new Set(resultados.map((r) => r.pedido.id)).size).toBe(1);
    expect(conta(c)).toBe(1);
  });

  it("chave desligada (`autoExecutar`): nasce em execução, sem aviso na Central", async () => {
    const c = montaCenario("auto");
    const aberto = await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }));
    expect(aberto).toMatchObject({ reivindicado: true, pedido: { status: "executing" } });
    expect(sql(`select count(*) from public.agent_inbox_items where organization_id='${c.org}' and kind='external_tool_approval';`).trim()).toBe("0");
    // E a repetição enquanto executa reencontra o pedido: não há segundo efeito.
    const repetida = await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }));
    expect(repetida.reivindicado).toBe(false);
  });
});

describe("a execução é ÚNICA por pedido", () => {
  it("a reivindicação `pending → executing` só vale uma vez", async () => {
    const c = montaCenario("unica");
    const { pedido } = await abrirPedidoNoBanco(pool, c.org, entrada(c));
    // O mesmo comando que a rota de decisão faz (PostgREST: update … eq(status,pending) gt(expires_at,now)).
    const reivindicar = `
      update public.${TABELA} set status = 'executing', decided_at = now()
       where organization_id = '${c.org}' and id = '${pedido.id}' and status = 'pending' and expires_at > now()
      returning id;`;
    expect(sql(reivindicar).trim()).toContain(pedido.id);
    expect(sql(reivindicar).trim(), "o segundo clique reivindicou o MESMO pedido").not.toContain(pedido.id);
  });

  it("pedido vencido não pode ser reivindicado, mesmo antes do cron marcá-lo", async () => {
    const c = montaCenario("vencido");
    const { pedido } = await abrirPedidoNoBanco(pool, c.org, entrada(c));
    sql(`update public.${TABELA} set expires_at = now() - interval '1 minute' where id = '${pedido.id}';`);
    const reivindicar = `
      update public.${TABELA} set status = 'executing'
       where organization_id = '${c.org}' and id = '${pedido.id}' and status = 'pending' and expires_at > now()
      returning id;`;
    expect(sql(reivindicar).trim()).not.toContain(pedido.id);
  });
});

describe("o desfecho e a repetição", () => {
  it("concluir grava executada com o status do outro sistema, e só uma vez", async () => {
    const c = montaCenario("conclui");
    const { pedido } = await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }));
    await concluirPedidoNoBanco(pool, c.org, {
      pedido,
      resultado: { ok: true, httpStatus: 201, conteudo: '{"pedido":"A-1"}', truncado: false, tentativas: 1, duracaoMs: 5 },
    });
    expect(sql(`select status || '|' || outcome_http_status || '|' || (executed_at is not null)::text from public.${TABELA} where id='${pedido.id}';`).trim()).toBe(
      "executed|201|true",
    );
    // O que o outro sistema devolveu fica guardado: é com isso que a repetição do modelo lê o resultado.
    const de_novo = await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }));
    expect(de_novo.pedido).toMatchObject({ id: pedido.id, status: "executed", conteudo: '{"pedido":"A-1"}' });
    // Um segundo fechamento (outro caminho) não reescreve.
    await concluirPedidoNoBanco(pool, c.org, {
      pedido,
      resultado: { ok: false, motivo: "timeout", httpStatus: null, tentativas: 1, duracaoMs: 5, desfechoIncerto: true },
    });
    expect(sql(`select status from public.${TABELA} where id='${pedido.id}';`).trim()).toBe("executed");
  });

  it("já executada: a mesma chamada reencontra a executada (não abre outra nem executa)", async () => {
    const c = montaCenario("executada");
    const { pedido } = await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }));
    await concluirPedidoNoBanco(pool, c.org, {
      pedido,
      resultado: { ok: true, httpStatus: 200, conteudo: "{}", truncado: false, tentativas: 1, duracaoMs: 5 },
    });
    const de_novo = await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }));
    expect(de_novo).toMatchObject({ reivindicado: false, pedido: { id: pedido.id, status: "executed" } });
    // Passada a janela de 24 h, o cliente pode legitimamente pedir outra vez.
    sql(`update public.${TABELA} set created_at = now() - interval '25 hours' where id = '${pedido.id}';`);
    expect((await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }))).reivindicado).toBe(true);
  });

  it("falha INCERTA não é repetida; falha certa, recusa e expiração permitem um pedido novo", async () => {
    const c = montaCenario("falhas");
    const incerto = (await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }))).pedido;
    await concluirPedidoNoBanco(pool, c.org, {
      pedido: incerto,
      resultado: { ok: false, motivo: "erro_do_outro_sistema", httpStatus: 503, tentativas: 1, duracaoMs: 5, desfechoIncerto: true },
    });
    const repetida = await abrirPedidoNoBanco(pool, c.org, entrada(c, { autoExecutar: true }));
    expect(repetida).toMatchObject({ reivindicado: false, pedido: { id: incerto.id, status: "failed", incerto: true } });

    for (const [rotulo, fecha] of [
      ["certa", (id: string) => `update public.${TABELA} set status='failed', uncertain=false where id='${id}';`],
      ["recusada", (id: string) => `update public.${TABELA} set status='rejected' where id='${id}';`],
      ["expirada", (id: string) => `update public.${TABELA} set status='expired' where id='${id}';`],
    ] as const) {
      const c2 = montaCenario(`falha-${rotulo}`);
      const primeiro = (await abrirPedidoNoBanco(pool, c2.org, entrada(c2))).pedido;
      sql(fecha(primeiro.id));
      const segundo = await abrirPedidoNoBanco(pool, c2.org, entrada(c2));
      expect(segundo.reivindicado, rotulo).toBe(true);
      expect(segundo.pedido.id, rotulo).not.toBe(primeiro.id);
    }
  });

  it("pendente que passou do prazo vira expirado ao abrir de novo, e o aviso dele sai da Central", async () => {
    const c = montaCenario("prazo");
    const velho = (await abrirPedidoNoBanco(pool, c.org, entrada(c))).pedido;
    sql(`update public.${TABELA} set expires_at = now() - interval '1 minute' where id = '${velho.id}';`);
    const novo = await abrirPedidoNoBanco(pool, c.org, entrada(c));
    expect(novo.reivindicado).toBe(true);
    expect(sql(`select status from public.${TABELA} where id='${velho.id}';`).trim()).toBe("expired");
    expect(
      sql(`select count(*) from public.agent_inbox_items i join public.${TABELA} r on r.inbox_item_id = i.id where r.id='${velho.id}' and i.status='open';`).trim(),
      "o aviso do pedido vencido continua aberto na Central",
    ).toBe("0");
  });
});

describe("o que o agente lê da conversa", () => {
  it("lista os pedidos da conversa com a ferramenta e os dados, e diz se há algum pendente", async () => {
    const c = montaCenario("leitura");
    expect(await temPedidoPendenteNaConversa(pool, c.org, c.conversa)).toBe(false);
    await abrirPedidoNoBanco(pool, c.org, entrada(c));
    const lidos = await pedidosDaConversa(pool, c.org, c.conversa);
    expect(lidos).toHaveLength(1);
    expect(lidos[0]).toMatchObject({ tool_name: "Criar pedido", status: "pending", arguments: { produto: "camiseta azul" }, tem_resultado: false });
    expect(await temPedidoPendenteNaConversa(pool, c.org, c.conversa)).toBe(true);
    sql(`update public.${TABELA} set expires_at = now() - interval '1 minute' where organization_id='${c.org}';`);
    expect(await temPedidoPendenteNaConversa(pool, c.org, c.conversa), "pedido vencido ainda sustenta a promessa «depende da equipe»").toBe(false);
  });
});

describe("isolamento entre organizações", () => {
  it("cada organização lê só os seus pedidos; o id de uma não responde na consulta da outra", async () => {
    const a = montaCenario("iso-a");
    const b = montaCenario("iso-b");
    const pedidoA = (await abrirPedidoNoBanco(pool, a.org, entrada(a))).pedido;
    const pedidoB = (await abrirPedidoNoBanco(pool, b.org, entrada(b))).pedido;

    expect(conta(a, `id = '${pedidoA.id}'`)).toBe(1);
    expect(conta(a, `id = '${pedidoB.id}'`), "o pedido da B apareceu na consulta da A").toBe(0);
    expect(conta(b, `id = '${pedidoA.id}'`)).toBe(0);

    // A conversa da B, perguntada pela organização A, não devolve nada.
    expect(await pedidosDaConversa(pool, a.org, b.conversa)).toEqual([]);
    expect(await temPedidoPendenteNaConversa(pool, a.org, b.conversa)).toBe(false);

    // A reivindicação filtra a organização: com o id da B e a organização A, 0 linhas.
    const reivindicar = (org: string, id: string) => `
      update public.${TABELA} set status = 'executing'
       where organization_id = '${org}' and id = '${id}' and status = 'pending' and expires_at > now() returning id;`;
    expect(sql(reivindicar(a.org, pedidoB.id)).trim()).not.toContain(pedidoB.id);
    expect(sql(`select status from public.${TABELA} where id='${pedidoB.id}';`).trim(), "a A mexeu no pedido da B").toBe("pending");

    // Os avisos também são de cada uma.
    expect(sql(`select count(*) from public.agent_inbox_items where organization_id='${a.org}' and kind='external_tool_approval';`).trim()).toBe("1");
  });
});
