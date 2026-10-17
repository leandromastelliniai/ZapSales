/**
 * LER UMA PÁGINA DE SITE PARA O AGENTE APRENDER (issue #93, parte da #86).
 *
 * Todo acesso passa pela rede segura única (`lib/net/rede-segura`, #88): só
 * HTTPS, DNS resolvido uma vez e preso ao socket, endereço interno/privado/local
 * recusado a cada salto de redirecionamento, prazo TOTAL e teto de bytes contado
 * no que chega. Aqui só entram as decisões desta função: o que é uma página
 * legível, qual o limite do dono do produto e como cada falha é dita a quem opera.
 *
 * **O conteúdo é dado, nunca instrução.** Esta função devolve texto e um hash — não
 * interpreta, não segue links, não executa nada do que leu. O que sai daqui entra
 * na base como qualquer material e atravessa as mesmas defesas do agente.
 */
import { computeContentHash } from "@/lib/ai/rag/chunker";
import { buscarSeguro, ErroDeRedeSegura, validarUrl, type PoliticaDeDestino } from "@/lib/net/rede-segura";
import { z } from "zod";

import { extrairTextoPrincipal } from "./site-extrair";

// ---------------------------------------------------------------------------
// Limites (valores confirmados pelo dono do produto em 15/10/2026)
// ---------------------------------------------------------------------------

export interface LimitesDoSite {
  /** Páginas por fonte. */
  maxPaginas: number;
  /** Bytes por página, contados no que chega. */
  maxBytes: number;
  /** Prazo total por página, em milissegundos. */
  timeoutMs: number;
}

export const LIMITES_PADRAO_DO_SITE: LimitesDoSite = {
  maxPaginas: 20,
  maxBytes: 2 * 1024 * 1024,
  timeoutMs: 15_000,
};

const MAX_REDIRECIONAMENTOS = 3;

function inteiroPositivo(bruto: string | undefined, padrao: number): number {
  if (bruto === undefined || bruto.trim() === "") return padrao;
  const n = Number(bruto);
  return Number.isInteger(n) && n > 0 ? n : padrao;
}

/**
 * Os limites vigentes. Ajustáveis por ambiente, mas NUNCA derrubam o app: valor
 * ausente, zero, negativo ou ilegível volta ao padrão (um `.env` antigo, que não
 * conhece estas variáveis, segue igual).
 */
export function limitesDoSite(ambiente: Record<string, string | undefined> = process.env): LimitesDoSite {
  return {
    maxPaginas: inteiroPositivo(ambiente.KB_SITE_MAX_PAGES, LIMITES_PADRAO_DO_SITE.maxPaginas),
    maxBytes: inteiroPositivo(ambiente.KB_SITE_MAX_BYTES, LIMITES_PADRAO_DO_SITE.maxBytes),
    timeoutMs: inteiroPositivo(ambiente.KB_SITE_TIMEOUT_MS, LIMITES_PADRAO_DO_SITE.timeoutMs),
  };
}

// ---------------------------------------------------------------------------
// A lista de endereços
// ---------------------------------------------------------------------------

