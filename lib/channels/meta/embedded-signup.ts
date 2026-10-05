/**
 * EMBEDDED SIGNUP v4 — o "Conectar com Facebook", DESLIGADO por padrão.
 *
 * O fluxo: o navegador abre o login da Meta (SDK JS, `FB.login` com o
 * `config_id` da configuração de Embedded Signup); a pessoa escolhe a empresa, a
 * WABA e o número; a janela devolve um CÓDIGO de uso único e, por `postMessage`,
 * os ids da WABA e do número. O código vai para o NOSSO servidor, que o troca pelo
 * token de negócio com o App Secret — o segredo nunca chega ao navegador. Daí em
 * diante é a mesma conexão do assistente: validar, inscrever o app, registrar o
 * número e o webhook.
 *
 * ─── Por que desligado ──────────────────────────────────────────────────────
 * Oferecer o botão a terceiros exige um app Tech Provider aprovado pela Meta
 * (spec, "Out of Scope"). Até lá a chave fica desligada, e é decisão de quem
 * administra a INSTALAÇÃO (`platform_meta_app.embedded_signup_ligado`, 0536) —
 * não da organização, porque o app é um só para todas.
 *
 * ─── O que a tela recebe ────────────────────────────────────────────────────
 * Só `app_id` e `config_id`, que o SDK exige no navegador e são públicos por
 * natureza. Com a chave ligada mas qualquer peça faltando (ids, App Secret), a
 * tela NÃO mostra o botão: um botão que abre o login e morre na troca do código
 * é pior que nenhum.
 *
 * Nunca lança: roda dentro do GET da tela de conexão.
 */
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { appDaMeta } from "./app";
import { graphBaseUrl } from "./graph-base";

/** O que o navegador precisa para abrir o Embedded Signup. */
export interface EmbeddedSignupNaTela {
  appId: string;
  configId: string;
}

interface LinhaDoEmbeddedSignup {
  app_id: string | null;
  embedded_signup_config_id: string | null;
  embedded_signup_ligado: boolean | null;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** A configuração gravada, ou `null` quando desligada/incompleta. Nunca lança. */
export async function configDoEmbeddedSignup(): Promise<EmbeddedSignupNaTela | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("platform_meta_app")
      .select("app_id, embedded_signup_config_id, embedded_signup_ligado")
      .eq("id", 1)
      .maybeSingle();
    // Banco sem a 0536 devolve 42703: é "desligado", não erro desta tela.
    if (error || !data) return null;
    const linha = data as LinhaDoEmbeddedSignup;
    if (linha.embedded_signup_ligado !== true) return null;
    const appId = texto(linha.app_id);
    const configId = texto(linha.embedded_signup_config_id);
    if (!appId || !configId) return null;
    return { appId, configId };
  } catch (err) {
    logger.warn("[meta.embedded-signup] leitura da chave falhou; botão desligado", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * O que a tela de conexão recebe: os ids públicos, SÓ quando a troca do código
 * tem como dar certo — chave ligada, ids gravados E App Secret da instalação.
 */
export async function embeddedSignupParaATela(): Promise<EmbeddedSignupNaTela | null> {
  const config = await configDoEmbeddedSignup();
  if (!config) return null;
  const { appSecret } = await appDaMeta();
  return appSecret ? config : null;
}

/**
 * Troca o código de uso único (30 segundos de vida) pelo token de negócio.
 *
 * `GET /oauth/access_token?client_id&client_secret&code`, como a documentação de
 * Tech Provider manda — sem `redirect_uri`. O segredo vai na busca porque é o
 * contrato da Meta para esta chamada; ela é feita do SERVIDOR para a Meta, por
 * TLS, e nunca passa pelo navegador nem pelo nosso log. Nunca lança.
 */
export async function trocarCodigoDoEmbeddedSignup(input: {
  code: string;
  appId: string;
  appSecret: string;
}): Promise<{ ok: true; token: string } | { ok: false; motivo: string }> {
  const busca = new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    code: input.code,
  });
  try {
    const res = await fetch(`${graphBaseUrl()}/oauth/access_token?${busca.toString()}`);
    const corpo = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error?: { message?: string; error_data?: { details?: string } };
    };
    if (res.ok && typeof corpo.access_token === "string" && corpo.access_token) {
      return { ok: true, token: corpo.access_token };
    }
    return {
      ok: false,
      motivo: corpo.error?.error_data?.details ?? corpo.error?.message ?? `http_${res.status}`,
    };
  } catch (err) {
    return { ok: false, motivo: `rede indisponível: ${err instanceof Error ? err.message : "erro"}` };
  }
}
