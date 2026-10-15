import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * O SELO: uma etiqueta cuja COR diz uma coisa só, em todo o produto.
 *
 * É a regra de cor da direção "Linha do Funil" (a mesma da Inbox) escrita como componente, para que
 * nenhuma tela escolha cor por gosto:
 *
 *   - `ia`        violeta — o automático, o agente de IA
 *   - `humano`    ciano   — uma pessoa atendendo
 *   - `funil`     âmbar   — etapa do funil, fila, espera
 *   - `concluido` verde   — deu certo, aceito, pago
 *   - `falha`     coral   — falhou, recusado, atrasado
 *   - `neutro`    cinza   — só informação, sem significado de estado
 *
 * Quem precisa de cor nova precisa de significado novo, e isso é decisão de produto, não de tela.
 * Antes disto, "Aceito" em Equipe saía violeta (a cor da IA) e o papel "admin" saía azul qualquer.
 *
 * Não substitui o `Badge`: o `Badge` segue valendo onde a cor é só ênfase da marca. Onde a cor
 * significa estado, use o `Selo`.
 */
const COR = {
  ia: "bg-ia-fundo text-ia",
  humano: "bg-humano-fundo text-humano",
  funil: "bg-funil-fundo text-funil",
  concluido: "bg-success-bg text-success-fg",
  falha: "bg-error-bg text-error-fg",
  neutro: "border-border bg-surface-elevated text-text-muted",
} as const;

export type SignificadoDoSelo = keyof typeof COR;

export function Selo({
  significado = "neutro",
  className,
  ...props
}: { significado?: SignificadoDoSelo } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-selo={significado}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium leading-5",
        COR[significado],
        className,
      )}
      {...props}
    />
  );
}
