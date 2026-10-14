"use client";

import { format, formatDistanceToNowStrict, type Locale } from "date-fns";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { ArrowRight, Clock, Robot } from "@/lib/ui/icons";
import type { Comando } from "@/lib/inbox/comando-da-conversa";
import { cn } from "@/lib/utils";

import { AvatarDoContato, iniciaisDe, type SeloDeQuemAtende } from "./AvatarDoContato";

/**
 * QUEM ESTÁ COM A CONVERSA — sempre dito, em três lugares da Inbox.
 *
 * Pedido do dono (07/10/2026): "é preciso saber quando um agente de IA está
 * trabalhando ou quando foi transferido para um humano, e qual é o atendente".
 * A lista diz QUEM (`EtiquetaDeQuemAtende`), o cabeçalho diz QUEM, DESDE QUANDO
 * e QUEM PASSOU (`ChipDeComando`), e o fio da conversa marca O MOMENTO da troca
 * (`MarcoDaPassagem`). Os três leem o mesmo `Comando` de
 * `lib/inbox/comando-da-conversa.ts` — nenhum recalcula a regra.
 *
 * "IA" aqui é o rótulo curto que o dono escolheu para o agente enquanto a
 * passagem não guarda QUAL agente atendeu (o nome vem num PR seguinte). Os
 * rótulos de ESTADO de `ROTULO_DO_COMANDO` ("Automático atendendo") continuam
 * sendo o contrato das abas e do cabeçalho antigo e não mudam.
 */

/** O selo da foto para cada estado do comando (neutro = encerrada ou sem atendente). */
export function seloDoComando(comando: Comando): SeloDeQuemAtende {
  if (comando.quem === "automatico") return "ia";
  if (comando.quem === "humano") return "humano";
  if (comando.quem === "aguardando") return "fila";
  return "neutro";
}

function esperaCurta(desde: string | null | undefined, locale: Locale): string | null {
  if (!desde) return null;
  return formatDistanceToNowStrict(new Date(desde), { locale });
}

interface EtiquetaProps {
  comando: Comando;
  /** Desde quando o cliente espera (`esperaDaConversa`), para a fila. */
  esperaDesde?: string | null;
  className?: string;
}

/** A etiqueta curta da linha da lista: "IA atendendo", "Ana Paula", "Na fila · 12 min". */
export function EtiquetaDeQuemAtende({ comando, esperaDesde, className }: EtiquetaProps) {
  const t = useT();
  const locale = useLocaleDeData();
  const base = "inline-flex min-w-0 items-center gap-1 text-xs font-medium";
  if (comando.quem === "automatico") {
    return (
      <span className={cn(base, "text-ia", className)}>
        <Robot size={13} weight="fill" aria-hidden />
        <span className="truncate">{t("IA atendendo")}</span>
      </span>
    );
  }
  if (comando.quem === "humano") {
    const nome = comando.nome ?? t("Atendente");
    return (
      <span className={cn(base, "text-humano", className)}>
        <AvatarDoContato nome={nome} tamanho="mini" />
        <span className="truncate">{nome}</span>
      </span>
    );
  }
  if (comando.quem === "aguardando") {
    const espera = esperaCurta(esperaDesde, locale);
    return (
      <span className={cn(base, "text-funil", className)}>
        <Clock size={13} weight="bold" aria-hidden />
        <span className="truncate">
          {t("Na fila")}
          {espera ? ` · ${espera}` : ""}
        </span>
      </span>
    );
  }
  if (comando.quem === "encerrada") {
    return <span className={cn(base, "text-text-subtle", className)}>{t("Encerrada")}</span>;
  }
  return <span className={cn(base, "text-text-subtle", className)}>{t("Sem atendente")}</span>;
}

interface ChipProps {
  comando: Comando;
  /** Quando a pessoa assumiu (`assigned_at`). */
  desde?: string | null;
  /** A pessoa assumiu depois de o automático passar a conversa (`last_handoff_at`). */
  transferidaPelaIa?: boolean;
  esperaDesde?: string | null;
  className?: string;
}

/** O chip do cabeçalho: quem tem o comando agora, desde quando e quem passou. */
export function ChipDeComando({
  comando,
  desde,
  transferidaPelaIa,
  esperaDesde,
  className,
}: ChipProps) {
  const t = useT();
  const locale = useLocaleDeData();
  const base =
    "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium";
  if (comando.quem === "humano") {
    const nome = comando.nome ?? t("Atendente");
    const partes = [`${t("Em atendimento")}: ${nome}`];
    if (desde) partes.push(`${t("desde")} ${format(new Date(desde), "HH:mm", { locale })}`);
    if (transferidaPelaIa) partes.push(t("transferida pela IA"));
    return (
      <span
        data-testid="chip-de-comando"
        className={cn(base, "border-humano/60 bg-humano-fundo text-humano", className)}
      >
        <AvatarDoContato nome={nome} tamanho="mini" />
        <span className="truncate">{partes.join(" · ")}</span>
      </span>
    );
  }
  if (comando.quem === "automatico") {
    return (
      <span
        data-testid="chip-de-comando"
        className={cn(base, "border-ia/60 bg-ia-fundo text-ia", className)}
      >
        <Robot size={16} weight="fill" aria-hidden />
        <span className="truncate">{t("IA atendendo")}</span>
      </span>
    );
  }
  if (comando.quem === "aguardando") {
    const espera = esperaCurta(esperaDesde, locale);
    return (
      <span
        data-testid="chip-de-comando"
        className={cn(base, "border-funil/60 bg-funil-fundo text-funil", className)}
      >
        <Clock size={16} weight="bold" aria-hidden />
        <span className="truncate">
          {t("Na fila, esperando uma pessoa")}
          {espera ? ` · ${espera}` : ""}
        </span>
      </span>
    );
  }
  return (
    <span
      data-testid="chip-de-comando"
      className={cn(base, "border-border text-text-muted", className)}
    >
      <span className="truncate">
        {t(comando.quem === "encerrada" ? "Encerrada" : "Sem atendente")}
      </span>
    </span>
  );
}

interface MarcoProps {
  /** Quando a passagem aconteceu. */
  quando: string;
  /** Quem assumiu; `null` enquanto ninguém pegou. */
  para: string | null;
  motivo?: string | null;
  className?: string;
}

/** A linha de largura total que marca, no fio, a troca da IA para uma pessoa. */
export function MarcoDaPassagem({ quando, para, motivo, className }: MarcoProps) {
  const t = useT();
  const locale = useLocaleDeData();
  const hora = format(new Date(quando), "HH:mm", { locale });
  const frase = para
    ? `${t("IA transferiu para")} ${para}`
    : t("IA passou a conversa para a equipe");
  return (
    <div
      data-testid="marco-da-passagem"
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-lg border border-ia/30 bg-ia-fundo px-3 py-2 text-sm",
        className,
      )}
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ia text-bg">
        <Robot size={16} weight="fill" aria-hidden />
      </span>
      <ArrowRight size={16} className="shrink-0 text-text-muted" aria-hidden />
      {para ? (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-[11px] font-semibold text-humano ring-2 ring-humano">
          {iniciaisDe(para)}
        </span>
      ) : null}
      <p className="min-w-0 truncate text-ia">
        <span className="tabular-nums">{hora}</span>
        {" · "}
        {frase}
        {motivo ? (
          <>
            {" · "}
            <span className="text-text-muted">
              {t("motivo")}: {motivo}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}
