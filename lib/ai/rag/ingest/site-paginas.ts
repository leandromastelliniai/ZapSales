/**
 * AS PÁGINAS DE UMA FONTE `site`: o estado de cada uma e os trechos que rendem
 * (issue #93, parte da #86).
 *
 * O indexador chama `montarPedacosDoSite` quando a fonte é do tipo `site`. Aqui se
 * decide, página a página:
 *
 *  - **lida / falhou, e por quê** — gravado em `ai_knowledge_source_pages`, que é o
 *    que a tela mostra ao dono do negócio;
 *  - **inalterada** — o hash do texto bate com o da leitura anterior: nenhum trecho
 *    dela é reembedado (o embedding é REAPROVEITADO da versão ativa);
 *  - **falhou depois de já ter sido lida** — o que o agente sabia dela é mantido
 *    (um site fora do ar por uma hora não pode apagar o conhecimento do agente).
 *
 * O reaproveitamento é por TRECHO (mesmo `content_hash`), não por página: o que
 * barateia a leitura de uma página que mudou só no fim. E só vale quando a versão
 * ativa foi calculada com o MESMO modelo de embedding — vetores de modelos
 * diferentes não se misturam.
 *
 * Toda query filtra `organization_id` — a fonte vem do evento, que é fonte
 * confiável (CLAUDE.md §multi-tenancy).
 */
