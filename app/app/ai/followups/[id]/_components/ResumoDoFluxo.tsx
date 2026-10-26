"use client";
/**
 * "O que este fluxo faz" e "Vai disparar?", numa faixa entre a barra de publicar e o canvas.
 *
 * Quatro respostas lidas do próprio fluxo (quando começa, o que envia, por quanto tempo
 * acompanha, quando para) e as conferências que dizem se ele vai mesmo funcionar. As contas são
 * as do produto (`lib/followup/resumo-do-fluxo.ts`): as da galeria de modelos, o gate do motor
 * que exige um agente publicado e a mesma validação do botão Publicar. Nada é gravado: a faixa
 * acompanha o rascunho a cada edição.
 */
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { descreverMinutos, descreverMs } from "@/lib/followup/duracao";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import {
  prontidaoDoFluxo,
  resumoDoFluxo,
  type Conferencia,
  type GatilhoDoFluxo,
  type PoliticaDeHandoff,
} from "@/lib/followup/resumo-do-fluxo";
import { CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  grafo: FlowGraph;
  triggerConfig: Record<string, unknown>;
  handoff: PoliticaDeHandoff;
  status: string;
  /** Agentes PUBLICADOS da organização que armam este fluxo. */
  agentesQueArmam: Array<{ id: string; name: string }>;
}

