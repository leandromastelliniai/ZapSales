/**
 * A DURAÇÃO COMO GENTE FALA: "1 dia", "2 horas", "45 min".
 *
 * O construtor de follow-up guarda tempo em milissegundos e o mostrava em minutos: uma espera
 * de um dia aparecia como "1440 min", e quem configura tinha de fazer a conta de cabeça. Esta
 * função diz o mesmo número na unidade que a pessoa usa. Os campos continuam em minutos (o
 * fio e o motor não mudam); só a leitura passa a ser humana.
 *
 * A regra de unidade é a que o gatilho de retorno já usava (`limiarDaTela`): a MAIOR unidade
 * que divide exato. 1440 vira "1 dia", 90 fica "90 min", 120 vira "2 horas".
 */
import { limiarDaTela } from "./gap-de-retorno";

/** "1 dia", "3 dias", "1 hora", "2 horas", "45 min". `t` traduz as palavras; "min" é sigla e fica. */
export function descreverMinutos(minutos: number, t: (texto: string) => string): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return `0 min`;
  const { valor, unidade } = limiarDaTela(Math.round(minutos));
  if (unidade === "days") return `${valor} ${valor === 1 ? t("dia") : t("dias")}`;
  if (unidade === "hours") return `${valor} ${valor === 1 ? t("hora") : t("horas")}`;
  return `${valor} min`;
}

/** O mesmo, partindo de milissegundos (a unidade do grafo). */
export function descreverMs(ms: number, t: (texto: string) => string): string {
  return descreverMinutos(Math.round(ms / 60_000), t);
}