import { chunkText, computeContentHash } from "@/lib/ai/rag/chunker";
import { ErroDeExtracao } from "@/lib/ai/rag/ingest/documento";
import { lerPagina, type ResultadoDaPagina } from "@/lib/ai/rag/ingest/site";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * O vocabulário de `ai_knowledge_source_pages.status` (CHECK da 0549, par vigiado em
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts`).
 */
export const ESTADOS_DA_PAGINA = ["pendente", "lida", "falhou"] as const;
export type EstadoDaPagina = (typeof ESTADOS_DA_PAGINA)[number];

export interface PaginaDoSite {
  id: string;
  organization_id: string;
  knowledge_source_id: string;
  url: string;
  position: number;
  status: EstadoDaPagina;
  error_code: string | null;
  error_message: string | null;
  title: string | null;
  content_hash: string | null;
  chunks_count: number;
  last_read_at: string | null;
  last_changed_at: string | null;
}

export const COLUNAS_DA_PAGINA =
  "id, organization_id, knowledge_source_id, url, position, status, error_code, error_message, title, content_hash, chunks_count, last_read_at, last_changed_at";

/** Um pedaço pronto para virar vetor — com o vetor já pronto quando foi reaproveitado. */
export interface PedacoDoSite {
  content: string;
  metadata: Record<string, unknown>;
  embedding?: string;
}

export interface ResumoDaLeituraDoSite {
  lidas: number;
  falhas: number;
  inalteradas: number;
}

/** Quantas páginas são lidas ao mesmo tempo: o suficiente para não esperar 20 × 15 s, sem martelar o site. */
const PAGINAS_EM_PARALELO = 4;

export async function listarPaginasDoSite(admin: Admin, organizationId: string, sourceId: string): Promise<PaginaDoSite[]> {
  const { data, error } = await admin
    .from("ai_knowledge_source_pages")
    .select(COLUNAS_DA_PAGINA)
    .eq("organization_id", organizationId)
    .eq("knowledge_source_id", sourceId)
    .order("position", { ascending: true });
  if (error) throw new Error(`paginas_do_site: ${error.message}`);
  return (data ?? []) as unknown as PaginaDoSite[];
}

/**
 * Faz a lista de páginas da fonte IGUAL a `urls`: cria as novas, remove as que
 * saíram e reordena as que ficam. Quem chama já validou as URLs (Zod) e a fonte.
 */
export async function definirPaginasDoSite(
  admin: Admin,
  organizationId: string,
  sourceId: string,
  urls: string[],
): Promise<{ adicionadas: number; removidas: number }> {
  const atuais = await listarPaginasDoSite(admin, organizationId, sourceId);
  const queFicam = new Set(urls);
  const sairam = atuais.filter((p) => !queFicam.has(p.url));
  const jaExistem = new Map(atuais.map((p) => [p.url, p]));

  if (sairam.length > 0) {
    const { error } = await admin
      .from("ai_knowledge_source_pages")
      .delete()
      .eq("organization_id", organizationId)
      .eq("knowledge_source_id", sourceId)
      .in("id", sairam.map((p) => p.id));
    if (error) throw new Error(`remover_paginas: ${error.message}`);
  }

  const novas = urls
    .map((url, position) => ({ url, position }))
    .filter(({ url }) => !jaExistem.has(url))
    .map(({ url, position }) => ({
      organization_id: organizationId,
      knowledge_source_id: sourceId,
      url,
      position,
      status: "pendente" as const,
    }));
  if (novas.length > 0) {
    const { error } = await admin.from("ai_knowledge_source_pages").insert(novas);
    if (error) throw new Error(`criar_paginas: ${error.message}`);
  }

  for (const [position, url] of urls.entries()) {
    const existente = jaExistem.get(url);
    if (existente && existente.position !== position) {
      await admin
        .from("ai_knowledge_source_pages")
        .update({ position })
        .eq("organization_id", organizationId)
        .eq("id", existente.id);
    }
  }
  return { adicionadas: novas.length, removidas: sairam.length };
}

/** O nome com que o agente cita a página quando ela não tem título: `host/caminho`. */
function nomeDaPagina(titulo: string | null, url: string): string {
  if (titulo) return titulo;
  try {
    const u = new URL(url);
    const caminho = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return `${u.host}${caminho}`;
  } catch {
    return url;
  }
}

interface TrechoAnterior {
  content: string;
  content_hash: string;
  embedding: string;
  metadata: Record<string, unknown> | null;
}

/** Os trechos da versão ativa, quando ela foi calculada com o mesmo modelo. */
async function trechosDaVersaoAtiva(
  admin: Admin,
  fonte: { id: string; organization_id: string; active_kb_version_id: string | null },
  modeloDeEmbedding: string,
): Promise<TrechoAnterior[]> {
  if (!fonte.active_kb_version_id) return [];
  const { data: versao } = await admin
    .from("ai_knowledge_versions")
    .select("embedding_model")
    .eq("id", fonte.active_kb_version_id)
    .eq("organization_id", fonte.organization_id)
    .maybeSingle();
  if ((versao as { embedding_model?: string } | null)?.embedding_model !== modeloDeEmbedding) return [];

  const { data } = await admin
    .from("ai_chunks")
    .select("content, content_hash, embedding, metadata")
    .eq("organization_id", fonte.organization_id)
    .eq("knowledge_source_id", fonte.id)
    .eq("kb_version_id", fonte.active_kb_version_id)
    .order("position", { ascending: true });
  return (data ?? []) as unknown as TrechoAnterior[];
}

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let proximo = 0;
  const operarios = Array.from({ length: Math.min(tamanho, itens.length) }, async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      saida[i] = await fn(itens[i]!);
    }
  });
  await Promise.all(operarios);
  return saida;
}

/**
 * Lê as páginas da fonte, atualiza o estado de cada uma e devolve os pedaços que a
 * versão nova da fonte deve conter.
 *
 * Lança `ErroDeExtracao` (frase de gente, que o cartão da fonte mostra) quando não há
 * página nenhuma, ou quando nenhuma pôde ser lida e nada do que havia pode ser mantido.
 */
export async function montarPedacosDoSite(args: {
  admin: Admin;
  fonte: { id: string; organization_id: string; active_kb_version_id: string | null };
  modeloDeEmbedding: string;
  /** Troca a leitura da rede — só para teste. */
  ler?: (url: string) => Promise<ResultadoDaPagina>;
  agora?: () => Date;
}): Promise<{ pedacos: PedacoDoSite[]; resumo: ResumoDaLeituraDoSite }> {
  const { admin, fonte, modeloDeEmbedding } = args;
  const ler = args.ler ?? ((url: string) => lerPagina(url));
  const agora = args.agora ?? (() => new Date());

  const paginas = await listarPaginasDoSite(admin, fonte.organization_id, fonte.id);
  if (paginas.length === 0) {
    throw new ErroDeExtracao("A fonte do site não tem nenhuma página. Informe ao menos um endereço.");
  }

  const anteriores = await trechosDaVersaoAtiva(admin, fonte, modeloDeEmbedding);
  const porHash = new Map<string, TrechoAnterior>();
  for (const t of anteriores) if (!porHash.has(t.content_hash)) porHash.set(t.content_hash, t);
  const trechosDaPagina = (url: string) => anteriores.filter((t) => t.metadata?.["endereco"] === url);

  const lidas = await emLotes(paginas, PAGINAS_EM_PARALELO, async (p) => ({ p, r: await ler(p.url) }));

  const pedacos: PedacoDoSite[] = [];
  const resumo: ResumoDaLeituraDoSite = { lidas: 0, falhas: 0, inalteradas: 0 };
  const primeirasFalhas: string[] = [];

  for (const { p, r } of lidas) {
    const instante = agora().toISOString();
    let atualizacao: Record<string, unknown>;

    if (r.ok) {
      const pedacosDaPagina = chunkText(r.texto, { maxChars: 1600, overlapChars: 200 }).map((content) => {
        const antigo = porHash.get(computeContentHash(content));
        return {
          content,
          metadata: {
            source_type: "site",
            pagina: nomeDaPagina(r.titulo, p.url),
            endereco: p.url,
          },
          ...(antigo ? { embedding: antigo.embedding } : {}),
        } satisfies PedacoDoSite;
      });
      pedacos.push(...pedacosDaPagina);

      const mudou = p.content_hash !== r.hash;
      resumo.lidas += 1;
      if (!mudou) resumo.inalteradas += 1;
      atualizacao = {
        status: "lida",
        error_code: null,
        error_message: null,
        title: r.titulo,
        content_hash: r.hash,
        chunks_count: pedacosDaPagina.length,
        last_read_at: instante,
        ...(mudou ? { last_changed_at: instante } : {}),
      };
    } else {
      resumo.falhas += 1;
      primeirasFalhas.push(r.mensagem);
      const mantidos = trechosDaPagina(p.url);
      for (const t of mantidos) {
        pedacos.push({ content: t.content, metadata: t.metadata ?? {}, embedding: t.embedding });
      }
      atualizacao = {
        status: "falhou",
        error_code: r.codigo,
        error_message: r.mensagem,
        chunks_count: mantidos.length,
        last_read_at: instante,
      };
    }

    const { error } = await admin
      .from("ai_knowledge_source_pages")
      .update(atualizacao)
      .eq("organization_id", fonte.organization_id)
      .eq("id", p.id);
    if (error) throw new Error(`estado_da_pagina: ${error.message}`);
  }

  if (pedacos.length === 0) {
    throw new ErroDeExtracao(
      "Nenhuma página do site pôde ser lida.",
      primeirasFalhas[0] ?? undefined,
    );
  }
  return { pedacos, resumo };
}
