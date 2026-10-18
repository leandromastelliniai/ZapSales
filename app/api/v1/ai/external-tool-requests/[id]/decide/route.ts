import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/external-tool-requests/:id/decide (manager+) — aprovar ou recusar o que o
 * agente quer executar num sistema externo (issue #95). É o botão da Central de avisos.
 *
 *   { "decision": "approve" }  — executa a ação UMA vez e devolve o desfecho.
 *   { "decision": "reject", "reason"?: "…" } — cancela; nada é enviado.
 *
 * ═══ O que esta rota garante ═══
 *
 *  - EXECUÇÃO ÚNICA. A reivindicação (`pending → executing`) é um UPDATE condicional; clique
 *    duplo, dois gestores ou o navegador reenviando disputam o mesmo UPDATE e só um vence. Quem
 *    perde recebe 409 e NADA é chamado. O id do pedido viaja como `delivery_id`: quem recebe
 *    também pode deduplicar.
 *  - SEM REPETIÇÃO. A chamada de uma ação que altera é de UMA tentativa. Se o desfecho for
 *    incerto (prazo, rede, 5xx), o pedido fecha como «falha incerta», a Central ganha o aviso
 *    e a resposta diz que a ação não foi repetida.
 *  - PRAZO. Pendente vencido nunca executa, mesmo que o cron ainda não o tenha marcado.
 *  - DADOS ATUAIS. Se a ferramenta foi editada e os dados guardados já não cabem no esquema
 *    dela, a rota recusa (422) em vez de mandar ao outro sistema um formato que ele não espera.
 *  - AUDITORIA. Quem aprovou/recusou, qual ferramenta e um resumo dos dados SEM segredos — nunca
 *    a chave de assinatura, o corpo enviado nem o que o outro sistema respondeu.
 *
 * A organização vem da sessão, nunca do corpo (o schema é `strict`). Pedido de outra organização
 * é 404, nunca 403: não confirma que existe.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { resumoDosDados } from "@/lib/ai/ferramentas-externas/aprovacao";
import { fraseDoMotivo, type ResultadoDaChamada } from "@/lib/ai/ferramentas-externas/chamar";
import { parametrosLidos, validarArgumentos } from "@/lib/ai/ferramentas-externas/esquema";
import { executarFerramentaExterna, type FerramentaExecutavel } from "@/lib/ai/ferramentas-externas/executar";
import { lerConfigDeMcpDaOrganizacao } from "@/lib/ai/ferramentas-externas/mcp/config";
import { carregarServidorParaChamar } from "@/lib/ai/ferramentas-externas/mcp/repositorio";
import {
  abrirAvisoDeFalhaDoPedido,
  buscarPedido,
  finalizar,
  marcarExpirado,
  reivindicar,
  recusar,
  resolverAviso,
} from "@/lib/ai/ferramentas-externas/pedidos-api";
import { lerChaveDaFerramenta } from "@/lib/ai/ferramentas-externas/repositorio";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    /** Por que recusou. Vai para a auditoria: é o sinal de onde o agente erra. */
    reason: z.string().trim().max(300).optional(),
  })
  .strict();

