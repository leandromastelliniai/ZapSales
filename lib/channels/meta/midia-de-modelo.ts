/**
 * A MÍDIA DO CABEÇALHO DE UM MODELO: API DE UPLOAD DA META + CÓPIA NO STORAGE (issue #7).
 *
 * Um modelo com cabeçalho de imagem, vídeo ou documento precisa de uma AMOSTRA
 * para a revisão da Meta, e a amostra não é um link: é o `handle` da API de
 * upload retomável (Resumable Upload API), em dois passos —
 *
 *   1. `POST /{app-id}/uploads?file_length&file_type&file_name` abre a sessão
 *      no app dono do token e devolve `{ id: "upload:…?sig=…" }`;
 *   2. `POST /{id}` com o arquivo inteiro, `file_offset: 0` e
 *      `Authorization: OAuth <token>`, devolve `{ h: "4::…" }`.
 *
 * O app sai do próprio token (`GET /app`): a sessão de upload só abre no app
 * que emitiu o token, e a instalação não guarda esse id por número.
 *
 * A Meta guarda só a amostra; o arquivo de cada DISPARO vai em cada envio. Por
 * isso a rota de upload também guarda uma cópia (que as campanhas oficiais vão
 * usar no disparo; hoje só a lista de modelos a lê) no bucket `whatsapp-media`, em
 * `<org>/templates/<uuid>.<ext>`, e o espelho do modelo registra o caminho por
 * slot (`midiasDoModelo`). A retenção de mídia só apaga dessa pasta o arquivo
 * com mais de 7 dias que nenhum modelo cita (migration 0542, #21).
 *
 * O token vai SEMPRE em cabeçalho, nunca na URL (CLAUDE.md, API key em query
 * string). Nada aqui lança: rede caída é um desfecho com nome.
 */
import { randomUUID } from "node:crypto";

import { erroDaRespostaDaGraph } from "./erros";
import { graphBaseUrl } from "./graph-base";
import {
  MIDIAS_DO_CABECALHO,
  type FormatoDeMidia,
  type TipoDeArquivoDoCabecalho,
} from "./novo-modelo";

/** O bucket da cópia — o mesmo da mídia das conversas, com a pasta própria. */
export const BUCKET_DA_MIDIA_DE_MODELO = "whatsapp-media";

const MB = 1024 * 1024;

/**
 * O maior arquivo aceito por formato. Imagem é o teto da Meta (5 MB). Vídeo e
 * documento ficam em 9 MB, abaixo do da Meta (16 MB e 100 MB), por causa do
 * `proxy.ts`: ele roda antes de toda rota, e o Next entrega à rota só os
 * primeiros 10 MB do corpo quando há proxy (`proxyClientMaxBodySize`, padrão
 * 10 MB — "Only the first 10MB will be available", em
 * `next/dist/server/body-streams.js`). Acima disso o multipart chegaria cortado
 * e a rota não acharia o arquivo. 9 MB deixa folga para o envelope do multipart.
 */
export const TETO_POR_FORMATO: Record<FormatoDeMidia, number> = {
  IMAGE: 5 * MB,
  VIDEO: 9 * MB,
  DOCUMENT: 9 * MB,
};

const comeca = (bytes: Uint8Array, cabeca: number[], desde = 0) =>
  bytes.length >= desde + cabeca.length && cabeca.every((b, i) => bytes[desde + i] === b);

/**
 * O tipo do arquivo pelo CONTEÚDO, nunca pelo nome nem pelo `content-type` que
 * o navegador declarou. Só os quatro que o cabeçalho de modelo aceita.
 */