export function ResumoDoFluxo({ grafo, triggerConfig, handoff, status, agentesQueArmam }: Props) {
  const t = useT();
  const gatilho = triggerConfig as GatilhoDoFluxo;
  const resumo = resumoDoFluxo(grafo, gatilho, handoff);
  const conferencias = prontidaoDoFluxo({ grafo, gatilho, status, agentesQueArmam: agentesQueArmam.length });
  const comAtencao = conferencias.filter((c) => c.estado === "atencao").length;

  const minutos = resumo.gatilho.minutos;
  const quando = ((): string => {
    switch (resumo.gatilho.kind) {
      case "silence":
        return minutos
          ? `${descreverMinutos(minutos, t)} ${t("sem o cliente responder")}`
          : t("um tempo sem o cliente responder");
      case "inbound_after_silence":
        return minutos
          ? `${t("o cliente volta depois de")} ${descreverMinutos(minutos, t)} ${t("sem falar")}`
          : t("o cliente volta depois de um tempo sem falar");
      case "manual":
        return t("quando alguém inicia o fluxo à mão");
      case "stage_change":
        return t("o negócio entra numa etapa do funil");
      case "case_opened":
        return t("o agente pede ajuda (abre um caso)");
      case "lead_created":
        return t("um lead é criado");
      case "webhook":
        return t("uma automação em Webhooks o inicia");
      case "appointment_no_show":
        return t("uma falta é confirmada pela equipe");
      default:
        return resumo.gatilho.kind;
    }
  })();

  const envia =
    resumo.mensagens === 0
      ? t("nenhuma mensagem ainda")
      : `${resumo.mensagens} ${resumo.mensagens === 1 ? t("mensagem") : t("mensagens")}`;

  const acompanha =
    resumo.horizonteMs === null
      ? t("depende das repetições")
      : resumo.horizonteMs === 0
        ? "—"
        : descreverMs(resumo.horizonteMs, t);

  const paradas: string[] = [];
  if (resumo.para.clienteResponde) paradas.push(t("o cliente responde"));
  if (resumo.para.handoff === "pause") paradas.push(t("uma pessoa assume (o fluxo pausa)"));
  if (resumo.para.handoff === "cancel") paradas.push(t("uma pessoa assume (o fluxo cancela)"));
  const para = paradas.length > 0 ? paradas.join(` ${t("ou")} `) : t("só no fim do fluxo");

  function textoDaConferencia(c: Conferencia): string {
    if (c.id === "validacao") {
      if (c.estado === "ok") return t("Passa na conferência do Publicar.");
      const n = c.quantidade ?? 0;
      return `${n} ${n === 1 ? t("problema a corrigir antes de publicar") : t("problemas a corrigir antes de publicar")}`;
    }
    if (c.id === "agente") {
      if (c.motivo === "nao_precisa") return t("Não precisa de agente: as mensagens são texto fixo.");
      if (c.motivo === "agente_arma") return `${t("Um agente publicado usa este fluxo")}: ${agentesQueArmam.map((a) => a.name).join(", ")}.`;
      return t(
        "Nenhum agente publicado usa este fluxo, e ele pede IA. O gatilho só dispara quando um agente publicado o liga: abra o agente, em Propostas e retornos › Follow-up, e escolha este fluxo.",
      );
    }
    if (c.status === "active") return t("Está no ar.");
    if (c.status === "disabled") return t("Está desativado: nada dispara.");
    return t("Ainda é rascunho: nada dispara até publicar.");
  }

  const celulas: Array<{ titulo: string; texto: string; destaque?: boolean; id: string }> = [
    { id: "quando", titulo: t("Quando começa"), texto: quando },
    { id: "envia", titulo: t("O que envia"), texto: envia, destaque: resumo.mensagens === 0 },
    { id: "acompanha", titulo: t("Acompanha por"), texto: acompanha },
    { id: "para", titulo: t("Para quando"), texto: para },
  ];

  return (
    <section
      aria-label={t("O que este fluxo faz")}
      data-testid="resumo-do-fluxo"
      className="relative z-20 border-b border-border bg-surface"
    >
      <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-[1fr_1fr_1fr_1.5fr_auto]">
        {celulas.map((c) => (
          <div key={c.id} data-testid={`resumo-${c.id}`} className="bg-surface px-4 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{c.titulo}</dt>
            <dd className={cn("text-sm font-medium", c.destaque && "text-warning-fg")}>{c.texto}</dd>
          </div>
        ))}

        {/*
          "Vai disparar?" é uma célula da mesma faixa, e as conferências abrem como PAINEL SOBREPOSTO
          (`absolute`), nunca empurrando o canvas: o construtor depende de a área do desenho não
          mudar de altura quando alguém abre ou fecha uma conferência. O estado (verde ou âmbar)
          fica sempre à vista no botão; o detalhe só abre por clique.
        */}
        <div className="relative col-span-2 bg-surface lg:col-span-1">
          <details data-testid="vai-disparar" className="group">
            <summary className="flex h-full min-h-[3.25rem] cursor-pointer list-none flex-col justify-center px-4 py-2 [&::-webkit-details-marker]:hidden">
              <span className="text-[11px] text-muted-foreground">{t("Vai disparar?")}</span>
              {comAtencao === 0 ? (
                <span
                  data-testid="vai-disparar-estado"
                  data-estado="ok"
                  className="inline-flex w-fit items-center gap-1 text-sm font-medium text-success-fg"
                >
                  <CheckCircle size={14} weight="bold" aria-hidden />
                  {t("Tudo certo")}
                </span>
              ) : (
                <span
                  data-testid="vai-disparar-estado"
                  data-estado="atencao"
                  className="inline-flex w-fit items-center gap-1 text-sm font-medium text-warning-fg"
                >
                  <Warning size={14} weight="bold" aria-hidden />
                  {comAtencao === 1 ? t("1 pede atenção") : `${comAtencao} ${t("pedem atenção")}`}
                </span>
              )}
            </summary>
            <ul className="absolute top-full right-0 z-30 w-[min(36rem,calc(100vw-1rem))] space-y-2 rounded-b-xl border border-border bg-surface p-4 shadow-lg">
              {conferencias.map((c) => (
                <li
                  key={c.id}
                  data-testid={`conferencia-${c.id}`}
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
                  <div className="min-w-0">
                    <p>{textoDaConferencia(c)}</p>
                    {c.id === "validacao" && c.estado === "atencao" ? (
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                        {c.detalhes.slice(0, 3).map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                        {c.detalhes.length > 3 ? <li>… {c.detalhes.length - 3} {t("a mais")}</li> : null}
                      </ul>
                    ) : null}
                    {c.id === "agente" && c.motivo === "sem_agente" ? (
                      <Link href="/app/ai/agents" className="text-xs font-medium text-ia underline-offset-2 hover:underline">
                        {t("Escolher o agente")}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </dl>
    </section>
  );
}
