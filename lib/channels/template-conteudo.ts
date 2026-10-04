/**
 * O CONTEÚDO de uma definição aprovada, legível.
 *
 * A lista mostrava só nome, idioma e estado. Ver "APPROVED" sem ver o texto
 * obriga o operador a abrir a plataforma para saber o que a definição diz — e é
 * o texto que ele precisa para escolher qual mandar.
 */

type Bruto = Record<string, unknown>;

const obj = (v: unknown): Bruto | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Bruto) : null;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

export interface ConteudoDaDefinicao {
  /** `midiaUrl`: o link de exemplo do cabeçalho de mídia (`header_handle`), quando há. */
  header: { formato: string; texto: string | null; midiaUrl?: string | null } | null;
  body: string | null;
  footer: string | null;
  /** `url`/`telefone` só nos botões desses tipos — a edição precisa deles de volta. */
  botoes: { tipo: string; texto: string; url?: string; telefone?: string }[];
  /** Quantos `{{n}}` o corpo declara — o que o envio vai precisar preencher. */
  variaveis: number;
  /** As amostras de cada `{{n}}` que a revisão recebeu (`example.body_text[0]`). */
  exemplos?: string[];
}

/**
 * Lê o payload cru como a plataforma o devolveu.
 *
 * Tolerante a caixa (`BODY` e `body` convivem — a Meta lê em maiúsculas,
 * o payload de escrita usa minúsculas) e a campo ausente — uma definição sem
 * rodapé é normal, não erro.
 */
export function lerConteudo(components: unknown): ConteudoDaDefinicao {
  const lista = Array.isArray(components) ? components : [];
  const vazio: ConteudoDaDefinicao = {
    header: null,
    body: null,
    footer: null,
    botoes: [],
    variaveis: 0,
  };

  for (const bruto of lista) {
    const c = obj(bruto);
    if (!c) continue;
    const tipo = (str(c.type) ?? "").toUpperCase();

    if (tipo === "HEADER") {
      const handle = obj(c.example)?.header_handle;
      vazio.header = {
        formato: (str(c.format) ?? "TEXT").toUpperCase(),
        texto: str(c.text),
        midiaUrl: Array.isArray(handle) ? str(handle[0]) : null,
      };
    } else if (tipo === "BODY") {
      vazio.body = str(c.text);
      const amostras = obj(c.example)?.body_text;
      const primeira = Array.isArray(amostras) && Array.isArray(amostras[0]) ? amostras[0] : [];
      vazio.exemplos = primeira.map((v: unknown) => (typeof v === "string" ? v : ""));
    } else if (tipo === "FOOTER") {
      vazio.footer = str(c.text);
    } else if (tipo === "BUTTONS") {
      const bts = Array.isArray(c.buttons) ? c.buttons : [];
      for (const b of bts) {
        const o = obj(b);
        if (!o) continue;
        vazio.botoes.push({
          tipo: (str(o.type) ?? "").toUpperCase(),
          texto: str(o.text) ?? "",
          ...(str(o.url) ? { url: str(o.url)! } : {}),
          ...(str(o.phone_number) ? { telefone: str(o.phone_number)! } : {}),
        });
      }
    }
  }

  vazio.variaveis = contarVariaveis(vazio.body ?? "");
  return vazio;
}

/**
 * Quantos `{{n}}` distintos o texto usa.
 *
 * DISTINTOS, e pelo MAIOR índice: um texto que repete `{{1}}` duas vezes pede
 * um valor, não dois — e um que usa `{{1}}` e `{{3}}` pede três, porque a
 * plataforma numera por posição e recusa a lista com buracos.
 */
function contarVariaveis(texto: string): number {
  const achados = [...texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return achados.length === 0 ? 0 : Math.max(...achados);
}
