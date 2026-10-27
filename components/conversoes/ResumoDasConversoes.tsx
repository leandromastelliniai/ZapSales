"use client";
/**
 * "Suas conversões" e "Está tudo certo?", numa faixa no topo de Conversões — acima das abas, para
 * valer em todas elas.
 *
 * Quatro respostas que quem paga mídia quer antes de abrir qualquer formulário — a Meta está
 * devolvendo as vendas?, e o Google?, quantas a plataforma já aceitou e quantas não chegaram —, mais
 * as conferências e UMA recomendação com o motivo. As contas são do produto
 * (`lib/conversoes/resumo-das-conversoes.ts`); a faixa só lê e nunca grava.
 *
 * Não é `sticky`, de propósito: no casco real do app quem rola é a janela, e um `sticky` ali não
 * gruda (medido em produção em 26/10/2026 na tela de Nova campanha).
 */
import { useState } from "react";

import { FaixaRecomendada } from "@/components/guia/FaixaRecomendada";
import { useT } from "@/hooks/i18n/useT";
import type {
  ConferenciaDeConversoes,
  EstadoDaPlataforma,
  RecomendacaoDeConversoes,
  ResumoDasConversoes,
} from "@/lib/conversoes/resumo-das-conversoes";
import { contarAtencaoDeConversoes } from "@/lib/conversoes/resumo-das-conversoes";
import { CaretDown, CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  resumo: ResumoDasConversoes;
  recomendacao: RecomendacaoDeConversoes | null;
}

