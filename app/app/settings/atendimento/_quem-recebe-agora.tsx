"use client";
/**
 * "Quem recebe agora": o que a distribuição entregaria neste instante, no topo da tela.
 *
 * Só mostra o que o sistema já calcula (`lib/routing/situacao-da-distribuicao.ts`, com as
 * regras do próprio roteamento): quantas pessoas podem receber, quem é o próximo da vez,
 * quantos clientes esperam. Sem isto a tela deixava ligar o rodízio sem dizer se ele ia
 * entregar o cliente a alguém, e numa instalação nova (ninguém com plantão configurado)
 * ele não entregava a ninguém.
 */
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import type { EstadoDaPessoa, SituacaoDaDistribuicao } from "@/lib/routing/situacao-da-distribuicao";
import type { RoutingMode } from "@/lib/schemas/routing";
import { ArrowRight, Hourglass, Users } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

const HORARIOS_DA_EQUIPE = "/app/team?aba=atendimento";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "?") + (partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

export function QuemRecebeAgora({
  situacao,
  modo,
}: {
  situacao: SituacaoDaDistribuicao;
  /** O modo SALVO: a faixa descreve o que acontece hoje, não o que está sendo editado. */
  modo: RoutingMode;
}) {
  const t = useT();
  const { pessoas, disponiveis, total, proximoId, fila, esperaMediaSegundos } = situacao;
  const proximo = pessoas.find((p) => p.id === proximoId);

  const motivo: Record<EstadoDaPessoa, string> = {
    disponivel: "",
    lotado: t("lotado"),
    fora_do_horario: t("fora do horário"),
    sem_plantao: t("sem plantão"),
  };

  const espera = Math.round(esperaMediaSegundos / 60);
  const linhaDaFila =
    fila === 0
      ? t("Nenhum cliente esperando na fila agora.")
      : `${fila} ${fila === 1 ? t("cliente na fila agora") : t("clientes na fila agora")}${
          espera >= 1 ? ` · ${t("espera média de")} ${espera} min` : ""
        }.`;

  const linhaDoModo =
    modo === "manual"
      ? t("Em “cada um pega” ninguém recebe sozinho: o primeiro que clicar assume.")
      : proximo
        ? `${modo === "load" ? t("Com “menos conversas”, o próximo cliente vai para") : t("Com o rodízio, o próximo cliente vai para")} ${proximo.nome}.`
        : "";

  return (
    <section aria-label={t("Quem recebe agora")} data-testid="quem-recebe-agora" className="space-y-3">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs md:flex-row md:items-center md:gap-6">
        <div className="md:w-40 md:shrink-0">
          <p className="text-3xl leading-none font-semibold tabular-nums" data-testid="podem-receber">
            {disponiveis} <span className="text-base font-normal text-muted-foreground">{t("de")} {total}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("podem receber agora")}</p>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {pessoas.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label={t("Equipe")}>
              {pessoas.map((p) => {
                const ehProximo = p.id === proximoId;
                return (
                  <li
                    key={p.id}
                    data-testid={`pessoa-${p.id}`}
                    data-estado={p.estado}
                    data-proximo={ehProximo ? "sim" : "nao"}
                    className={cn(
                      "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm",
                      ehProximo ? "border-2 border-ia bg-ia-fundo" : "border-border bg-surface",
                      p.estado !== "disponivel" && "text-muted-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        ehProximo ? "bg-ia text-white" : "bg-surface-elevated",
                      )}
                    >
                      {iniciais(p.nome)}
                    </span>
                    <span>
                      <span className={cn(p.estado === "disponivel" && "text-foreground")}>{p.nome}</span>
                      {ehProximo ? <span className="text-ia"> · {t("próximo da vez")}</span> : null}
                      {p.estado !== "disponivel" ? <span> · {motivo[p.estado]}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <p className="text-sm text-muted-foreground" data-testid="linha-da-fila">
            {linhaDaFila}
            {linhaDoModo ? ` ${linhaDoModo}` : ""}
          </p>
        </div>

        <Link
          href={HORARIOS_DA_EQUIPE}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden md:self-center"
        >
          <Users size={16} aria-hidden />
          {t("Horários da equipe")}
          <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {disponiveis === 0 ? (
        <div
          role="status"
          data-testid="aviso-ninguem-disponivel"
          className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm"
        >
          <Hourglass size={20} aria-hidden className="mt-0.5 shrink-0 text-warning-fg" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {total === 0
                ? t("Ninguém da equipe pode receber atendimento ainda.")
                : t("Ninguém pode receber um cliente novo agora.")}
            </p>
            <p className="text-muted-foreground">
              {t(
                "Os clientes novos ficam na fila e o agente de IA avisa que a equipe responde assim que possível. Cada pessoa define o próprio plantão, o horário e quantas conversas aguenta em",
              )}{" "}
              {t("Equipe › Atendimento")}.
            </p>
            <Link
              href={HORARIOS_DA_EQUIPE}
              data-testid="definir-horarios"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-warning/40 bg-surface px-3 text-sm font-medium transition-colors hover:border-foreground/50 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden"
            >
              {t("Definir os horários da equipe")}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
