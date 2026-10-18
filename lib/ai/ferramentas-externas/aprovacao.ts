/**
 * As REGRAS PURAS da aprovação de ações externas (issue #95, parte da #86).
 *
 * Nada aqui toca banco, rede ou relógio de parede: é a decisão «pede aprovação?», o
 * resumo dos dados sem segredos, a impressão digital da chamada e o que o AGENTE lê
 * sobre cada estado do pedido. O resto (gravar, executar, avisar) está em
 * `pedidos-*.ts`; ter as regras separadas é o que permite exercitá-las sem rede.
 *
 * Client-safe: nenhum import de servidor (a impressão digital, que usa `node:crypto`, mora em
 * `impressao-digital.ts`).
 */
import type { EfeitoDaFerramenta, EstadoDoPedido } from "./tipos";

/** Em que situação o turno roda: ao vivo, ou como rascunho do modo Assistido. */
export type ModoDoTurnoExterno = "ao_vivo" | "assistido";

export type PorQuePede = "modo_assistido" | "chave_da_ferramenta" | "padrao_do_efeito";

export type DecisaoDeAprovacao = { pede: true; porque: PorQuePede } | { pede: false; porque: null };

/**
 * A pergunta central: esta chamada espera um humano?
 *
 *  1. Modo Assistido: SIM, sempre — «toda ferramenta externa espera aprovação,
 *     independentemente da chave». A chave não é consultada: quem opera o agente em
 *     modo Assistido decidiu que nada sai sem olho humano.
 *  2. Chave explícita (`true`/`false`): vale o que a pessoa que cadastrou escolheu.
 *  3. Chave nunca tocada (`null`): o padrão do efeito — altera pede, consulta não.
 *
 * O padrão seguro mora no `null`, e não numa coluna com `default`: uma linha escrita por
 * fora da tela, sem a chave, continua pedindo aprovação quando altera.
 */
export function decidirSePedeAprovacao(entrada: {
  effect: EfeitoDaFerramenta;
  requireApproval: boolean | null;
  modo: ModoDoTurnoExterno;
}): DecisaoDeAprovacao {
  if (entrada.modo === "assistido") return { pede: true, porque: "modo_assistido" };
  if (entrada.requireApproval === true) return { pede: true, porque: "chave_da_ferramenta" };
  if (entrada.requireApproval === false) return { pede: false, porque: null };
  return entrada.effect === "altera" ? { pede: true, porque: "padrao_do_efeito" } : { pede: false, porque: null };
}

const CAMPO_QUE_PARECE_SEGREDO = /senha|password|passwd|token|secret|segredo|chave|apikey|api_key|authorization/i;
const LIMITE_DO_VALOR = 80;

export interface LinhaDoResumo {
  campo: string;
  valor: string;
}

/**
 * O que a Central e a auditoria mostram dos dados que o agente preencheu: «campo: valor»,
 * valor cortado em 80 caracteres e valor de campo com cara de segredo substituído por «•••».
 *
 * É um RESUMO, não uma cópia: o pedido guarda os dados inteiros (precisa deles para
 * executar), mas o que viaja para a tela de avisos e para o log de auditoria é isto.
 */
export function resumoDosDados(argumentos: Record<string, unknown>): LinhaDoResumo[] {
  const linhas: LinhaDoResumo[] = [];
  for (const [campo, bruto] of Object.entries(argumentos)) {
    if (bruto === undefined || bruto === null) continue;
    let valor: string;
    if (CAMPO_QUE_PARECE_SEGREDO.test(campo)) valor = "•••";
    else if (typeof bruto === "boolean") valor = bruto ? "sim" : "não";
    else valor = String(bruto);
    if (valor.length > LIMITE_DO_VALOR) valor = `${valor.slice(0, LIMITE_DO_VALOR)}…`;
    linhas.push({ campo, valor });
  }
  return linhas;
}

/** O resumo numa linha, para o corpo do aviso e para a auditoria. */
export function resumoEmTexto(argumentos: Record<string, unknown>): string {
  const linhas = resumoDosDados(argumentos);
  return linhas.length === 0 ? "(sem dados)" : linhas.map((l) => `${l.campo}: ${l.valor}`).join("; ");
}

/**
 * O estado que vale AGORA. Pendente com prazo vencido já é expirado — o cron só põe o
 * carimbo, e entre o vencimento e a rodada dele nem a tela nem o agente podem tratar o
 * pedido como vivo (aprovar um pedido vencido está fora de questão).
 */
export function estadoEfetivoDoPedido(
  pedido: { status: EstadoDoPedido; expires_at: string },
  agora: Date,
): EstadoDoPedido {
  if (pedido.status === "pending" && new Date(pedido.expires_at).getTime() <= agora.getTime()) return "expired";
  return pedido.status;
}

/**
 * O que o AGENTE lê sobre um pedido. Cada frase fecha a porta do dano real: afirmar ao
 * cliente que algo foi feito quando não foi. Só `executed` autoriza confirmar.
 */
export function fraseDoEstadoParaOAgente(p: { estado: EstadoDoPedido; incerto: boolean }): string {
  switch (p.estado) {
    case "pending":
    case "executing":
      return (
        "Pedido aguardando aprovação humana. A ação NÃO foi feita ainda. NÃO afirme ao cliente que foi feita nem " +
        "que será feita com certeza: diga que depende de uma confirmação da equipe e que ele será avisado."
      );
    case "executed":
      return "A ação foi executada no sistema externo. Você pode confirmar ao cliente o que foi feito, sem inventar detalhes que o sistema não devolveu.";
    case "rejected":
      return "O pedido foi recusado por uma pessoa da equipe: a ação NÃO foi feita. Não a prometa nem a ofereça de novo; ofereça outro caminho ou chame um atendente.";
    case "expired":
      return "O pedido expirou sem decisão da equipe: a ação NÃO foi feita. Não afirme que foi nem que será; ofereça chamar um atendente.";
    case "failed":
      return p.incerto
        ? "Não foi possível confirmar se a ação foi realizada no sistema externo. NÃO afirme que foi feita nem que não foi, e não tente de novo por conta própria (poderia ser feita em dobro): uma pessoa da equipe confere."
        : "A ação NÃO foi feita: o sistema externo recusou ou não chegou a receber o pedido. Não afirme ao cliente que foi realizada; ofereça chamar um atendente.";
  }
}

/**
 * O título do aviso na Central. Leva o nome da ferramenta, a primeira informação e um
 * sufixo do id: a Central não aceita dois avisos abertos com o mesmo título, e dois
 * pedidos iguais de conversas diferentes são avisos diferentes.
 */
export function tituloDoAviso(nomeDaFerramenta: string, argumentos: Record<string, unknown>, pedidoId: string): string {
  const primeira = resumoDosDados(argumentos)[0];
  const dado = primeira ? ` — ${primeira.campo}: ${primeira.valor.slice(0, 40)}` : "";
  return `Aprovar «${nomeDaFerramenta}»${dado} (#${pedidoId.slice(0, 4)})`;
}
