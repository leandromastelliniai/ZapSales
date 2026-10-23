"use client";
import { useState } from "react";

import { AvatarDoAgente, DESENHO_DO_ICONE } from "@/components/ai/AvatarDoAgente";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PencilSimple } from "@/lib/ui/icons";
import { ICONES_DO_AGENTE, ROTULO_DO_ICONE, type IconeDoAgente } from "@/lib/ai/agents/icone-do-agente";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * O ícone do agente, que vira o botão de trocá-lo.
 *
 * Quem decide o que fazer com a escolha é quem chama: no editor, grava na hora em
 * `ai_agents.config.icone` (identidade não passa por rascunho e publicação); na
 * criação, guarda até o agente existir.
 */
export function EscolherIcone({
  icone,
  onEscolher,
  tamanho = "lg",
  ponto = null,
  disabled,
  salvando,
}: {
  icone: IconeDoAgente;
  onEscolher: (icone: IconeDoAgente) => void;
  tamanho?: "md" | "lg";
  ponto?: "no_ar" | "pausado" | null;
  disabled?: boolean;
  salvando?: boolean;
}) {
  const t = useT();
  const [aberto, setAberto] = useState(false);

  if (disabled) return <AvatarDoAgente icone={icone} tamanho={tamanho} ponto={ponto} />;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="trocar-icone-do-agente"
          aria-label={`${t("Trocar o ícone do agente")} (${t(ROTULO_DO_ICONE[icone])})`}
          disabled={salvando}
          className="group/icone relative shrink-0 rounded-2xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
        >
          <AvatarDoAgente icone={icone} tamanho={tamanho} ponto={ponto} />
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-xs transition-colors group-hover/icone:text-foreground"
          >
            <PencilSimple size={12} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19rem] p-3">
        <p className="text-sm font-medium">{t("Ícone do agente")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("Ajuda a equipe a reconhecer o agente nas listas. O cliente não vê.")}
        </p>
        <div role="radiogroup" aria-label={t("Ícone do agente")} className="mt-3 grid grid-cols-5 gap-1.5">
          {ICONES_DO_AGENTE.map((id) => {
            const Desenho = DESENHO_DO_ICONE[id];
            const marcado = id === icone;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={marcado}
                aria-label={t(ROTULO_DO_ICONE[id])}
                title={t(ROTULO_DO_ICONE[id])}
                data-testid={`icone-${id}`}
                onClick={() => {
                  setAberto(false);
                  if (!marcado) onEscolher(id);
                }}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg border transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                  marcado
                    ? "border-ia bg-ia-fundo text-ia"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-surface-elevated hover:text-foreground",
                )}
              >
                <Desenho size={22} weight={marcado ? "duotone" : "regular"} aria-hidden />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
