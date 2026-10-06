/**
 * O LIMITE DO PORTFÓLIO — quem divide o limite diário com o número da campanha,
 * e qual é o teto (issue #9). Puro: o motor lê os números, isto decide.
 *
 * Desde 2025 o limite de mensagens da Meta é do PORTFÓLIO de negócio,
 * compartilhado por todos os números de todas as WABAs dele: rodar números não
 * multiplica o limite, e duas campanhas em números diferentes do mesmo
 * portfólio, somadas, não podem passar dele. A Meta conta CONTATOS ÚNICOS
 * alcançados por modelo em 24 h móveis — a conta mora no banco
 * (`fn_portfolio_contatos_alcancados`, 0539), junto da reserva.
 *
 * ─── Por que o grupo cruza organizações ─────────────────────────────────────
 *
 * Uma organização tem UM número oficial (`conectarNumeroOficial` atualiza a
 * linha que existe). Dois números do mesmo portfólio na mesma instalação são,
 * então, de organizações diferentes — a agência que atende duas marcas do mesmo
 * dono, por exemplo. O limite é da Meta, não do tenant: quem não somar os dois
 * lados estoura o limite pelos dois. O que cruza a fronteira é só contagem e
 * faixa; nenhum contato, texto ou campanha da outra organização.
 *
 * ─── Quando não se sabe ─────────────────────────────────────────────────────
 *
 * O portfólio vem da WABA na conexão (`meta_portfolio_id`) e pode faltar
 * (número conectado antes, Graph que não respondeu). O motor tenta descobri-lo
 * antes de contar (`lib/channels/meta/portfolio-do-numero.ts`); enquanto falta,
 * o número divide o limite com o que se sabe que PODE ser do mesmo portfólio:
 * os números oficiais da mesma organização e os da mesma WABA (a WABA é de um
 * portfólio só). Isso erra para menos DENTRO da organização; entre organizações
 * de WABAs diferentes, só o portfólio conhecido junta — por isso a descoberta.
 * A faixa que falta vale a INICIAL da Meta.
 */
import { tamanhoDoLimite } from "@/lib/channels/meta/saude";

/** A faixa com que a Meta começa um portfólio novo (TIER_250). */
export const LIMITE_QUANDO_NAO_SE_SABE = 250;

export interface NumeroDoPortfolio {
  id: string;
  organization_id: string;
  meta_waba_id: string | null;
  meta_portfolio_id: string | null;
  meta_limite_de_mensagens: string | null;
}

export interface PortfolioDoNumero {
  /** Os números (inclusive o da campanha) cujos envios contam no mesmo limite. */
  sessoes: string[];
  /** Contatos únicos por 24 h. `Infinity` = ilimitado. */
  teto: number;
  /** A faixa que deu o teto (`TIER_2K`), ou `null` quando valeu a inicial. */
  limite: string | null;
}

/** `n` pode ser do mesmo portfólio de `alvo`, pelo que se sabe dos dois? */
function mesmoPortfolio(alvo: NumeroDoPortfolio, n: NumeroDoPortfolio): boolean {
  if (n.id === alvo.id) return true;
  if (alvo.meta_portfolio_id && n.meta_portfolio_id) return n.meta_portfolio_id === alvo.meta_portfolio_id;
  // Um dos dois sem portfólio conhecido: o que se sabe é a organização e a WABA.
  return (
    n.organization_id === alvo.organization_id ||
    (!!alvo.meta_waba_id && n.meta_waba_id === alvo.meta_waba_id)
  );
}

/**
 * O portfólio do número `numeroId` entre os números oficiais da instalação que
 * podem dividir o limite com ele.
 */
export function portfolioDoNumero(numeros: readonly NumeroDoPortfolio[], numeroId: string): PortfolioDoNumero {
  const alvo = numeros.find((n) => n.id === numeroId);
  if (!alvo) return { sessoes: [numeroId], teto: LIMITE_QUANDO_NAO_SE_SABE, limite: null };

  const grupo = numeros.filter((n) => mesmoPortfolio(alvo, n));

  let teto = Number.POSITIVE_INFINITY;
  let limite: string | null = null;
  for (const n of grupo) {
    const tamanho = tamanhoDoLimite(n.meta_limite_de_mensagens);
    if (tamanho === null) continue;
    if (limite === null || tamanho < teto) {
      teto = tamanho;
      limite = n.meta_limite_de_mensagens;
    }
  }

  return {
    sessoes: grupo.map((n) => n.id),
    teto: limite === null ? LIMITE_QUANDO_NAO_SE_SABE : teto,
    limite,
  };
}
