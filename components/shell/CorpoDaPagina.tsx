import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A largura e o respiro de toda tela do app — duas medidas, não quatro.
 *
 *   - `lista`: tabelas, listas e painéis. Até 1280 px: numa tela larga o conteúdo deixa de esticar
 *     (medido em 14/10/2026: o `main` chegava a 2230 px num monitor de 2294).
 *   - `formulario`: configuração, formulário e leitura. Até 880 px.
 *   - `total`: o que precisa da largura toda (quadro do funil, agenda). Sem teto.
 *
 * ─── O respiro é LEGADO, de propósito, e sai no fim da migração ─────────────────────────────────
 *
 * O `<main>` do `AppShell` já dá 24 px, e cada tela somava o `p-6` dela por cima: 48 px de margem
 * numas telas e 24 em outras (Faturamento, que não somava, ficava 11 px à esquerda das vizinhas,
 * medido). O destino é 24 px em todas — mas tirar o `p-6` de uma tela só, com as outras ainda por
 * migrar, faria a margem pular de uma página para a seguinte. Então este corpo CONTINUA somando o
 * `p-6` (`RESPIRO_LEGADO`) enquanto houver tela com o corpo antigo, e o último pacote do plano
 * (`docs/design/plano-de-implementacao-visual.md`, X1) apaga a constante num commit só.
 */
const RESPIRO_LEGADO = "p-6";

const LARGURA = {
  lista: "max-w-[1280px]",
  formulario: "max-w-[880px]",
  total: "",
} as const;

export type LarguraDaPagina = keyof typeof LARGURA;

export function CorpoDaPagina({
  largura = "lista",
  className,
  children,
}: {
  largura?: LarguraDaPagina;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-largura={largura}
      className={cn("mx-auto flex h-full w-full flex-col gap-6", RESPIRO_LEGADO, LARGURA[largura], className)}
    >
      {children}
    </div>
  );
}
