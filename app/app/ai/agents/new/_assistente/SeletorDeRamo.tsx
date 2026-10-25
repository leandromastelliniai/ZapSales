"use client";
/**
 * O tipo de negócio, sempre à vista e em dois níveis: as CATEGORIAS em cima (com ícone) e,
 * embaixo, os TIPOS da categoria escolhida, em blocos com ícone. Nada de lista comprida nem
 * de menu que esconde as opções: a estação inteira cabe numa tela, e a pessoa vê o que há.
 *
 * A busca acha pelo nome nos três idiomas e atravessa as categorias. "Outro" é a última
 * categoria: escolhê-lo deixa o agente com palavras neutras.
 *
 * A categoria aberta é DERIVADA: a que a pessoa clicou por último; senão a do tipo já
 * escolhido (ao recarregar a página); senão a primeira. Sem `useEffect` para sincronizar.
 */
import * as React from "react";

import {
  ICONE_DE_OUTRO,
  ICONE_DO_GRUPO,
  ICONE_POR_RAMO,
} from "@/components/ai/icones-do-assistente";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import {
  GRUPOS_DE_RAMO,
  RAMOS,
  buscarRamos,
  ramoPorId,
  type IdDoGrupo,
} from "@/lib/ai/agents/assistente/ramos";
import type { IdiomaDoAgente } from "@/lib/ai/agents/perfil";
import { cn } from "@/lib/utils";

interface Props {
  /** O tipo de negócio escolhido; `null` = "Outro" (ou ainda não escolhido). */
  escolhido: string | null;
  idioma: IdiomaDoAgente;
  onEscolher: (ramoId: string | null) => void;
}

type Categoria = IdDoGrupo | "outro";

const PILULA =
  "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden";

export function SeletorDeRamo({ escolhido, idioma, onEscolher }: Props) {
  const t = useT();
  const [clicada, setClicada] = React.useState<Categoria | null>(null);
  const [consulta, setConsulta] = React.useState("");
  const ramoEscolhido = escolhido ? ramoPorId(escolhido) : undefined;
  const categoria: Categoria = clicada ?? ramoEscolhido?.grupo ?? GRUPOS_DE_RAMO[0]!.id;
  const buscando = consulta.trim() !== "";
  const tipos = buscando
    ? buscarRamos(consulta, idioma)
    : RAMOS.filter((r) => r.grupo === categoria);

  return (
    <div className="min-w-0 space-y-3" data-testid="seletor-de-ramo">
      <Input
        type="search"
        value={consulta}
        placeholder={t("Digite para buscar: clínica, loja, advocacia…")}
        aria-label={t("Buscar o tipo de negócio")}
        autoComplete="off"
        onChange={(e) => setConsulta(e.target.value)}
      />

      <div
        role="tablist"
        aria-label={t("Categorias de negócio")}
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
      >
        {GRUPOS_DE_RAMO.map((g) => {
          const Icone = ICONE_DO_GRUPO[g.id]!;
          const ativa = !buscando && categoria === g.id;
          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              data-testid={`categoria-${g.id}`}
              onClick={() => {
                setClicada(g.id);
                setConsulta("");
              }}
              className={cn(
                PILULA,
                ativa
                  ? "border-ia bg-ia text-white"
                  : "border-border bg-surface hover:border-foreground/50",
              )}
            >
              <Icone size={16} aria-hidden className="shrink-0" />
              {g.nome[idioma]}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          aria-selected={!buscando && categoria === "outro"}
          data-testid="ramo-outro"
          onClick={() => {
            setClicada("outro");
            setConsulta("");
            onEscolher(null);
          }}
          className={cn(
            PILULA,
            !buscando && categoria === "outro"
              ? "border-ia bg-ia text-white"
              : "border-border bg-surface hover:border-foreground/50",
          )}
        >
          <ICONE_DE_OUTRO size={16} aria-hidden className="shrink-0" />
          {t("Outro")}
        </button>
      </div>

      <div
        role="tabpanel"
        data-testid="lista-de-ramos"
        aria-label={buscando ? t("Resultados da busca") : undefined}
      >
        {!buscando && categoria === "outro" ? (
          <p className="rounded-lg bg-surface-elevated px-3 py-3 text-sm text-muted-foreground">
            {t("O agente começa com palavras neutras e você ajusta o que quiser.")}
          </p>
        ) : tipos.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            {t("Nenhum tipo de negócio com esse nome. Use “Outro”.")}
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label={t("Tipo de negócio")}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {tipos.map((r) => {
              const Icone = ICONE_POR_RAMO[r.id]!;
              const marcado = escolhido === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  data-testid={`ramo-${r.id}`}
                  onClick={() => onEscolher(r.id)}
                  className={cn(
                    "flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-center text-sm leading-tight transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden",
                    marcado
                      ? "border-2 border-foreground bg-ia-fundo font-medium"
                      : "border-border bg-surface hover:border-foreground/50",
                  )}
                >
                  <Icone
                    size={26}
                    aria-hidden
                    className={cn("shrink-0", marcado ? "text-ia" : "text-muted-foreground")}
                  />
                  {r.nome[idioma]}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
