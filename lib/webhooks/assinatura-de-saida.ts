/**
 * A assinatura das chamadas que o ZapSales FAZ a um sistema de fora (webhook de
 * saída das automações e ferramenta externa do agente). Um esquema só: o
 * receptor que já verifica a assinatura de um verifica a do outro.
 *
 * `t=<ts>,v1=<hex HMAC-SHA256(segredo, "<ts>.<entrega>.<corpo>")>` — cobre a hora
 * e o id da entrega, então uma requisição capturada e repetida fora da janela do
 * receptor é recusável. O guia de quem recebe é `docs/integracao/webhooks-de-saida.md`.
 */
import { createHmac } from "node:crypto";

export function assinaturaComCarimbo(segredo: string, carimbo: number, entrega: string, corpo: string): string {
  const v1 = createHmac("sha256", segredo).update(`${carimbo}.${entrega}.${corpo}`).digest("hex");
  return `t=${carimbo},v1=${v1}`;
}
