/**
 * Como a tela FALA da saúde e do uso de um número oficial (issue #5).
 *
 * O vocabulário que chega é o da Meta (`GREEN`, `TIER_2K`); quem administra lê
 * "Verde" e "até 2.000 conversas por dia". Valor que a Meta inventar depois cai
 * no rótulo cru em vez de sumir — a tela nunca esconde o que não entende.
 */
import type { UsoDoNumero } from "@/lib/channels/uso";

type T = (texto: string) => string;

export function rotuloDaQualidade(q: string | null | undefined, t: T): string {
  switch ((q ?? "").toUpperCase()) {
    case "GREEN":
      return t("Verde");
    case "YELLOW":
      return t("Amarela");
    case "RED":
      return t("Vermelha");
    case "":
    case "NA":
    case "UNKNOWN":
      return t("Sem avaliação");
    default:
      return q ?? "";
  }
}

/** Classes do selo de qualidade, pelos tokens de estado do tema. */
export function corDaQualidade(q: string | null | undefined): string {
  switch ((q ?? "").toUpperCase()) {
    case "GREEN":
      return "border-success/40 bg-success-bg text-success-fg";
    case "YELLOW":
      return "border-warning/40 bg-warning-bg text-warning-fg";
    case "RED":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    default:
      return "";
  }
}

const CONVERSAS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_2K: 2000,
  TIER_10K: 10000,
  TIER_100K: 100000,
};

export function rotuloDoLimite(limite: string | null | undefined, t: T, idioma = "pt-BR"): string {
  if (!limite) return t("Não informado");
  if (limite === "TIER_UNLIMITED") return t("Ilimitado");
  const n = CONVERSAS[limite] ?? (/^TIER_(\d+)$/.exec(limite) ? Number(/^TIER_(\d+)$/.exec(limite)![1]) : null);
  if (n === null) return limite;
  return `${t("até")} ${n.toLocaleString(idioma)} ${t("conversas por dia")}`;
}

export const USOS_NA_TELA: ReadonlyArray<{ valor: UsoDoNumero; rotulo: string; descricao: string }> = [
  {
    valor: "atendimento",
    rotulo: "Atendimento",
    descricao: "Receber e responder clientes, com a equipe e os agentes de IA.",
  },
  {
    valor: "campanha",
    rotulo: "Campanha",
    descricao: "Disparos em massa com modelos aprovados pela Meta.",
  },
  {
    valor: "ambos",
    rotulo: "Ambos",
    descricao: "Atender e disparar pelo mesmo número.",
  },
];

export function rotuloDoUso(uso: UsoDoNumero | null | undefined, t: T): string {
  const achado = USOS_NA_TELA.find((u) => u.valor === uso);
  return achado ? t(achado.rotulo) : t("Não declarado");
}
