/**
 * O RESUMO DO USO DE IA — as contas da faixa no alto de Uso de IA, sobre o `BudgetStatus` que a tela
 * já lê (a mesma régua que decide se a IA para: `fn_gasto_de_ia_do_mes`).
 *
 * Puro de propósito, e sem regra nova: nenhum limite aqui é inventado. O que "pede atenção" é o que o
 * próprio orçamento já trata como evento — a IA parada, o limite alcançado, o aviso (limiar escolhido
 * pela empresa) e a medição incompleta.
 *
 * ⚠️ SEM LIMITE É `info`, NÃO `atencao`. A empresa pode querer acompanhar sem teto, e o cartão de
 * orçamento já diz "a IA não vai parar sozinha por gasto". A faixa só RECOMENDA definir um (com o
 * motivo), e só a quem pode editar.
 *
 * ⚠️ MEDIÇÃO INCOMPLETA PEDE ATENÇÃO: o gasto mostrado é MENOR que o real, e a parada no limite pode não
 * acontecer. "US$ 0,00 gastos" nessa situação seria o número errado dito com confiança.
 */
import type { ChaveDeOrcamento, ModoDeOrcamento } from "@/lib/agent-engine/edge/llm/orcamento";

export interface EntradaDoUso {
  monthly_limit_cents: number;
  current_month_consumed_cents: number;
  pct: number;
  alarm_threshold_pct: number;
  enforcement_mode: ModoDeOrcamento;
  enforcement_env: ChaveDeOrcamento;
  blocked_now: boolean;
  gasto_incompleto: boolean;
}

export type IdDaConferenciaDoUso = "parada" | "limite" | "medicao" | "protecao";

export interface ConferenciaDoUso {
  id: IdDaConferenciaDoUso;
  estado: "ok" | "atencao" | "info";
  motivo: string;
  /** Porcentagem ou limiar, quando o texto a cita. */
  valor?: number;
}

/** Como a proteção está de fato: o que a empresa escolheu, limitado pelo que a instalação deixa valer. */
export type ProtecaoEfetiva = "sem_limite" | "so_acompanha" | "avisa" | "para" | "desligada_na_instalacao" | "so_avisa_na_instalacao";

export interface ResumoDoUso {
  gastoCents: number;
  limiteCents: number;
  temLimite: boolean;
  pct: number;
  protecao: ProtecaoEfetiva;
  medicaoCompleta: boolean;
  conferencias: ConferenciaDoUso[];
}

export function protecaoEfetiva(e: EntradaDoUso): ProtecaoEfetiva {
  if (e.monthly_limit_cents <= 0) return "sem_limite";
  // A chave da INSTALAÇÃO vale por cima do que a empresa escolheu aqui.
  if (e.enforcement_env === "off") return "desligada_na_instalacao";
  if (e.enforcement_mode === "bloquear") return e.enforcement_env === "avisar" ? "so_avisa_na_instalacao" : "para";
  if (e.enforcement_mode === "avisar") return "avisa";
  return "so_acompanha";
}

export function resumoDoUso(e: EntradaDoUso): ResumoDoUso {
  const temLimite = e.monthly_limit_cents > 0;
  const protecao = protecaoEfetiva(e);
  const conferencias: ConferenciaDoUso[] = [];

  conferencias.push(
    e.blocked_now
      ? { id: "parada", estado: "atencao", motivo: "ia_parada" }
      : { id: "parada", estado: "ok", motivo: "ia_respondendo" },
  );

  if (!temLimite) {
    conferencias.push({ id: "limite", estado: "info", motivo: "sem_limite" });
  } else if (e.pct >= 100) {
    conferencias.push({ id: "limite", estado: "atencao", motivo: "passou_do_limite", valor: Math.round(e.pct) });
  } else if (e.pct >= e.alarm_threshold_pct) {
    conferencias.push({ id: "limite", estado: "atencao", motivo: "perto_do_limite", valor: Math.round(e.pct) });
  } else {
    conferencias.push({ id: "limite", estado: "ok", motivo: "dentro_do_limite", valor: Math.round(e.pct) });
  }

  conferencias.push(
    e.gasto_incompleto
      ? { id: "medicao", estado: "atencao", motivo: "medicao_incompleta" }
      : { id: "medicao", estado: "ok", motivo: "medicao_completa" },
  );

  if (protecao === "desligada_na_instalacao") {
    conferencias.push({ id: "protecao", estado: "info", motivo: "desligada_na_instalacao" });
  } else if (protecao === "so_avisa_na_instalacao") {
    conferencias.push({ id: "protecao", estado: "info", motivo: "so_avisa_na_instalacao" });
  }

  return {
    gastoCents: e.current_month_consumed_cents,
    limiteCents: e.monthly_limit_cents,
    temLimite,
    pct: e.pct,
    protecao,
    medicaoCompleta: !e.gasto_incompleto,
    conferencias,
  };
}

export function contarAtencaoDoUso(conferencias: readonly ConferenciaDoUso[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

/** A recomendação: definir um limite mensal. Só quando não há limite e quem lê pode editá-lo. */
export function recomendarLimite(resumo: ResumoDoUso, podeEditar: boolean): boolean {
  return !resumo.temLimite && podeEditar;
}
