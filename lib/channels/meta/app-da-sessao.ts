/**
 * O App da Meta DE UM NÚMERO — quando o administrador trouxe o próprio app.
 *
 * O assistente de conexão (issue #5) recebe o token do System User, o App Secret
 * e o verify token: na instalação de uma empresa só, o app da Meta é DELA, e
 * pedir a quem administra a VPS que cadastre o segredo em outra tela seria o
 * "procure quem administra" que o assistente existe para acabar.
 *
 * O par fica cifrado NA SESSÃO (`channel_sessions.meta_app_secret_encrypted` e
 * `meta_verify_token_encrypted`, migration 0536) e vale para o webhook DAQUELE
 * número: o token no caminho escolhe a sessão, e a sessão diz com que segredo a
 * entrega foi assinada. Sessão sem par próprio usa o app da INSTALAÇÃO
 * (`./app.ts`), que é o desenho Tech Provider — um app para N organizações.
 *
 * ─── As duas fontes NÃO se misturam ─────────────────────────────────────────
 * Mesma regra de `./app.ts`: o par só é servido inteiro, da mesma origem. Segredo
 * da sessão com verify token da instalação é um app que não existe — o handshake
 * passaria e toda entrega morreria em 401.
 *
 * ─── Nunca lança ────────────────────────────────────────────────────────────
 * Roda a cada entrega da Meta; um throw aqui é 500 e reentrega em backoff de um
 * evento que nunca vai melhorar. Falha de decifra cai para a instalação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

import { appDaMeta, type AppDaMetaEmVigor } from "./app";

/** As duas colunas cifradas da sessão — nulas quando o número usa o app da instalação. */
export interface ParCifradoDaSessao {
  appSecretCifrado: string | null;
  verifyTokenCifrado: string | null;
}

export interface AppDaMetaDoNumero extends AppDaMetaEmVigor {
  /** De onde veio o par — para o log de diagnóstico e para a tela. */
  readonly origem: "sessao" | "instalacao";
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** O par em vigor para ESTE número: o da sessão, inteiro, ou o da instalação. */
export async function appDaMetaDoNumero(
  admin: SupabaseClient,
  par: ParCifradoDaSessao,
): Promise<AppDaMetaDoNumero> {
  const segredoCifrado = texto(par.appSecretCifrado);
  const tokenCifrado = texto(par.verifyTokenCifrado);
  if (segredoCifrado && tokenCifrado) {
    try {
      const appSecret = texto(await decryptWebhookSecret(admin, segredoCifrado));
      const verifyToken = texto(await decryptWebhookSecret(admin, tokenCifrado));
      if (appSecret && verifyToken) return { appSecret, verifyToken, origem: "sessao" };
      logger.warn("[meta.app] o par do número não decifrou; vale o app da instalação");
    } catch (err) {
      logger.warn("[meta.app] decifra do par do número falhou; vale o app da instalação", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ...(await appDaMeta()), origem: "instalacao" };
}
