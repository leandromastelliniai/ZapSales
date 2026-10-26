/**
 * OS TEMPOS QUE OS MODELOS PRONTOS JÁ USAM — a fonte dos "exemplos" do construtor.
 *
 * Quem configura uma espera não sabe quanto esperar entre uma mensagem e outra. Em vez de
 * inventar uma recomendação, o construtor mostra o que os modelos prontos do próprio produto
 * escolheram (clínica: consulta, exame, cirurgia, falta), com o nome da jornada. Derivado do
 * grafo de cada modelo em tempo de execução: um número copiado aqui envelheceria no dia em
 * que alguém mudasse um prazo do modelo.
 */
import { MODELOS_DE_FOLLOWUP } from "./index";

export interface EsperaDeModelo {
  minutos: number;
  /** A jornada do primeiro modelo que usa esse tempo ("Exame", "Cirurgia"…). */
  jornada: string;
}

function todas(): EsperaDeModelo[] {
  const porMinutos = new Map<number, string>();
  for (const modelo of MODELOS_DE_FOLLOWUP) {
    for (const no of modelo.grafo.nodes) {
      if (no.type !== "wait" || no.config.mode !== "fixed") continue;
      const minutos = Math.round(no.config.duration_ms / 60_000);
      if (!porMinutos.has(minutos)) porMinutos.set(minutos, modelo.jornada);
    }
  }
  return [...porMinutos].map(([minutos, jornada]) => ({ minutos, jornada })).sort((a, b) => a.minutos - b.minutos);
}

/**
 * Até 4 exemplos, espalhados do menor ao maior tempo usado pelos modelos (não os 4 menores:
 * quem decide algo grande, como uma cirurgia, espera semanas, e isso também é um exemplo).
 */
export function esperasDeExemplo(): EsperaDeModelo[] {
  const lista = todas();
  if (lista.length <= 4) return lista;
  const n = lista.length;
  const indices = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  return indices.map((i) => lista[i]!);
}

/** Os tempos de silêncio (gatilho) que os modelos usam, para o campo de silêncio. */
export function silenciosDeExemplo(): EsperaDeModelo[] {
  const porMinutos = new Map<number, string>();
  for (const modelo of MODELOS_DE_FOLLOWUP) {
    const cfg = modelo.gatilho({}) as { kind?: string; params?: { threshold_minutes?: number } };
    if (cfg.kind !== "silence") continue;
    const minutos = cfg.params?.threshold_minutes;
    if (typeof minutos === "number" && !porMinutos.has(minutos)) porMinutos.set(minutos, modelo.jornada);
  }
  return [...porMinutos].map(([minutos, jornada]) => ({ minutos, jornada })).sort((a, b) => a.minutos - b.minutos);
}
