/**
 * Webhook da Meta (Cloud API) — verificação e parse. **Puro e síncrono**: nada
 * aqui toca banco nem rede, para que cada regra seja testável sem ambiente.
 *
 * Duas diferenças em relação ao webhook do WAHA (`lib/waha/ingest.ts`), e as duas
 * já morderam quem tentou reaproveitar o outro:
 *
 *   1. **HMAC SHA-256, não SHA-512**, e o header vem prefixado: `X-Hub-Signature-256:
 *      sha256=<hex>`. Comparar sem tirar o prefixo reprova sempre.
 *   2. **A chave é o App Secret**, não um segredo por sessão. Um App Secret vale para
 *      todas as WABAs do app — por isso a rota ainda usa token no path, para amarrar
 *      o payload a UMA organização antes de confiar nele.
 *
 * `hub.challenge` (GET) faz parte do protocolo: a Meta só passa a entregar eventos
 * depois que o endpoint devolve o desafio **em texto puro** — não JSON, não
 * `{data:...}`. Envelopar quebra a verificação com uma mensagem inútil no dashboard.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { parseMetaInboundContact } from "@/lib/channels/meta/contact-card";
import type { SharedContact } from "@/lib/messaging/contact-card";
import type { MetaWebhookEnvelope } from "./envelope";

/** Assinatura da Meta: `sha256=<hex>` no header `X-Hub-Signature-256`. */
/**
 * A instalação consegue RECEBER pelo canal oficial? — as duas metades.
 *
 * São dois segredos com papéis diferentes, e conferir só um produz o pior tipo
 * de tela: a que diz "pronto" sobre algo que não funciona.
 *
 *   META_WEBHOOK_VERIFY_TOKEN → responde o handshake GET, em que a Meta valida
 *                               o endereço. Sem ele o webhook nem é aceito.
 *   META_APP_SECRET           → valida a ASSINATURA de cada mensagem que chega
 *                               (`verifyMetaSignature`, logo abaixo). Sem ele,
 *                               o handshake passa e TODO POST assinado morre em
 *                               401 `invalid_signature` — o número envia e
 *                               nunca recebe, sem erro em lugar nenhum.
 *
 * Nenhum dos dois é escrito pelo `install.sh` (`git grep 'META_' -- '*.sh'`
 * devolve vazio): numa instalação recém-feita os dois estão ausentes, que é
 * exatamente quando o aviso precisa aparecer.
 *
 * `.trim() !== ""` e não `Boolean()`: o contrato do `.env` deste projeto é que
 * vazio é ausente — o template gera `CHAVE=` e é assim que `preenchida()` em
 * `lib/instalacao/ambiente.ts:61` já decide.
 */
