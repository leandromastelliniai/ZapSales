/**
 * O TEXTO PRINCIPAL DE UMA PÁGINA — o que uma pessoa leria (issue #93).
 *
 * Fica de fora: script, estilo, menu, cabeçalho, rodapé, formulário, e tudo o
 * que a PRÓPRIA página esconde (`hidden`, `aria-hidden`, `display:none`,
 * `visibility:hidden`, comentário, `<template>`, `<noscript>`). O escondido não é
 * só ruído: é o lugar clássico de uma instrução plantada para o agente. O texto
 * VISÍVEL continua sendo só texto — entra na base como dado, como qualquer
 * material, e nada aqui o interpreta.
 *
 * Sem dependência de parser: é um tokenizador linear (uma passada, pilha de
 * elementos abertos), então HTML torto ou hostil custa O(n) — não recursão, não
 * regex com retrocesso. O limite de bytes já foi imposto por quem baixou.
 */

export interface PaginaExtraida {
  titulo: string | null;
  texto: string;
}

const ELEMENTOS_VAZIOS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

/** Conteúdo bruto: o que há entre a abertura e o fechamento NÃO é marcação. */
const ELEMENTOS_DE_TEXTO_BRUTO = new Set(["script", "style", "textarea"]);

/** Descartados sempre, com tudo o que contêm. */
const SEMPRE_FORA = new Set(["script", "style", "noscript", "template", "svg", "iframe", "object", "canvas", "select"]);

/** Estrutura de página que não é conteúdo — descartada, com uma rede de segurança (ver `extrair`). */
const ESTRUTURA_FORA = new Set(["nav", "header", "footer", "aside", "form"]);

const BLOCOS = new Set([
  "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "section", "article", "main",
  "blockquote", "pre", "dt", "dd", "dl", "figure", "figcaption", "details", "summary", "address", "fieldset",
]);

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>?/gy;

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", trade: "™", hellip: "…",
  mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", bull: "•",
  middot: "·", deg: "°", euro: "€", pound: "£", cent: "¢", sect: "§", ordm: "º", ordf: "ª", iexcl: "¡", iquest: "¿",
  times: "×", divide: "÷", frac12: "½",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í",
  Oacute: "Ó", Uacute: "Ú", agrave: "à", egrave: "è", Agrave: "À", acirc: "â", ecirc: "ê", ocirc: "ô",
  Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô", atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ", ccedil: "ç",
  Ccedil: "Ç", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", auml: "ä", ouml: "ö", szlig: "ß",
};

function decodificarEntidades(texto: string): string {
  if (!texto.includes("&")) return texto;
  return texto.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,8});/g, (inteira, corpo: string) => {
    if (corpo[0] === "#") {
      const codigo = corpo[1] === "x" || corpo[1] === "X" ? parseInt(corpo.slice(2), 16) : parseInt(corpo.slice(1), 10);
      if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff || (codigo >= 0xd800 && codigo <= 0xdfff)) {
        return inteira;
      }
      const c = String.fromCodePoint(codigo);
      return c === " " ? " " : c;
    }
    return ENTIDADES[corpo] ?? inteira;
  });
}

function atributo(atributos: string, nome: string): string | null {
  const m = new RegExp(`(?:^|[\\s"'/])${nome}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?=[\\s/>]|$)`, "i").exec(atributos);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? "";
}

function escondidoPelaPagina(atributos: string): boolean {
  if (atributos === "") return false;
  if (atributo(atributos, "hidden") !== null) return true;
  if ((atributo(atributos, "aria-hidden") ?? "").trim().toLowerCase() === "true") return true;
  const estilo = atributo(atributos, "style");
  return estilo !== null && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(estilo);
}

interface Acumulador {
  partes: string[];
}

/** Quebra que vem de TAG (abre/fecha bloco): várias seguidas valem uma. A do texto cru é o "\n" de verdade. */
const QUEBRA = "\u0001";

function juntar(a: Acumulador): string {
  const linhas = a.partes
    .join("")
    .replace(/[ \t\r\f\v]*\u0001(?:\s*\u0001)*[ \t\r\f\v]*/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\r]+/g, " ").trim());
  const saida: string[] = [];
  for (const l of linhas) {
    if (l === "" && (saida.length === 0 || saida[saida.length - 1] === "")) continue;
    saida.push(l);
  }
  while (saida.length > 0 && saida[saida.length - 1] === "") saida.pop();
  return saida.join("\n");
}

