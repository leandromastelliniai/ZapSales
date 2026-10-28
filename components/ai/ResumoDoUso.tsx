"use client";
/**
 * "Seu uso de IA" e "Está tudo certo?", numa faixa no alto de Uso de IA.
 *
 * Quatro respostas antes do cartão de orçamento — quanto se gastou no mês, qual é o limite, como a
 * proteção está de fato e se a medição está completa. As contas são do produto
 * (`lib/ai/budget/resumo-do-uso.ts`) sobre o MESMO `BudgetStatus` do cartão abaixo (mesma query, então a
 * faixa acompanha quando o administrador edita o limite). A faixa só lê e nunca grava; a única
 * recomendação (definir um limite) vem com o motivo e só para quem pode editá-lo.
 */
import Link from "next/link";

import { FaixaDeResumo, type CelulaDaFaixa, type ConferenciaDaFaixa } from "@/components/guia/FaixaDeResumo";
import { FaixaRecomendada } from "@/components/guia/FaixaRecomendada";
import { useAiBudget, type BudgetStatus } from "@/hooks/ai/useAiBudget";
import { useT } from "@/hooks/i18n/useT";
import {
  recomendarLimite,
  resumoDoUso,
  type ConferenciaDoUso,
  type ProtecaoEfetiva,
} from "@/lib/ai/budget/resumo-do-uso";

// DÓLAR: `cost_cents` vem de `llm_calls`, gravado em centavo de USD (mesma moeda do cartão abaixo).
const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

export function ResumoDoUso({ initialData, isAdmin }: { initialData: BudgetStatus; isAdmin: boolean }) {
  const t = useT();
  const q = useAiBudget({ initialData });
  const status = q.data ?? initialData;
  const resumo = resumoDoUso(status);

  const protecao = textosDaProtecao(resumo.protecao, status.alarm_threshold_pct, t);
  const celulas: CelulaDaFaixa[] = [
    {
      id: "gasto",
      titulo: t("Gasto do mês"),
      texto: usd.format(resumo.gastoCents / 100),
      sub: resumo.medicaoCompleta ? t("valores em dólar") : t("o gasto real é maior que este"),
      destaque: !resumo.medicaoCompleta,
    },
    {
      id: "limite",
      titulo: t("Limite do mês"),
      texto: resumo.temLimite ? usd.format(resumo.limiteCents / 100) : t("sem limite"),
      sub: resumo.temLimite ? `${Math.round(resumo.pct)}% ${t("usado")}` : t("a IA não para por gasto"),
      destaque: resumo.temLimite && resumo.conferencias.some((c) => c.id === "limite" && c.estado === "atencao"),
    },
    { id: "protecao", titulo: t("Proteção de gasto"), texto: protecao.titulo, sub: protecao.sub },
    {
      id: "medicao",
      titulo: t("Medição do gasto"),
      texto: resumo.medicaoCompleta ? t("Completa") : t("Incompleta"),
      sub: resumo.medicaoCompleta ? t("todo o gasto teve preço") : t("falta o preço de um modelo"),
      destaque: !resumo.medicaoCompleta,
    },
  ];

  const conferencias: ConferenciaDaFaixa[] = resumo.conferencias.map((c) => ({
    id: c.id,
    estado: c.estado,
    texto: textoDaConferencia(c, t),
  }));

  return (
    <div className="grid gap-3">
      <FaixaDeResumo rotulo={t("Seu uso de IA")} prefixo="uso" celulas={celulas} conferencias={conferencias} />
      {recomendarLimite(resumo, isAdmin) && (
        <FaixaRecomendada testId="uso-recomenda-limite">
          {t(
            "defina um limite mensal em Editar limite. Motivo: sem limite a IA continua respondendo mesmo se o gasto disparar; com ele você é avisado ao passar do ponto escolhido e, se quiser, a IA para.",
          )}
        </FaixaRecomendada>
      )}
      {!isAdmin && !resumo.temLimite && (
        <p className="text-xs text-muted-foreground">
          {t("Só um administrador define o limite. Se quiser um teto de gasto, peça a ele.")}{" "}
          <Link href="/app/team" className="underline underline-offset-2">
            {t("Ver a equipe")}
          </Link>
        </p>
      )}
    </div>
  );
}

function textosDaProtecao(
  p: ProtecaoEfetiva,
  limiar: number,
  t: (s: string) => string,
): { titulo: string; sub: string } {
  switch (p) {
    case "sem_limite":
      return { titulo: t("Nenhuma"), sub: t("não há limite definido") };
    case "so_acompanha":
      return { titulo: t("Só acompanha"), sub: t("a IA não para nem avisa") };
    case "avisa":
      return { titulo: t("Avisa"), sub: `${t("ao passar de")} ${limiar}%` };
    case "para":
      return { titulo: t("Para a IA"), sub: t("ao chegar no limite") };
    case "desligada_na_instalacao":
      return { titulo: t("Desligada"), sub: t("pela instalação") };
    case "so_avisa_na_instalacao":
      return { titulo: t("Só avisa"), sub: t("pela instalação") };
  }
}

function textoDaConferencia(c: ConferenciaDoUso, t: (s: string) => string): string {
  const v = c.valor ?? 0;
  switch (c.motivo) {
    case "ia_parada":
      return t(
        "A IA está parada por gasto: chegou ao limite do mês, e as conversas em andamento foram para a fila de atendimento humano. Um administrador pode aumentar o limite em Editar limite.",
      );
    case "ia_respondendo":
      return t("A IA não está parada por gasto.");
    case "sem_limite":
      return t(
        "Não há limite mensal: a IA não vai parar sozinha por gasto. É escolha sua — se quiser um teto, um administrador define em Editar limite.",
      );
    case "passou_do_limite":
      return `${t("O gasto passou do limite do mês:")} ${v}%.`;
    case "perto_do_limite":
      return `${t("O gasto já usou")} ${v}% ${t("do limite do mês, acima do ponto de aviso.")}`;
    case "dentro_do_limite":
      return `${t("O gasto usou")} ${v}% ${t("do limite do mês, abaixo do ponto de aviso.")}`;
    case "medicao_incompleta":
      return t(
        "Parte do gasto não entra na conta: o produto ainda não sabe o preço de um modelo em uso, então o número é menor que o real. Acompanhe também no painel do seu provedor de IA.",
      );
    case "medicao_completa":
      return t("Todo o gasto do mês teve o preço calculado.");
    case "desligada_na_instalacao":
      return t(
        "A proteção de gasto está desligada nesta instalação: o que for escolhido em Editar limite não vale até alguém religar no Admin.",
      );
    case "so_avisa_na_instalacao":
      return t(
        "Nesta instalação a proteção só avisa: mesmo com “Parar a IA” escolhido, a IA continua respondendo.",
      );
    default:
      return c.motivo;
  }
}
