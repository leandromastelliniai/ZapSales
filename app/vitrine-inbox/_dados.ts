/**
 * DADOS DE EXEMPLO da vitrine da Inbox — pessoas e conversas que NÃO existem.
 *
 * Plausíveis de propósito, pelo mesmo motivo de `app/vitrine-agenda`: "Fulano 1"
 * não deixa ninguém julgar densidade, truncamento ou contraste. Por isso moram
 * FORA de `app/app/**` (onde `tests/unit/telas-sem-dado-de-mentira.test.ts`
 * reprova qualquer dado de mentira alcançável) e a página que os usa não tem
 * porta na navegação do cliente.
 *
 * As fotos (`public/vitrine-inbox/*.jpg`) são retratos gerados por IA de pessoas que não
 * existem; a origem está gravada no próprio arquivo.
 */
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import type { Message } from "@/lib/types/messaging";
import type { PassagemDaConversa } from "@/lib/escalacao/cartao-da-passagem";
import type { EtapaDaLinha } from "@/components/inbox/visual/LinhaDoFunil";

export const ORG_ID = "00000000-0000-4000-8000-0000000000aa";
export const ANA_PAULA_ID = "00000000-0000-4000-8000-0000000000a1";
export const BRUNO_ID = "00000000-0000-4000-8000-0000000000b1";
export const CONVERSA_ABERTA = "00000000-0000-4000-8000-00000000c001";

export const FOTOS = {
  mariana: "/vitrine-inbox/mariana.jpg",
  anaPaula: "/vitrine-inbox/ana-paula.jpg",
  rafael: "/vitrine-inbox/rafael.jpg",
  juliana: "/vitrine-inbox/juliana.jpg",
  pedro: "/vitrine-inbox/pedro.jpg",
} as const;

