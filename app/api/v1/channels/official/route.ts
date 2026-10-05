import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/channels/official — estado da conexão oficial + o que colar na Meta.
 * POST /api/v1/channels/official — VALIDA a credencial e só então grava.
 *
 * O `POST` valida contra a Graph API **antes** de persistir. Gravar primeiro e
 * descobrir depois é o que faz o operador achar que conectou e só entender que não na
 * primeira mensagem que não sai — com o lead do outro lado esperando.
 *
 * O `POST` é também o caminho de VOLTA: conectar por cima de um canal oficial que
 * foi excluído RESSUSCITA a linha (`lib/channels/reactivate.ts`). Sem isso o
 * update devolvia status/credencial/número e deixava `archived_at` no lugar — e o
 * canal "conectado" ficava invisível para o webhook, para o ingest, para os
 * seletores e para o envio, todos filtrados por essa coluna.
 *
 * Ressuscitar NÃO devolve a URL de webhook antiga: a exclusão rotacionou o
 * `webhook_path_token` de propósito (é o que corta a entrega da plataforma), e a
 * volta mantém a nova. É por isso que a tela mostra o que colar na Meta depois de
 * conectar — inclusive na reconexão, onde o endereço mudou.
 *
 * O token é cifrado pelas MESMAS RPCs do resto do repo (`lib/webhooks/secrets.ts`) e
 * **nunca volta** num GET: uma vez gravado, a tela mostra que existe, não qual é.
 *
 * Desde a issue #5 o `POST` é também a porta do ASSISTENTE: com App Secret, PIN e
 * uso declarado ele confere o segredo, registra o número e assina os campos do
 * webhook no app. A ordem dos passos mora em `lib/channels/meta/conectar-numero.ts`,
 * que o Embedded Signup também usa.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { appDaMeta, appDaMetaDoAmbiente } from "@/lib/channels/meta/app";
import { metaGraphBase } from "@/lib/channels/meta/credentials";
import { COLUNAS_DO_DESFECHO_DO_WEBHOOK } from "@/lib/channels/meta/webhook-da-sessao";
import { createAdminClient } from "@/lib/supabase/admin";
import { basePublicaDoWebhookMeta } from "@/lib/webhooks/url-publica";
import { traduzir } from "@/lib/i18n/dicionario";
import { lerUsoDoNumero, usoDoNumeroSchema } from "@/lib/channels/uso";
import { conectarNumeroOficial } from "@/lib/channels/meta/conectar-numero";
import { CAMPOS_DO_WEBHOOK_DO_APP } from "@/lib/channels/meta/conexao-guiada";
import { embeddedSignupParaATela } from "@/lib/channels/meta/embedded-signup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const conectarSchema = z.object({
  phone_number_id: z.string().min(5),
  waba_id: z.string().min(5),
  token: z.string().min(20),
  /**
   * Conta de mensagens (Graph v26, modelo novo de contas). Opcional: só é
   * obrigatória para a Meta quando o token alcança mais de uma conta de mensagens
   * no número. Vazia conta como ausente.
   */
  messaging_account_id: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .optional()
    .transform((v) => (v ? v : null)),
  /**
   * Os campos do ASSISTENTE (issue #5). Todos opcionais: o formulário manual de
   * sempre continua conectando só com número, conta e token.
   *
   * App Secret: 32 hexadecimais na Meta; o piso de 16 é o mesmo da tela da
   * instalação (`updateMetaApp.ts`).
   */
  app_secret: z.string().trim().min(16).max(300).optional(),
  /** Verify token do app próprio. Vazio com App Secret = o servidor gera um forte. */
  verify_token: z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9._~-]*$/)
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** PIN de confirmação em duas etapas: com ele, o número é registrado na Cloud API. */
  pin: z.string().regex(/^\d{6}$/).optional(),
  uso: usoDoNumeroSchema.optional(),
});

interface DesfechoGravado {
  meta_webhook_override_uri: string | null;
  meta_webhook_override_erro: string | null;
  meta_webhook_override_em: string | null;
}

/**
 * O desfecho do registro do webhook desta sessão, lido em consulta PRÓPRIA.
 *
 * Separado do select principal de propósito: as três colunas chegam na migration
 * 0311, e num banco sem ela o select inteiro voltaria 42703 — a tela perderia o
 * canal (conectado, número, URL) por causa de um EXTRA. Aqui a ausência só significa
 * "estado do registro indisponível".
 */
async function lerDesfechoDoWebhook(
  admin: ReturnType<typeof createAdminClient>,
  channelSessionId: string,
): Promise<DesfechoGravado | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(COLUNAS_DO_DESFECHO_DO_WEBHOOK)
    .eq("id", channelSessionId)
    .maybeSingle();
  if (error) return null;
  return data as DesfechoGravado | null;
}

/** O que a 0536 acrescenta à conexão, lido em consulta PRÓPRIA (mesma razão da 0311). */
interface ExtrasDaConexao {
  uso_declarado: string | null;
  meta_qualidade: string | null;
  meta_limite_de_mensagens: string | null;
  meta_saude_evento: string | null;
  meta_saude_em: string | null;
  meta_numero_registrado_em: string | null;
  meta_app_secret_encrypted: string | null;
}