export function farejarArquivo(bytes: Uint8Array): TipoDeArquivoDoCabecalho | null {
  if (comeca(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (comeca(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  // MP4: a caixa `ftyp` nos bytes 4..7.
  if (comeca(bytes, [0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4";
  return null;
}

/**
 * Onde a cópia mora. Gerado AQUI, nunca aceito do cliente. `id` é o nome do
 * arquivo — e o `resource_id` da auditoria, que é `uuid`.
 */
export function caminhoDaMidia(
  organizationId: string,
  tipo: TipoDeArquivoDoCabecalho,
  id: string = randomUUID(),
): string {
  return `${organizationId}/templates/${id}.${MIDIAS_DO_CABECALHO[tipo].extensao}`;
}

/**
 * O caminho que voltou do editor é desta organização e da pasta de modelos?
 * O corpo da criação traz o caminho de volta; a rota confere antes de gravar
 * no espelho, para uma organização não registrar arquivo de outra.
 */
export function caminhoEhDaOrganizacao(caminho: string, organizationId: string): boolean {
  return caminho.startsWith(`${organizationId}/templates/`) && !caminho.includes("..");
}

export interface EntradaDoUpload {
  /** Token da Graph API. Resolvido de fonte confiável pelo chamador, nunca do body. */
  token: string;
  graphVersion: string;
  bytes: Uint8Array;
  tipo: TipoDeArquivoDoCabecalho;
  /** O nome original — a Meta o guarda junto da amostra. */
  nome: string;
}

export type DesfechoDoUpload =
  | { ok: true; handle: string }
  | {
      ok: false;
      /** Em que passo parou: descobrir o app, abrir a sessão ou mandar o arquivo. */
      etapa: "app" | "sessao" | "arquivo";
      mensagem: string;
      codigo: number | null;
      subcodigo: number | null;
    };

type Recusa = Extract<DesfechoDoUpload, { ok: false }>;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Uma chamada à Graph; devolve o corpo ou a recusa já classificada. */
async function chamar(
  etapa: Recusa["etapa"],
  url: string,
  init: RequestInit,
): Promise<{ ok: true; corpo: Record<string, unknown> } | Recusa> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    return {
      ok: false,
      etapa,
      mensagem: `Não deu para falar com a Meta (${err instanceof Error ? err.message : "rede"}).`,
      codigo: null,
      subcodigo: null,
    };
  }
  const corpo: unknown = await res.json().catch(() => null);
  const erro = erroDaRespostaDaGraph(corpo, res.status);
  if (erro) {
    const e = (corpo as { error?: Record<string, unknown> } | null)?.error ?? {};
    return {
      ok: false,
      etapa,
      mensagem: texto(e.error_user_msg) ?? erro.motivo,
      codigo: erro.codigo,
      subcodigo: erro.subcodigo,
    };
  }
  return { ok: true, corpo: (corpo ?? {}) as Record<string, unknown> };
}

const semResposta = (etapa: Recusa["etapa"], campo: string): Recusa => ({
  ok: false,
  etapa,
  mensagem: `A Meta respondeu sem ${campo}.`,
  codigo: null,
  subcodigo: null,
});

/** Manda o arquivo à API de upload retomável e devolve o `handle` da amostra. */
export async function enviarMidiaParaMeta(entrada: EntradaDoUpload): Promise<DesfechoDoUpload> {
  const base = graphBaseUrl(entrada.graphVersion);
  const bearer = { Authorization: `Bearer ${entrada.token}` };

  const app = await chamar("app", `${base}/app?fields=id`, { headers: bearer });
  if (!app.ok) return app;
  const appId = texto(app.corpo.id);
  if (!appId) return semResposta("app", "o id do app");

  const busca = new URLSearchParams({
    file_name: entrada.nome,
    file_length: String(entrada.bytes.length),
    file_type: entrada.tipo,
  });
  const sessao = await chamar("sessao", `${base}/${appId}/uploads?${busca}`, {
    method: "POST",
    headers: bearer,
  });
  if (!sessao.ok) return sessao;
  const idDaSessao = texto(sessao.corpo.id);
  if (!idDaSessao?.startsWith("upload:")) return semResposta("sessao", "a sessão de upload");

  // O id vai À URL como a Meta o deu: ele já traz o `?sig=` da sessão, e
  // codificá-lo quebraria a assinatura.
  const envio = await chamar("arquivo", `${base}/${idDaSessao}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${entrada.token}`,
      file_offset: "0",
      "content-type": "application/octet-stream",
    },
    body: Buffer.from(entrada.bytes),
  });
  if (!envio.ok) return envio;
  const handle = texto(envio.corpo.h);
  if (!handle) return semResposta("arquivo", "o handle do arquivo");
  return { ok: true, handle };
}
