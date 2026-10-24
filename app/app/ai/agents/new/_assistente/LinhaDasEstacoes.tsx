"use client";
/**
 * A Linha das Estações: o mesmo desenho da Linha do Funil da Inbox, aplicada aos cinco
 * passos do assistente — estações passadas cheias, a atual maior e com um pulso único,
 * as futuras vazadas. Texto de apoio "Passo X de 5" sempre visível: no celular os
 * nomes das estações somem e é ele que diz onde a pessoa está.
 */
import { useT } from "@/hooks/i18n/useT";
import { ESTACOES, type Estacao } from "@/lib/ai/agents/assistente/estado";
import { cn } from "@/lib/utils";

const NOMES: Record<Estacao, string> = {
  1: "Seu negócio",
  2: "O que faz",
  3: "Como fala",
  4: "Quando chamar uma pessoa",
  5: "Criar e testar",
};

export function LinhaDasEstacoes({ atual }: { atual: Estacao }) {
  const t = useT();
  return (
    <nav aria-label={t("Passos para criar o agente")} className="space-y-2">
      <p className="text-sm text-muted-foreground" data-testid="passo-atual">
        {t("Passo")} {atual} {t("de")} {ESTACOES.length} ·{" "}
        <span className="font-medium text-foreground">{t(NOMES[atual])}</span>
      </p>
      <ol className="flex items-center">
        {ESTACOES.map((n, i) => {
          const feita = n < atual;
          const agora = n === atual;
          return (
            <li
              key={n}
              className="flex flex-1 items-center last:flex-none"
              aria-current={agora ? "step" : undefined}
            >
              <span className="flex items-center gap-2">
                <span
                  key={agora ? `agora-${atual}` : `estacao-${n}`}
                  data-estacao={n}
                  data-estado={feita ? "feita" : agora ? "atual" : "futura"}
                  className={cn(
                    "shrink-0 rounded-full border-2 bg-surface",
                    agora ? "pulso-de-estacao size-5 border-ia" : "size-4",
                    feita ? "border-ia bg-ia" : null,
                    !feita && !agora ? "border-border-strong" : null,
                  )}
                />
                <span
                  className={cn(
                    "hidden text-sm whitespace-nowrap lg:inline",
                    agora ? "font-medium text-ia" : "text-muted-foreground",
                  )}
                >
                  {t(NOMES[n])}
                </span>
              </span>
              {i < ESTACOES.length - 1 ? (
                <span
                  aria-hidden
                  className={cn("mx-2 h-0.5 min-w-4 flex-1", feita ? "bg-ia" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
