/**
 * O QUE PODE SER GRAVADO EM `conversations.channel`.
 *
 * Duas listas precisam concordar: esta, em TypeScript, e
 * `conversations_channel_check`, no banco. O invariante
 * `canal-da-conversa-banco-x-catalogo` reprova quando as duas divergem — um
 * canal novo entra nas duas no mesmo PR, ou o CI reprova.
 *
 * O modo de falha que isto evita é o pior: o webhook do provedor **reentrega**.
 * Um valor que o CHECK recusa vira 500 a cada reentrega, para sempre, e a
 * conversa nunca aparece.
 */
export const CANAIS_DE_CONVERSA = ["whatsapp"] as const satisfies readonly string[];

