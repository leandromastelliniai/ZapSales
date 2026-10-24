"use client";
/**
 * Estação 2 — o que o agente vai fazer. Os quatro modelos, com o recomendado para o
 * ramo marcado e o motivo escrito. A pessoa não escolhe "capacidades": o modelo já liga o
 * que precisa, e a tela só diz, em uma frase, o que o agente vai fazer.
 */
import { Selo } from "@/components/ui/selo";
import { useT } from "@/hooks/i18n/useT";
import { fraseDoQueFaz } from "@/lib/ai/agents/o-que-o-modelo-faz";
import { motivoDoModelo, ramoPorId } from "@/lib/ai/agents/assistente/ramos";
import { escolherModelo, type EstadoDoAssistente } from "@/lib/ai/agents/assistente/estado";
import { MODELOS_DE_AGENTE } from "@/lib/ai/agents/modelos";
import type { IdiomaDoAgente } from "@/lib/ai/agents/perfil";
import { cn } from "@/lib/utils";

interface Props {
  estado: EstadoDoAssistente;
  idioma: IdiomaDoAgente;
  mudar: (e: EstadoDoAssistente) => void;
}

export function EstacaoModelo({ estado, idioma, mudar }: Props) {
  const t = useT();
  const ramo = estado.respostas.ramoId ? ramoPorId(estado.respostas.ramoId) : undefined;
  const recomendado = ramo?.modeloRecomendado ?? "atendimento";
  const escolhido = estado.respostas.modeloId;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("O que o agente vai fazer?")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Cada opção já vem com as instruções prontas. Você pode editar qualquer texto depois.",
          )}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("O que o agente vai fazer?")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {MODELOS_DE_AGENTE.map((m) => {
          const c = m.conteudo[idioma];
          const marcado = escolhido === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={marcado}
              data-testid={`modelo-${m.id}`}
              onClick={() => mudar(escolherModelo(estado, m.id))}
              className={cn(
                "min-h-11 space-y-1 rounded-lg border px-3 py-3 text-left transition-colors",
                marcado ? "border-2 border-foreground" : "border-border hover:border-foreground/50",
              )}
            >
              <span className="flex min-h-6 flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{c.titulo}</span>
                {m.id === recomendado ? <Selo significado="ia">{t("Recomendado")}</Selo> : null}
              </span>
              <span className="block text-xs text-muted-foreground">{c.descricao}</span>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground" data-testid="motivo-da-recomendacao">
        <span className="font-medium text-foreground">{t("Por que o recomendado?")}</span>{" "}
        {ramo
          ? motivoDoModelo(ramo, idioma)
          : t(
              "Sem um tipo de negócio escolhido, começamos pelo mais seguro: ele recebe, entende e passa para a equipe.",
            )}
      </p>

      <p
        className="rounded-lg bg-surface-elevated px-3 py-2 text-sm"
        data-testid="frase-do-que-faz"
      >
        <span className="font-medium">{t("Na prática:")}</span> {fraseDoQueFaz(escolhido, idioma)}
      </p>
    </div>
  );
}
