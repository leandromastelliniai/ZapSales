/**
 * Convite de time, sem React Email, no idioma da organização que convida. Devolve subject/html/text.
 * Estilo inline apenas (compatibilidade com cliente de e-mail); zero asset
 * externo.
 *
 * É o PRIMEIRO artefato que um usuário novo recebe do sistema — e chegava com
 * o nome do NOSSO produto em vez do da instalação que convidou. A marca entra
 * resolvida (`marcaDaSaida(organizationId)`, classe A: há organização), e as
 * cores deixam de ser hexes inventados aqui: o botão usa o accent derivado e o
 * resto vem dos neutros da régua do produto.
 *
 * O LOGO entrou depois, e por um motivo medido: `MarcaDeSaida.logoUrl` era
 * campo morto — resolvido, entregue a este template e a nenhum outro, e
 * renderizado por ninguém. Um e-mail que diz o nome do revendedor mas mostra a
 * arte de ninguém é meia marca; e este é o e-mail que a pessoa abre antes de
 * ter visto qualquer tela do produto.
 */
import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";
import { escapeHtml, frase, fraseHtml } from "@/lib/email/frase";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { IDIOMA_PADRAO, type Idioma } from "@/lib/i18n/idiomas";

export interface InviteEmailOptions {
  inviterName: string;
  orgName: string;
  acceptUrl: string;
  role: string;
  expiresAt: Date;
  /** A marca de quem convidou. Obrigatória — sem ela o e-mail não tem dono. */
  marca: MarcaDeSaida;
  /**
   * O idioma da ORGANIZAÇÃO que convida (`organizations.locale`). Quem é
   * convidado ainda não tem conta nem preferência, e é a da organização que ele
   * herda ao entrar (`lib/auth/server.ts`) — o e-mail fala a língua da tela que
   * ele vai abrir. Ausente, sai no padrão do produto.
   */
  idioma?: Idioma;
}

export function buildInviteEmail(opts: InviteEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const idioma = opts.idioma ?? IDIOMA_PADRAO;
  const tag = tagDeIdioma(idioma);
  const expiresStr = opts.expiresAt.toLocaleString(tag, {
    timeZone: "America/Sao_Paulo",
  });
  const marca = opts.marca.nome;
  const subject = frase(idioma, "{quem} convidou você para a {org} no {marca}", {
    quem: opts.inviterName,
    org: opts.orgName,
    marca,
  });

  /**
   * O logo de quem convidou, quando há um.
   *
   * `<img>` solto e não background: cliente de e-mail não carrega CSS externo e
   * boa parte ignora `background-image`. Dimensão no ATRIBUTO além do style
   * porque Outlook desktop descarta `height` de style em imagem, e sem dimensão
   * ele renderiza a arte no tamanho original — um PNG de 1200px arrebentaria a
   * largura de 560 do corpo.
   *
   * A URL passa por `escapeHtml` como qualquer outro valor: ela vem de
   * `platform_branding.logo_url`, que é `text` livre no banco (a tela de marca
   * ainda não a edita), e uma aspa ali escaparia do atributo.
   *
   * Sem logo, NADA é renderizado: um espaço reservado vazio é pior que ausência
   * — o cliente de e-mail desenharia o ícone de imagem quebrada no topo do
   * primeiro e-mail que a pessoa recebe do sistema.
   */
  const logo = opts.marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(opts.marca.logoUrl)}" alt="${escapeHtml(marca)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";

  const html = `<!doctype html>
<html lang="${tag}">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">
      ${fraseHtml(idioma, "Você foi convidado para a {org}", { org: opts.orgName })}
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      ${fraseHtml(
        idioma,
        "{quem} convidou você como {papel} no {marca}.",
        { quem: opts.inviterName, marca },
        { papel: `<strong>${escapeHtml(opts.role)}</strong>` },
      )}
    </p>
    <p style="margin:24px 0">
      <a href="${opts.acceptUrl}" style="display:inline-block;padding:12px 24px;background:${opts.marca.accent};color:${opts.marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">
        ${fraseHtml(idioma, "Aceitar convite")}
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      ${fraseHtml(idioma, "Ou copie e cole este link no navegador:")}<br>
      <span style="word-break:break-all;color:${opts.marca.accent}">${opts.acceptUrl}</span>
    </p>
    <p style="margin:24px 0 0;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      ${fraseHtml(
        idioma,
        "Este link expira em {quando}. Se você não esperava este convite, pode ignorá-lo.",
        {},
        { quando: `<strong>${escapeHtml(expiresStr)}</strong>` },
      )}
    </p>
  </div>
</body>
</html>`;

  const text = [
    frase(idioma, "Você foi convidado para a {org} como {papel} no {marca}.", {
      org: opts.orgName,
      papel: opts.role,
      marca,
    }),
    "",
    frase(idioma, "Aceitar: {link}", { link: opts.acceptUrl }),
    "",
    frase(idioma, "Expira em {quando}.", { quando: expiresStr }),
  ].join("\n");

  return { subject, html, text };
}