/** Forma canônica: sem `#fragmento` (a mesma página) e com o host em minúsculas (o `URL` cuida disso). */
function canonizar(bruto: string): string | null {
  try {
    const url = new URL(bruto.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * A lista que a pessoa informa. Garante a FORMA (https, sem credencial, sem
 * repetida, entre 1 e `maximo`) e recusa já no cadastro o que é óbvio — `localhost`,
 * IP privado por extenso — com a mesma régua de texto da rede segura. Quem decide
 * o que um NOME resolve é a leitura: nome que aponta para dentro só falha lá.
 */
export function enderecosDoSiteSchema(maximo: number) {
  return z
    .array(z.string())
    .transform((lista) => lista.map((e) => e.trim()).filter((e) => e !== ""))
    .pipe(
      z
        .array(z.string())
        .min(1, "Informe ao menos um endereço de página.")
        .max(maximo, `No máximo ${maximo} páginas por fonte.`),
    )
    .transform((lista, ctx) => {
      const vistos = new Set<string>();
      const saida: string[] = [];
      for (const bruto of lista) {
        const canonico = canonizar(bruto);
        if (canonico === null) {
          ctx.addIssue({ code: "custom", message: `Endereço inválido: ${bruto}` });
          return z.NEVER;
        }
        const url = new URL(canonico);
        if (url.protocol !== "https:") {
          ctx.addIssue({ code: "custom", message: `Só endereços https:// são aceitos: ${bruto}` });
          return z.NEVER;
        }
        if (url.username !== "" || url.password !== "") {
          ctx.addIssue({ code: "custom", message: `Endereço com usuário e senha não é aceito: ${bruto}` });
          return z.NEVER;
        }
        try {
          validarUrl(canonico);
        } catch {
          ctx.addIssue({ code: "custom", message: `Endereço interno, privado ou local não é aceito: ${bruto}` });
          return z.NEVER;
        }
        if (vistos.has(canonico)) continue;
        vistos.add(canonico);
        saida.push(canonico);
      }
      return saida;
    });
}

// ---------------------------------------------------------------------------
// A leitura
// ---------------------------------------------------------------------------

/** Os motivos de falha. Estáveis: a tela e o banco os guardam como estão. */
export const CODIGOS_DE_FALHA_DA_PAGINA = [
  "endereco_invalido",
  "endereco_recusado",
  "tempo_esgotado",
  "pagina_grande_demais",
  "redirecionamentos_demais",
  "sem_conexao",
  "resposta_http",
  "tipo_nao_suportado",
  "sem_texto",
] as const;
export type CodigoDeFalhaDaPagina = (typeof CODIGOS_DE_FALHA_DA_PAGINA)[number];

export type ResultadoDaPagina =
  | { ok: true; titulo: string | null; texto: string; hash: string; urlFinal: string }
  | { ok: false; codigo: CodigoDeFalhaDaPagina; mensagem: string };

export interface OpcoesDeLeitura {
  limites?: Partial<LimitesDoSite>;
  /** SÓ PARA TESTE: afrouxa a política (loopback e http). Produção nunca passa isto. */
  rede?: PoliticaDeDestino;
}

function falha(codigo: CodigoDeFalhaDaPagina, mensagem: string): ResultadoDaPagina {
  return { ok: false, codigo, mensagem };
}

function falhaDaRede(erro: unknown): ResultadoDaPagina {
  const codigo = erro instanceof ErroDeRedeSegura ? erro.codigo : "net:connection_failed";
  switch (codigo) {
    case "unsafe_url:invalid":
    case "unsafe_url:scheme":
      return falha("endereco_invalido", "O endereço não é uma página válida.");
    case "unsafe_url:https_required":
      return falha("endereco_recusado", "Só endereços https:// são aceitos.");
    case "net:timeout":
      return falha("tempo_esgotado", "O site demorou demais para responder.");
    case "net:response_too_large":
      return falha("pagina_grande_demais", "A página é grande demais para o agente ler.");
    case "net:too_many_redirects":
      return falha("redirecionamentos_demais", "A página redireciona vezes demais.");
    default:
      if (codigo.startsWith("unsafe_url:")) {
        return falha(
          "endereco_recusado",
          "Este endereço aponta para uma rede interna, privada ou local — por segurança, o sistema não lê esse tipo de endereço.",
        );
      }
      return falha("sem_conexao", "Não consegui conectar ao site.");
  }
}

const TIPOS_DE_TEXTO = /^(text\/(html|plain|markdown|xml)|application\/(xhtml\+xml|xml))\b/i;

function decodificar(corpo: Buffer, contentType: string): string {
  let charset = /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    // `<meta charset>` ou `<meta http-equiv ... charset=>` nos primeiros bytes.
    charset = /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(corpo.subarray(0, 2048).toString("latin1"))?.[1];
  }
  try {
    return new TextDecoder(charset ?? "utf-8").decode(corpo);
  } catch {
    return new TextDecoder("utf-8").decode(corpo);
  }
}

export async function lerPagina(endereco: string, opcoes: OpcoesDeLeitura = {}): Promise<ResultadoDaPagina> {
  const limites: LimitesDoSite = { ...limitesDoSite(), ...opcoes.limites };

  let resposta;
  try {
    resposta = await buscarSeguro(endereco, {
      ...opcoes.rede,
      metodo: "GET",
      headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1", "user-agent": "AgentSiteReader/1.0 (+page reading for the AI agent)" },
      maxRedirecionamentos: MAX_REDIRECIONAMENTOS,
      timeoutMs: limites.timeoutMs,
      maxBytes: limites.maxBytes,
    });
  } catch (erro) {
    return falhaDaRede(erro);
  }

  if (resposta.status < 200 || resposta.status >= 300) {
    return falha("resposta_http", `O site respondeu ${resposta.status}.`);
  }

  const contentType = String(resposta.headers["content-type"] ?? "");
  if (contentType !== "" && !TIPOS_DE_TEXTO.test(contentType)) {
    return falha("tipo_nao_suportado", "A página não é um texto que o agente consiga ler (PDF, imagem ou outro formato).");
  }

  const bruto = decodificar(resposta.corpo, contentType);
  const ehHtml = contentType === "" || /html|xml/i.test(contentType) || /<\s*(html|body|p|div)\b/i.test(bruto.slice(0, 4096));
  const { titulo, texto } = ehHtml ? extrairTextoPrincipal(bruto) : { titulo: null, texto: bruto.trim() };

  if (texto.trim().length === 0) {
    return falha("sem_texto", "A página não tem texto para o agente ler (só menu, imagem ou script).");
  }

  return { ok: true, titulo, texto, hash: computeContentHash(texto), urlFinal: resposta.urlFinal };
}
