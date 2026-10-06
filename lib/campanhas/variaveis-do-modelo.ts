/**
 * De onde sai o valor de cada variável do MODELO APROVADO numa campanha oficial
 * (issue #8) — puro, sem banco e sem rede.
 *
 * ═══ Por que um mapa por campanha, e não o renderizador de texto livre ═══
 *
 * O modo de texto livre escreve o texto e usa `{{nome}}`/`{{primeiro_nome}}`
 * (`./renderizador.ts`). No modo oficial o texto é da Meta: ele já foi aprovado
 * com `{{1}}`, `{{2}}` ou `{{nome_do_cliente}}`, e o que a campanha decide é só
 * DE ONDE vem cada valor. Um modelo posicional não diz que `{{1}}` é o nome —
 * quem sabe é o operador, e o mapa é onde ele diz.
 *
 * ═══ Chave = `slotKey` ═══
 *
 * O mapa é chaveado pela MESMA função que monta o envio
 * (`lib/channels/meta/build-components.ts`): `"1"` no corpo, `"header:1"`,
 * `"button0:1"`. Chave montada de outro jeito é variável que nunca chega.
 *
 * ═══ Valor vazio é FALTA, nunca envio ═══
 *
 * A Meta recusa parâmetro vazio (132000) e, pior, um `{{1}}` vazio faria a
 * mensagem chegar como "Oi , sua oferta". Contato sem o dado vira exclusão
 * `variavel_ausente` na preparação — a mesma régua do modo de texto livre.
 */
import { z } from "zod";

import { slotKey } from "@/lib/channels/meta/build-components";
import type { TemplateContract } from "@/lib/channels/meta/template-contract";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

/** Os campos do contato que uma variável pode ler. Oferecer outro é prometer dado que não há. */
export const CAMPOS_DO_CONTATO = ["nome", "primeiro_nome", "telefone", "email"] as const;
export type CampoDoContato = (typeof CAMPOS_DO_CONTATO)[number];

export const fonteDaVariavelSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("contato"), campo: z.enum(CAMPOS_DO_CONTATO) }),
  z.object({ tipo: z.literal("campo_personalizado"), chave: z.string().trim().min(1).max(80) }),
  z.object({ tipo: z.literal("fixo"), valor: z.string().max(1024) }),
]);
export type FonteDaVariavel = z.infer<typeof fonteDaVariavelSchema>;

/** `campaigns.template_variables`: slotKey → fonte. */
export const mapaDeVariaveisSchema = z.record(z.string().min(1).max(80), fonteDaVariavelSchema);
export type MapaDeVariaveis = z.infer<typeof mapaDeVariaveisSchema>;

/** O que se lê do contato para preencher variável. */
export interface ContatoDasVariaveis {
  name?: string | null;
  display_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  custom_fields?: unknown;
}

/** As chaves de envio do modelo, sem repetição (`{{1}}` duas vezes no corpo é UM valor). */
export function chavesDoModelo(contrato: TemplateContract): string[] {
  return [...new Set(contrato.slots.map((s) => slotKey(s.address, s.key)))];
}

function textoDe(valor: unknown): string {
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return "";
}

function resolver(fonte: FonteDaVariavel, contato: ContatoDasVariaveis): string {
  switch (fonte.tipo) {
    case "fixo":
      return fonte.valor.trim();
    case "campo_personalizado": {
      const campos = contato.custom_fields;
      if (!campos || typeof campos !== "object" || Array.isArray(campos)) return "";
      return textoDe((campos as Record<string, unknown>)[fonte.chave]);
    }
    case "contato":
      switch (fonte.campo) {
        case "nome":
          return nomeDoContato(contato) ?? "";
        case "primeiro_nome":
          return (nomeDoContato(contato) ?? "").split(/\s+/)[0] ?? "";
        case "telefone":
          return textoDe(contato.phone_number);
        case "email":
          return textoDe(contato.email);
      }
  }
}

export interface ValoresDoDestinatario {
  /** `template_values` do envio, chaveado por slotKey. */
  valores: Record<string, string>;
  /** Slots sem fonte ou que resolveram vazio para ESTE contato. Vazio = pode enviar. */
  faltando: string[];
}

export function valoresDoDestinatario(
  contrato: TemplateContract,
  mapa: MapaDeVariaveis,
  contato: ContatoDasVariaveis,
): ValoresDoDestinatario {
  const valores: Record<string, string> = {};
  const faltando: string[] = [];
  for (const chave of chavesDoModelo(contrato)) {
    const fonte = mapa[chave];
    const valor = fonte ? resolver(fonte, contato) : "";
    if (valor === "") faltando.push(chave);
    else valores[chave] = valor;
  }
  return { valores, faltando };
}

/**
 * O que impede o mapa de servir a ESTE modelo, independente de contato: variável
 * sem fonte (o envio sairia incompleto para todo mundo) e chave que o modelo não
 * tem (sinal de mapa feito para outro modelo — o operador trocou o modelo e o
 * mapa ficou para trás).
 */
export function problemasDoMapa(
  contrato: TemplateContract,
  mapa: MapaDeVariaveis,
): { semFonte: string[]; desconhecidas: string[] } {
  const chaves = chavesDoModelo(contrato);
  const doModelo = new Set(chaves);
  return {
    semFonte: chaves.filter((c) => {
      const f = mapa[c];
      return !f || (f.tipo === "fixo" && f.valor.trim() === "");
    }),
    desconhecidas: Object.keys(mapa).filter((c) => !doModelo.has(c)),
  };
}
