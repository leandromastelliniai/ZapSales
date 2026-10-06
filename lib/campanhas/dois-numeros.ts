/**
 * O MODO "DOIS NÚMEROS" (issue #9) — puro, sem banco e sem rede.
 *
 * O modelo sai pelo número OFICIAL (sem risco de banimento, com limite e
 * qualidade medidos pela Meta) e traz um botão de link `wa.me` que abre conversa
 * com um número conectado por QR code, onde o atendimento segue fora da API
 * Oficial — sem janela de 24 h nem cobrança por conversa. Quem clica e escreve
 * cai no MESMO contato da campanha: a ingestão do número de QR code acha o
 * contato pelo telefone canônico, e a resposta é atribuída à campanha pelo contato
 * (`./resposta.ts`), não pelo número.
 *
 * O botão é do modelo — aprovado pela Meta, não editável aqui. Então o modo
 * CONFERE o modelo em vez de montá-lo:
 *
 * - URL fixa (`https://wa.me/5531999990000`): tem de abrir o número escolhido;
 * - URL dinâmica com a variável logo depois de `wa.me/`
 *   (`https://wa.me/{{1}}`): o sistema preenche com o número escolhido, e o
 *   operador não precisa (nem pode) dizer de onde vem essa variável.
 */
import { slotKey } from "@/lib/channels/meta/build-components";
import { samePhone } from "@/lib/channels/phone-variants";

import type { MapaDeVariaveis } from "./variaveis-do-modelo";

export interface BotaoWaMe {
  /** Índice do botão no componente BUTTONS — o mesmo do envio. */
  index: number;
  url: string;
  /** Dígitos do número que a URL fixa abre; `null` quando o número é variável. */
  numeroFixo: string | null;
  /** `slotKey` da variável que É o número (`button1:1`); `null` com URL fixa. */
  slot: string | null;
}

interface Botao {
  type?: unknown;
  url?: unknown;
}

/** `wa.me/<número|{{var}}>` ou `api.whatsapp.com/send?phone=<número|{{var}}>`. */
const WA_ME = /^https?:\/\/(?:www\.)?(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^#]*&)?phone=)(?:(\d{8,15})|\{\{(\w+)\}\})/i;

/** O primeiro botão de link do modelo que abre conversa no WhatsApp, ou `null`. */
export function botaoWaMe(components: unknown): BotaoWaMe | null {
  if (!Array.isArray(components)) return null;
  for (const c of components as Array<{ type?: unknown; buttons?: unknown }>) {
    if (String(c?.type ?? "").toUpperCase() !== "BUTTONS" || !Array.isArray(c.buttons)) continue;
    const botoes = c.buttons as Botao[];
    for (let index = 0; index < botoes.length; index++) {
      const b = botoes[index]!;
      if (String(b?.type ?? "").toUpperCase() !== "URL" || typeof b.url !== "string") continue;
      const m = WA_ME.exec(b.url.trim());
      if (!m) continue;
      return {
        index,
        url: b.url,
        numeroFixo: m[1] ?? null,
        slot: m[2] ? slotKey({ kind: "button", subType: "url", index }, m[2]) : null,
      };
    }
  }
  return null;
}

const digitos = (v: string) => v.replace(/\D/g, "");

/**
 * Por que este modelo não serve para o modo dois números com este número — ou
 * `null`. A frase é para o operador.
 */
export function recusaDoBotaoWaMe(components: unknown, telefoneDoAtendimento: string | null): string | null {
  if (!telefoneDoAtendimento || digitos(telefoneDoAtendimento) === "") {
    return "O número de atendimento ainda não tem telefone conhecido — conecte-o pelo QR code antes de usá-lo na campanha.";
  }
  const botao = botaoWaMe(components);
  if (!botao) {
    return (
      "No modo dois números o modelo precisa de um botão de link para wa.me (ex.: https://wa.me/{{1}}). " +
      "Escolha um modelo com esse botão ou crie um."
    );
  }
  if (botao.numeroFixo && !samePhone(`+${botao.numeroFixo}`, `+${digitos(telefoneDoAtendimento)}`)) {
    return (
      `O botão do modelo abre o número ${botao.numeroFixo}, e o número de atendimento escolhido é ` +
      `${digitos(telefoneDoAtendimento)}. Escolha o número certo ou um modelo com o botão para ele.`
    );
  }
  return null;
}

/**
 * O mapa de variáveis com o número de atendimento no lugar da variável do botão
 * — quando a URL é dinâmica. Com URL fixa, o mapa volta como veio.
 */
export function mapaComNumeroDeAtendimento(
  components: unknown,
  mapa: MapaDeVariaveis,
  telefoneDoAtendimento: string,
): MapaDeVariaveis {
  const botao = botaoWaMe(components);
  if (!botao?.slot) return mapa;
  return { ...mapa, [botao.slot]: { tipo: "fixo", valor: digitos(telefoneDoAtendimento) } };
}
