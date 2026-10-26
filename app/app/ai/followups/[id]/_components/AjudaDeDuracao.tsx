"use client";
/**
 * Ajuda para um campo de tempo em MINUTOS: o equivalente em dias ou horas ao lado ("= 1 dia")
 * e, quando há exemplos, atalhos de um clique com o que os modelos prontos do produto usam.
 *
 * O campo continua em minutos (o fio e o motor não mudam): quem configura deixa de fazer a conta
 * de cabeça ("1440 é quanto?") sem que o valor gravado mude. Os atalhos só preenchem o campo.
 */
import { useT } from "@/hooks/i18n/useT";
import { descreverMinutos } from "@/lib/followup/duracao";
import type { EsperaDeModelo } from "@/lib/followup/modelos/esperas";
import { cn } from "@/lib/utils";

interface Props {
  minutos: number;
  /** Atalhos de um clique; sem eles, só o equivalente ("= 1 dia", que não aparece ao lado de "45 min": seria ruído). */
  exemplos?: EsperaDeModelo[];
  onEscolher?: (minutos: number) => void;
  disabled?: boolean;
  /** Texto antes dos exemplos ("Nos modelos prontos:"). */
  rotuloDosExemplos?: string;
  className?: string;
}

export function AjudaDeDuracao({ minutos, exemplos, onEscolher, disabled, rotuloDosExemplos, className }: Props) {
  const t = useT();
  const texto = descreverMinutos(minutos, t);
  const naoEhSoMinuto = Number.isFinite(minutos) && minutos >= 60 && minutos % 60 === 0;
  const valido = Number.isFinite(minutos) && minutos > 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      {valido && naoEhSoMinuto ? (
        <p className="text-xs text-muted-foreground" data-testid="duracao-equivale">
          = <span className="font-medium text-foreground">{texto}</span>
        </p>
      ) : null}
      {exemplos && exemplos.length > 0 && onEscolher ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="duracao-exemplos">
          <span className="text-xs text-muted-foreground">{rotuloDosExemplos ?? t("Nos modelos prontos:")}</span>
          {exemplos.map((e) => {
            const marcado = e.minutos === minutos;
            return (
              <button
                key={e.minutos}
                type="button"
                disabled={disabled}
                data-testid={`duracao-exemplo-${e.minutos}`}
                aria-pressed={marcado}
                onClick={() => onEscolher(e.minutos)}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden disabled:opacity-50",
                  marcado
                    ? "border-ia bg-ia-fundo font-medium text-ia"
                    : "border-dashed border-border bg-surface text-muted-foreground hover:border-ia/50 hover:text-foreground",
                )}
              >
                {descreverMinutos(e.minutos, t)} · {e.jornada}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
