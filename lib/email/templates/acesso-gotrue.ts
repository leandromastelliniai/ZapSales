import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";
import { frase, fraseHtml } from "@/lib/email/frase";
import { escapeHtml } from "@/lib/html/escapar";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { IDIOMA_PADRAO, type Idioma } from "@/lib/i18n/idiomas";

/**
 * Os dois e-mails de ACESSO — confirmar conta e redefinir senha — no formato
 * que o GoTrue renderiza.
 *
 * ─── POR QUE ISTO É DIFERENTE DE `invite.ts` ────────────────────────────────
 *
 * O convite de time é montado e ENVIADO por nós. Estes dois não: quem os
 * renderiza e envia é o GoTrue, um processo de terceiro. Nós só entregamos o
 * MOLDE, e ele preenche `{{ .RedirectTo }}` e `{{ .TokenHash }}` na hora do
 * envio. Por isso a saída aqui é uma string de template Go, não um e-mail
 * pronto — e por isso as chaves duplas NÃO passam por escape: elas são sintaxe
 * do renderizador, não dado.
 *
 * ─── POR QUE `token_hash` E NÃO `{{ .ConfirmationURL }}` ────────────────────
 *
 * O modelo PADRÃO do GoTrue linka para `/auth/v1/verify`, que devolve um `code`
 * PKCE. O verificador desse code vive num cookie `SameSite=Strict`
 * (`lib/supabase/server.ts`), e clique vindo de webmail é navegação
 * cross-site: o cookie não viaja, `exchangeCodeForSession` falha, e a conta é
 * confirmada sem que a sessão feche. `token_hash` não depende de cookie nenhum.
 *
 * Medido numa instalação self-hosted em 2026-09-10: com o modelo padrão, o
 * `api_audit_log` registrava `auth.email_link_rejected` com
 * `"PKCE code verifier not found in storage"`; com estes moldes, o mesmo fluxo
 * fecha a sessão.
 *
 * ─── `&`, NUNCA `?` ────────────────────────────────────────────────────────
 *
 * `.RedirectTo` já chega com `?type=` embutido — `signUp.ts` e
 * `requestPasswordReset.ts` o anexam de propósito, porque é o único jeito de o
 * `type` sobreviver ao hop pelo GoTrue no outro formato. Um `?` aqui duplicaria
 * o separador e o parser de URL do browser pararia de reconhecer `token_hash`.
 */

export type ModeloDeAcesso = "confirmation" | "recovery";

export const MODELOS_DE_ACESSO: readonly ModeloDeAcesso[] = ["confirmation", "recovery"];

/**
 * O texto de cada modelo, com a frase em português como chave (`lib/email/frase.ts`).
 * Assunto entra no `GOTRUE_MAILER_SUBJECTS_*`.
 */
const COPIA: Record<ModeloDeAcesso, { assunto: string; titulo: string; corpo: string; botao: string; rodape: string }> = {
  confirmation: {
    assunto: "Confirme seu e-mail · {marca}",
    titulo: "Confirme seu e-mail",
    corpo:
      "Sua conta no {marca} está quase pronta. Clique no botão abaixo para confirmar seu e-mail e ativar sua conta.",
    botao: "Confirmar e-mail",
    rodape: "Se você não criou esta conta, ignore este e-mail.",
  },
  recovery: {
    assunto: "Redefinir sua senha · {marca}",
    titulo: "Redefinir sua senha",
    corpo:
      "Recebemos um pedido para redefinir a senha da sua conta no {marca}. Clique no botão abaixo para escolher uma nova.",
    botao: "Definir nova senha",
    rodape: "Se não foi você quem pediu, ignore este e-mail — sua senha continua a mesma.",
  },
};

export function assuntoDoModelo(
  modelo: ModeloDeAcesso,
  marca: MarcaDeSaida,
  idioma: Idioma = IDIOMA_PADRAO,
): string {
  return frase(idioma, COPIA[modelo].assunto, { marca: marca.nome });
}

/**
 * O molde, com a marca da INSTALAÇÃO já aplicada.
 *
 * Estilo inline apenas e zero asset externo além do logo, pelas mesmas razões
 * de `invite.ts` — inclusive a dimensão no atributo, que o Outlook desktop
 * exige porque descarta `height` de style em imagem.
 */
export function montarTemplateDeAcesso(
  modelo: ModeloDeAcesso,
  marca: MarcaDeSaida,
  idioma: Idioma = IDIOMA_PADRAO,
): string {
  const t = COPIA[modelo];
  const nome = escapeHtml(marca.nome);

  const logo = marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(marca.logoUrl)}" alt="${nome}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";

  // As chaves duplas ficam CRUAS de propósito: o GoTrue as substitui.
  const destino = "{{ .RedirectTo }}&token_hash={{ .TokenHash }}";

  return `<!doctype html>
<html lang="${tagDeIdioma(idioma)}">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">
      ${fraseHtml(idioma, t.titulo)}
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      ${fraseHtml(idioma, t.corpo, { marca: marca.nome })}
    </p>
    <p style="margin:24px 0">
      <a href="${destino}" style="display:inline-block;padding:12px 24px;background:${marca.accent};color:${marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">
        ${fraseHtml(idioma, t.botao)}
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      ${fraseHtml(idioma, "Ou copie e cole este link no navegador:")}<br>
      <span style="word-break:break-all;color:${marca.accent}">${destino}</span>
    </p>
    <p style="margin:24px 0 0;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      ${fraseHtml(idioma, t.rodape)}
    </p>
  </div>
</body>
</html>`;
}
