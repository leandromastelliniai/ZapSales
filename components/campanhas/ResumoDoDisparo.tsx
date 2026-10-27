"use client";
/**
 * "O que este disparo faz" e "Vai disparar?", numa faixa no topo de Nova campanha.
 *
 * Quatro respostas que quem monta uma campanha quer antes de salvar — quantas pessoas, por onde,
 * quanto tempo, quanto custa — e as conferências que dizem por que o botão Salvar está (ou não)
 * liberado. As contas são do produto (`lib/campanhas/resumo-do-disparo.ts`): a prévia do público, a
 * estimativa de custo da Meta e o ritmo efetivo do número. Nada é gravado; a faixa acompanha o
 * formulário a cada edição.
 *
 * A faixa NÃO é `sticky` de propósito: no casco real do app o `<main>` tem `overflow-auto` sem altura
 * fixa, quem rola é a janela, e um `sticky` ali nunca gruda (medido em produção em 26/10/2026 — a
 * vitrine local, com um contêiner de altura fixa, tinha mostrado o contrário). Quem quiser colá-la
 * de novo precisa antes mexer no casco, que serve a todas as telas.
 *
 * ⚠️ Esta faixa NUNCA escreve "podem receber": o botão "Ver quantas pessoas" tem a sua própria
 * frase com essas palavras ao lado, e a spec `disparo-em-massa-csv` a localiza por texto, exigindo
 * um único elemento.
 */
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import type { Conferencia, Duracao, QuemLimita } from "@/lib/campanhas/resumo-do-disparo";
import { contarAtencao } from "@/lib/campanhas/resumo-do-disparo";
import { emReais } from "@/lib/custo/formato";
import { CaretDown, CheckCircle, Info, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  canalNome: string | null;
  oficial: boolean;
  temCriterio: boolean;
  contando: boolean;
  /** `null` = a contagem ainda não rodou. */
  elegiveis: number | null;
  excluidos: number;
  /** `null` = o ritmo do número não pôde ser lido (a faixa diz que não estima, em vez de chutar). */
  duracao: Duracao | null;
  /** Oficial: estimativa dos elegíveis pela tabela da Meta. */
  custoCents: number | null;
  tetoDeGastoCents: number | null;
  conferencias: Conferencia[];
}

