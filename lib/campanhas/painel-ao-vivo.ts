/**
 * Quando o painel da campanha reconsulta sozinho — puro, com o relógio injetado.
 *
 * Campanha em movimento muda a cada rodada. A concluída também segue mudando por
 * um tempo: `completed` quer dizer "ninguém mais na fila", não "a Meta já disse
 * tudo". Entregue e lido chegam pelo webhook DEPOIS do último envio (issue #8,
 * "status do webhook atualiza o painel ao vivo"), e a tela aberta tem de vê-los
 * sem recarregar. Passada a janela, quem quiser o número final recarrega.
 */
import type { StatusDaCampanha } from "./tipos";

/** Por quanto tempo a concluída ainda reconsulta. */
export const PAINEL_SEGUE_APOS_CONCLUIR_MS = 2 * 60 * 60_000;

const EM_MOVIMENTO: ReadonlySet<StatusDaCampanha> = new Set(["preparing", "running", "scheduled"]);

export function painelAindaMuda(
  c: { status: StatusDaCampanha; completed_at: string | null },
  agora: Date,
): boolean {
  if (EM_MOVIMENTO.has(c.status)) return true;
  if (c.status !== "completed" || !c.completed_at) return false;
  return agora.getTime() - new Date(c.completed_at).getTime() <= PAINEL_SEGUE_APOS_CONCLUIR_MS;
}