// O mesmo tipo que `lib/instalacao/ambiente.ts` usa para ler `.env`:
// `NodeJS.ProcessEnv` exige `NODE_ENV` e obrigaria todo teste a montá-lo.
export function metaPodeReceber(
  source: Record<string, string | undefined> = process.env,
): boolean {
  const cheia = (nome: string): boolean => (source[nome] ?? "").trim() !== "";
  return cheia("META_WEBHOOK_VERIFY_TOKEN") && cheia("META_APP_SECRET");
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [algo, received] = signatureHeader.split("=");
  if (algo !== "sha256" || !received) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  // timingSafeEqual estoura se os tamanhos diferem — comparar antes evita
  // transformar assinatura malformada em exceção 500.
  if (received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

/** Resposta do handshake de verificação (GET). `null` = recusar com 403. */
export function verificationChallenge(
  params: URLSearchParams,
  expectedVerifyToken: string,
): string | null {
  if (params.get("hub.mode") !== "subscribe") return null;
  if (!expectedVerifyToken) return null;
  if (params.get("hub.verify_token") !== expectedVerifyToken) return null;
  return params.get("hub.challenge");
}

/** Um template mudou de estado na Meta — o evento que a Fase 3a persegue. */
export interface TemplateStatusEvent {
  kind: "template_status";
  wabaId: string;
  templateName: string;
  templateLanguage: string;
  event: string;
  reason: string | null;
  /**
   * `other_info.description` — a explicação que a Meta dá à pausa ou à
   * desativação ("pausado por 3 horas por feedback negativo"). Ausente quando
   * ela não explica.
   */
  detail?: string | null;
}

/** A qualidade de um modelo mudou (`message_template_quality_update`). */
export interface TemplateQualityEvent {
  kind: "template_quality";
  wabaId: string;
  templateName: string;
  templateLanguage: string;
  /** `GREEN` | `YELLOW` | `RED` | `UNKNOWN` — vocabulário da Meta, sem trava aqui. */
  previous: string | null;
  quality: string;
}

/**
 * A Meta recategorizou um modelo (`template_category_update`) — utilidade que
 * vira marketing passa a custar como marketing.
 *
 * Chega em duas formas. A EFETIVA traz `previous_category` e `new_category`: a
 * mudança já valeu. O AVISO PRÉVIO traz só `correct_category`: a Meta avisa que
 * vai recategorizar; nada muda ainda, mas quem paga quer saber antes.
 */
export interface TemplateCategoryEvent {
  kind: "template_category";
  wabaId: string;
  templateName: string;
  templateLanguage: string;
  previous: string | null;
  category: string;
  efetiva: boolean;
}

/**
 * Mensagem ENVIADA PELO CONTATO. A metade que faltava do canal: sem ela o oficial
 * é um megafone — o cliente responde e nada chega, nenhum lead se move, o agente não
 * acorda, e a janela de 24h (que deriva de `last_inbound_at`) nunca abre.
 */
export interface InboundMessageEvent {
  kind: "inbound_message";
  wabaId: string;
  /** Qual número NOSSO recebeu — é o que amarra a mensagem à sessão certa. */
  phoneNumberId: string;
  /** `wamid` — a chave de idempotência. A Meta re-entrega o que não recebe 2xx. */
  externalId: string;
  /**
   * `wa_id` do contato. **Pode vir sem o nono dígito** em celular brasileiro
   * (medido: 553191234567 para quem recebemos como 5531991234567) — quem resolve o
   * contato TEM de usar `phoneLookupVariants`, senão duplica a pessoa.
   */
  from: string | null;
  /**
   * BSUID do contato (`messages[].from_user_id`, ou `contacts[].user_id`):
   * identificador com escopo do portfólio de negócio, `BR.123…`. Quem ativou nome
   * de usuário no WhatsApp pode chegar SÓ com ele — `from` vem nulo. Opcional no
   * tipo para os eventos montados à mão nos testes antigos.
   */
  fromUserId?: string | null;
  profileName: string | null;
  sentAt: Date;
  /** `text` | `audio` | `image` | `video` | `document` | `sticker` | `contact` | … */
  type: string;
  text: string | null;
  /** Preenchido quando `type === "contact"` (cartão compartilhado). */
  sharedContact?: SharedContact | null;
  media: {
    id: string;
    /** A Meta manda URL pronta, com `ext=` de expiração — baixe na hora, não guarde. */
    url: string | null;
    mime: string | null;
    /** Nota de voz de verdade (não anexo de áudio). */
    voice: boolean;
  } | null;
  /**
   * `messages[].referral` cru — vem na mensagem que o app do cliente manda ao
   * clicar num anúncio "Clique para o WhatsApp". Repassado sem interpretar: a
   * leitura é de `extrairAtribuicaoMeta`. Opcional porque só a ingestão o lê.
   */
  referral?: unknown;
}

/** Status de entrega de uma mensagem que ENVIAMOS (sent/delivered/read/failed). */
export interface MessageStatusEvent {
  kind: "message_status";
  wabaId: string;
  externalId: string;
  status: string;
  recipient: string | null;
  /** `recipient_user_id` — o BSUID do destinatário, presente mesmo sem telefone. */
  recipientUserId?: string | null;
  errorCode: number | null;
  errorTitle: string | null;
}

/**
 * Mensagem que a EMPRESA enviou pelo app WhatsApp Business, num número em
 * coexistência (o mesmo número no app e na Cloud API). A Meta entrega no campo
 * `smb_message_echoes` — só o que saiu PELO APP; o que sai pela API não volta
 * como eco. Sem este evento a conversa no CRM fica sem as respostas dadas pelo
 * celular, e o agente responde por cima de um humano que já respondeu.
 *
 * `revoke` e `edit` também chegam por este campo e ficam de fora de propósito:
 * não são mensagem nova, e sim alteração de uma que talvez nem tenhamos gravado.
 */
export interface OutboundEchoEvent {
  kind: "outbound_echo";
  wabaId: string;
  /** Qual número NOSSO enviou — amarra o eco à sessão, como no recebimento. */
  phoneNumberId: string;
  /** `wamid` — mesma chave de idempotência das mensagens recebidas. */
  externalId: string;
  /** `wa_id` do CLIENTE (o destinatário). Mesma ressalva do nono dígito. */
  to: string;
  sentAt: Date;
  /** `text` | `image` | `video` | `document` | `contact` | … */
  type: string;
  text: string | null;
  /** Preenchido quando `type === "contact"` (cartão compartilhado pelo app). */
  sharedContact?: SharedContact | null;
  media: {
    id: string;
    url: string | null;
    mime: string | null;
    voice: boolean;
  } | null;
}

export type MetaWebhookEvent =
  | TemplateStatusEvent
  | TemplateQualityEvent
  | TemplateCategoryEvent
  | MessageStatusEvent
  | InboundMessageEvent
  | OutboundEchoEvent;

/**
 * O formato do fio mora em `./envelope.ts`, onde é um schema Zod — e o tipo
 * NASCE dele (`z.infer`). Aqui era um `interface` escrita à mão, que o
 * `JSON.parse ... as` da rota prometia sem nunca conferir.
 */
export type { MetaWebhookEnvelope } from "./envelope";

/**
 * A Meta manda `rejected_reason: "NONE"` em template APROVADO (medido contra a WABA
 * real). Guardar o literal faz a tela anunciar um motivo de recusa que não existe.
 *
 * Mora aqui, no módulo puro, porque tem DOIS escritores da mesma coluna — o sync e
 * este webhook. Na prova ao vivo o webhook gravou `"NONE"` enquanto o sync gravava
 * `null`: a mesma linha ficava com convenções diferentes dependendo de quem a
 * tocou por último. Regra duplicada é regra que diverge.
 */
export function normalizeRejectedReason(v: unknown): string | null {
  const s = typeof v === "string" && v.length > 0 ? v : null;
  return s === null || s.toUpperCase() === "NONE" ? null : s;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Extrai os eventos que nos interessam. **Evento desconhecido é IGNORADO, não erro** —
 * a Meta re-entrega tudo que não recebe 2xx, então devolver falha para um evento que
 * não nos interessa vira auto-DDoS: ela re-tenta o mesmo payload em backoff por horas.
 */
export function parseMetaWebhook(envelope: MetaWebhookEnvelope): MetaWebhookEvent[] {
  const out: MetaWebhookEvent[] = [];
  if (envelope?.object !== "whatsapp_business_account") return out;

  for (const entry of envelope.entry ?? []) {
    const wabaId = str(entry.id) ?? "";
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};

      if (change.field === "message_template_status_update") {
        const name = str(v.message_template_name);
        const language = str(v.message_template_language);
        if (!name || !language) continue; // payload capenga não vira linha meia-boca
        const outra = v.other_info as { description?: unknown } | null | undefined;
        const detalhe = str(outra?.description);
        out.push({
          kind: "template_status",
          wabaId,
          templateName: name,
          templateLanguage: language,
          event: str(v.event) ?? "UNKNOWN",
          reason: normalizeRejectedReason(v.reason),
          ...(detalhe ? { detail: detalhe } : {}),
        });
        continue;
      }

      if (change.field === "message_template_quality_update") {
        const name = str(v.message_template_name);
        const language = str(v.message_template_language);
        const quality = str(v.new_quality_score);
        if (!name || !language || !quality) continue;
        out.push({
          kind: "template_quality",
          wabaId,
          templateName: name,
          templateLanguage: language,
          previous: str(v.previous_quality_score),
          quality,
        });
        continue;
      }

      if (change.field === "template_category_update") {
        const name = str(v.message_template_name);
        const language = str(v.message_template_language);
        const nova = str(v.new_category);
        const correta = str(v.correct_category);
        if (!name || !language || (!nova && !correta)) continue;
        out.push({
          kind: "template_category",
          wabaId,
          templateName: name,
          templateLanguage: language,
          previous: nova ? str(v.previous_category) : null,
          category: (nova ?? correta)!,
          efetiva: nova !== null,
        });
        continue;
      }

      // Mensagens RECEBIDAS. Vem no mesmo `field: "messages"` das entregas — o que
      // separa é `messages[]` (do contato) vs `statuses[]` (das nossas). Tratar os
      // dois no mesmo `if` faria um mascarar o outro quando ambos vêm juntos.
      if (change.field === "messages" && Array.isArray(v.messages)) {
        const meta = (v.metadata ?? {}) as Record<string, unknown>;
        const contatos = Array.isArray(v.contacts) ? (v.contacts as Record<string, unknown>[]) : [];
        for (const raw of v.messages as Record<string, unknown>[]) {
          const id = str(raw.id);
          const from = str(raw.from);
          // O BSUID vem na mensagem (`from_user_id`) e no bloco de contatos
          // (`user_id`). Sem telefone NEM BSUID é payload capenga; só com o BSUID
          // é quem ativou nome de usuário e escondeu o número — e é contato.
          const perfil =
            contatos.find((c) => from !== null && str(c.wa_id) === from) ??
            contatos.find((c) => str(raw.from_user_id) !== null && str(c.user_id) === str(raw.from_user_id)) ??
            (contatos.length === 1 ? contatos[0] : undefined);
          const fromUserId = str(raw.from_user_id) ?? str(perfil?.user_id);
          if (!id || (!from && !fromUserId)) continue; // payload capenga não vira linha meia-boca

          const tipo = str(raw.type) ?? "unknown";
          const corpoMidia = tipo !== "contacts" ? (raw[tipo] as Record<string, unknown> | undefined) : undefined;
          const sharedContact = tipo === "contacts" ? parseMetaInboundContact(raw) : null;
          const tipoCrm = tipo === "contacts" ? "contact" : tipo;

          out.push({
            kind: "inbound_message",
            wabaId,
            phoneNumberId: str(meta.phone_number_id) ?? "",
            externalId: id,
            from,
            fromUserId,
            profileName: str((perfil?.profile as Record<string, unknown> | undefined)?.name),
            // A Meta manda epoch em SEGUNDOS, string. Passar direto ao Date daria 1970.
            sentAt: new Date(Number(str(raw.timestamp) ?? "0") * 1000),
            type: tipoCrm,
            text:
              tipoCrm === "text"
                ? str((raw.text as Record<string, unknown>)?.body)
                : sharedContact?.name ?? null,
            ...(sharedContact ? { sharedContact } : {}),
            media:
              corpoMidia && str(corpoMidia.id)
                ? {
                    id: str(corpoMidia.id)!,
                    url: str(corpoMidia.url),
                    mime: str(corpoMidia.mime_type),
                    voice: corpoMidia.voice === true,
                  }
                : null,
            referral: raw.referral ?? null,
          });
        }
        continue;
      }

      if (change.field === "messages" && Array.isArray(v.statuses)) {
        for (const raw of v.statuses as Record<string, unknown>[]) {
          const id = str(raw.id);
          if (!id) continue;
          const errors = Array.isArray(raw.errors)
            ? (raw.errors as Record<string, unknown>[])
            : [];
          const first = errors[0] ?? {};
          out.push({
            kind: "message_status",
            wabaId,
            externalId: id,
            status: str(raw.status) ?? "unknown",
            recipient: str(raw.recipient_id),
            recipientUserId: str(raw.recipient_user_id),
            errorCode: typeof first.code === "number" ? first.code : null,
            errorTitle: str(first.title),
          });
        }
      }
      // Coexistência: o que a empresa enviou pelo app WhatsApp Business.
      if (change.field === "smb_message_echoes" && Array.isArray(v.message_echoes)) {
        const meta = (v.metadata ?? {}) as Record<string, unknown>;
        for (const raw of v.message_echoes as Record<string, unknown>[]) {
          const id = str(raw.id);
          const to = str(raw.to);
          const tipo = str(raw.type) ?? "unknown";
          if (!id || !to) continue; // payload capenga não vira linha meia-boca
          if (tipo === "revoke" || tipo === "edit") continue; // ver `OutboundEchoEvent`

          // Cartão chega como `contacts`, que o CHECK de `messages.type` recusa —
          // mesmo mapeamento da recebida, senão o insert falha e a IA não pausa.
          const corpoMidia = tipo !== "contacts" ? (raw[tipo] as Record<string, unknown> | undefined) : undefined;
          const sharedContact = tipo === "contacts" ? parseMetaInboundContact(raw) : null;
          const tipoCrm = tipo === "contacts" ? "contact" : tipo;
          out.push({
            kind: "outbound_echo",
            wabaId,
            phoneNumberId: str(meta.phone_number_id) ?? "",
            externalId: id,
            to,
            sentAt: new Date(Number(str(raw.timestamp) ?? "0") * 1000),
            type: tipoCrm,
            // Texto do balão: o corpo, o nome do cartão, ou a legenda da mídia.
            text:
              tipoCrm === "text"
                ? str((raw.text as Record<string, unknown>)?.body)
                : sharedContact?.name ?? str(corpoMidia?.caption),
            ...(sharedContact ? { sharedContact } : {}),
            media:
              corpoMidia && str(corpoMidia.id)
                ? {
                    id: str(corpoMidia.id)!,
                    url: str(corpoMidia.url),
                    mime: str(corpoMidia.mime_type),
                    voice: corpoMidia.voice === true,
                  }
                : null,
          });
        }
        continue;
      }
      // Qualquer outro `field` cai fora de propósito — ver o comentário acima.
    }
  }
  return out;
}