async function lerExtrasDaConexao(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  channelSessionId: string,
): Promise<ExtrasDaConexao | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(
      "uso_declarado, meta_qualidade, meta_limite_de_mensagens, meta_saude_evento, meta_saude_em, meta_numero_registrado_em, meta_app_secret_encrypted",
    )
    .eq("organization_id", orgId)
    .eq("id", channelSessionId)
    .maybeSingle();
  if (error) return null;
  return data as ExtrasDaConexao | null;
}

/**
 * O token de verificação que esta tela pode MOSTRAR — e de onde vem o que vale.
 *
 * Isto lia `process.env.META_WEBHOOK_VERIFY_TOKEN` direto, e a migration 0257
 * tornou a leitura errada nos dois sentidos: com o App da Meta cadastrado pela
 * tela de administração, o handshake passa a conferir o token do BANCO, e esta
 * rota seguia mostrando o do `.env` (que a Meta recusaria) ou, sem `.env`,
 * "defina no servidor" para quem já tinha configurado tudo.
 *
 * O valor do banco NÃO é devolvido: ele é mostrado uma vez, na resposta da
 * action que o gera (`app/actions/settings/updateMetaApp.ts`), e aqui quem
 * responde é o admin de UM tenant, não quem administra a instalação. O do `.env`
 * continua sendo mostrado, como sempre foi — é o mesmo valor, na mesma rota.
 *
 * Por que "o que vale é igual ao do `.env`" basta para rotular a origem como
 * `ambiente`: o token em vigor (`lib/channels/meta/app.ts`) é OU o do banco OU o
 * do `.env` — o do banco só vale com o par inteiro decifrado; fora disso vale o
 * que o `.env` tiver, até pela metade. Então a igualdade só engana num caso: o
 * token do banco coincidir com o do `.env`. E o do banco ninguém escolhe — é
 * gerado pelo servidor com 32 bytes aleatórios —, então coincidir exige alguém
 * ter COPIADO o token gerado para o `.env`. Nesse caso o rótulo erra a origem,
 * mas o valor exibido é o mesmo que já está no `.env`, que esta rota sempre
 * mostrou: não sai nada que antes não saía.
 */
