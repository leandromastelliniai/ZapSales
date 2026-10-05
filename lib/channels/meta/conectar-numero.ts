/**
 * CONECTAR UM NÚMERO OFICIAL — o caso de uso, com três portas de entrada.
 *
 * O formulário manual, o assistente (issue #5) e o Embedded Signup chegam aqui
 * com a mesma pergunta: "esta credencial serve para este número? então conecte".
 * Uma função só porque a ordem dos passos É o produto, e três cópias dela
 * divergiriam no primeiro conserto:
 *
 *   1. VALIDA a credencial contra a Graph ANTES de gravar (número responde, e
 *      pertence à WABA informada). Gravar primeiro e descobrir depois é o que faz
 *      o operador achar que conectou e só entender que não na primeira mensagem
 *      que não sai — com o lead do outro lado esperando.
 *   2. Com App Secret (app PRÓPRIO): confere que o segredo é do app do token.
 *   3. Com PIN: REGISTRA o número na Cloud API — antes de gravar, porque registro
 *      recusado (PIN errado) é motivo para não conectar, e a pessoa corrige na
 *      hora. Registrar não dispara webhook, então a ordem não arrisca handshake.
 *   4. GRAVA a sessão com tudo cifrado (token, App Secret, verify token).
 *   5. Registra o webhook DO NÚMERO (override) — DEPOIS de gravar, nunca antes: o
 *      GET de verificação da Meta chega no instante do registro e procura a
 *      sessão pelo `webhook_path_token`.
 *   6. Com app próprio: aponta o webhook do APP para o mesmo endereço, porque
 *      qualidade, limite e modelos SÓ chegam pela URL do app (não aceitam
 *      override). Falhar aqui não desfaz a conexão — o canal envia e recebe; o
 *      que falta é a saúde, e a tela diz isso.
 *
 * ─── Reconectar é ressuscitar ───────────────────────────────────────────────
 * Conectar por cima de um canal oficial excluído RESSUSCITA a linha
 * (`lib/channels/reactivate.ts`). Sem isso o update devolvia status/credencial/
 * número e deixava `archived_at` no lugar — e o canal "conectado" ficava
 * invisível para o webhook, o ingest, os seletores e o envio. Ressuscitar NÃO
 * devolve a URL de webhook antiga: a exclusão rotacionou o `webhook_path_token`
 * de propósito, e a volta mantém o novo.
 *
 * O token é cifrado pelas MESMAS RPCs do resto do repo (`lib/webhooks/secrets.ts`)
 * e nunca volta num GET.
 */
import { randomBytes } from "node:crypto";

