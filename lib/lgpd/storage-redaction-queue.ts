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
  bucket: string;
  object_path: string;
  attempts: number;
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
    .select("id, organization_id, bucket, object_path, attempts")
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
