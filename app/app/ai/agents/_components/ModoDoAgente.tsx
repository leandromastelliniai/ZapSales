"use client";
import { AgenteEmConversa } from "@/components/icons/produto";
import { Pause, UserCheck } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import type { AgentRow } from "@/hooks/ai/useAgent";
import { cn } from "@/lib/utils";

/**
 * COMO o agente atende, numa linha que um leigo entende: responde sozinho, ou
 * prepara a resposta para uma pessoa aprovar. A cor segue o significado do
 * produto — violeta é o automático (IA), ciano é uma pessoa no comando.
 *
 * Pausado vence o modo: com o automático pausado, nada sai sozinho, seja qual for
 * o modo escolhido.
 */
export function ModoDoAgente({
  agent,
  className,
}: {
  agent: Pick<AgentRow, "operation_mode" | "paused_at" | "published_version_id">;
  className?: string;
}) {
  const t = useT();
  const pausado = agent.paused_at != null && agent.published_version_id != null;
  const assistido = agent.operation_mode === "assisted";

  const [Icone, texto, cor] = pausado
    ? [Pause, t("Automático pausado"), "text-funil"]
    : assistido
      ? [UserCheck, t("Sugere a resposta; uma pessoa aprova"), "text-humano"]
      : [AgenteEmConversa, t("Responde sozinho"), "text-ia"];

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Icone size={16} weight="duotone" aria-hidden className={cn("shrink-0", cor)} />
      <span className="truncate">{texto}</span>
    </span>
  );
}
