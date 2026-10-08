"use client";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * A LINHA DO FUNIL — a assinatura da direção "Linha do Funil" (07/10/2026).
 *
 * A jornada do lead desenhada como uma linha de metrô: as etapas são estações
 * na ordem do funil, a atual é um anel maior aceso, as passadas são cheias e as
 * futuras são vazadas. A cor é a do papel `--color-funil` (âmbar), que nunca
 * troca com a cor do revendedor: ela quer dizer "funil", não "marca".
 *
 * Etapa perdida não entra na linha: ela não é uma estação do caminho, é a saída
 * dele. Quem está numa etapa perdida vê a linha inteira vazada e o nome da etapa
 * no rótulo.
 */
export interface EtapaDaLinha {
  id: string;
  nome: string;
  perdida?: boolean;
}

interface Props {
  etapas: readonly EtapaDaLinha[];
  atualId: string | null;
  /** `faixa` desenha os nomes; `compacta` é só a linha, para a lista de conversas. */
  variante?: "faixa" | "compacta";
  className?: string;
}

export function LinhaDoFunil({ etapas, atualId, variante = "faixa", className }: Props) {
  const t = useT();
  const caminho = etapas.filter((e) => !e.perdida || e.id === atualId);
  const indiceAtual = caminho.findIndex((e) => e.id === atualId);
  const atual = indiceAtual >= 0 ? caminho[indiceAtual] : null;
  const compacta = variante === "compacta";

  if (caminho.length === 0) return null;

  return (
    <ol
      aria-label={atual ? `${t("Etapa do funil")}: ${atual.nome}` : t("Etapa do funil")}
      title={compacta && atual ? atual.nome : undefined}
      // O nome da etapa quebra só entre PALAVRAS ("Campanha / Clareamento"),
      // nunca no meio de uma; numa estação estreita a sobra de uma palavra longa
      // fica visível em vez de cortada.
      className={cn("flex w-full min-w-0 items-start", className)}
    >
      {caminho.map((etapa, i) => {
        const passada = indiceAtual >= 0 && i < indiceAtual;
        const eAtual = i === indiceAtual;
        const tracoAceso = indiceAtual >= 0 && i <= indiceAtual;
        return (
          <li
            key={etapa.id}
            aria-current={eAtual ? "step" : undefined}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center",
              compacta ? "" : "gap-1.5",
            )}
          >
            {/* O traço que liga esta estação à anterior: aceso até a atual. */}
            {i > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute right-1/2 h-0.5 w-full",
                  compacta ? "top-[3px]" : "top-[7px]",
                  tracoAceso ? "bg-funil" : "bg-border-strong",
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-[1] shrink-0 rounded-full",
                compacta ? "h-2 w-2" : "h-4 w-4",
                eAtual
                  ? cn(
                      "bg-funil ring-funil-fundo",
                      compacta ? "ring-2" : "ring-4",
                      "outline-2 outline-funil",
                    )
                  : passada
                    ? "bg-funil"
                    : "border-2 border-text-muted bg-surface",
              )}
            />
            {!compacta ? (
              <span
                className={cn(
                  "w-full px-0.5 text-center text-[11px] leading-tight [overflow-wrap:normal]",
                  eAtual ? "font-semibold text-funil" : passada ? "text-text" : "text-text-muted",
                )}
              >
                {etapa.nome}
              </span>
            ) : (
              <span className="sr-only">{etapa.nome}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
