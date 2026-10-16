import type { AuditAction } from "./actions";

/**
 * Uma frase para cada código de auditoria — para quem não é programador.
 *
 * A tela de Auditoria mostrava `contact.merged`, `conversation.claimed`: certo para quem investiga,
 * ilegível para o dono do negócio. Aqui o código vira "Uniu contatos duplicados", e a tela guarda o
 * código ao lado (é ele que o filtro "Ação contém" entende).
 *
 * Duas camadas, da mais específica para a mais geral:
 *   1. `ACOES_COM_FRASE` — frases inteiras, escritas à mão para os códigos que o dono mais procura.
 *      A chave é `AuditAction`: um código que sair do vocabulário (`./actions`) deixa de compilar.
 *   2. `recurso.verbo` — "Criou" + "contato". Cobre a maioria dos códigos de criação, edição e remoção
 *      sem uma linha por código.
 * O que nenhuma das duas cobre devolve `null`, e a tela mostra o código como está. Nunca inventa frase.
 *
 * Sem `import` de valor: o módulo roda no navegador. Quem traduz é quem chama (`t`), peça por peça,
 * porque "Criou" e "contato" se traduzem separados e se juntam na mesma ordem em es/en.
 */

export const ACOES_COM_FRASE: Partial<Record<AuditAction, string>> = {
  "lead.moved": "Moveu um lead de etapa",
  "lead.moved_to_pipeline": "Moveu um lead para outro funil",
  "contact.merged": "Uniu contatos duplicados",
  "contact.blocked": "Bloqueou um contato",
  "contact.unblocked": "Desbloqueou um contato",
  "conversation.claimed": "Assumiu uma conversa",
  "conversation.released": "Liberou uma conversa",
  "conversation.closed": "Encerrou uma conversa",
  "conversation.transferred": "Transferiu uma conversa",
  "conversation.note_added": "Anotou numa conversa",
  "conversation.snoozed": "Adiou uma conversa",
  "member.invited": "Convidou alguém para a equipe",
  "member.accepted": "Aceitou o convite da equipe",
  "member.revoked": "Tirou alguém da equipe",
  "member.reactivated": "Reativou alguém da equipe",
  "member.invite_revoked": "Cancelou um convite",
  "team.role_changed": "Mudou o papel de alguém da equipe",
  "token.created": "Criou uma chave de acesso",
  "token.revoked": "Revogou uma chave de acesso",
  "message.sent": "Enviou uma mensagem",
  "message.received": "Recebeu uma mensagem",
  "webhook.hmac_invalid": "Recusou um webhook com assinatura inválida",
  "proposal.sent": "Enviou uma proposta",
  "platform_admin.impersonate_started": "O suporte da plataforma entrou na conta",
  "platform_admin.impersonate_ended": "O suporte da plataforma saiu da conta",
  "system.update_requested": "Pediu a atualização do sistema",
  "system.update_finished": "A atualização do sistema terminou",
  "lgpd.consent_changed": "Mudou um consentimento (LGPD)",
  "lgpd.export_generated": "Gerou uma exportação de dados (LGPD)",
  "lgpd.redact_completed": "Anonimizou os dados de um contato (LGPD)",
  "channel.connected": "Conectou um canal",
  "channel.reconnected": "Reconectou um canal",
  "agenda.appointment_created": "Marcou um agendamento",
  "agenda.appointment_cancelled": "Cancelou um agendamento",
  "org.branding_updated": "Alterou a marca da organização",
};

/** O substantivo, no singular e sem artigo: "Criou" + "contato". */
export const RECURSOS_DA_AUDITORIA: Readonly<Record<string, string>> = {
  contact: "contato",
  contacts: "contato",
  lead: "lead",
  conversation: "conversa",
  channel: "canal",
  campaign: "campanha",
  member: "membro da equipe",
  pipeline: "funil",
  proposal: "proposta",
  proposal_template: "modelo de proposta",
  webhook: "webhook",
  token: "chave de acesso",
  ai_agent: "agente de IA",
  followup_flow: "roteiro de follow-up",
  catalog_product: "produto",
  crm_task: "tarefa",
  companies: "empresa",
  people: "pessoa",
  template: "template",
  meta_template: "template do WhatsApp",
  external_db_connection: "conexão com banco de dados",
  automation: "automação",
  extension: "extensão",
  phone_number: "número de telefone",
  message: "mensagem",
  comanda: "comanda",
};

/** O verbo no passado, que é como a auditoria conta: o que já aconteceu. */
export const VERBOS_DA_AUDITORIA: Readonly<Record<string, string>> = {
  created: "Criou",
  updated: "Alterou",
  deleted: "Apagou",
  imported: "Importou",
  archived: "Arquivou",
  published: "Publicou",
  paused: "Pausou",
  reactivated: "Reativou",
  revoked: "Revogou",
  duplicated: "Duplicou",
  tested: "Testou",
  cancelled: "Cancelou",
  edited: "Editou",
  sent: "Enviou",
  installed: "Instalou",
  removed: "Removeu",
};

/**
 * A frase da ação, ou `null` quando não há uma que seja honesta.
 * `t` traduz cada peça; sem tradução ele devolve o texto como veio (português).
 */
export function rotuloDaAcao(acao: string, t: (texto: string) => string): string | null {
  const inteira = (ACOES_COM_FRASE as Readonly<Record<string, string | undefined>>)[acao];
  if (inteira) return t(inteira);
  const partes = acao.split(".");
  if (partes.length !== 2) return null;
  const recurso = RECURSOS_DA_AUDITORIA[partes[0]!];
  const verbo = VERBOS_DA_AUDITORIA[partes[1]!];
  if (!recurso || !verbo) return null;
  return `${t(verbo)} ${t(recurso)}`;
}

/** O tipo do recurso em palavras ("contato"), ou `null` quando não há nome conhecido. */
export function rotuloDoRecurso(tipo: string | null, t: (texto: string) => string): string | null {
  if (!tipo) return null;
  const nome = RECURSOS_DA_AUDITORIA[tipo];
  return nome ? t(nome) : null;
}

export interface AtorDaAuditoria {
  acting_as_platform_admin: boolean;
  actor_user_id: string | null;
  actor_api_token_id: string | null;
}

/**
 * Quem fez. `nomeDe` resolve o id de uma pessoa da equipe em nome; sem nome (pessoa que saiu da
 * organização, lista que não carregou) cai no começo do id, como a tela já mostrava.
 */
export function atorDaAuditoria(
  linha: AtorDaAuditoria,
  nomeDe: (userId: string) => string | undefined,
  t: (texto: string) => string,
): { nome: string; detalhe: string | null } {
  if (linha.acting_as_platform_admin) return { nome: t("Suporte da plataforma"), detalhe: null };
  if (linha.actor_user_id) {
    const nome = nomeDe(linha.actor_user_id);
    return nome
      ? { nome, detalhe: null }
      : { nome: `${t("Pessoa")} ${linha.actor_user_id.slice(0, 8)}`, detalhe: null };
  }
  if (linha.actor_api_token_id) {
    return { nome: t("Chave de acesso"), detalhe: linha.actor_api_token_id.slice(0, 8) };
  }
  return { nome: t("Sistema"), detalhe: null };
}