export function ResumoDasConversoesFaixa({ resumo, recomendacao }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const comAtencao = contarAtencaoDeConversoes(resumo.conferencias);

  const celulas: { id: string; titulo: string; texto: string; sub: string | null; destaque: boolean }[] = [
    { id: "meta", titulo: "Meta Ads", ...celulaDaPlataforma(resumo.meta, t) },
    { id: "google", titulo: "Google Ads", ...celulaDaPlataforma(resumo.google, t) },
    {
      id: "enviadas",
      titulo: t("Enviadas"),
      texto: String(resumo.enviadas),
      sub: t("aceitas pela plataforma"),
      destaque: false,
    },
    {
      id: "pendentes",
      titulo: t("Não reportadas"),
      texto: resumo.pendentesAlemDoTeto ? `${resumo.pendentes}+` : String(resumo.pendentes),
      sub: resumo.pendentes > 0 ? t("vendas que o anúncio ainda não recebeu") : t("Nenhuma pendência"),
      destaque: resumo.pendentes > 0,
    },
  ];

  return (
    <>
      <section
        aria-label={t("Suas conversões")}
        data-testid="resumo-das-conversoes"
        className="rounded-xl border border-border bg-surface shadow-sm"
      >
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-border lg:grid-cols-4">
          {celulas.map((c) => (
            <div key={c.id} data-testid={`resumo-conv-${c.id}`} className="bg-surface px-4 py-2.5">
              <dt className="text-[11px] text-muted-foreground">{c.titulo}</dt>
              <dd className={cn("truncate text-sm font-medium", c.destaque && "text-warning-fg")} title={c.texto}>
                {c.texto}
              </dd>
              {c.sub && <dd className="text-xs text-muted-foreground">{c.sub}</dd>}
            </div>
          ))}
        </dl>

        <div className="border-t border-border">
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls="conferencias-das-conversoes"
            data-testid="conv-esta-certo-botao"
            onClick={() => setAberto((a) => !a)}
            className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left"
          >
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-[11px] text-muted-foreground">{t("Está tudo certo?")}</span>
              {comAtencao === 0 ? (
                <span
                  data-testid="conv-esta-certo-estado"
                  data-estado="ok"
                  className="inline-flex items-center gap-1 text-sm font-medium text-success-fg"
                >
                  <CheckCircle size={14} weight="bold" aria-hidden />
                  {t("Tudo certo")}
                </span>
              ) : (
                <span
                  data-testid="conv-esta-certo-estado"
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
            <ul id="conferencias-das-conversoes" className="space-y-2 border-t border-border px-4 py-3">
              {resumo.conferencias.map((c) => (
                <li
                  key={c.id}
                  data-testid={`conferencia-conv-${c.id}`}
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

      {recomendacao && (
        <FaixaRecomendada testId="recomendacao-das-conversoes">
          <RecomendacaoTexto r={recomendacao} />
        </FaixaRecomendada>
      )}
    </>
  );
}

function celulaDaPlataforma(
  estado: EstadoDaPlataforma,
  t: (s: string) => string,
): { texto: string; sub: string | null; destaque: boolean } {
  switch (estado) {
    case "enviando":
      return { texto: t("Enviando"), sub: t("As vendas voltam para o anúncio"), destaque: false };
    case "em_teste":
      return { texto: t("Em teste"), sub: t("Vendas marcadas como teste"), destaque: true };
    case "pausada":
      return { texto: t("Pausada"), sub: t("Nada sai até religar"), destaque: true };
    case "indisponivel":
      return { texto: t("Indisponível"), sub: t("Falta configurar na instalação"), destaque: false };
    case "nao_conectada":
      return { texto: t("Não conectada"), sub: t("Opcional: só para quem anuncia"), destaque: false };
  }
}

function textoDaConferencia(c: ConferenciaDeConversoes, t: (s: string) => string): string {
  switch (c.motivo) {
    case "meta_enviando":
      return t("A Meta está recebendo as vendas que vieram de anúncio.");
    case "meta_em_teste":
      return t("A Meta está em modo de teste: as vendas vão marcadas como teste e não contam para a otimização. Apague o código de teste quando terminar de conferir.");
    case "meta_pausada":
      return t("O envio para a Meta está pausado: as vendas ficam registradas aqui, mas não vão para a plataforma até religar.");
    case "meta_nao_conectada":
      return t("A Meta não está conectada. É opcional: serve para quem paga anúncio e quer devolver as vendas a ele.");
    case "google_enviando":
      return t("O Google Ads está recebendo as vendas que vieram de anúncio.");
    case "google_pausada":
      return t("O envio para o Google Ads está pausado: as vendas ficam registradas aqui, mas não vão para a plataforma até religar.");
    case "google_nao_conectada":
      return t("O Google Ads não está conectado. É opcional: serve para quem paga anúncio no Google.");
    case "google_indisponivel":
      return t("O Google Ads ainda não está disponível nesta instalação: quem instalou o sistema precisa configurar as credenciais dele.");
    case "com_pendencias":
      return c.quantidade === 1
        ? t("1 venda de anúncio não foi reportada: confira a lista logo abaixo e reprocesse depois de corrigir.")
        : `${c.quantidade ?? 0} ${t("vendas de anúncio não foram reportadas: confira a lista logo abaixo e reprocesse depois de corrigir.")}`;
    case "sem_pendencias":
      return t("Nenhuma venda de anúncio ficou sem ser reportada.");
    case "nada_conectado":
      return t("Sem plataforma conectada não há o que reportar.");
    case "captura_ligada":
      return t("A captura de origem do site está ligada: quem chega pelo site entra no CRM com a origem.");
    case "captura_desligada":
      return t("A captura de origem do site está desligada. É opcional: sem ela, quem chega pelo site entra sem origem.");
    default:
      return c.motivo;
  }
}

function RecomendacaoTexto({ r }: { r: RecomendacaoDeConversoes }) {
  const t = useT();
  const motivo = <strong className="font-semibold">{t("Motivo:")}</strong>;
  switch (r.tipo) {
    case "conectar_plataforma":
      return (
        <>
          {t("conectar a plataforma em que você anuncia.")} {motivo}{" "}
          {t("é a volta da venda para o anúncio que ensina a plataforma a procurar mais gente parecida com quem comprou.")}
        </>
      );
    case "apagar_codigo_de_teste":
      return (
        <>
          {t("apagar o código de teste da Meta quando terminar de conferir.")} {motivo}{" "}
          {t("enquanto ele estiver preenchido, as vendas vão marcadas como teste e não contam para a otimização.")}
        </>
      );
    case "religar_envio":
      return (
        <>
          {t("religar o envio, se a pausa não foi de propósito.")} {motivo}{" "}
          {t("pausado, nada vai para a plataforma e o anúncio não fica sabendo das vendas.")}
        </>
      );
    case "resolver_pendencias":
      return (
        <>
          {t("conferir a lista de vendas não reportadas.")} {motivo}{" "}
          {t("cada uma é uma venda que o anúncio não ficou sabendo; depois de corrigir, use o botão de reprocessar.")}
        </>
      );
    case "ligar_captura":
      return (
        <>
          {t("ligar o endereço de captura de origem do site.")} {motivo}{" "}
          {t("ele guarda de onde veio quem chega pelo site, sem você instalar script nenhum.")}
        </>
      );
  }
}