import { audit } from "@/lib/audit";
import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";
import type { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "../archived";
import { CHANNEL_PROVIDER_META } from "../capabilities";
import { reactivateChannelSession } from "../reactivate";
import type { UsoDoNumero } from "../uso";
import { assinarCamposDoApp, conferirSegredoDoApp, registrarNumero } from "./conexao-guiada";
import { validateMetaCredentials } from "./validate-credentials";
import { registrarWebhookDaSessao, type DesfechoDoWebhookDaSessao } from "./webhook-da-sessao";
import { urlDeCallbackDaSessao } from "./webhook-override";

export interface EntradaDaConexao {
  phoneNumberId: string;
  wabaId: string;
  token: string;
  messagingAccountId: string | null;
  /** App Secret do app PRÓPRIO. Ausente = o número usa o app da instalação. */
  appSecret?: string | null;
  /** Verify token do app próprio. Ausente com App Secret = o servidor gera um. */
  verifyToken?: string | null;
  /** PIN de 6 dígitos: com ele o número é registrado na Cloud API. */
  pin?: string | null;
  uso?: UsoDoNumero | null;
  /**
   * Apaga o par do app PRÓPRIO que sobrou de uma conexão anterior. O Embedded
   * Signup liga o número ao app da INSTALAÇÃO, e um par velho faria o webhook
   * conferir a entrega com o segredo do app errado — toda mensagem morreria em
   * 401. O formulário manual ("trocar credencial") não apaga: troca só o token.
   */
  limparAppProprio?: boolean;
}

export type OrigemDaConexao = "manual" | "assistente" | "embedded_signup";

export type ResultadoDaConexao =
  | {
      ok: true;
      channelSessionId: string | null;
      displayName: string;
      phoneNumber: string | null;
      webhookRegistro: DesfechoDoWebhookDaSessao | null;
      /** O assistente registrou o número com o PIN nesta conexão. */
      numeroRegistrado: boolean;
      /** Campos de saúde/modelos assinados no app próprio. Nulo = app da instalação. */
      webhookDoApp: { assinado: boolean; erro: string | null } | null;
    }
  | {
      ok: false;
      status: 422 | 500;
      code: "invalid_request" | "internal_error";
      mensagem: string;
      /** Qual passo recusou — a tela usa para pôr a mensagem no campo certo. */
      etapa: "credencial" | "segredo" | "registro" | "cifra" | "gravacao";
    };

/** Verify token novo: aleatório forte e seguro em query string (como o da instalação). */
function gerarVerifyToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function conectarNumeroOficial(input: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  userId: string;
  requestId: string;
  /** Base pública desta instalação — compõe a URL de callback. */
  base: string;
  origem: OrigemDaConexao;
  entrada: EntradaDaConexao;
}): Promise<ResultadoDaConexao> {
  const { admin, organizationId: orgId, entrada } = input;

  // ─── 1. A credencial presta, e o número é desta WABA? ─────────────────────
  // `wabaId` junto desde a fatia F1: a checagem do número sozinha aceita o par
  // trocado, e o registro do webhook apontaria o override de um número que esta
  // instalação não controla.
  const validacao = await validateMetaCredentials({
    phoneNumberId: entrada.phoneNumberId,
    token: entrada.token,
    wabaId: entrada.wabaId,
  });
  if (!validacao.ok) {
    return { ok: false, status: 422, code: "invalid_request", mensagem: validacao.motivo, etapa: "credencial" };
  }

  // ─── 2. O segredo é do app deste token? ───────────────────────────────────
  const appSecret = entrada.appSecret?.trim() || null;
  let appId: string | null = null;
  if (appSecret) {
    const conferido = await conferirSegredoDoApp({ token: entrada.token, appSecret });
    if (!conferido.ok) {
      return {
        ok: false,
        status: 422,
        code: "invalid_request",
        mensagem: conferido.problema.mensagem,
        etapa: "segredo",
      };
    }
    appId = conferido.appId;
  }

  // ─── 3. Registro do número com o PIN ──────────────────────────────────────
  let numeroRegistrado = false;
  if (entrada.pin) {
    const registro = await registrarNumero({
      phoneNumberId: entrada.phoneNumberId,
      token: entrada.token,
      pin: entrada.pin,
    });
    if (!registro.ok) {
      return { ok: false, status: 422, code: "invalid_request", mensagem: registro.motivo, etapa: "registro" };
    }
    numeroRegistrado = true;
  }

  // ─── 4. Gravar, cifrado ───────────────────────────────────────────────────
  // Sem a GUC de cifra, gravar o token em claro seria pior que recusar.
  // Frases inteiras, e não montadas: são chave de dicionário na rota.
  const semCifra = (mensagem: string): ResultadoDaConexao => ({
    ok: false,
    status: 422,
    code: "invalid_request",
    mensagem,
    etapa: "cifra",
  });
  const cifrado = await encryptWebhookSecret(admin, entrada.token);
  if (!cifrado) {
    return semCifra(
      "cifra indisponível nesta instalação (GUC app.integrations_oauth_key ausente) — o token não foi gravado",
    );
  }

  const verifyToken = appSecret ? entrada.verifyToken?.trim() || gerarVerifyToken() : null;
  let parCifrado: { meta_app_secret_encrypted: string; meta_verify_token_encrypted: string } | null = null;
  if (appSecret && verifyToken) {
    const segredoCifrado = await encryptWebhookSecret(admin, appSecret);
    const verifyCifrado = await encryptWebhookSecret(admin, verifyToken);
    if (!segredoCifrado || !verifyCifrado) {
      return semCifra(
        "cifra indisponível nesta instalação (GUC app.integrations_oauth_key ausente) — a chave secreta do app não foi gravada",
      );
    }
    parCifrado = { meta_app_secret_encrypted: segredoCifrado, meta_verify_token_encrypted: verifyCifrado };
  }

  // A busca NÃO filtra `archived_at`: um canal oficial excluído é exatamente o
  // que esta conexão precisa achar para trazer de volta. Ignorá-lo criaria uma
  // SEGUNDA linha oficial na org — e a linha velha continuaria segurando o par
  // (org, número) na trava da 0106.
  const buscarExistente = (colunas: string) =>
    admin
      .from("channel_sessions")
      .select(colunas)
      .eq("organization_id", orgId)
      .eq("provider", CHANNEL_PROVIDER_META)
      .maybeSingle();
  const { data: existenteRaw } = await queryTolerantToMissingArchived(
    () => buscarExistente(`id, ${ARCHIVED_AT}, webhook_path_token`),
    () => buscarExistente("id, webhook_path_token"),
  );
  const existente = existenteRaw as {
    id: string;
    archived_at?: string | null;
    webhook_path_token?: string | null;
  } | null;

  const agora = new Date().toISOString();
  const linha: Record<string, unknown> = {
    organization_id: orgId,
    provider: CHANNEL_PROVIDER_META,
    meta_phone_number_id: entrada.phoneNumberId,
    meta_waba_id: entrada.wabaId,
    meta_messaging_account_id: entrada.messagingAccountId,
    meta_token_encrypted: cifrado,
    phone_number: validacao.displayPhoneNumber ? `+${validacao.displayPhoneNumber.replace(/\D/g, "")}` : null,
    display_name: validacao.verifiedName ?? "Canal oficial",
    status: "WORKING",
    // As colunas da 0536 só entram quando há o que dizer: a conexão manual de
    // sempre não passa a escrever nelas, e um banco sem a migration continua
    // conectando pelo formulário antigo.
    ...(parCifrado ?? {}),
    ...(entrada.limparAppProprio && !parCifrado
      ? { meta_app_secret_encrypted: null, meta_verify_token_encrypted: null }
      : {}),
    ...(entrada.uso ? { uso_declarado: entrada.uso } : {}),
    ...(validacao.qualityRating || validacao.messagingLimit
      ? {
          meta_qualidade: validacao.qualityRating,
          meta_limite_de_mensagens: validacao.messagingLimit,
          meta_saude_em: agora,
        }
      : {}),
    ...(numeroRegistrado ? { meta_numero_registrado_em: agora } : {}),
  };

  // `update` quando já existe em vez de upsert: a trava única de (org,
  // phone_number) é um índice único PARCIAL (`where archived_at is null`, 0107),
  // que só seria inferível em `ON CONFLICT` se a cláusula repetisse o predicado —
  // e o cliente do PostgREST não expõe isso.
  //
  // O update passa por `reactivateChannelSession` porque reconectar é
  // ressuscitar; para o canal que já estava ativo é um no-op — e a auditoria de
  // volta sai de lá, junto da ressurreição.
  let sessaoGravadaId: string | null = existente?.id ?? null;
  let webhookPathToken: string | null = existente?.webhook_path_token ?? null;
  let error: { message?: string | null } | null = null;

  if (existente) {
    ({ error } = await reactivateChannelSession(
      admin,
      { organizationId: orgId, channelSessionId: existente.id, archivedAt: existente.archived_at ?? null },
      linha,
      {
        userId: input.userId,
        requestId: input.requestId,
        metadata: { provider: CHANNEL_PROVIDER_META, phone_number: linha.phone_number },
      },
    ));
  } else {
    // `select("id, webhook_path_token")`: o registro do webhook precisa dos DOIS —
    // o id para gravar o desfecho na mesma linha, e o token porque é ele que
    // compõe a URL que a Meta vai chamar.
    const inserida = await admin
      .from("channel_sessions")
      .insert({ ...linha, webhook_secret_encrypted: cifrado, metadata: metadataInicialDoCanal() })
      .select("id, webhook_path_token")
      .maybeSingle();
    error = inserida.error;
    sessaoGravadaId = inserida.data?.id ?? null;
    webhookPathToken = inserida.data?.webhook_path_token ?? null;
  }

  if (error) {
    return {
      ok: false,
      status: 500,
      code: "internal_error",
      mensagem: error.message ?? "channel_session_write_failed",
      etapa: "gravacao",
    };
  }

  // ─── 5. O webhook DESTE número (fatia F1) ─────────────────────────────────
  // E o desfecho volta na RESPOSTA, não só no log: quem conectou precisa saber
  // que o canal envia mas ainda não entrega, com o motivo em mãos.
  const webhook =
    sessaoGravadaId && webhookPathToken
      ? await registrarWebhookDaSessao({
          admin,
          channelSessionId: sessaoGravadaId,
          phoneNumberId: entrada.phoneNumberId,
          wabaId: entrada.wabaId,
          tokenCifrado: cifrado,
          webhookPathToken,
          base: input.base,
          requestId: input.requestId,
          par: parCifrado
            ? {
                appSecretCifrado: parCifrado.meta_app_secret_encrypted,
                verifyTokenCifrado: parCifrado.meta_verify_token_encrypted,
              }
            : null,
        })
      : null;

  // ─── 6. Os campos que só chegam pela URL do APP ───────────────────────────
  let webhookDoApp: { assinado: boolean; erro: string | null } | null = null;
  if (appSecret && appId && verifyToken && webhookPathToken) {
    const r = await assinarCamposDoApp({
      appId,
      appSecret,
      callbackUrl: urlDeCallbackDaSessao(input.base, webhookPathToken),
      verifyToken,
    });
    webhookDoApp = r.ok ? { assinado: true, erro: null } : { assinado: false, erro: r.motivo };
  }

  void audit({
    action: "channel.connected",
    actorUserId: input.userId,
    organizationId: orgId,
    resourceType: "channel_session",
    resourceId: sessaoGravadaId,
    requestId: input.requestId,
    // O QUE aconteceu, jamais segredo nenhum.
    metadata: {
      provider: CHANNEL_PROVIDER_META,
      origem: input.origem,
      app_proprio: Boolean(parCifrado),
      numero_registrado: numeroRegistrado,
      uso: entrada.uso ?? null,
      webhook_registrado: webhook?.registrado ?? null,
      webhook_do_app_assinado: webhookDoApp?.assinado ?? null,
    },
  });

  return {
    ok: true,
    channelSessionId: sessaoGravadaId,
    displayName: String(linha.display_name),
    phoneNumber: (linha.phone_number as string | null) ?? null,
    webhookRegistro: webhook,
    numeroRegistrado,
    webhookDoApp,
  };
}
