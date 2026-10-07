/**
 * Storage redaction queue — drains `storage_redaction_queue` rows enqueued by
 * the cascade RPC and removes the underlying objects from Supabase Storage.
 *
 * Idempotent: each row is claimed right before its object is removed
 * (`attempts++` only while the row is still `pending`) and finalized to
 * deleted | failed | skipped. Re-runs ignore terminal rows.
 *
 * The claim matters because the batch is read once and processed in sequence:
 * a row can leave the queue in the meantime — a template that starts citing a
 * `<org>/templates/` file marks its row `skipped` (migration 0543, issue #30) —
 * and removing from the stale batch would delete the file the template signs.
 *
 * A retention row under `<org>/templates/` is also checked against the
 * templates right before removal: the retention sweep reads `meta_templates`
 * in its own snapshot, so a template written during the sweep neither holds
 * the path there nor finds a `pending` row for the trigger to clear.
 *
 * Message media under `<org>/<conversation>/` follows the same design (issue
 * #40): a message that starts citing the path clears its row (migration 0544),
 * and the retention row is checked against the conversation's messages right
 * before removal, for the message written during the sweep.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface DrainStats {
  attempted: number;
  deleted: number;
  failed: number;
  skipped: number;
}

interface QueueRow {
  id: string;
  organization_id: string;
  request_id: string | null;
  bucket: string;
  object_path: string;
  attempts: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Does any template of the row's organization cite this object? Only for
 * retention rows (`request_id` null) in the template header folder — an LGPD
 * cascade is never held back by a template.
 *
 * Same rule as the SQL of migrations 0542/0543 (`header_media -> slot ->>
 * 'path'`), deliberately looser than `lerMidiasGuardadas`: keeping a file by
 * mistake costs storage, deleting one by mistake breaks a campaign. Throws when
 * the templates can't be read, so the row goes through the retry path.
 */
async function citedByTemplate(admin: AdminClient, row: QueueRow): Promise<boolean> {
  if (row.request_id !== null || row.bucket !== "whatsapp-media") return false;
  if (!row.object_path.startsWith(`${row.organization_id}/templates/`)) return false;

  const { data, error } = await admin
    .from("meta_templates")
    .select("header_media")
    .eq("organization_id", row.organization_id);
  if (error) throw new Error(`template_citation_check_failed: ${error.message}`);

  return (data ?? []).some(({ header_media }) =>
    Object.values((header_media ?? {}) as Record<string, unknown>).some(
      (slot) =>
        typeof slot === "object" &&
        slot !== null &&
        (slot as { path?: unknown }).path === row.object_path,
    ),
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Does a message of the row's conversation cite this object? Only for retention
 * rows (`request_id` null) in a conversation folder, `<org>/<conversation>/` —
 * the folder the retention sweep (step 2) treats as message media.
 *
 * The conversation comes from the path, which is what keeps this lookup on the
 * conversation index (`media_storage_path` has none, and `messages` is the
 * biggest table): the send route only accepts a path inside the message's own
 * conversation (`isMediaPathOwnedBy`). Throws when the messages can't be read,
 * so the row goes through the retry path.
 */
async function citedByMessage(admin: AdminClient, row: QueueRow): Promise<boolean> {
  if (row.request_id !== null || row.bucket !== "whatsapp-media") return false;
  const [org, conversationId] = row.object_path.split("/");
  if (org !== row.organization_id || !conversationId || !UUID.test(conversationId)) return false;

  const { data, error } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", row.organization_id)
    .eq("conversation_id", conversationId)
    .eq("media_storage_path", row.object_path)
    .limit(1);
  if (error) throw new Error(`message_citation_check_failed: ${error.message}`);

  return (data ?? []).length > 0;
}

/** Why the row's object must stay in the bucket, or null when nothing cites it. */
async function citation(admin: AdminClient, row: QueueRow): Promise<string | null> {
  if (await citedByTemplate(admin, row)) return "citado_por_modelo";
  if (await citedByMessage(admin, row)) return "citado_por_mensagem";
  return null;
}

const MAX_ATTEMPTS = 3;
const DEFAULT_BATCH = 50;

/**
 * Pull up to `limit` pending rows and process them sequentially.
 *
 * Caller responsibility: throttle invocation via cron. The function returns
 * after one batch — repeat invocation drains the rest.
 */
export async function drainStorageRedactionQueue(
  opts: { limit?: number } = {},
): Promise<DrainStats> {
  const admin = createAdminClient();
  const limit = opts.limit ?? DEFAULT_BATCH;

  const stats: DrainStats = { attempted: 0, deleted: 0, failed: 0, skipped: 0 };

  const { data: rows, error } = await admin
    .from("storage_redaction_queue")
    .select("id, organization_id, request_id, bucket, object_path, attempts")
    .eq("status", "pending")
    .order("enqueued_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("[lgpd-redact-worker] queue select failed", {
      error_message: error.message,
    });
    return stats;
  }

  const queueRows = (rows ?? []) as QueueRow[];

  for (const row of queueRows) {
    stats.attempted++;
    const nextAttempts = row.attempts + 1;

    const { data: claimed, error: claimErr } = await admin
      .from("storage_redaction_queue")
      .update({ attempts: nextAttempts })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (claimErr) {
      // Nothing was removed: the row stays `pending` for the next run.
      logger.warn("[lgpd-redact-worker] queue claim failed", {
        queue_id: row.id,
        organization_id: row.organization_id,
        error_message: claimErr.message,
      });
      continue;
    }
    if (!claimed || claimed.length === 0) {
      // Left the queue after the batch was read; whoever moved it set the status.
      stats.skipped++;
      continue;
    }

    try {
      const citedBy = await citation(admin, row);
      if (citedBy) {
        await admin
          .from("storage_redaction_queue")
          .update({
            status: "skipped",
            processed_at: new Date().toISOString(),
            error_message: citedBy,
          })
          .eq("id", row.id);
        stats.skipped++;
        continue;
      }

      const { error: removeErr } = await admin.storage
        .from(row.bucket)
        .remove([row.object_path]);

      if (removeErr) {
        // Treat "not found" as deleted (idempotent / object already gone).
        const msg = removeErr.message ?? "";
        const notFound = /not\s+found|not_found|no such/i.test(msg);
        if (notFound) {
          await admin
            .from("storage_redaction_queue")
            .update({
              status: "skipped",
              attempts: nextAttempts,
              processed_at: new Date().toISOString(),
              error_message: "object_not_found",
            })
            .eq("id", row.id);
          stats.skipped++;
          continue;
        }
        throw new Error(msg || "storage_remove_failed");
      }

      await admin
        .from("storage_redaction_queue")
        .update({
          status: "deleted",
          attempts: nextAttempts,
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", row.id);
      stats.deleted++;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const terminal = nextAttempts >= MAX_ATTEMPTS;
      await admin
        .from("storage_redaction_queue")
        .update({
          status: terminal ? "failed" : "pending",
          attempts: nextAttempts,
          processed_at: terminal ? new Date().toISOString() : null,
          error_message: detail.slice(0, 500),
        })
        .eq("id", row.id);
      if (terminal) stats.failed++;
      logger.warn("[lgpd-redact-worker] media remove failed", {
        queue_id: row.id,
        organization_id: row.organization_id,
        attempts: nextAttempts,
        terminal,
      });
    }
  }

  return stats;
}
