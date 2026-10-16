/**
 * A TRAVA DA VERSÃO PUBLICADA COBRE A RESPOSTA EM ÁUDIO (migration 0546, issue #91).
 *
 * `audio_reply_enabled`, `audio_reply_voice_id` e `audio_reply_model_id` são dado
 * da VERSÃO do agente: rascunho, diff, histórico, desfazer. Mudar a voz de uma
 * versão JÁ publicada, sem virar rascunho novo, mudaria como o agente fala com o
 * cliente em produção sem trilha nenhuma — o defeito que a 0503 já fechou para
 * `proposal_ai_draft_enabled` e `inbound_debounce_ms`.
 *
 * Mesmo desenho de `trava-da-versao-publicada-cobre-flags-e-debounce.test.ts`,
 * e os valores do UPDATE são diferentes do default de propósito (default de
 * `audio_reply_enabled` é FALSE; de voz e modelo, NULL): um UPDATE para o mesmo
 * valor passa pelo `is distinct from` e mediria nada.
 *
 * E o default é a PROVA de que nada muda para quem já existia: uma versão criada
 * sem mencionar o áudio nasce com ele desligado.
 */
import pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { seedGov } from "./gov-helpers";
import { replyFixture } from "../support/autonomia-fixture";

const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? 54329}/postgres`,
  max: 5,
});

beforeAll(() => seedGov());
afterAll(() => pool.end());

const COLUNAS: Array<[string, unknown]> = [
  ["audio_reply_enabled", true],
  ["audio_reply_voice_id", "voz-da-sofia"],
  ["audio_reply_model_id", "eleven_turbo_v2_5"],
];

async function linha(id: string) {
  return (
    await pool.query(
      "select status, audio_reply_enabled, audio_reply_voice_id, audio_reply_model_id from ai_agent_versions where id=$1",
      [id],
    )
  ).rows[0] as {
    status: string;
    audio_reply_enabled: boolean;
    audio_reply_voice_id: string | null;
    audio_reply_model_id: string | null;
  };
}

it("versão que nunca falou de áudio nasce com ele DESLIGADO — agente existente não muda", async () => {
  const f = await replyFixture(pool);
  expect(await linha(f.version)).toMatchObject({
    audio_reply_enabled: false,
    audio_reply_voice_id: null,
    audio_reply_model_id: null,
  });
});

it.each(COLUNAS)("%s não muda numa versão PUBLICADA", async (coluna, valor) => {
  const f = await replyFixture(pool);
  const antes = await linha(f.version);
  expect(antes.status).toBe("published");

  await expect(
    pool.query(`update ai_agent_versions set ${coluna} = $2 where id = $1`, [f.version, valor]),
  ).rejects.toThrow(/imutável/);

  expect(await linha(f.version)).toEqual(antes);
});

it("voz e modelo respeitam o tamanho do CHECK (1..120) e não aceitam vazio", async () => {
  const f = await replyFixture(pool);
  const rascunho = randomUUID();
  await pool.query(
    `insert into ai_agent_versions
       (id,organization_id,agent_id,version_number,system_prompt,provider,model,credential_id,channel_session_id,status)
     values ($1,$2,$3,2,'Atenda quem chegar.','anthropic','claude-sonnet-4-6',null,$4,'draft')`,
    [rascunho, f.org, f.agent, f.channel],
  );
  await expect(
    pool.query("update ai_agent_versions set audio_reply_voice_id = '' where id = $1", [rascunho]),
  ).rejects.toThrow(/audio_reply_voice_len/);
  await expect(
    pool.query("update ai_agent_versions set audio_reply_model_id = $2 where id = $1", [rascunho, "x".repeat(121)]),
  ).rejects.toThrow(/audio_reply_model_len/);
  await pool.query("update ai_agent_versions set audio_reply_voice_id = $2 where id = $1", [rascunho, "x".repeat(120)]);
});

it("o caminho de versão nova continua: rascunho com a voz nova publica, e a anterior vira superseded", async () => {
  const f = await replyFixture(pool);
  await pool.query("update channel_sessions set status='WORKING' where id=$1", [f.channel]);
  await pool.query("update ai_agents set published_version_id=$2 where id=$1", [f.agent, f.version]);

  const credencial = randomUUID();
  await pool.query(
    `insert into ai_provider_credentials
       (id, organization_id, provider, label, api_key_encrypted, api_key_iv, api_key_tag,
        api_key_last4, validated_at, models_available, base_url)
     values ($1,$2,'custom','Ollama','\\x01'::bytea,'\\x02'::bytea,'\\x03'::bytea,
             '4242', now(), $3, 'https://ollama.example/v1')`,
    [credencial, f.org, ["qwen3:14b"]],
  );

  const rascunho = randomUUID();
  await pool.query(
    `insert into ai_agent_versions
       (id,organization_id,agent_id,version_number,system_prompt,provider,model,credential_id,channel_session_id,status)
     values ($1,$2,$3,2,'Atenda quem chegar.','custom','qwen3:14b',$4,$5,'draft')`,
    [rascunho, f.org, f.agent, credencial, f.channel],
  );
  // Rascunho é editável — senão ninguém configura nada.
  for (const [coluna, valor] of COLUNAS) {
    await pool.query(`update ai_agent_versions set ${coluna} = $2 where id = $1`, [rascunho, valor]);
  }

  await pool.query("select * from fn_publish_ai_agent_version($1,$2,$3,false)", [f.org, f.agent, rascunho]);

  expect(await linha(rascunho)).toEqual({
    status: "published",
    audio_reply_enabled: true,
    audio_reply_voice_id: "voz-da-sofia",
    audio_reply_model_id: "eleven_turbo_v2_5",
  });
  expect((await linha(f.version)).status).toBe("superseded");
});