async function tokenDeVerificacaoParaATela(): Promise<{
  verifyToken: string | null;
  verifyTokenOrigem: "ambiente" | "instalacao" | null;
}> {
  const { verifyToken: emVigor } = await appDaMeta();
  if (!emVigor) return { verifyToken: null, verifyTokenOrigem: null };
  if (emVigor === appDaMetaDoAmbiente().verifyToken) {
    return { verifyToken: emVigor, verifyTokenOrigem: "ambiente" };
  }
  return { verifyToken: null, verifyTokenOrigem: "instalacao" };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_official" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const admin = createAdminClient();
  // Canal ARQUIVADO não conta como conectado. A linha sobrevive à exclusão como
  // âncora das FKs, e sem este filtro a tela dizia "conectado" (com a URL de
  // webhook já rotacionada, portanto morta) para um canal que o operador acabou
  // de excluir — e oferecia "Trocar credencial" onde deveria oferecer "Conectar".
  // O POST, ao contrário, PRECISA enxergar a linha arquivada: é ela que ele
  // ressuscita.
  const consultar = () =>
    admin
      .from("channel_sessions")
      .select("id, meta_phone_number_id, meta_waba_id, meta_messaging_account_id, meta_token_encrypted, phone_number, display_name, webhook_path_token, status")
      .eq("organization_id", orgId)
      .eq("provider", CHANNEL_PROVIDER_META);
  const { data } = await queryTolerantToMissingArchived(
    () => consultar().is(ARCHIVED_AT, null).maybeSingle(),
    () => consultar().maybeSingle(),
  );

  const base = basePublicaDoWebhookMeta(req);
  const desfecho = data?.id ? await lerDesfechoDoWebhook(admin, data.id) : null;
  const extras = data?.id ? await lerExtrasDaConexao(admin, orgId, data.id) : null;
  const appProprio = Boolean(extras?.meta_app_secret_encrypted);
  return ok({
    connected: Boolean(data),
    channel_session_id: data?.id ?? null,
    // `hasToken` em vez do token: uma vez gravado, a tela mostra que EXISTE, nunca
    // qual é. Devolver o segredo para preencher o campo seria vazá-lo a cada render.
    hasToken: Boolean(data?.meta_token_encrypted),
    phoneNumberId: data?.meta_phone_number_id ?? null,
    wabaId: data?.meta_waba_id ?? null,
    /** Conta de mensagens (Graph v26) que vai em toda chamada à API de mensagens. */
    messagingAccountId:
      (data as { meta_messaging_account_id?: string | null } | null)?.meta_messaging_account_id ?? null,
    /** Base pública da Graph API — para o operador reaproveitar em outro sistema. */
    endpoint: data ? metaGraphBase() : null,
    displayName: data?.display_name ?? null,
    phoneNumber: data?.phone_number ?? null,
    status: data?.status ?? null,
    /** O que o operador precisa colar do NOSSO lado no dashboard da Meta. */
    webhook: data
      ? {
          callbackUrl: `${base}/api/v1/webhooks/meta/${data.webhook_path_token}`,
          // Com app próprio, o token de verificação é o do NÚMERO: ele foi
          // informado (ou gerado) no assistente e não volta num GET.
          ...(appProprio
            ? { verifyToken: null, verifyTokenOrigem: "numero" as const }
            : await tokenDeVerificacaoParaATela()),
          // A porta para quem PODE abrir a tela da instalação — mesma regra do
          // link de `/admin/google` na Agenda. Para o admin de um tenant qualquer
          // o link seria um 404; a tela diz a ele quem procurar.
          configurarEm: authz.user.is_platform_admin && !authz.user.support ? "/admin/meta" : null,
          // `smb_message_echoes`: o que a empresa manda pelo app WhatsApp Business
          // num número em coexistência. Sem coexistência a Meta não o envia, então
          // assinar é inofensivo para quem não usa. Qualidade e limite do portfólio
          // (issue #5) e qualidade e categoria do modelo (issue #6) só chegam pela
          // URL do APP — por isso entram na lista que a tela manda assinar quando o
          // webhook é configurado à mão.
          fields: [...CAMPOS_DO_WEBHOOK_DO_APP],
        }
      : null,
    /** Para que o administrador declarou o número (issue #5). Nulo = não declarado. */
    uso: lerUsoDoNumero(extras?.uso_declarado),
    /**
     * A saúde do número que a Meta informa — na conexão e pelo webhook
     * `phone_number_quality_update`. Nulo = banco sem a 0536 ou nada informado.
     */
    saude: data
      ? {
          qualidade: extras?.meta_qualidade ?? null,
          limite: extras?.meta_limite_de_mensagens ?? null,
          evento: extras?.meta_saude_evento ?? null,
          em: extras?.meta_saude_em ?? null,
        }
      : null,
    /** Quando o assistente registrou o número na Cloud API (PIN). */
    numeroRegistradoEm: extras?.meta_numero_registrado_em ?? null,
    /**
     * O número usa o app PRÓPRIO (segredo trazido pelo assistente) ou o da
     * instalação? SE existe, nunca QUAL — o segredo não volta para a tela.
     */
    appProprio,
    /**
     * O "Conectar com Facebook" (Embedded Signup v4): só com a chave da instalação
     * ligada. Nulo = a tela não mostra o botão. Só ids públicos atravessam.
     */
    embeddedSignup: await embeddedSignupParaATela(),
    /**
     * E o que a instalação já fez SOZINHA (fatia F1): o webhook deste número está
     * registrado na Meta ou ainda não? `registrado: false` com `erro` é estado
     * esperado e não falha da conexão — o canal ENVIA normalmente; o que depende
     * disto é a ENTREGA. A tela mostra o motivo e oferece tentar de novo.
     */
    webhookRegistro: data
      ? {
          registrado:
            Boolean(desfecho?.meta_webhook_override_uri) && !desfecho?.meta_webhook_override_erro,
          url: desfecho?.meta_webhook_override_uri ?? null,
          erro: desfecho?.meta_webhook_override_erro ?? null,
          em: desfecho?.meta_webhook_override_em ?? null,
        }
      : null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_official" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const parsed = conectarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("invalid_request", t("phone_number_id, waba_id e token são obrigatórios"), 422, {
      requestId,
    });
  }
  const d = parsed.data;

  const resultado = await conectarNumeroOficial({
    admin: createAdminClient(),
    organizationId: orgId,
    userId,
    requestId,
    base: basePublicaDoWebhookMeta(req),
    // Com App Secret ou PIN a chamada veio do assistente; sem, do formulário manual.
    origem: d.app_secret || d.pin ? "assistente" : "manual",
    entrada: {
      phoneNumberId: d.phone_number_id,
      wabaId: d.waba_id,
      token: d.token,
      messagingAccountId: d.messaging_account_id,
      appSecret: d.app_secret ?? null,
      verifyToken: d.verify_token ?? null,
      pin: d.pin ?? null,
      uso: d.uso ?? null,
    },
  });
  if (!resultado.ok) {
    return fail(resultado.code, t(resultado.mensagem), resultado.status, {
      requestId,
      details: { etapa: resultado.etapa },
    });
  }

  return ok({
    connected: true,
    channel_session_id: resultado.channelSessionId,
    displayName: resultado.displayName,
    phoneNumber: resultado.phoneNumber,
    /** `registrado: false` NÃO desfaz a conexão — o canal envia; falta a entrega. */
    webhookRegistro: resultado.webhookRegistro
      ? {
          registrado: resultado.webhookRegistro.registrado,
          url: resultado.webhookRegistro.url,
          erro: resultado.webhookRegistro.erro,
          em: resultado.webhookRegistro.em,
        }
      : null,
    numeroRegistrado: resultado.numeroRegistrado,
    webhookDoApp: resultado.webhookDoApp,
  });
}
