"use client";
/**
 * O menu do tipo de negócio: um botão que mostra o que foi escolhido (com o ícone) e, ao
 * clicar, abre a lista agrupada com busca. Fechado ele ocupa uma linha — a lista de 36 tipos
 * só aparece quando a pessoa a pede, em vez de empurrar o resto da tela para baixo.
 *
 * Cada tipo tem o seu ícone e cada grupo também, para reconhecer de relance. "Outro" fica
 * sempre no fim, e a busca acha pelo nome nos três idiomas.
 */
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ICONE_DE_OUTRO,
  ICONE_DO_GRUPO,
  ICONE_POR_RAMO,
} from "@/components/ai/icones-do-assistente";
import { useT } from "@/hooks/i18n/useT";
import { GRUPOS_DE_RAMO, buscarRamos, ramoPorId } from "@/lib/ai/agents/assistente/ramos";
import type { IdiomaDoAgente } from "@/lib/ai/agents/perfil";
import { CaretDown, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  /** O tipo de negócio escolhido; `null` = "Outro" (ou ainda não escolhido). */
  escolhido: string | null;
  idioma: IdiomaDoAgente;
  onEscolher: (ramoId: string | null) => void;
}

const OPCAO =
  "flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-hidden";

export function SeletorDeRamo({ escolhido, idioma, onEscolher }: Props) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const [consulta, setConsulta] = React.useState("");
  const ramo = escolhido ? ramoPorId(escolhido) : undefined;
  const achados = buscarRamos(consulta, idioma);
  const IconeEscolhido = ramo ? ICONE_POR_RAMO[ramo.id]! : ICONE_DE_OUTRO;

  const escolher = (id: string | null) => {
    onEscolher(id);
    setAberto(false);
    setConsulta("");
  };

  return (
    <Popover
      open={aberto}
      onOpenChange={(a) => {
        setAberto(a);
        if (!a) setConsulta("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id="assistente-ramo"
          data-testid="seletor-de-ramo"
          aria-haspopup="listbox"
          aria-expanded={aberto}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm transition-colors hover:border-foreground/50 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden"
        >
          <IconeEscolhido size={20} aria-hidden className="shrink-0 text-ia" />
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              ramo ? "font-medium" : "text-muted-foreground",
            )}
          >
            {ramo ? ramo.nome[idioma] : t("Escolha o tipo de negócio…")}
          </span>
          <CaretDown size={16} aria-hidden className="shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] space-y-2 p-2"
        data-testid="menu-de-ramos"
      >
        <Input
          type="search"
          autoFocus
          value={consulta}
          placeholder={t("Digite para buscar: clínica, loja, advocacia…")}
          aria-label={t("Buscar o tipo de negócio")}
          autoComplete="off"
          onChange={(e) => setConsulta(e.target.value)}
        />
        <div
          role="listbox"
          aria-label={t("Tipo de negócio")}
          data-testid="lista-de-ramos"
          className="max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-0.5"
        >
          {GRUPOS_DE_RAMO.map((g) => {
            const doGrupo = achados.filter((r) => r.grupo === g.id);
            if (doGrupo.length === 0) return null;
            const IconeDoGrupo = ICONE_DO_GRUPO[g.id]!;
            return (
              <div key={g.id} role="group" aria-label={g.nome[idioma]}>
                <p className="flex items-center gap-1.5 px-2.5 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
                  <IconeDoGrupo size={14} aria-hidden />
                  {g.nome[idioma]}
                </p>
                {doGrupo.map((r) => {
                  const Icone = ICONE_POR_RAMO[r.id]!;
                  const marcado = escolhido === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="option"
                      aria-selected={marcado}
                      data-testid={`ramo-${r.id}`}
                      onClick={() => escolher(r.id)}
                      className={OPCAO}
                    >
                      <Icone size={18} aria-hidden className="shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{r.nome[idioma]}</span>
                      {marcado ? (
                        <Check size={16} aria-hidden className="shrink-0 text-ia" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {achados.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              {t("Nenhum tipo de negócio com esse nome. Use “Outro”.")}
            </p>
          ) : null}
          <button
            type="button"
            role="option"
            aria-selected={escolhido === null}
            data-testid="ramo-outro"
            onClick={() => escolher(null)}
            className={cn(OPCAO, "border-t border-border pt-2")}
          >
            <ICONE_DE_OUTRO size={18} aria-hidden className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              {t("Outro")}
              <span className="block text-xs text-muted-foreground">
                {t("O agente começa com palavras neutras e você ajusta o que quiser.")}
              </span>
            </span>
            {escolhido === null ? (
              <Check size={16} aria-hidden className="shrink-0 text-ia" />
            ) : null}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