function extrair(
  html: string,
  descartarEstrutura: boolean,
): { titulo: string | null; todo: string; principal: string; estruturaSemFechar: boolean } {
  const todo: Acumulador = { partes: [] };
  const principal: Acumulador = { partes: [] };
  let titulo: string | null = null;
  let primeiroH1: string | null = null;

  /** Elementos abertos; o que importa de cada um é se o ELE (ou um ancestral) esconde o texto. */
  const pilha: Array<{ nome: string; fora: boolean; principal: boolean; h1: boolean }> = [];
  let foraDesde = 0; // quantos elementos abertos descartam o texto
  let principalDesde = 0;
  let dentroDoTitle = false;
  let bufferDoTitle = "";
  let bufferDoH1: string | null = null;

  const escrever = (texto: string) => {
    if (texto === "") return;
    if (dentroDoTitle) {
      bufferDoTitle += texto;
      return;
    }
    if (foraDesde > 0) return;
    todo.partes.push(texto);
    if (principalDesde > 0) principal.partes.push(texto);
    if (bufferDoH1 !== null) bufferDoH1 += texto;
  };
  const quebrar = () => {
    if (foraDesde > 0) return;
    todo.partes.push(QUEBRA);
    if (principalDesde > 0) principal.partes.push(QUEBRA);
  };

  const fechar = (indice: number) => {
    while (pilha.length > indice) {
      const e = pilha.pop()!;
      if (e.fora) foraDesde--;
      if (e.principal) principalDesde--;
      if (e.h1 && bufferDoH1 !== null) {
        if (primeiroH1 === null) primeiroH1 = bufferDoH1.replace(/\s+/g, " ").trim() || null;
        bufferDoH1 = null;
      }
    }
  };

  let pos = 0;
  TOKEN.lastIndex = 0;
  while (pos < html.length) {
    const proximo = html.indexOf("<", pos);
    if (proximo === -1) {
      escrever(decodificarEntidades(html.slice(pos)));
      break;
    }
    if (proximo > pos) escrever(decodificarEntidades(html.slice(pos, proximo)));
    TOKEN.lastIndex = proximo;
    const m = TOKEN.exec(html);
    if (!m) {
      // "<" solto (ex.: "a < b"): é texto.
      escrever("<");
      pos = proximo + 1;
      continue;
    }
    pos = TOKEN.lastIndex;
    if (m[0].startsWith("<!--")) continue; // comentário: some, inclusive o não fechado.

    const fechamento = m[1] === "/";
    const nome = m[2]!.toLowerCase();
    const atributos = m[3] ?? "";

    if (fechamento) {
      if (nome === "title") dentroDoTitle = false;
      for (let i = pilha.length - 1; i >= 0; i--) {
        if (pilha[i]!.nome === nome) {
          fechar(i);
          break;
        }
      }
      if (BLOCOS.has(nome) || nome === "br") quebrar();
      continue;
    }

    if (nome === "title") {
      dentroDoTitle = true;
      bufferDoTitle = "";
      continue;
    }

    if (ELEMENTOS_DE_TEXTO_BRUTO.has(nome)) {
      // Pula até o fechamento correspondente (ou o fim, se nunca fechar).
      const fim = html.toLowerCase().indexOf(`</${nome}`, pos);
      if (fim === -1) {
        pos = html.length;
      } else {
        const gt = html.indexOf(">", fim);
        pos = gt === -1 ? html.length : gt + 1;
      }
      continue;
    }

    if (nome === "br") {
      quebrar();
      continue;
    }
    if (ELEMENTOS_VAZIOS.has(nome) || m[0].endsWith("/>")) continue;

    const fora = SEMPRE_FORA.has(nome) || (descartarEstrutura && ESTRUTURA_FORA.has(nome)) || escondidoPelaPagina(atributos);
    const ehPrincipal = nome === "main" || nome === "article" || (atributo(atributos, "role") ?? "").toLowerCase() === "main";
    const ehH1 = nome === "h1" && foraDesde === 0 && bufferDoH1 === null && primeiroH1 === null;

    if (BLOCOS.has(nome)) quebrar();
    if (nome === "li" && foraDesde === 0 && !fora) escrever("- ");
    if (nome === "td" || nome === "th") escrever(" ");

    pilha.push({ nome, fora, principal: ehPrincipal, h1: ehH1 });
    if (fora) foraDesde++;
    if (ehPrincipal) principalDesde++;
    if (ehH1) bufferDoH1 = "";
  }
  const estruturaSemFechar = descartarEstrutura && pilha.some((e) => e.fora && ESTRUTURA_FORA.has(e.nome));
  fechar(0);

  const doTitle = bufferDoTitle.replace(/\s+/g, " ").trim();
  titulo = doTitle !== "" ? doTitle : primeiroH1;
  return { titulo, todo: juntar(todo), principal: juntar(principal), estruturaSemFechar };
}

/** Abaixo disto o miolo de <main>/<article> é pouco demais para valer sozinho. */
const MIOLO_MINIMO = 200;

export function extrairTextoPrincipal(html: string): PaginaExtraida {
  let r = extrair(html, true);
  // Rede de segurança: rodapé/menu que NUNCA FECHA engole o resto da página. Só nesse caso
  // refaz sem descartar a estrutura — texto a mais é melhor que página vazia. (Página que é
  // só menu, com tudo fechado, continua vazia: o que ela tem não é conteúdo.)
  if (r.estruturaSemFechar) {
    const sem = extrair(html, false);
    if (sem.todo.length > r.todo.length) r = sem;
  }
  const texto = r.principal.length >= MIOLO_MINIMO ? r.principal : r.todo;
  return { titulo: r.titulo, texto };
}
