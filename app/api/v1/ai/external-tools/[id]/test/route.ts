import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/external-tools/:id/test (manager+) — o botão "Testar de verdade".
 *
 * Chama o webhook DE VERDADE, com os dados de exemplo que a pessoa escreveu, e mostra o
 * que o outro sistema respondeu. É o único caminho em que uma ferramenta executa fora
 * de um atendimento real — e só por ação explícita desta tela (no teste do agente a
 * chamada é mostrada e NÃO executada).
 *
 * Por que existe: os erros de integração só aparecem numa chamada de verdade (endereço
 * errado, o outro sistema recusando a assinatura, resposta lenta, formato inesperado).
 * Sem este botão a ferramenta ficaria "ligada" e o agente descobriria a falha na frente
 * de um cliente. A resposta é sempre 200 com `ok: true|false` e a frase do que fazer —
 * o erro do outro sistema é resultado do teste, não falha da rota.
 *
 * Numa ferramenta que ALTERA algo, o teste é uma alteração de verdade no outro sistema, com
 * os dados de exemplo — por isso a tela avisa antes, e a auditoria registra o efeito. A pessoa
 * que clica É a aprovação, então o teste não passa pelo pedido. A chamada leva a mesma
 * assinatura, o mesmo prazo, o mesmo teto de resposta e a mesma rede segura de uma chamada do
 * agente; ação que altera tem UMA tentativa só.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { fraseDoMotivo } from "@/lib/ai/ferramentas-externas/chamar";
import { validarArgumentos } from "@/lib/ai/ferramentas-externas/esquema";
import { executarFerramentaExterna, type FerramentaExecutavel } from "@/lib/ai/ferramentas-externas/executar";
import { lerConfigDeMcpDaOrganizacao } from "@/lib/ai/ferramentas-externas/mcp/config";
import { carregarServidorParaChamar } from "@/lib/ai/ferramentas-externas/mcp/repositorio";
import { buscarFerramenta, lerChaveDaFerramenta } from "@/lib/ai/ferramentas-externas/repositorio";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

const postSchema = z.object({ arguments: z.record(z.string(), z.unknown()).default({}) }).strict();

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  // Não grava no banco, mas dispara uma chamada para fora em nome da organização:
  // suporte temporário não faz isso por ela.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tools" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown = {};
  try {
    const texto = await req.text();
    if (texto.trim()) raw = JSON.parse(texto);
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os dados de exemplo: o formato não é o esperado."), 422, { requestId });
  }

  const admin = createAdminClient();
  try {
    const ferramenta = await buscarFerramenta(admin, org.orgId, id);
    if (!ferramenta) return fail("not_found", t("Ferramenta não encontrada."), 404, { requestId });

    // Os dados de exemplo passam pela MESMA conferência do que o agente preenche.
    const validado = validarArgumentos(ferramenta.parameters, parsed.data.arguments);
    if (!validado.ok) return fail("validation_failed", validado.mensagem, 422, { requestId });

    // Ferramenta de servidor MCP (#96): quem testa é o administrador (o servidor é uma integração de
    // terceiro com credencial), o recurso tem de estar ligado e o servidor ativo.
    let alvo: FerramentaExecutavel;
    let segredo: string | null;
    if (ferramenta.mcp) {
      const admOk = await requireRole("admin", { requestId, resource: "ai_external_tools" });
      if (!admOk.ok) return admOk.response;
      const config = await lerConfigDeMcpDaOrganizacao(admin, org.orgId);
      if (!config?.ligado) {
        return fail("mcp_disabled", t("Os servidores MCP estão desligados nesta organização. Ligue-os para testar."), 409, {
          requestId,
        });
      }
      const servidor = await carregarServidorParaChamar(admin, org.orgId, ferramenta.mcp.server_id);
      if (!servidor || !servidor.ativo) {
        return fail("mcp_server_inactive", t("O servidor MCP desta ferramenta está desativado."), 409, { requestId });
      }
      alvo = {
        slug: ferramenta.slug,
        url: servidor.servidor.url,
        efeito: ferramenta.effect,
        mcp: {
          cabecalho: servidor.servidor.cabecalho,
          temCredencial: servidor.temCredencial,
          nomeNoServidor: ferramenta.mcp.tool_name,
        },
      };
      segredo = servidor.servidor.credencial;
    } else {
      alvo = { slug: ferramenta.slug, url: ferramenta.url ?? "", efeito: ferramenta.effect };
      segredo = await lerChaveDaFerramenta(admin, org.orgId, id);
    }
    const resultado = await executarFerramentaExterna({ ferramenta: alvo, segredo, argumentos: validado.valor });

    // O fato, sem a chave, sem o corpo enviado e sem o que o outro sistema respondeu.
    void audit({
      action: "ai.external_tool_tested",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: id,
      requestId,
      metadata: {
        slug: ferramenta.slug,
        effect: ferramenta.effect,
        kind: ferramenta.kind,
        ...(ferramenta.mcp ? { mcp_server_id: ferramenta.mcp.server_id, mcp_tool: ferramenta.mcp.tool_name } : {}),
        ok: resultado.ok,
        http_status: resultado.httpStatus,
        attempts: resultado.tentativas,
        duration_ms: resultado.duracaoMs,
        ...(resultado.ok ? {} : { reason: resultado.motivo }),
      },
    });

    const enviado = ferramenta.mcp
      ? { method: "tools/call", tool: ferramenta.mcp.tool_name, arguments: validado.valor }
      : { event: "agent.tool_call", tool: ferramenta.slug, arguments: validado.valor };
    if (resultado.ok) {
      return ok(
        {
          ok: true as const,
          http_status: resultado.httpStatus,
          content: resultado.conteudo,
          truncated: resultado.truncado,
          attempts: resultado.tentativas,
          duration_ms: resultado.duracaoMs,
          sent: enviado,
        },
        { requestId },
      );
    }
    return ok(
      {
        ok: false as const,
        reason: resultado.motivo,
        message: t(fraseDoMotivo(resultado.motivo)),
        // O que o servidor MCP disse do erro (texto de terceiro, já limpo): só o administrador que testa o lê.
        ...(resultado.detalhe && resultado.motivo === "ferramenta_com_erro" ? { detail: resultado.detalhe } : {}),
        http_status: resultado.httpStatus,
        attempts: resultado.tentativas,
        duration_ms: resultado.duracaoMs,
        sent: enviado,
      },
      { requestId },
    );
  } catch {
    return fail("internal_error", t("Não foi possível testar a ferramenta."), 500, { requestId });
  }
}