export function ResumoDoDisparo({
  canalNome,
  oficial,
  temCriterio,
  contando,
  elegiveis,
  excluidos,
  duracao,
  custoCents,
  tetoDeGastoCents,
  conferencias,
}: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const comAtencao = contarAtencao(conferencias);

  const quem = ((): { texto: string; sub: string | null; destaque?: boolean } => {
    if (!temCriterio) return { texto: t("Escolha o público"), sub: null, destaque: true };
    if (elegiveis === null) return { texto: contando ? t("Contando…") : t("Ainda não contei"), sub: null };
    return {
      texto: `${elegiveis} ${elegiveis === 1 ? t("pessoa") : t("pessoas")}`,
      sub: excluidos > 0 ? `${excluidos} ${t("ficam de fora")}` : null,
    };
  })();

  const porOnde = {
    texto: canalNome ?? t("Escolha o número"),
    sub: canalNome === null ? null : oficial ? t("API Oficial · modelo aprovado") : t("QR code · texto livre"),
    destaque: canalNome === null,
  };

  const tempo = ((): { texto: string; sub: string | null; destaque?: boolean } => {
    if (duracao === null) return { texto: "—", sub: t("Sem ler o ritmo do número") };
    switch (duracao.tipo) {
      case "sem_destinatarios":
        return { texto: "—", sub: t("Depende de quantas pessoas entram") };
      case "janela_invalida":
        return { texto: "—", sub: t("O horário de envio não fecha"), destaque: true };
      case "sem_teto_proprio":
        return {
          texto: t("No mesmo dia"),
          sub: `${t("Dentro do horário de envio")} · ${t("o limite da Meta pode estender")}`,
        };
      case "muito_longo":
        return { texto: t("Mais de um ano"), sub: `${t("Até")} ${duracao.porDia} ${t("por dia")} · ${quemLimita(duracao.limitadoPor, t)}` };
      case "dias":
        return {
          texto: duracao.dias === 1 ? t("1 dia") : `${duracao.dias} ${t("dias")}`,
          sub: `${t("Até")} ${duracao.porDia} ${t("por dia")} · ${quemLimita(duracao.limitadoPor, t)}`,
        };
    }
  })();

  const custo = ((): { texto: string; sub: string | null } => {
    if (!oficial) return { texto: t("Sem tarifa da Meta"), sub: t("Número de QR code não paga por mensagem") };
    if (custoCents === null) return { texto: "—", sub: t("Aparece depois de contar o público") };
    return {
      texto: emReais(custoCents),
      sub: tetoDeGastoCents === null ? t("Sem teto de gasto") : `${t("Teto")}: ${emReais(tetoDeGastoCents)}`,
    };
  })();

  const celulas = [
    { id: "quem", titulo: t("Quem recebe"), ...quem },
    { id: "onde", titulo: t("Por onde"), ...porOnde },
    { id: "tempo", titulo: t("Quanto tempo"), ...tempo },
    { id: "custo", titulo: t("Quanto custa"), ...custo, destaque: false },
  ];

  return (
    <section
      aria-label={t("O que este disparo faz")}
      data-testid="resumo-do-disparo"
      className="rounded-xl border border-border bg-surface shadow-sm"
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl bg-border lg:grid-cols-4">
        {celulas.map((c) => (
          <div key={c.id} data-testid={`resumo-disparo-${c.id}`} className="bg-surface px-4 py-2.5">
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
          aria-controls="conferencias-do-disparo"
          data-testid="vai-disparar-botao"
          onClick={() => setAberto((a) => !a)}
          className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 text-left"
        >
          <span className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="text-[11px] text-muted-foreground">{t("Vai disparar?")}</span>
            {comAtencao === 0 ? (
              <span
                data-testid="vai-disparar-estado"
                data-estado="ok"
                className="inline-flex items-center gap-1 text-sm font-medium text-success-fg"
              >
                <CheckCircle size={14} weight="bold" aria-hidden />
                {t("Tudo certo")}
              </span>
            ) : (
              <span
                data-testid="vai-disparar-estado"
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
          <ul id="conferencias-do-disparo" className="space-y-2 border-t border-border px-4 py-3">
            {conferencias.map((c) => (
              <li
                key={c.id}
                data-testid={`conferencia-disparo-${c.id}`}
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

function quemLimita(q: QuemLimita, t: (s: string) => string): string {
  switch (q) {
    case "teto_da_campanha":
      return t("limitado pelo teto da campanha");
    case "teto_por_hora":
      return t("limitado pelo teto por hora");
    case "limite_do_numero":
      return t("limitado pelo limite do número");
    case "aquecimento":
      return t("limitado pelo aquecimento do número");
    case "intervalo":
      return t("limitado pelo intervalo entre mensagens");
  }
}

function textoDaConferencia(c: Conferencia, t: (s: string) => string): string {
  switch (`${c.id}:${c.motivo}`) {
    case "nome:preenchido":
      return t("Campanha com nome.");
    case "nome:falta_nome":
      return t("Dê um nome à campanha.");
    case "numero:escolhido":
      return t("Número escolhido.");
    case "numero:falta_escolher":
      return t("Escolha o número que vai enviar.");
    case "publico:sem_criterio":
      return t("Escolha pelo menos um critério de público ou suba uma lista de contatos.");
    case "publico:contando":
      return t("Ainda não sei quantas pessoas entram.");
    case "publico:ninguem_recebe":
      return t("Nenhuma pessoa entra com este recorte: afrouxe o filtro ou suba uma lista.");
    case "publico:tem_gente":
      return `${c.quantidade ?? 0} ${t("pessoas entram na lista.")}`;
    case "mensagem:pronta":
      return t("Mensagem pronta.");
    case "mensagem:falta_modelo":
      return t("Escolha o modelo aprovado que vai ser enviado.");
    case "mensagem:faltam_variaveis":
      return t("Falta dizer de onde vem cada variável do modelo.");
    case "mensagem:texto_vazio":
      return t("Escreva o texto da mensagem.");
    case "base_legal:falta_lia":
      return t("Informe a referência da avaliação (LIA) do interesse legítimo.");
    case "resposta:falta_agente":
      return t("A resposta pede um agente: escolha quem atende quem responder.");
    case "ritmo:janela_invalida":
      return t("O horário de envio não fecha: a hora de parar precisa ser depois da hora de começar.");
    case "custo:sem_teto":
      return t("Sem teto de gasto: a campanha não pausa por custo.");
    case "custo:dentro_do_teto":
      return t("O custo estimado cabe no teto de gasto.");
    case "custo:estimativa_passa_do_teto":
      return `${t("A estimativa")} (${emReais(c.quantidade ?? 0)}) ${t("passa do teto de gasto: a campanha vai pausar antes de chegar a todos.")}`;
    case "risco:aceite_ao_iniciar":
      return t("Número de QR code: ao iniciar, você vai precisar aceitar o aviso de risco de banimento.");
    default:
      return c.motivo;
  }
}
