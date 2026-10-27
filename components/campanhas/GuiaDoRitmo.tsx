"use client";
/**
 * O guia do bloco "Ritmo desta campanha": o que o número já faz sozinho, a recomendação com o
 * MOTIVO e os avisos do que foi digitado. Os campos continuam onde estavam (mesmos ids e rótulos);
 * isto só ensina a ler o bloco antes de preenchê-lo.
 *
 * As contas (`lib/campanhas/resumo-do-disparo.ts`) leem as regras do motor de envio: a campanha só
 * sabe ir mais devagar que o número, o aquecimento sobe com a idade dele e a API Oficial não passa
 * por intervalo nem aquecimento — quem manda ali é o limite da Meta e o teto de gasto.
 */
import { FaixaRecomendada } from "@/components/guia/FaixaRecomendada";
import { useT } from "@/hooks/i18n/useT";
import type {
  AvisoDeRitmo,
  RecomendacaoDeRitmo,
  RitmoDoNumero,
} from "@/lib/campanhas/resumo-do-disparo";
import { Warning } from "@/lib/ui/icons";

interface Props {
  oficial: boolean;
  /** `null` = o ritmo do número não pôde ser lido: o guia some, os campos seguem. */
  numero: RitmoDoNumero | null;
  recomendacao: RecomendacaoDeRitmo | null;
  avisos: AvisoDeRitmo[];
}

function hora(h: number): string {
  return `${h}h`;
}

/** 1,2 vira "1,2 s"; 2 vira "2 s". */
function segundos(s: number): string {
  return `${String(Math.round(s * 10) / 10).replace(".", ",")} s`;
}

export function GuiaDoRitmo({ oficial, numero, recomendacao, avisos }: Props) {
  const t = useT();
  if (!numero || !recomendacao) return null;

  const partes: string[] = [`${t("horário de envio")} ${hora(numero.janelaInicioHora)}–${hora(numero.janelaFimHora)}`];
  partes.push(numero.domingoLiberado ? t("domingo liberado") : t("sem domingo"));
  if (!oficial) {
    partes.unshift(`${t("intervalo mínimo entre mensagens")} ${segundos(numero.intervaloSegundos)}`);
    if (recomendacao.tipo === "aquecimento") {
      partes.push(`${t("aquecimento hoje")}: ${recomendacao.hoje} ${t("por dia")}`);
    }
    if (numero.limiteDiario !== null) partes.push(`${t("limite do número")}: ${numero.limiteDiario} ${t("por dia")}`);
  }

  return (
    <div className="space-y-3" data-testid="guia-do-ritmo">
      <p className="text-sm" data-testid="ritmo-do-numero">
        <strong className="font-medium">{t("Sem mexer em nada, o número já faz isto:")}</strong> {partes.join(" · ")}.
      </p>

      <FaixaRecomendada testId="recomendacao-do-ritmo">
        <RecomendacaoTexto r={recomendacao} />
      </FaixaRecomendada>

      {avisos.length > 0 && (
        <ul className="space-y-1" data-testid="avisos-do-ritmo">
          {avisos.map((a) => (
            <li key={a.id} data-aviso={a.id} className="flex items-start gap-2 text-sm text-warning-fg">
              <Warning size={16} weight="fill" aria-hidden className="mt-0.5 shrink-0" />
              <span>{textoDoAviso(a, t)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecomendacaoTexto({ r }: { r: RecomendacaoDeRitmo }) {
  const t = useT();
  switch (r.tipo) {
    case "oficial":
      return r.temTetoDeGasto ? (
        <>
          {t("deixe o ritmo em branco. O teto de gasto já protege o bolso e pausa a campanha sozinho; quem controla quantas pessoas novas por dia é a Meta, pelo limite do seu portfólio.")}
        </>
      ) : (
        <>
          {t("defina um teto de gasto, logo abaixo. Na API Oficial a Meta cobra por mensagem, e o teto pausa a campanha sozinho ao chegar nele, em vez de você descobrir o valor na fatura.")}
        </>
      );
    case "aquecimento":
      return (
        <>
          {`${t("deixe o ritmo em branco. O número é novo e o aquecimento já limita a")} ${r.hoje} ${t("por dia")}`}
          {r.proximo
            ? ` (${t("sobe para")} ${r.proximo.cap ?? t("sem teto")} ${t("em")} ${r.proximo.emDias} ${r.proximo.emDias === 1 ? t("dia") : t("dias")})`
            : ""}
          {". "}
          {t("Motivo: número novo que dispara muito para quem nunca falou com você é o jeito mais rápido de ser banido, e número banido não volta.")}
        </>
      );
    case "formado":
      return (
        <>
          {t("deixe em branco para usar o ritmo do número. Se a lista é de gente que nunca falou com você, ponha um Máximo por dia baixo. Motivo: lista fria disparada de uma vez é o padrão que o WhatsApp bane.")}
        </>
      );
  }
}

function textoDoAviso(a: AvisoDeRitmo, t: (s: string) => string): string {
  switch (a.id) {
    case "janela_invalida":
      return t("O horário não fecha: a hora de parar precisa ser depois da hora de começar.");
    case "teto_acima_do_numero":
      return `${t("O limite do número é")} ${a.limite} ${t("por dia")}: ${t("um Máximo por dia maior que isso não faz a campanha mandar mais.")}`;
    case "intervalo_abaixo_do_numero":
      return `${t("O número já espera")} ${segundos(a.minimo)} ${t("entre mensagens")}: ${t("um intervalo menor que isso não muda nada, a campanha só pode ir mais devagar.")}`;
  }
}
