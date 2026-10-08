"use client";

import type { ReactNode } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import { AvatarDoContato } from "./AvatarDoContato";
import { LinhaDoFunil, type EtapaDaLinha } from "./LinhaDoFunil";

/**
 * A FAIXA DA JORNADA — o topo da conversa no arranjo aprovado ("A jornada no
 * topo", comp `inbox-2`, 07/10/2026).
 *
 * Substitui a coluna da ficha: quem atende vê, numa faixa só, QUEM é o cliente,
 * DE ONDE veio (a campanha), ONDE está no funil e O QUE vale. O resto da ficha
 * (demandas, memória, pedidos, atividade, acervo) continua a um clique, na gaveta
 * que `acaoDaFicha` abre — nada do que a coluna mostrava foi removido.
 *
 * Componente de APRESENTAÇÃO: recebe o que mostrar, não busca nada. É o mesmo na
 * Inbox (com os dados do resumo do contato) e na vitrine (com dados de exemplo).
 */
export interface FunilDaFaixa {
  nome: string;
  etapas: readonly EtapaDaLinha[];
  atualId: string | null;
}

interface Props {
  nome: string;
  telefone?: string | null;
  fotoUrl?: string | null;
  canal?: Parameters<typeof AvatarDoContato>[0]["canal"];
  campanha?: string | null;
  funil?: FunilDaFaixa | null;
  /** Valor já formatado na moeda da organização ("R$ 1.150,00"). */
  valor?: string | null;
  proximoPasso?: string | null;
  etiquetas?: readonly string[];
  /** O botão que abre a ficha completa (gaveta). */
  acaoDaFicha?: ReactNode;
  /** O que mostrar no lugar da linha quando o contato não tem lead. */
  semFunil?: ReactNode;
  carregando?: boolean;
  className?: string;
}

export function FaixaDaJornada({
  nome,
  telefone,
  fotoUrl,
  canal,
  campanha,
  funil,
  valor,
  proximoPasso,
  etiquetas = [],
  acaoDaFicha,
  semFunil,
  carregando = false,
  className,
}: Props) {
  const t = useT();
  return (
    <section
      aria-label={t("Jornada do cliente")}
      data-testid="faixa-da-jornada"
      className={cn(
        "grid min-w-0 grid-cols-[auto_minmax(0,10rem)_1px_minmax(0,1fr)_1px_minmax(0,13rem)] items-center gap-x-4 rounded-xl border border-border bg-surface px-4 py-2.5",
        "max-lg:grid-cols-[auto_minmax(0,1fr)] max-lg:gap-y-3",
        className,
      )}
    >
      <AvatarDoContato nome={nome} fotoUrl={fotoUrl} canal={canal} tamanho="faixa" />

      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-text">{nome}</h2>
        {telefone ? (
          <p className="truncate text-sm text-text-muted tabular-nums">{telefone}</p>
        ) : null}
        {campanha ? (
          <p className="mt-1.5 min-w-0">
            <span className="inline-flex max-w-full items-center rounded-md border border-success/40 bg-success-bg px-2 py-0.5 text-xs font-medium text-success-fg">
              {t("Veio da campanha")}
            </span>
            <span className="mt-0.5 block truncate text-xs text-text-muted">{campanha}</span>
          </p>
        ) : null}
      </div>

      <span aria-hidden className="h-full w-px bg-border max-lg:hidden" />

      <div className="min-w-0 max-lg:col-span-2">
        <p className="mb-1.5 truncate text-sm font-semibold text-funil">
          {funil ? `${t("Linha do Funil")} · ${funil.nome}` : t("Linha do Funil")}
        </p>
        {carregando ? (
          <div className="h-10 animate-pulse rounded-md bg-surface-elevated" aria-hidden />
        ) : funil ? (
          <LinhaDoFunil etapas={funil.etapas} atualId={funil.atualId} />
        ) : (
          (semFunil ?? (
            <p className="truncate text-sm text-text-muted" title={proximoPasso ?? undefined}>
              {t("Este contato ainda não está em nenhum funil.")}
            </p>
          ))
        )}
      </div>

      <span aria-hidden className="h-full w-px bg-border max-lg:hidden" />

      <div className="min-w-0 space-y-1 max-lg:col-span-2">
        {valor ? <p className="text-base font-semibold text-text tabular-nums">{valor}</p> : null}
        {proximoPasso ? (
          <p className="text-sm text-text-muted">
            {t("Próximo passo")}: <span className="text-text">{proximoPasso}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {etiquetas.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label={t("Etiquetas")}>
              {etiquetas.slice(0, 3).map((e, i) => (
                <li
                  key={e}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    i === 0 ? "bg-accent text-accent-foreground" : "bg-surface-elevated text-text-muted",
                  )}
                >
                  {e}
                </li>
              ))}
            </ul>
          ) : null}
          {acaoDaFicha}
        </div>
      </div>
    </section>
  );
}
