"use client";
/**
 * "Seus tipos de agendamento" e "Está tudo certo?", numa faixa no topo da tela.
 *
 * Quatro respostas antes da lista — quantos tipos estão ativos, quantos já dá para marcar, quantos
 * pedem ajuste e quantos avisam o cliente antes do horário — mais as conferências. As contas são do
 * produto (`lib/agenda/resumo-dos-tipos.ts`); a faixa só lê e nunca grava. A única recomendação (ligar o
 * aviso ao cliente) vem com o motivo, e some quando todo tipo ativo já avisa.
 *
 * Não é `sticky`: no casco real do app quem rola é a janela, e um `sticky` ali não gruda.
 */
import Link from "next/link";
import { useState } from "react";

import { FaixaRecomendada } from "@/components/guia/FaixaRecomendada";
import { useT } from "@/hooks/i18n/useT";
import {
  contarAtencaoDosTipos,
  recomendarLembrete,
  type ConferenciaDosTipos,
  type ResumoDosTipos,
} from "@/lib/agenda/resumo-dos-tipos";
import { CaretDown, CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export function ResumoDosTiposFaixa({ resumo }: { resumo: ResumoDosTipos }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const comAtencao = contarAtencaoDosTipos(resumo.conferencias);
  const pedemAjuste = resumo.semResponsavel + resumo.semHorarios + resumo.naoLidos;

  const celulas: { id: string; titulo: string; texto: string; sub: string; destaque: boolean }[] = [
    {
      id: "ativos",
      titulo: t("Tipos ativos"),
      texto: String(resumo.ativos),
      sub:
        resumo.desativados === 0
          ? t("nenhum desativado")
          : resumo.desativados === 1
            ? t("1 desativado")
            : `${resumo.desativados} ${t("desativados")}`,
      destaque: resumo.ativos === 0,
    },
    {
      id: "prontos",
      titulo: t("Prontos para marcar"),
      texto: `${resumo.prontos}/${resumo.ativos}`,
      sub: t("têm responsável e horários"),
      destaque: false,
    },
    {
      id: "ajuste",
      titulo: t("Pedem ajuste"),
      texto: String(pedemAjuste),
      sub:
        resumo.naoLidos > 0
          ? `${resumo.naoLidos} ${t("não consegui ler agora")}`
          : pedemAjuste === 0
            ? t("nada a ajustar")
            : t("faltam responsável ou horários"),
      destaque: pedemAjuste > 0,
    },
    {
      id: "avisam",
      titulo: t("Avisam o cliente"),
      texto: `${resumo.comLembrete}/${resumo.ativos}`,
      sub: t("lembrete pelo WhatsApp"),
      destaque: false,
    },
  ];

  return (
    <div className="grid gap-3">
      <section
        aria-label={t("Seus tipos de agendamento")}
        data-testid="resumo-dos-tipos"
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-border lg:grid-cols-4">
          {celulas.map((c) => (
            <div key={c.id} data-testid={`resumo-tipos-${c.id}`} className="bg-surface px-4 py-2.5">
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
            aria-controls="conferencias-dos-tipos"
            data-testid="tipos-esta-certo-botao"
            onClick={() => setAberto((a) => !a)}
            className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left"
          >
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-[11px] text-muted-foreground">{t("Está tudo certo?")}</span>
              {comAtencao === 0 ? (
                <span
                  data-testid="tipos-esta-certo-estado"
                  data-estado="ok"
                  className="inline-flex items-center gap-1 text-sm font-medium text-success-fg"
                >
                  <CheckCircle size={14} weight="bold" aria-hidden />
                  {t("Tudo certo")}
                </span>
              ) : (
                <span
                  data-testid="tipos-esta-certo-estado"
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
            <ul id="conferencias-dos-tipos" className="space-y-2 border-t border-border px-4 py-3">
              {resumo.conferencias.map((c) => (
                <li
                  key={c.id}
                  data-testid={`conferencia-tipos-${c.id}`}
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
                  <p className="min-w-0">
                    {textoDaConferencia(c, t)}
                    {c.motivo === "sem_horarios" && (
                      <>
                        {" "}
                        <Link
                          href="/app/team?aba=atendimento"
                          data-testid="tipos-ir-publicar-horarios"
                          className="font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
                        >
                          {t("Abrir Equipe › Atendimento")}
                        </Link>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {recomendarLembrete(resumo) && (
        <FaixaRecomendada testId="tipos-recomenda-lembrete">
          {t(
            "ligue o aviso ao cliente nos tipos em que ele marca horário com você (Editar › Avisar o cliente antes do compromisso). Motivo: o lembrete sai sozinho pelo WhatsApp e ajuda o cliente a lembrar do horário ou remarcar a tempo.",
          )}
        </FaixaRecomendada>
      )}
    </div>
  );
}

function textoDaConferencia(c: ConferenciaDosTipos, t: (s: string) => string): string {
  const n = c.quantidade ?? 0;
  switch (c.motivo) {
    case "nenhum_ativo":
      return t("Nenhum tipo está ativo: a tela de marcar e o agente de IA não têm o que oferecer. Crie um tipo ou reative um.");
    case "ha_ativos":
      return n === 1
        ? t("1 tipo está ativo e aparece para marcar.")
        : `${n} ${t("tipos estão ativos e aparecem para marcar.")}`;
    case "sem_responsavel":
      return n === 1
        ? t("1 tipo ativo não tem responsável, e sem responsável não há horário para oferecer. Use Editar no tipo e escolha quem atende.")
        : `${n} ${t("tipos ativos não têm responsável, e sem responsável não há horário para oferecer. Use Editar em cada um e escolha quem atende.")}`;
    case "todos_com_responsavel":
      return t("Todo tipo ativo tem responsável.");
    case "sem_horarios":
      return n === 1
        ? t("O responsável de 1 tipo ativo não tem horários de atendimento publicados, então nenhum horário é oferecido.")
        : `${t("Os responsáveis de")} ${n} ${t("tipos ativos não têm horários de atendimento publicados, então nenhum horário é oferecido.")}`;
    case "todos_com_horarios":
      return t("O responsável de cada tipo ativo tem horários de atendimento publicados.");
    case "horarios_nao_lidos":
      return n === 1
        ? t("Não consegui ler os horários do responsável de 1 tipo agora. Recarregue a página para conferir.")
        : `${t("Não consegui ler os horários dos responsáveis de")} ${n} ${t("tipos agora. Recarregue a página para conferir.")}`;
    case "sem_lembrete":
      return n === 1
        ? t("1 tipo ativo não avisa o cliente antes do horário. É escolha sua: o aviso se liga em Editar.")
        : `${n} ${t("tipos ativos não avisam o cliente antes do horário. É escolha sua: o aviso se liga em Editar, em cada tipo.")}`;
    case "todos_avisam":
      return t("Todo tipo ativo avisa o cliente antes do horário.");
    default:
      return c.motivo;
  }
}
