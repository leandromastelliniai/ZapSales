/**
 * O worker da fila de remoção não apaga a mídia que uma mensagem passou a citar (issue #40).
 *
 * O aceite da issue, medido no worker de verdade (`drainStorageRedactionQueue`)
 * contra o banco de verdade: um caminho de `<org>/<conversa>/` enfileirado e
 * citado por uma mensagem antes de o worker chegar a ele continua no bucket.
 * Três momentos:
 *
 *   - a citação chega ANTES da rodada: o gatilho da 0544 tira a linha da fila,
 *     e o worker nem a lê;
 *   - a citação chega enquanto a PODA roda: a poda lê `messages` no snapshot
 *     dela e enfileira mesmo assim, e o gatilho, que rodou antes de a linha da
 *     poda existir, não tinha o que tirar. Quem segura é o worker, conferindo a
 *     citação antes de apagar;
 *   - a citação chega NO MEIO da rodada do worker: só a reivindicação
 *     (`update … where status = 'pending'`) segura este caso.
 *
 * E as duas linhas que a citação NÃO segura: a do pedido LGPD (a cascata do
 * titular não é cancelada) e a mídia vencida, cuja mensagem já perdeu o caminho.
 *
 * Dublê, só o bucket (`storage-em-memoria.ts` — o Postgres efêmero não tem a
 * API de Storage). O `aoRemover` dele encaixa a escrita concorrente.
 */
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { pgComoSupabase } from "../pg-como-supabase";
import { storageEmMemoria } from "../support/storage-em-memoria";

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 1,
});

const quem = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => quem.db }));

import { drainStorageRedactionQueue } from "@/lib/lgpd/storage-redaction-queue";

const ORG = "44100000-0000-4000-8000-000000000001";
const CONTATO = "44100000-0000-4000-8000-000000000003";
const SESSAO = "44100000-0000-4000-8000-000000000004";
const CONVERSA = "44100000-0000-4000-8000-000000000005";
const PEDIDO_LGPD = "44100000-0000-4000-8000-0000000000c1";
const BUCKET = "whatsapp-media";

const PRIMEIRO = `${ORG}/${CONVERSA}/primeiro.jpg`;
const SEGUNDO = `${ORG}/${CONVERSA}/segundo.jpg`;

const storage = storageEmMemoria();
const noBucket = (p: string) => storage.objetos.has(`${BUCKET}/${p}`);

async function guardar(p: string): Promise<void> {
  await storage.from(BUCKET).upload(p, new Uint8Array([0xff, 0xd8, 0xff]), {
    contentType: "image/jpeg",
  });
}

/** Na ordem de `enqueued_at`, que é a ordem em que o worker processa o lote. */
async function enfileirar(...paths: string[]): Promise<void> {
  for (const [i, p] of paths.entries()) {
    await pool.query(
      `insert into storage_redaction_queue (organization_id, bucket, object_path, enqueued_at)
       values ($1, $2, $3, now() - make_interval(mins => $4))`,
      [ORG, BUCKET, p, 10 - i],
    );
  }
}

let n = 0;
async function enviar(p: string | null): Promise<string> {
  const { rows } = await pool.query(
    `insert into messages (organization_id, conversation_id, channel_session_id, contact_id,
                           type, direction, status, sent_via, sent_at, media_storage_path, body)
     values ($1, $2, $3, $4, 'image', 'outbound', 'queued', 'system', now(), $5, $6)
     returning id`,
    [ORG, CONVERSA, SESSAO, CONTATO, p, `msg-${++n}`],
  );
  return rows[0].id;
}

async function linha(p: string): Promise<{ status: string; error_message: string | null }> {
  const { rows } = await pool.query(
    `select status, error_message from storage_redaction_queue where bucket = $1 and object_path = $2`,
    [BUCKET, p],
  );
  return rows[0];
}

