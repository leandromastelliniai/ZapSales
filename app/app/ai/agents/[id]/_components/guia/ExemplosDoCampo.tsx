"use client";
/**
 * Exemplos de um campo do perfil, de um clique. Saem dos modelos de agente
 * (`MODELOS_DE_AGENTE`, no idioma do agente), então são os mesmos textos que o assistente
 * de criação oferece: um conteúdo só, revisado em um lugar só.
 *
 * Aplicar substitui o que está no campo, e por isso, quando havia texto, a confirmação
 * traz "Desfazer": o exemplo é sugestão, nunca pode custar o que a pessoa escreveu.
 */
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { MODELOS_DE_AGENTE } from "@/lib/ai/agents/modelos";
import type { IdiomaDoAgente } from "@/lib/ai/agents/perfil";

export type CampoComExemplo = "persona" | "objetivo" | "boasVindas";

interface Props {
  campo: CampoComExemplo;
  idioma: IdiomaDoAgente;
  /** O texto que o campo tem agora. */
  valor: string;
  onAplicar: (texto: string) => void;
  disabled?: boolean;
}

export function ExemplosDoCampo({ campo, idioma, valor, onAplicar, disabled }: Props) {
  const t = useT();
  const exemplos = MODELOS_DE_AGENTE.map((m) => ({
    id: m.id,
    modelo: m.conteudo[idioma].titulo,
    texto: m.conteudo[idioma][campo],
  }));

  return (
    <details className="group" data-testid={`exemplos-${campo}`}>
      <summary className="cursor-pointer text-xs text-ia hover:underline">
        {t("Ver exemplos")}
      </summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {exemplos.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              disabled={disabled}
              data-testid={`exemplo-${campo}-${e.id}`}
              onClick={() => {
                const anterior = valor;
                onAplicar(e.texto);
                toast(t("Exemplo aplicado. Edite como quiser."), {
                  action:
                    anterior.trim() === ""
                      ? undefined
                      : { label: t("Desfazer"), onClick: () => onAplicar(anterior) },
                });
              }}
              className="flex h-full w-full flex-col gap-1 rounded-lg border border-dashed border-border bg-surface p-2.5 text-left transition-colors hover:border-ia/50 hover:bg-ia-fundo focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden disabled:opacity-50"
            >
              <span className="text-[11px] font-medium text-ia">{e.modelo}</span>
              <span className="line-clamp-3 text-xs text-muted-foreground">{e.texto}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
