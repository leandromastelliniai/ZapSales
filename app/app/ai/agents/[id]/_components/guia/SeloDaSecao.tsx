"use client";
/**
 * O estado de uma parte do editor, em PALAVRA e ícone, nunca só em cor: "Pronto" (está
 * preenchida ou tem um padrão bom), "Revisar" (falta algo que o agente precisa) e
 * "Opcional" (dá para publicar sem ela). A régua mora em `lib/ai/agents/guia-do-editor.ts`.
 */
import { useT } from "@/hooks/i18n/useT";
import type { EstadoDaSecao } from "@/lib/ai/agents/guia-do-editor";
import { Check, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

const CLASSE: Record<EstadoDaSecao, string> = {
  pronto: "bg-success-bg text-success-fg",
  revisar: "bg-warning-bg text-warning-fg",
  opcional: "bg-surface-elevated text-muted-foreground",
};

/** O selo com texto, para o cabeçalho de cada parte. */
export function SeloDaSecao({ estado, className }: { estado: EstadoDaSecao; className?: string }) {
  const t = useT();
  const rotulo =
    estado === "pronto" ? t("Pronto") : estado === "revisar" ? t("Revisar") : t("Opcional");
  return (
    <span
      data-testid={`selo-${estado}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        CLASSE[estado],
        className,
      )}
    >
      {estado === "pronto" ? <Check size={12} weight="bold" aria-hidden /> : null}
      {estado === "revisar" ? <Warning size={12} weight="bold" aria-hidden /> : null}
      {rotulo}
    </span>
  );
}

/** A marca pequena do índice: forma diferente por estado, e o texto fica para leitor de tela. */
export function MarcaDaSecao({ estado }: { estado: EstadoDaSecao }) {
  const t = useT();
  const rotulo =
    estado === "pronto" ? t("Pronto") : estado === "revisar" ? t("Revisar") : t("Opcional");
  return (
    <span
      data-testid={`marca-${estado}`}
      title={rotulo}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full",
        CLASSE[estado],
      )}
    >
      {estado === "pronto" ? <Check size={10} weight="bold" aria-hidden /> : null}
      {estado === "revisar" ? <Warning size={10} weight="bold" aria-hidden /> : null}
      {estado === "opcional" ? <span aria-hidden className="h-0.5 w-2 rounded-full bg-current" /> : null}
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}