beforeAll(async () => {
  quem.db = Object.assign(pgComoSupabase(pool), { storage });
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name)
     values ($1, 'org-worker-441', 'Org Worker 441 LTDA', 'Org Worker 441') on conflict (id) do nothing`,
    [ORG],
  );
  await pool.query(`delete from messages where organization_id = $1`, [ORG]);
  await pool.query(`delete from conversations where organization_id = $1`, [ORG]);
  await pool.query(`delete from channel_sessions where organization_id = $1`, [ORG]);
  await pool.query(`delete from contacts where organization_id = $1`, [ORG]);
  await pool.query(
    `insert into contacts (id, organization_id, name, phone_number) values ($1, $2, 'Cliente', '+5511900000441')`,
    [CONTATO, ORG],
  );
  await pool.query(
    `insert into channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'worker-441', 'WORKING', '\\x00'::bytea)`,
    [SESSAO, ORG],
  );
  await pool.query(
    `insert into conversations (id, organization_id, contact_id, channel_session_id, status, is_group)
     values ($1, $2, $3, $4, 'open', false)`,
    [CONVERSA, ORG, CONTATO, SESSAO],
  );
});

beforeEach(async () => {
  storage.objetos.clear();
  storage.aoRemover(null);
  // O worker drena a fila INTEIRA, de todas as organizações: as contagens de
  // `stats` só medem este arquivo se a fila começar só com o que ele enfileira.
  await pool.query(`delete from storage_redaction_queue`);
  await pool.query(`delete from messages where organization_id = $1`, [ORG]);
  await pool.query(`delete from lgpd_requests where id = $1`, [PEDIDO_LGPD]);
  await guardar(PRIMEIRO);
  await guardar(SEGUNDO);
});

afterAll(async () => {
  await pool.end();
});

describe("drainStorageRedactionQueue — mídia citada por mensagem", () => {
  it("controle: o caminho enfileirado e não citado sai do bucket", async () => {
    await enfileirar(PRIMEIRO);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(false);
    expect((await linha(PRIMEIRO)).status).toBe("deleted");
    expect(stats).toMatchObject({ attempted: 1, deleted: 1 });
  });

  it("citado antes da rodada: o worker não o apaga", async () => {
    await enfileirar(PRIMEIRO);
    await enviar(PRIMEIRO);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(true);
    expect(await linha(PRIMEIRO)).toEqual({
      status: "skipped",
      error_message: "citado_por_mensagem",
    });
    expect(stats).toMatchObject({ attempted: 0, deleted: 0 });
  });

  it("enfileirado DEPOIS de a mensagem citar: o worker confere e não o apaga", async () => {
    await enviar(PRIMEIRO);
    await enfileirar(PRIMEIRO);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(true);
    expect(await linha(PRIMEIRO)).toEqual({
      status: "skipped",
      error_message: "citado_por_mensagem",
    });
    expect(stats).toEqual({ attempted: 1, deleted: 0, failed: 0, skipped: 1 });
  });

  it("citado no meio da rodada, depois de o lote ser lido: o worker não o apaga", async () => {
    await enfileirar(PRIMEIRO, SEGUNDO);
    // A mensagem que cita o SEGUNDO é criada enquanto o worker apaga o PRIMEIRO.
    storage.aoRemover(async (_bucket, paths) => {
      if (paths.includes(PRIMEIRO)) await enviar(SEGUNDO);
    });

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(false);
    expect(noBucket(SEGUNDO)).toBe(true);
    expect(await linha(SEGUNDO)).toEqual({ status: "skipped", error_message: "citado_por_mensagem" });
    expect(stats).toEqual({ attempted: 2, deleted: 1, failed: 0, skipped: 1 });
  });

  it("a mídia vencida, cuja mensagem perdeu o caminho, sai do bucket", async () => {
    // O passo 1 da poda limpa `media_storage_path` da vencida e enfileira o
    // arquivo: a linha existe, e nada a cita mais.
    const id = await enviar(PRIMEIRO);
    await pool.query(`update messages set media_storage_path = null where id = $1`, [id]);
    await enfileirar(PRIMEIRO);

    await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(false);
    expect((await linha(PRIMEIRO)).status).toBe("deleted");
  });

  it("a cascata LGPD não é segurada por mensagem que cita o caminho", async () => {
    await pool.query(
      `insert into lgpd_requests (id, organization_id, request_type, source, due_at)
       values ($1, $2, 'redact', 'manual', now() + interval '15 days')`,
      [PEDIDO_LGPD, ORG],
    );
    await enviar(PRIMEIRO);
    await pool.query(
      `insert into storage_redaction_queue (organization_id, request_id, bucket, object_path)
       values ($1, $2, $3, $4)`,
      [ORG, PEDIDO_LGPD, BUCKET, PRIMEIRO],
    );

    await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(false);
    expect((await linha(PRIMEIRO)).status).toBe("deleted");
  });
});