/** Um horário de HOJE, para a lista mostrar "14:32" como a imagem aprovada. */
export function hoje(hora: number, minuto: number): string {
  const d = new Date();
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

function ontem(hora: number, minuto: number): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

export const ETAPAS: readonly EtapaDaLinha[] = [
  { id: "e1", nome: "Campanha Clareamento" },
  { id: "e2", nome: "Conversa" },
  { id: "e3", nome: "Qualificado" },
  { id: "e4", nome: "Proposta enviada" },
  { id: "e5", nome: "Agendado" },
  { id: "e6", nome: "Fechado" },
];

const CANAL = { phone_number: "+55 11 4002-8922", display_name: "Recepção", provider: "waha" };

function conversa(p: {
  id: string;
  nome: string;
  telefone: string;
  previa: string;
  quando: string;
  comando: "humano" | "automatico" | "aguardando";
  dono?: { id: string; nome: string };
  naoLidas?: number;
  grupo?: boolean;
  esperaDesde?: string;
}): ConversationWithContact {
  return {
    id: p.id,
    organization_id: ORG_ID,
    contact_id: `${p.id}-contato`,
    channel_session_id: "canal-1",
    channel: "whatsapp",
    status: p.comando === "automatico" ? "ai_handling" : "open",
    status_changed_at: p.quando,
    service_revision: 1,
    service_closed_at: null,
    service_started_at: p.quando,
    current_demanda_id: null,
    assigned_to_user_id: p.dono?.id ?? null,
    assigned_to_user_name: p.dono?.nome ?? null,
    assignee_kind: p.dono ? "user" : p.comando === "automatico" ? "ai" : null,
    assigned_at: p.dono ? hoje(14, 27) : null,
    last_inbound_at: p.quando,
    awaiting_since: p.esperaDesde ?? null,
    last_outbound_at: null,
    last_message_at: p.quando,
    last_message_preview: p.previa,
    unread_count_for_assignee: p.naoLidas ?? 0,
    is_group: p.grupo ?? false,
    group_chat_id: null,
    tags: [],
    metadata: {},
    snooze_until: null,
    created_at: p.quando,
    updated_at: p.quando,
    // Na fila = a IA passou e ninguém assumiu: o automático fica calado.
    bot_silenced_until: p.dono || p.comando === "aguardando" ? "infinity" : null,
    last_handoff_at: p.dono || p.comando === "aguardando" ? hoje(14, 27) : null,
    last_handoff_reason: p.dono || p.comando === "aguardando" ? "requested_human" : null,
    comando_da_conversa: p.comando,
    contacts: {
      id: `${p.id}-contato`,
      display_name: p.nome,
      name: p.nome,
      phone_number: p.telefone,
      is_anonymized: false,
      tags: p.id === CONVERSA_ABERTA ? ["Clareamento", "Particular"] : [],
      is_blocked: false,
      avatar_storage_path: null,
      force_human: false,
    },
    channel_sessions: CANAL,
  } as unknown as ConversationWithContact;
}

export interface LinhaDaVitrine {
  conversa: ConversationWithContact;
  foto: string | null;
  etapaAtual: string;
}

export const LISTA: readonly LinhaDaVitrine[] = [
  {
    conversa: conversa({
      id: CONVERSA_ABERTA,
      nome: "Mariana Costa",
      telefone: "5511987654321",
      previa: "Quinta às 14h fica ótimo!",
      quando: hoje(14, 32),
      comando: "humano",
      dono: { id: ANA_PAULA_ID, nome: "Ana Paula" },
      naoLidas: 1,
    }),
    foto: FOTOS.mariana,
    etapaAtual: "e4",
  },
  {
    conversa: conversa({
      id: "00000000-0000-4000-8000-00000000c002",
      nome: "Rafael Lima",
      telefone: "5511912345678",
      previa: "Perfeito, te mando o link do pagamento",
      quando: hoje(14, 29),
      comando: "automatico",
    }),
    foto: FOTOS.rafael,
    etapaAtual: "e4",
  },
  {
    conversa: conversa({
      id: "00000000-0000-4000-8000-00000000c003",
      nome: "Juliana Rocha",
      telefone: "5511998877665",
      previa: "Vocês atendem convênio?",
      quando: hoje(14, 18),
      comando: "aguardando",
      esperaDesde: new Date(Date.now() - 12 * 60_000).toISOString(),
    }),
    foto: FOTOS.juliana,
    etapaAtual: "e3",
  },
  {
    conversa: conversa({
      id: "00000000-0000-4000-8000-00000000c004",
      nome: "Pedro Henrique",
      telefone: "5511955554444",
      previa: "Oi, ainda está valendo a promoção?",
      quando: hoje(13, 58),
      comando: "humano",
      dono: { id: BRUNO_ID, nome: "Bruno" },
      naoLidas: 2,
    }),
    foto: FOTOS.pedro,
    etapaAtual: "e3",
  },
  {
    conversa: conversa({
      id: "00000000-0000-4000-8000-00000000c005",
      nome: "Equipe Recepção",
      telefone: "",
      previa: "Confirmei os horários de amanhã",
      quando: hoje(12, 41),
      comando: "automatico",
      grupo: true,
    }),
    foto: null,
    etapaAtual: "e3",
  },
  {
    conversa: conversa({
      id: "00000000-0000-4000-8000-00000000c006",
      nome: "Carla Mendes",
      telefone: "5511933332222",
      previa: "Ok, obrigada",
      quando: ontem(18, 5),
      comando: "humano",
      dono: { id: ANA_PAULA_ID, nome: "Ana Paula" },
    }),
    foto: null,
    etapaAtual: "e3",
  },
];

function mensagem(p: {
  id: string;
  quando: string;
  texto: string;
  de: "cliente" | "ia" | "ana";
}): Message {
  return {
    id: p.id,
    organization_id: ORG_ID,
    conversation_id: CONVERSA_ABERTA,
    channel_session_id: "canal-1",
    contact_id: `${CONVERSA_ABERTA}-contato`,
    external_id: `ext-${p.id}`,
    type: "text",
    direction: p.de === "cliente" ? "inbound" : "outbound",
    status: "read",
    ack: null,
    error_code: null,
    error_message: null,
    body: p.texto,
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: p.de === "ia" ? "ai" : "user",
    sent_by_user_id: p.de === "ana" ? ANA_PAULA_ID : null,
    sent_at: p.quando,
    delivered_at: p.quando,
    read_at: p.quando,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: p.quando,
  } as unknown as Message;
}

export const MENSAGENS: readonly Message[] = [
  mensagem({ id: "m1", quando: hoje(14, 20), de: "cliente", texto: "Oi! Vi a mensagem do clareamento. Ainda tem horário essa semana?" }),
  mensagem({ id: "m2", quando: hoje(14, 21), de: "ia", texto: "Oi, Mariana! Tem sim: quinta às 14h ou sexta às 9h30. Qual fica melhor?" }),
  mensagem({ id: "m3", quando: hoje(14, 25), de: "cliente", texto: "Quinta. Quanto fica o clareamento a laser?" }),
  mensagem({ id: "m4", quando: hoje(14, 28), de: "ana", texto: "Oi, Mariana! Aqui é a Ana. À vista fica R$ 1.150,00. Reservo quinta às 14h?" }),
  mensagem({ id: "m5", quando: hoje(14, 32), de: "cliente", texto: "Quinta às 14h fica ótimo!" }),
];

export const PASSAGENS: readonly PassagemDaConversa[] = [
  {
    id: "p1",
    origem: "pedido_explicito",
    motivo_codigo: "requested_human",
    title: "Saber o preço do clareamento a laser com desconto à vista",
    body: "Cliente veio da campanha de clareamento, escolheu quinta às 14h e pediu desconto no pagamento à vista.",
    notes: "Quinta. Quanto fica o clareamento a laser?",
    content: null,
    tentativas: [{ o_que: "Ofereceu os horários de quinta e sexta", desfecho: "cliente escolheu quinta" }],
    cliente_avisado: true,
    aviso_motivo_codigo: null,
    caso_id: null,
    criado_em: hoje(14, 27),
    reconhecido_em: hoje(14, 27),
    reconhecido_por: ANA_PAULA_ID,
    reconhecido_por_nome: "Ana Paula",
  } as unknown as PassagemDaConversa,
];
