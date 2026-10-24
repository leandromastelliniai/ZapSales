"use client";
/**
 * A galeria de modelos por ramo (issue #92): a primeira coisa que quem cria um
 * agente vê. Escolher um ramo preenche o perfil e as instruções; tudo continua
 * editável antes de publicar.
 *
 * Só apresenta e avisa qual foi escolhido — o QUE cada modelo preenche mora em
 * `lib/ai/agents/modelos.ts` (conteúdo versionado e traduzido), e quem aplica ao
 * formulário é o `AgentForm`. O texto do card vem do próprio modelo, no idioma
 * da tela, e não de `t()`: o modelo já é traduzido por inteiro lá.
 */
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { MODELOS_DE_AGENTE, type IdDoModelo } from "@/lib/ai/agents/modelos";
import type { IdiomaDoAgente } from "@/lib/ai/agents/perfil";

interface Props {
  /** O idioma em que os cards (e o que eles preenchem) aparecem. */
  idioma: IdiomaDoAgente;
  /** O ramo escolhido, para marcar o card. `null` = ainda nenhum. */
  escolhido: IdDoModelo | null;
  onEscolher: (id: IdDoModelo) => void;
  disabled?: boolean;
}

export function ModelosDoAgente({ idioma, escolhido, onEscolher, disabled }: Props) {
  const t = useT();
  return (
    <Card className="space-y-3 p-4" data-testid="galeria-de-modelos">
      <div>
        <h3 className="text-sm font-medium">{t("Comece por um modelo")}</h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Escolha o ramo e o perfil e as instruções já vêm preenchidos. Você edita o que quiser antes de publicar — ou ignore e preencha tudo à mão.",
          )}
        </p>
      </div>
      <div role="radiogroup" aria-label={t("Modelos de agente")} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
              disabled={disabled}
              onClick={() => onEscolher(m.id)}
              className={
                marcado
                  ? "rounded-md border-2 border-foreground px-3 py-2 text-left"
                  : "rounded-md border border-border px-3 py-2 text-left hover:border-foreground/50"
              }
            >
              <span className="block text-sm font-medium">{c.titulo}</span>
              <span className="block text-xs text-muted-foreground">{c.descricao}</span>
            </button>
          );
        })}
      </div>
      {escolhido ? (
        <p className="text-xs text-muted-foreground" data-testid="modelo-aviso">
          {t(
            "Modelo aplicado. Trocar de modelo substitui o perfil e as instruções que estão abaixo.",
          )}
        </p>
      ) : null}
    </Card>
  );
}
