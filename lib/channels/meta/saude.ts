/**
 * Regras PURAS da saúde do número oficial (issue #5) — sem banco, sem rede, para
 * o parser do webhook (`./webhook.ts`, puro por contrato) poder usá-las.
 *
 * O vocabulário é da META e ela o estende quando quer: qualidade `GREEN`,
 * `YELLOW`, `RED` (e `NA`/`UNKNOWN` quando não sabe); limite do portfólio
 * `TIER_50` … `TIER_UNLIMITED`. Valor desconhecido NÃO é erro — é "não sei", e
 * "não sei" nunca dispara aviso.
 */
import { preencher } from "@/lib/i18n/aviso-no-idioma";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMAS, type Idioma } from "@/lib/i18n/idiomas";

/** Ordem da qualidade: maior é melhor. `null` = não sei. */
const ORDEM_DA_QUALIDADE: Record<string, number> = { RED: 1, YELLOW: 2, GREEN: 3 };

/** As faixas conhecidas em número de conversas por dia (-1 = ilimitado). */
const FAIXA_POR_NUMERO: Record<number, string> = {
  50: "TIER_50",
  250: "TIER_250",
  1000: "TIER_1K",
  2000: "TIER_2K",
  10000: "TIER_10K",
  100000: "TIER_100K",
  [-1]: "TIER_UNLIMITED",
};

/**
 * O limite do portfólio no vocabulário de faixa, venha como vier.
 *
 * A documentação da Meta descreve `max_daily_conversations_per_business` como
 * faixa (`TIER_2K`) e mostra no exemplo um número (2000) — então os dois valem.
 * Número fora das faixas vira `TIER_<n>`: perder o valor seria pior que um rótulo
 * que a tela não conhece.
 */
export function limiteDoPortfolio(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return FAIXA_POR_NUMERO[valor] ?? `TIER_${Math.trunc(valor)}`;
  }
  if (typeof valor === "string") {
    const t = valor.trim().toUpperCase();
    if (!t) return null;
    if (/^-?\d+$/.test(t)) return limiteDoPortfolio(Number(t));
    return t;
  }
  return null;
}

/** Conversas por dia da faixa, para comparar. `null` = faixa que não se mede. */
export function tamanhoDoLimite(faixa: string | null): number | null {
  if (!faixa) return null;
  if (faixa === "TIER_UNLIMITED") return Number.POSITIVE_INFINITY;
  const m = /^TIER_(\d+)(K)?$/.exec(faixa);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

/** O número como o operador o reconhece nos avisos: apelido + telefone. */
export function apelidoDoNumero(n: { display_name: string | null; phone_number: string | null }): string {
  return [n.display_name, n.phone_number].filter(Boolean).join(" ") || "oficial";
}

/** A qualidade é vermelha? É o que pausa as campanhas do número (issue #9). */
export function ehQualidadeVermelha(q: string | null | undefined): boolean {
  return (q ?? "").trim().toUpperCase() === "RED";
}

function ordemDaQualidade(q: string | null): number | null {
  return q ? (ORDEM_DA_QUALIDADE[q.toUpperCase()] ?? null) : null;
}

export interface EstadoDeSaude {
  qualidade: string | null;
  limite: string | null;
}

/**
 * O começo do título do aviso de QUALIDADE. `agent_inbox_items` não tem coluna
 * de subtipo, e o `kind` (`channel_number_alert`) é o mesmo dos avisos de
 * conexão: quem fecha o aviso quando a qualidade volta precisa achar só os
 * de qualidade, e acha por este prefixo — a mesma constante de quem abre.
 */
export const PREFIXO_DO_AVISO_DE_QUALIDADE = "A qualidade do número ";

/**
 * O mesmo começo em TODO idioma visível — o aviso nasce no idioma da
 * organização, e quem o fecha precisa achá-lo em qualquer um (inclusive no
 * idioma de antes de alguém trocá-lo). Sai da própria frase traduzida, então a
 * tradução não tem como divergir do prefixo.
 */
export const PREFIXOS_DO_AVISO_DE_QUALIDADE: readonly string[] = [
  ...new Set(
    IDIOMAS.map(
      (idioma) => traduzir("A qualidade do número {apelido} caiu para vermelha", idioma).split("{apelido}")[0] ?? "",
    ).filter(Boolean),
  ),
];

export interface AvisoDeSaude {
  severity: "warn" | "critical";
  title: string;
  body: string;
}

/**
 * A mudança merece aviso? Só a QUEDA: qualidade que piora ou limite que encolhe.
 *
 * Melhora, igualdade e "não sei" ficam calados — avisar a cada evento da Meta
 * transformaria a Central numa lista do mesmo assunto, e é assim que se aprende
 * a ignorá-la. Vermelho é crítico porque é o passo antes de a Meta restringir o
 * número; amarelo é atenção.
 */
export function avisoDeSaude(
  antes: EstadoDeSaude,
  depois: EstadoDeSaude,
  apelido: string,
  idioma: Idioma = "pt-BR",
): AvisoDeSaude | null {
  const t = (texto: string) => traduzir(texto, idioma);
  const qAntes = ordemDaQualidade(antes.qualidade);
  const qDepois = ordemDaQualidade(depois.qualidade);
  if (qDepois !== null && qDepois < (qAntes ?? Number.POSITIVE_INFINITY) && qDepois < 3) {
    const vermelha = qDepois === 1;
    return {
      severity: vermelha ? "critical" : "warn",
      title: preencher(
        vermelha
          ? t("A qualidade do número {apelido} caiu para vermelha")
          : t("A qualidade do número {apelido} caiu para amarela"),
        { apelido },
      ),
      body: vermelha
        ? t(
            "A Meta está recebendo bloqueios e denúncias deste número. Pause disparos de marketing e revise o conteúdo e o público — se a qualidade continuar baixa, a Meta reduz o limite ou restringe o número.",
          )
        : t(
            "Os clientes começaram a bloquear ou denunciar as mensagens deste número. Revise o conteúdo e o público dos disparos antes que a qualidade fique vermelha.",
          ),
    };
  }

  const lAntes = tamanhoDoLimite(antes.limite);
  const lDepois = tamanhoDoLimite(depois.limite);
  if (lAntes !== null && lDepois !== null && lDepois < lAntes) {
    return {
      severity: "warn",
      title: preencher(t("O limite de mensagens do número {apelido} diminuiu"), { apelido }),
      body: preencher(
        t(
          "A Meta reduziu o limite diário do portfólio de {antes} para {depois}. Campanhas acima desse volume vão esperar o dia seguinte.",
        ),
        { antes: String(antes.limite), depois: String(depois.limite) },
      ),
    };
  }
  return null;
}
