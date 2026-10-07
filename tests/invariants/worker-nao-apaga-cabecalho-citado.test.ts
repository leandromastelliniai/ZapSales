/**
 * O worker da fila de remoção não apaga o cabeçalho que um modelo passou a citar (issue #30).
 *
 * O aceite da issue, medido no worker de verdade (`drainStorageRedactionQueue`)
 * contra o banco de verdade: um caminho enfileirado e citado por um modelo antes
 * de o worker chegar a ele continua no bucket. Dois momentos:
 *
 *   - a citação chega ANTES da rodada: o gatilho da 0543 tira a linha da fila,
 *     e o worker nem a lê;
 *   - a citação chega NO MEIO da rodada: o lote foi lido inteiro e é
 *     processado em sequência, e o modelo é gravado enquanto o worker apaga a
 *     linha anterior. Só a reivindicação (`update … where status = 'pending'`)
 *     segura este caso — sem ela o worker apagava a partir do lote já lido.
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

const ORG = "43100000-0000-4000-8000-000000000001";
const MODELO = "43100000-0000-4000-8000-0000000000a1";
const BUCKET = "whatsapp-media";

const caminho = (n: number) =>
  `${ORG}/templates/43100000-0000-4000-8000-${String(n).padStart(12, "0")}.png`;
const PRIMEIRO = caminho(101);
const SEGUNDO = caminho(102);

const storage = storageEmMemoria();
const noBucket = (p: string) => storage.objetos.has(`${BUCKET}/${p}`);

async function guardar(p: string): Promise<void> {
  await storage.from(BUCKET).upload(p, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
    contentType: "image/png",
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

async function citar(p: string): Promise<void> {
  await pool.query(
    `insert into meta_templates (id, organization_id, waba_id, name, language, status, components, contract_hash, header_media)
     values ($1, $2, 'waba-431', 'cabecalho_431', 'pt_BR', 'PENDING', '[]'::jsonb, 'h-431', $3::jsonb)`,
    [
      MODELO,
      ORG,
      JSON.stringify({ "header:1": { path: p, mime_type: "image/png", file_name: "a.png" } }),
    ],
  );
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
     values ($1, 'org-worker-431', 'Org Worker LTDA', 'Org Worker') on conflict (id) do nothing`,
    [ORG],
  );
});

beforeEach(async () => {
  storage.objetos.clear();
  storage.aoRemover(null);
  // O worker drena a fila INTEIRA, de todas as organizações: as contagens de
  // `stats` só medem este arquivo se a fila começar só com o que ele enfileira.
  await pool.query(`delete from storage_redaction_queue`);
  await pool.query(`delete from meta_templates where organization_id = $1`, [ORG]);
  await guardar(PRIMEIRO);
  await guardar(SEGUNDO);
});

afterAll(async () => {
  await pool.end();
});

describe("drainStorageRedactionQueue — cabeçalho citado por modelo", () => {
  it("controle: o caminho enfileirado e não citado sai do bucket", async () => {
    await enfileirar(PRIMEIRO);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(false);
    expect((await linha(PRIMEIRO)).status).toBe("deleted");
    expect(stats).toMatchObject({ attempted: 1, deleted: 1 });
  });

  it("citado antes da rodada: o worker não o apaga", async () => {
    await enfileirar(PRIMEIRO);
    await citar(PRIMEIRO);

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(true);
    expect(await linha(PRIMEIRO)).toEqual({
      status: "skipped",
      error_message: "citado_por_modelo",
    });
    expect(stats).toMatchObject({ attempted: 0, deleted: 0 });
  });

  it("citado no meio da rodada, depois de o lote ser lido: o worker não o apaga", async () => {
    await enfileirar(PRIMEIRO, SEGUNDO);
    // O modelo que cita o SEGUNDO é gravado enquanto o worker apaga o PRIMEIRO.
    storage.aoRemover(async (_bucket, paths) => {
      if (paths.includes(PRIMEIRO)) await citar(SEGUNDO);
    });

    const stats = await drainStorageRedactionQueue({ limit: 10 });

    expect(noBucket(PRIMEIRO)).toBe(false);
    expect(noBucket(SEGUNDO)).toBe(true);
    expect(await linha(SEGUNDO)).toEqual({ status: "skipped", error_message: "citado_por_modelo" });
    expect(stats).toEqual({ attempted: 2, deleted: 1, failed: 0, skipped: 1 });
  });
});
