/**
 * O destinatário e a conta de mensagens no corpo da API de mensagens da Graph.
 *
 * ─── BSUID ───────────────────────────────────────────────────────────────────
 *
 * Quem ativa nome de usuário no WhatsApp pode esconder o telefone; a Meta passa a
 * identificá-lo pelo BSUID (`BR.13491208655302741918`, ou o BSUID pai
 * `US.ENT.…`), único por portfólio de negócio + usuário. Para responder a esse
 * contato, o corpo leva `recipient` no lugar de `to`. Quando os dois existem a
 * Meta dá precedência ao telefone — então o adapter manda só um, e é o telefone
 * sempre que o contato tem.
 *
 * ─── Conta de mensagens ─────────────────────────────────────────────────────
 *
 * No modelo novo de contas (Graph v26) um número pode carregar mais de uma conta
 * de mensagens, e o token que alcança mais de uma precisa NOMEAR qual paga cada
 * mensagem (`messaging_account_id`). Toda chamada à API de mensagens desta
 * instalação leva o campo quando a sessão o tem; sem ele, a Meta resolve.
 *
 * Fonte: documentação oficial de BSUID e de contas de mensagens, conferida em
 * 04/10/2026.
 */

/** Formato do BSUID: país (ISO 3166 alfa-2), ponto, `ENT.` opcional (pai), até 128 alfanuméricos. */
const FORMATO_DO_BSUID = /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$/;

export function ehBsuid(valor: string | null | undefined): valor is string {
  return typeof valor === "string" && FORMATO_DO_BSUID.test(valor);
}

/**
 * O campo de destinatário do corpo: `{ to }` para telefone, `{ recipient }` para
 * BSUID. O valor já vem resolvido por `resolveRecipient` — os dois formatos não
 * se confundem (telefone é só dígito; BSUID tem o ponto depois do país).
 */
export function campoDoDestinatario(enderecado: string): { to: string } | { recipient: string } {
  return ehBsuid(enderecado) ? { recipient: enderecado } : { to: enderecado };
}

/** `{ messaging_account_id }` quando há conta de mensagens; nada quando não há. */
export function campoDaContaDeMensagens(
  contaDeMensagens: string | null | undefined,
): { messaging_account_id?: string } {
  const conta = contaDeMensagens?.trim();
  return conta ? { messaging_account_id: conta } : {};
}
