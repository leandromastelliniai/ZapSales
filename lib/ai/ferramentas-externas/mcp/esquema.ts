/**
 * Do que um servidor MCP DECLARA ao que o agente PREENCHE.
 *
 * O servidor descreve cada ferramenta com um esquema JSON arbitrário. O agente, no ZapSales,
 * preenche campos simples (texto, número, inteiro, sim/não — `ParametroDaFerramenta`), os
 * mesmos das ferramentas por webhook: assim a conferência do que o modelo preencheu, o
 * resumo do pedido de aprovação na Central e a tela são UMA só.
 *
 *  - Campo simples → vira campo. Lista de opções (`enum` de textos) vira texto com as opções
 *    na descrição (o servidor confere o resto).
 *  - Campo OPCIONAL que não é simples (lista, objeto) → é IGNORADO e a ferramenta segue; a
 *    tela diz quais ficaram de fora.
 *  - Campo OBRIGATÓRIO que não é simples → a ferramenta NÃO é suportada (o agente não saberia
 *    chamá-la), e a tela diz por quê.
 *
 * Tudo o que vem do servidor é texto de TERCEIRO: nome, descrição e esquema entram no que o
 * modelo lê. `sanitizarTextoDoServidor` o limpa e `impressaoDaDefinicao` deixa a tela perceber
 * que o servidor mudou uma ferramenta depois de o administrador tê-la escolhido.
 */
import { createHash } from "node:crypto";

import { LIMITES_DA_FERRAMENTA, type ParametroDaFerramenta, type TipoDeParametro } from "../tipos";
import type { MotivoDeFerramentaNaoSuportada } from "./tipos";

/** O nome de um campo que o MODELO consegue usar: o que os provedores aceitam em esquema de ferramenta. */
export const NOME_DE_CAMPO_DO_MCP = /^[A-Za-z_][A-Za-z0-9_-]{0,39}$/;

export type ConversaoDoEsquema =
  | { ok: true; parametros: ParametroDaFerramenta[]; ignorados: string[] }
  | { ok: false; motivo: MotivoDeFerramentaNaoSuportada };

const TIPOS_SIMPLES: Record<string, TipoDeParametro> = {
  string: "texto",
  number: "numero",
  integer: "inteiro",
  boolean: "booleano",
};

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

/** O tipo simples de uma propriedade, ou `null` se o agente não sabe preenchê-la. `["string","null"]` vale `string`. */
function tipoSimples(propriedade: Record<string, unknown>): TipoDeParametro | null {
  const bruto = propriedade.type;
  const tipos = (Array.isArray(bruto) ? bruto : [bruto]).filter((t): t is string => typeof t === "string" && t !== "null");
  if (tipos.length !== 1) return null;
  return TIPOS_SIMPLES[tipos[0]!] ?? null;
}

/**
 * Texto de terceiro, limpo para entrar numa descrição de ferramenta: sem caracteres de controle,
 * sem marcação que se passa por papel de conversa, em uma linha e com teto. Não é uma defesa
 * completa — quem fecha a porta é o administrador, que LÊ o texto antes de escolher a ferramenta —,
 * mas tira o truque barato.
 */
export function sanitizarTextoDoServidor(texto: string, maximo: number): string {
  const limpo = texto
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/<\/?\s*(system|assistant|user|developer|tool|instructions?)\b[^>]*>/gi, " ")
    .replace(/\[\/?\s*(INST|SYS)\s*\]|<<\/?\s*SYS\s*>>|<\|[^|>]*\|>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo.length > maximo ? `${limpo.slice(0, maximo - 1).trimEnd()}…` : limpo;
}

function descricaoDoCampo(nome: string, propriedade: Record<string, unknown>): string {
  const base = typeof propriedade.description === "string" ? sanitizarTextoDoServidor(propriedade.description, 200) : "";
  const opcoes = Array.isArray(propriedade.enum)
    ? propriedade.enum.filter((v): v is string => typeof v === "string").slice(0, 20)
    : [];
  let descricao = base.length >= LIMITES_DA_FERRAMENTA.descricaoDoParametro.min ? base : `Campo ${nome}`;
  if (opcoes.length > 0) {
    descricao = `${descricao.replace(/\.$/, "")}. Valores aceitos: ${opcoes.join(", ")}.`;
  }
  return sanitizarTextoDoServidor(descricao, LIMITES_DA_FERRAMENTA.descricaoDoParametro.max);
}

export function parametrosDoEsquemaMcp(esquema: unknown): ConversaoDoEsquema {
  // Sem esquema: a ferramenta não pede nada. O protocolo exige um objeto, mas servidor torto existe,
  // e «sem campos» é o que a chamada sem argumentos significa.
  if (esquema === undefined || esquema === null) return { ok: true, parametros: [], ignorados: [] };
  const raiz = objeto(esquema);
  if (!raiz) return { ok: false, motivo: "esquema_invalido" };
  if (raiz.type !== undefined && raiz.type !== "object") return { ok: false, motivo: "esquema_invalido" };

  const propriedades = raiz.properties === undefined ? {} : objeto(raiz.properties);
  if (!propriedades) return { ok: false, motivo: "esquema_invalido" };
  const obrigatorios = new Set(
    Array.isArray(raiz.required) ? raiz.required.filter((r): r is string => typeof r === "string") : [],
  );

  const parametros: ParametroDaFerramenta[] = [];
  const ignorados: string[] = [];
  for (const [nome, bruta] of Object.entries(propriedades)) {
    const propriedade = objeto(bruta);
    const obrigatorio = obrigatorios.has(nome);
    const tipo = propriedade ? tipoSimples(propriedade) : null;
    if (!propriedade || tipo === null) {
      if (obrigatorio) return { ok: false, motivo: "campo_obrigatorio_complexo" };
      ignorados.push(nome);
      continue;
    }
    if (!NOME_DE_CAMPO_DO_MCP.test(nome)) return { ok: false, motivo: "nome_de_campo_invalido" };
    parametros.push({ nome, tipo, descricao: descricaoDoCampo(nome, propriedade), obrigatorio });
  }
  if (parametros.length > LIMITES_DA_FERRAMENTA.parametros.max) return { ok: false, motivo: "campos_demais" };
  return { ok: true, parametros, ignorados };
}

function canonico(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(canonico);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonico(v)]),
    );
  }
  return valor;
}

/**
 * A impressão digital do que o servidor DECLAROU de uma ferramenta (descrição e esquema). Guardada
 * quando o administrador escolhe a ferramenta; na próxima descoberta, se mudou, a tela avisa — o
 * agente continua usando a definição que o administrador viu, não a que o servidor passou a mandar.
 */
export function impressaoDaDefinicao(definicao: { descricao: string; esquema: unknown }): string {
  return createHash("sha256").update(JSON.stringify(canonico({ d: definicao.descricao, e: definicao.esquema }))).digest("hex");
}
