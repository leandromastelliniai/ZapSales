"use client";
/**
 * "Seu funil" e "Está tudo certo?", numa faixa no topo de cada funil em Etapas do funil.
 *
 * Quatro respostas que quem abre a tela quer antes de mexer em qualquer campo — quantas colunas
 * recebem cliente, onde o cliente fecha, onde desiste e quanto do funil o agente conduz — mais as
 * conferências que dizem o que falta. As contas são do produto (`lib/funil/resumo-do-funil.ts`);
 * a faixa só lê o que está gravado e nunca escreve nada.
 *
 * Não é `sticky`, de propósito: no casco real do app quem rola é a janela, e um `sticky` ali não
 * gruda (medido em produção em 26/10/2026 na tela de Nova campanha).
 */
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import type { ConferenciaDoFunil, ResumoDoFunil, Vocabulario } from "@/lib/funil/resumo-do-funil";
import { contarAtencaoDoFunil } from "@/lib/funil/resumo-do-funil";
import { CaretDown, CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  pipelineId: string;
  resumo: ResumoDoFunil;
  /** `null` = o funil ainda não tem vocabulário gravado. */
  vocabulario: Partial<Vocabulario> | null;
}

export function ResumoDoFunilFaixa({ pipelineId, resumo, vocabulario }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const comAtencao = contarAtencaoDoFunil(resumo.conferencias);
  const idDaLista = `conferencias-do-funil-${pipelineId}`;

  const nomes = (lista: string[]) => (lista.length > 0 ? lista.join(", ") : t("Nenhuma"));

  const celulas: { id: string; titulo: string; texto: string; sub: string | null; destaque: boolean }[] = [
    {
      id: "etapas",
      titulo: t("Etapas do quadro"),
      texto: `${resumo.total} ${resumo.total === 1 ? t("etapa") : t("etapas")}`,
      sub: `${resumo.abertas} ${resumo.abertas === 1 ? t("aberta") : t("abertas")} · ${resumo.fechamento.length} ${t("de fechamento")} · ${resumo.perda.length} ${t("de perda")}`,
      destaque: resumo.abertas === 0,
    },
    {
      id: "fechamento",
      titulo: t("O cliente fecha em"),
      texto: nomes(resumo.fechamento),
      sub: null,
      destaque: resumo.fechamento.length === 0,
    },
    {
      id: "perda",
      titulo: t("O cliente desiste em"),
      texto: nomes(resumo.perda),
      sub: null,
      destaque: resumo.perda.length === 0,
    },
    {
      id: "agente",
      titulo: t("O agente move o card"),
      texto: `${resumo.passosMovidos} ${t("de")} ${resumo.totalDePassos} ${t("passos")}`,
      sub: resumo.passosMovidos === 0 ? t("Hoje o card fica onde entrou") : null,
      destaque: false,
    },
  ];

  const chamados: { id: keyof Vocabulario; rotulo: string }[] = [
    { id: "lead", rotulo: t("Contato") },
    { id: "deal", rotulo: t("Negócio") },
    { id: "won", rotulo: t("Fecha") },
    { id: "lost", rotulo: t("Perde") },
  ];

  return (
    <section
      aria-label={t("Seu funil")}
      data-testid="resumo-do-funil"
      className="rounded-xl border border-border bg-surface shadow-sm"
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-border lg:grid-cols-4">
        {celulas.map((c) => (
          <div key={c.id} data-testid={`resumo-funil-${c.id}`} className="bg-surface px-4 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{c.titulo}</dt>
            <dd className={cn("truncate text-sm font-medium", c.destaque && "text-warning-fg")} title={c.texto}>
              {c.texto}
            </dd>
            {c.sub && <dd className="text-xs text-muted-foreground">{c.sub}</dd>}
          </div>
        ))}
      </dl>

      {vocabulario && (
        <p
          data-testid="resumo-funil-vocabulario"
          className="border-t border-border px-4 py-2 text-xs text-muted-foreground"
        >
          <span className="mr-1">{t("Você chama de")}:</span>
          {chamados
            .filter((c) => vocabulario[c.id])
            .map((c, i) => (
              <span key={c.id}>
                {i > 0 && " · "}
                {c.rotulo} <strong className="font-medium text-foreground">{vocabulario[c.id]}</strong>
              </span>
            ))}
        </p>
      )}

      <div className="border-t border-border">
        <button
          type="button"
          aria-expanded={aberto}
          aria-controls={idDaLista}
          data-testid="funil-esta-certo-botao"
          onClick={() => setAberto((a) => !a)}
          className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left"
        >
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[11px] text-muted-foreground">{t("Está tudo certo?")}</span>
            {comAtencao === 0 ? (
              <span
                data-testid="funil-esta-certo-estado"
                data-estado="ok"
                className="inline-flex items-center gap-1 text-sm font-medium text-success-fg"
              >
                <CheckCircle size={14} weight="bold" aria-hidden />
                {t("Tudo certo")}
              </span>
            ) : (
              <span
                data-testid="funil-esta-certo-estado"
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
          <ul id={idDaLista} className="space-y-2 border-t border-border px-4 py-3">
            {resumo.conferencias.map((c) => (
              <li
                key={c.id}
                data-testid={`conferencia-funil-${c.id}`}
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

function textoDaConferencia(c: ConferenciaDoFunil, t: (s: string) => string): string {
  const nomes = (c.nomes ?? []).map((n) => `«${n}»`).join(", ");
  switch (`${c.id}:${c.motivo}`) {
    case "etapas:tem_etapas_abertas":
      return t("O funil tem etapas abertas para receber cliente.");
    case "etapas:sem_etapa_aberta":
      return t("Não há nenhuma etapa aberta: crie as etapas do meio do caminho para o cliente andar.");
    case "fechamento:tem_fechamento":
      return `${t("O cliente fecha em")} ${nomes}.`;
    case "fechamento:sem_fechamento":
      return t("Nenhuma etapa marca o fechamento: o card de quem fecha nunca chega ao fim do funil.");
    case "perda:tem_perda":
      return `${t("O cliente desiste em")} ${nomes}.`;
    case "perda:sem_perda":
      return t("Nenhuma etapa marca a perda: não há para onde levar quem desiste.");
    case "agente:agente_move":
      return t("O agente já move o card em alguns passos do atendimento.");
    case "agente:agente_nao_move":
      return t("O agente não move o card em nenhum passo: ele atende, mas o card fica onde entrou. Se for de propósito, tudo bem.");
    default:
      return c.motivo;
  }
}
