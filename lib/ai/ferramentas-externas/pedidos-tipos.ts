/**
 * Os TIPOS do pedido de execução (issue #95): a linha de `agent_external_tool_requests`
 * vista pelo turno do agente, pela API e pela tela. Client-safe (só tipos).
 */
import type { EstadoDoPedido, OrigemDoPedido } from "./tipos";

/** O que o TURNO precisa saber de um pedido: quem é, em que pé está e se a falha foi incerta. */
export interface PedidoDoTurno {
  id: string;
  status: EstadoDoPedido;
  /** `true` quando a chamada falhou e o outro sistema PODE ter feito a alteração. */
  incerto: boolean;
  expiresAt: string;
  /** O que o outro sistema devolveu, quando o pedido foi executado (até 4.000 caracteres). */
  conteudo?: string | null;
}

export interface AberturaDoPedido {
  pedido: PedidoDoTurno;
  /**
   * `true` só para quem CRIOU o pedido agora. Quem recebe `false` encontrou um pedido que já
   * existia (o modelo repetiu a chamada, ou outro turno a fez) e NÃO executa nada: o estado
   * dele é o que o agente lê.
   */
  reivindicado: boolean;
}

/** A linha completa, como a API e a tela a leem. Os dados vão inteiros (a execução precisa deles). */
export interface PedidoDeExecucao {
  id: string;
  tool_id: string;
  tool_name: string;
  tool_slug: string;
  effect: "consulta" | "altera";
  status: EstadoDoPedido;
  origin: OrigemDoPedido;
  arguments: Record<string, unknown>;
  uncertain: boolean;
  expires_at: string;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
  outcome_http_status: number | null;
  outcome_reason: string | null;
}
