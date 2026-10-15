/**
 * A PASSAGEM GUARDA O AGENTE DE IA, E APAGAR O AGENTE NÃO APAGA A PASSAGEM
 * (migration 0545).
 *
 * `passagens_de_atendimento.agente_id` referencia `ai_agents` com
 * `on delete set null`. As duas metades importam:
 *
 *   - a referência existe e aceita o agente da mesma organização — é dela que a
 *     Inbox tira o nome do marco ("Sofia (IA) transferiu para Ana");
 *   - apagar o agente zera a referência e PRESERVA a linha. A passagem é história
 *     do atendimento; um `cascade` aqui seria a "cascata fantasma" do
 *     anti-pattern 7 — apagar um assistente apagaria o contexto que a equipe leu.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";

const ORG = "05450001-0000-4000-8000-000000000001";
const SESSAO = "05450001-2222-4000-8000-000000000001";
const CONTATO = "05450001-3333-4000-8000-000000000001";
const CONVERSA = "05450001-4444-4000-8000-000000000001";
const AGENTE = "05450001-5555-4000-8000-000000000001";
const PASSAGEM = "05450001-7777-4000-8000-000000000001";

function valor(consulta: string): string {
  return sql(consulta).trim().split("\n").at(-1) ?? "";
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'passagem-0545-agente', 'Passagem 0545 Agente', 'Passagem 0545 Agente')
      on conflict do nothing;
    do $seed$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO}', '${ORG}', 'passagem-0545-agente', '\\x00'::bytea);
    exception when unique_violation then null; end $seed$;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${ORG}', 'Cliente da 0545')
      on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
      values ('${CONVERSA}', '${ORG}', '${CONTATO}', '${SESSAO}', 'open')
      on conflict do nothing;
    insert into public.ai_agents (id, organization_id, name, system_prompt)
      values ('${AGENTE}', '${ORG}', 'Sofia', 'prompt da 0545')
      on conflict do nothing;
    insert into public.passagens_de_atendimento
        (id, organization_id, contact_id, conversation_id, motor, origem, motivo_codigo, body, agente_id)
      values ('${PASSAGEM}', '${ORG}', '${CONTATO}', '${CONVERSA}',
              'engine', 'pedido_explicito', 'requested_human', 'Por que a IA passou: pedido.', '${AGENTE}')
      on conflict do nothing;
    -- Segunda rodada no mesmo banco: o caso do delete zerou a referencia.
    update public.passagens_de_atendimento set agente_id = '${AGENTE}'
     where organization_id = '${ORG}' and id = '${PASSAGEM}';
  `);
});

describe("passagens_de_atendimento.agente_id (0545)", () => {
  it("a passagem guarda o agente, e o nome sai por junção", () => {
    expect(
      valor(`
        select a.name from public.passagens_de_atendimento p
          join public.ai_agents a on a.id = p.agente_id
         where p.organization_id = '${ORG}' and p.id = '${PASSAGEM}';`),
    ).toBe("Sofia");
  });

  it("a referência é ON DELETE SET NULL (nunca cascade)", () => {
    expect(
      valor(`
        select c.confdeltype from pg_constraint c
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
         where c.conrelid = 'public.passagens_de_atendimento'::regclass
           and c.contype = 'f' and a.attname = 'agente_id';`),
    ).toBe("n");
  });

  it("apagar o agente preserva a passagem e zera a referência", () => {
    sql(`delete from public.ai_agents where organization_id = '${ORG}' and id = '${AGENTE}';`);
    expect(
      valor(`
        select coalesce(agente_id::text, '<null>') from public.passagens_de_atendimento
         where organization_id = '${ORG}' and id = '${PASSAGEM}';`),
    ).toBe("<null>");
  });

  it("o índice parcial existe (o set null do delete não varre a tabela)", () => {
    expect(
      valor(`
        select count(*) from pg_indexes
         where schemaname = 'public' and indexname = 'idx_passagens_de_atendimento_agente';`),
    ).toBe("1");
  });
});