/** O que dizer a quem tentou decidir um pedido que já não está pendente. */
const FRASE_DO_ESTADO: Record<string, string> = {
  executed: "Este pedido já foi executado.",
  rejected: "Este pedido já foi recusado.",
  expired: "Este pedido expirou sem decisão e não pode mais ser aprovado.",
  executing: "Este pedido está sendo executado agora.",
  failed: "Este pedido já foi tentado e falhou; a ação não é repetida sozinha.",
};

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  // Aprovar dispara uma chamada para fora em nome da organização: suporte temporário não faz isso.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tool_requests" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Diga se quer aprovar ou recusar o pedido."), 422, { requestId });
  }
  const { decision, reason } = parsed.data;

  const admin = createAdminClient();
  try {
    const pedido = await buscarPedido(admin, org.orgId, id);
    if (!pedido) return fail("not_found", t("Pedido não encontrado."), 404, { requestId });

    if (pedido.status !== "pending") {
      return fail("request_not_pending", t(FRASE_DO_ESTADO[pedido.status] ?? "Este pedido já foi decidido."), 409, {
        requestId,
      });
    }

    const resumo = resumoDosDados(pedido.arguments);
    const base = {
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool_request",
      resourceId: id,
      requestId,
    };
    const identidade = {
      tool_id: pedido.tool_id,
      tool_slug: pedido.tool_slug,
      effect: pedido.effect,
      kind: pedido.tool_mcp ? ("mcp" as const) : ("webhook" as const),
      ...(pedido.tool_mcp ? { mcp_server_id: pedido.tool_mcp.servidor_id, mcp_tool: pedido.tool_mcp.nome_no_servidor } : {}),
    };

    // Pendente vencido nunca executa, mesmo que o cron ainda não o tenha marcado.
    if (new Date(pedido.expires_at).getTime() <= Date.now()) {
      if (await marcarExpirado(admin, org.orgId, id)) {
        await resolverAviso(admin, org.orgId, pedido.inbox_item_id);
        void audit({ ...base, action: "ai.external_tool_request_expired", metadata: { ...identidade, by: "decision" } });
      }
      return fail("request_expired", t("Este pedido expirou sem decisão e não pode mais ser aprovado."), 409, { requestId });
    }

    if (decision === "reject") {
      const recusado = await recusar(admin, org.orgId, id, user.id, reason ?? null);
      if (!recusado) {
        return fail("request_not_pending", t("Este pedido já foi decidido por outra pessoa."), 409, { requestId });
      }
      await resolverAviso(admin, org.orgId, pedido.inbox_item_id);
      void audit({
        ...base,
        action: "ai.external_tool_request_rejected",
        metadata: { ...identidade, summary: resumo, reason: reason ?? null },
      });
      return ok({ id, status: "rejected" as const }, { requestId });
    }

    // ── Aprovar ──────────────────────────────────────────────────────────────
    if (!pedido.tool_active) {
      return fail(
        "tool_inactive",
        t("A ferramenta está desativada. Reative-a para aprovar, ou recuse o pedido."),
        409,
        { requestId },
      );
    }
    const parametros = parametrosLidos.safeParse(pedido.tool_parameters);
    const validado = validarArgumentos(parametros.success ? parametros.data : [], pedido.arguments);
    if (!validado.ok) {
      return fail(
        "request_arguments_outdated",
        t("A ferramenta foi editada depois deste pedido e os dados dele já não cabem nos campos atuais. Recuse o pedido."),
        422,
        { requestId },
      );
    }

    // Ferramenta de servidor MCP (#96): o recurso tem de estar ligado e o servidor ativo AGORA. Conferido
    // ANTES de reivindicar — o pedido segue pendente e pode ser aprovado depois (ou recusado), em vez de
    // fechar como falha por uma porta que estava fechada de propósito.
    let alvo: { ferramenta: FerramentaExecutavel; segredo: string | null };
    if (pedido.tool_mcp) {
      const config = await lerConfigDeMcpDaOrganizacao(admin, org.orgId);
      if (!config?.ligado) {
        return fail(
          "mcp_disabled",
          t("Os servidores MCP estão desligados nesta organização. Ligue-os em Ferramentas externas para aprovar, ou recuse o pedido."),
          409,
          { requestId },
        );
      }
      const servidor = await carregarServidorParaChamar(admin, org.orgId, pedido.tool_mcp.servidor_id);
      if (!servidor || !servidor.ativo) {
        return fail(
          "mcp_server_inactive",
          t("O servidor MCP desta ferramenta está desativado. Reative-o para aprovar, ou recuse o pedido."),
          409,
          { requestId },
        );
      }
      alvo = {
        ferramenta: {
          slug: pedido.tool_slug,
          url: servidor.servidor.url,
          efeito: pedido.effect,
          mcp: {
            cabecalho: servidor.servidor.cabecalho,
            temCredencial: servidor.temCredencial,
            nomeNoServidor: pedido.tool_mcp.nome_no_servidor,
          },
        },
        // Havendo credencial e não a tendo lido, `executarFerramentaExterna` NÃO chama (falha certa).
        segredo: servidor.servidor.credencial,
      };
    } else {
      alvo = {
        ferramenta: { slug: pedido.tool_slug, url: pedido.tool_url ?? "", efeito: pedido.effect },
        segredo: null,
      };
    }

    // A trava da execução única: só quem vence este UPDATE chama o outro sistema.
    if (!(await reivindicar(admin, org.orgId, id, user.id))) {
      return fail("request_not_pending", t("Este pedido já foi decidido por outra pessoa."), 409, { requestId });
    }
    void audit({ ...base, action: "ai.external_tool_request_approved", metadata: { ...identidade, summary: resumo } });

    // Daqui em diante o pedido está «executando»: qualquer exceção ANTES do desfecho o deixaria preso
    // (e bloqueando a mesma chamada). Não se sabe se saiu, então fecha como falha incerta.
    let resultado: ResultadoDaChamada;
    try {
      // Webhook: a chave de assinatura, lida agora. MCP: a credencial do servidor, já lida acima.
      const segredo = pedido.tool_mcp ? alvo.segredo : await lerChaveDaFerramenta(admin, org.orgId, pedido.tool_id);
      resultado = await executarFerramentaExterna({
        ferramenta: alvo.ferramenta,
        segredo,
        argumentos: validado.valor,
        idDeEntrega: id,
      });
    } catch (err) {
      logger.error("[ferramentas-externas] a execução do pedido lançou — fechando como falha incerta", {
        organization_id: org.orgId,
        request_id: id,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 120),
      });
      resultado = { ok: false, motivo: "rede", httpStatus: null, tentativas: 0, duracaoMs: 0, desfechoIncerto: true };
    }
    await finalizar(admin, org.orgId, id, resultado);
    await resolverAviso(admin, org.orgId, pedido.inbox_item_id);
    void audit({
      ...base,
      action: "ai.external_tool_request_executed",
      metadata: {
        ...identidade,
        ok: resultado.ok,
        http_status: resultado.httpStatus,
        attempts: resultado.tentativas,
        duration_ms: resultado.duracaoMs,
        ...(resultado.ok ? {} : { reason: resultado.motivo, uncertain: resultado.desfechoIncerto }),
      },
    });

    if (resultado.ok) {
      return ok(
        {
          id,
          status: "executed" as const,
          ok: true as const,
          http_status: resultado.httpStatus,
          // O que o outro sistema devolveu, para quem aprovou ver (a consulta aprovada não some no ar).
          content: resultado.conteudo,
          truncated: resultado.truncado,
        },
        { requestId },
      );
    }

    await abrirAvisoDeFalhaDoPedido(admin, org.orgId, {
      // O título leva o pedido: duas falhas da mesma ferramenta são dois avisos (a Central deduplica por título).
      titulo: `A ação «${pedido.tool_name}» falhou (#${id.slice(0, 4)})`,
      corpo:
        `A ação «${pedido.tool_name}» foi aprovada e não foi concluída: ${fraseDoMotivo(resultado.motivo)} ` +
        (resultado.desfechoIncerto
          ? "Ela pode ter sido feita no outro sistema e a resposta se perdeu — não sabemos se foi. Não foi repetida. Confira lá antes de refazer."
          : "A ação não foi feita."),
    });
    return ok(
      {
        id,
        status: "failed" as const,
        ok: false as const,
        uncertain: resultado.desfechoIncerto,
        reason: resultado.motivo,
        http_status: resultado.httpStatus,
        message: t(
          resultado.desfechoIncerto
            ? "Não foi possível confirmar se a ação foi feita no outro sistema. Ela não foi repetida: confira lá antes de refazer."
            : "A ação não foi feita.",
        ),
      },
      { requestId },
    );
  } catch {
    return fail("internal_error", t("Não foi possível decidir o pedido."), 500, { requestId });
  }
}
