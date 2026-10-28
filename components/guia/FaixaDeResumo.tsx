"use client";
/**
 * A faixa de resumo das telas guiadas: quatro células + "Está tudo certo?" que abre as conferências.
 *
 * Não conta nada: cada tela faz as contas numa função pura (`lib/…/resumo-do-…ts`) e entrega o resultado
 * pronto. A faixa só desenha — e só lê, nunca grava. Os `data-testid` seguem o `prefixo` da tela
 * (`resumo-<prefixo>`, `resumo-<prefixo>-<celula>`, `<prefixo>-esta-certo-botao|estado`,
 * `conferencia-<prefixo>-<id>`), o mesmo desenho das telas anteriores (Recursos opcionais, Tipos de agendamento).
 *
 * Não é `sticky`: no casco real do app quem rola é a janela, e um `sticky` ali não gruda.
 */
import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import { CaretDown, CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export interface CelulaDaFaixa {
  id: string;
  titulo: string;
  texto: string;
  sub: string;
  destaque?: boolean;
}

export interface ConferenciaDaFaixa {
  id: string;
  /** `atencao` é o que a empresa pode resolver; `info` é escolha ou fato; `ok` está certo. */
  estado: "ok" | "atencao" | "info";
  texto: React.ReactNode;
}

export function FaixaDeResumo({
  rotulo,
  prefixo,
  celulas,
  conferencias,
}: {
  rotulo: string;
  prefixo: string;
  celulas: readonly CelulaDaFaixa[];
  conferencias: readonly ConferenciaDaFaixa[];
}) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const comAtencao = conferencias.filter((c) => c.estado === "atencao").length;
  const idLista = `conferencias-${prefixo}`;

  return (
    <section
      aria-label={rotulo}
      data-testid={`resumo-${prefixo}`}
      className="rounded-xl border border-border bg-surface shadow-sm"
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-border lg:grid-cols-4">
        {celulas.map((c) => (
          <div key={c.id} data-testid={`resumo-${prefixo}-${c.id}`} className="bg-surface px-4 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{c.titulo}</dt>
            <dd className={cn("truncate text-sm font-medium", c.destaque && "text-warning-fg")} title={c.texto}>
              {c.texto}
            </dd>
            <dd className="text-xs text-muted-foreground">{c.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-border">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={idLista}
          data-testid={`${prefixo}-esta-certo-botao`}
          onClick={() => setAberto((a) => !a)}
          className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left"
        >
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[11px] text-muted-foreground">{t("Está tudo certo?")}</span>
            {comAtencao === 0 ? (
              <span
                data-testid={`${prefixo}-esta-certo-estado`}
                data-estado="ok"
                className="inline-flex items-center gap-1 text-sm font-medium text-success-fg"
              >
                <CheckCircle size={14} weight="bold" aria-hidden />
                {t("Tudo certo")}
              </span>
            ) : (
              <span
                data-testid={`${prefixo}-esta-certo-estado`}
                data-estado="atencao"
                className="inline-flex items-center gap-1 text-sm font-medium text-warning-fg"
              >
                <Warning size={14} weight="bold" aria-hidden />
                {comAtencao === 1 ? t("1 pede atenção") : `${comAtencao} ${t("pedem atenção")}`}
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            {aberto ? t("esconder") : t("ver as conferências")}
            <CaretDown size={12} aria-hidden className={cn("transition-transform", aberto && "rotate-180")} />
          </span>
        </button>

        {aberto && (
          <ul id={idLista} className="space-y-2 border-t border-border px-4 py-3">
            {conferencias.map((c) => (
              <li
                key={c.id}
                data-testid={`conferencia-${prefixo}-${c.id}`}
                data-estado={c.estado}
                className="flex items-start gap-2 text-sm"
              >
                {c.estado === "ok" ? (
                  <CheckCircle size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-success" />
                ) : c.estado === "atencao" ? (
                  <Warning size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0 text-warning" />
                ) : (
                  <Info size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <p className="min-w-0">{c.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
