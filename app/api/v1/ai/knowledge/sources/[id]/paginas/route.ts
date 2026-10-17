/**
 * GET /api/v1/ai/knowledge/sources/[id]/paginas
 *
 * O estado de cada página de uma fonte do tipo `site` (issue #93): lida ou falhou, e por
 * quê, o título, quando foi lida e quando mudou pela última vez. É o que responde à
 * pergunta de quem opera — "o que o agente realmente aprendeu do meu site?" — sem abrir o
 * banco.
 *
 * Só leitura; o re-treino é `POST …/reindex` (manual por fonte).
 *
 * Auth: sessão por cookie, papel >= manager (o mesmo gate do resto do acervo).
 * `organization_id` SEMPRE da sessão. Fonte de outra organização, ou que não é `site`, é 404.
 */

import { randomUUID } from "node:crypto";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { aceitaEnderecos, canonizarTipoDeFonte } from "@/lib/ai/rag/tipos-de-fonte";
import { COLUNAS_DA_PAGINA } from "@/lib/ai/rag/ingest/site-paginas";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: sourceId } = await params;

  const authz = await requireRole("manager", { requestId, resource: "ai_knowledge" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  const supabase = await createClient();

  const { data: fonte, error: fonteErr } = await supabase
    .from("ai_knowledge_sources")
    .select("id, source_type")
    .eq("id", sourceId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (fonteErr) {
    console.error("[conhecimento-paginas] leitura da fonte falhou:", fonteErr.message);
    return fail("internal_error", "Erro ao ler o material.", 500, { requestId });
  }
  const tipo = fonte ? canonizarTipoDeFonte((fonte as { source_type: string }).source_type) : null;
  if (!fonte || tipo === null || !aceitaEnderecos(tipo)) {
    return fail("not_found", t("Material não encontrado."), 404, { requestId });
  }

  const { data, error } = await supabase
    .from("ai_knowledge_source_pages")
    .select(COLUNAS_DA_PAGINA)
    .eq("organization_id", activeOrg.orgId)
    .eq("knowledge_source_id", sourceId)
    .order("position", { ascending: true });
  if (error) {
    console.error("[conhecimento-paginas] leitura das páginas falhou:", error.message);
    return fail("internal_error", "Erro ao ler as páginas.", 500, { requestId });
  }

  return ok(data ?? [], { requestId });
}
