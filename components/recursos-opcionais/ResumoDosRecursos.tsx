"use client";
/**
 * "Seus recursos opcionais" e "Está tudo certo?", numa faixa no topo de Recursos opcionais.
 *
 * Quatro respostas antes da lista de 34 itens — quantos estão ligados, quantos desligados, quantos
 * só se confere na tela de cada um e quantos dependem de quem administra o servidor — mais as
 * conferências. As contas são do produto (`lib/recursos-opcionais/resumo-dos-recursos.ts`); a faixa só
 * lê e nunca grava. SEM recomendação, de propósito: a tela é um mapa, e "ligue isto" seria opinião
 * sobre a empresa de quem lê (a verificação em duas etapas, por exemplo, é opcional por decisão do dono).
 *
 * Não é `sticky`: no casco real do app quem rola é a janela, e um `sticky` ali não gruda.
 */
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import {
  contarAtencaoDeRecursos,
  type ConferenciaDeRecursos,
  type ResumoDosRecursos,
} from "@/lib/recursos-opcionais/resumo-dos-recursos";
import { CaretDown, CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export function ResumoDosRecursosFaixa({ resumo }: { resumo: ResumoDosRecursos }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const comAtencao = contarAtencaoDeRecursos(resumo.conferencias);

  const celulas: { id: string; titulo: string; texto: string; sub: string; destaque: boolean }[] = [
    {
      id: "ligados",
      titulo: t("Ligados"),
      texto: String(resumo.ligados),
      sub: `${resumo.total} ${t("recursos no total")}`,
      destaque: false,
    },
    {
      id: "desligados",
      titulo: t("Desligados"),
      texto: String(resumo.desligados),
      sub: t("a empresa pode ligar"),
      destaque: false,
    },
    {
      id: "conferir",
      titulo: t("Você confere na tela dele"),
      texto: String(resumo.conferir),
      sub: resumo.naoLidos > 0 ? `${resumo.naoLidos} ${t("não consegui ler agora")}` : t("use o botão Ajustar"),
      destaque: resumo.naoLidos > 0,
    },
    {
      id: "servidor",
      titulo: t("Dependem do servidor"),
      texto: String(resumo.dependemDoServidor),
      sub: t("peça a quem administra"),
      destaque: false,
    },
  ];

  return (
    <section
      aria-label={t("Seus recursos opcionais")}
      data-testid="resumo-dos-recursos"
      className="rounded-xl border border-border bg-surface shadow-sm"
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-border lg:grid-cols-4">
        {celulas.map((c) => (
          <div key={c.id} data-testid={`resumo-rec-${c.id}`} className="bg-surface px-4 py-2.5">
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
          aria-controls="conferencias-dos-recursos"
          data-testid="rec-esta-certo-botao"
          onClick={() => setAberto((a) => !a)}
          className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left"
        >
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[11px] text-muted-foreground">{t("Está tudo certo?")}</span>
            {comAtencao === 0 ? (
              <span
                data-testid="rec-esta-certo-estado"
                data-estado="ok"
                className="inline-flex items-center gap-1 text-sm font-medium text-success-fg"
              >
                <CheckCircle size={14} weight="bold" aria-hidden />
                {t("Tudo certo")}
              </span>
            ) : (
              <span
                data-testid="rec-esta-certo-estado"
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
          <ul id="conferencias-dos-recursos" className="space-y-2 border-t border-border px-4 py-3">
            {resumo.conferencias.map((c) => (
              <li
                key={c.id}
                data-testid={`conferencia-rec-${c.id}`}
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
                <p className="min-w-0">{textoDaConferencia(c, t)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function textoDaConferencia(c: ConferenciaDeRecursos, t: (s: string) => string): string {
  const n = c.quantidade ?? 0;
  switch (c.motivo) {
    case "nao_lidos":
      return n === 1
        ? t("Não consegui ler o estado de 1 recurso agora. Abra a tela dele para conferir, ou tente de novo daqui a pouco.")
        : `${t("Não consegui ler o estado de")} ${n} ${t("recursos agora. Abra a tela de cada um para conferir, ou tente de novo daqui a pouco.")}`;
    case "todos_lidos":
      return t("O estado de todos os recursos foi lido.");
    case "dependem_do_servidor":
      return n === 1
        ? t("1 recurso depende de um módulo que o servidor não liga. Só quem administra o servidor pode ligá-lo: peça a essa pessoa.")
        : `${n} ${t("recursos dependem de um módulo que o servidor não liga. Só quem administra o servidor pode ligá-los: peça a essa pessoa.")}`;
    case "nada_depende_do_servidor":
      return t("Nenhum recurso desta lista fica de fora por falta de módulo no servidor.");
    case "conferir_na_tela":
      return n === 1
        ? t("1 recurso mostra o estado só na tela dele: use o botão Ajustar para ver.")
        : `${n} ${t("recursos mostram o estado só na tela deles: use o botão Ajustar de cada um para ver.")}`;
    case "nada_a_conferir":
      return t("Todos os recursos têm um estado único, lido aqui.");
    default:
      return c.motivo;
  }
}
