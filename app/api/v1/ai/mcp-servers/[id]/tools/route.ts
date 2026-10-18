import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * AS FERRAMENTAS DE UM SERVIDOR MCP (issue #96).
 *
 *   GET — a DESCOBERTA: conecta ao servidor agora e devolve o que ele oferece, ao lado do que o
 *         administrador já escolheu — para cada ferramenta, se o agente consegue usá-la (e, se não,
 *         por quê), a dica de risco que o servidor declarou, o risco que vale, o texto «quando usar»
 *         e se o servidor a mudou depois da escolha. Admin, com o recurso ligado.
 *   PUT — a ESCOLHA: exatamente as ferramentas que ficam disponíveis. As demais deste servidor saem
 *         (apagadas, ou desativadas se alguma versão de agente já as cita). Admin, com o recurso ligado.
 *
 * O corpo da escolha traz só o NOME da ferramenta no servidor e o que o administrador decide (risco,
 * «pedir aprovação», validade, «quando usar»). Descrição, campos e impressão vêm do servidor, AGORA:
 * nunca do corpo. O risco padrão é «altera dados» e a dica do servidor (`readOnlyHint`) é só uma dica.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { conectarAoServidor } from "@/lib/ai/ferramentas-externas/mcp/conexao";
import { selecionarFerramentasSchema } from "@/lib/ai/ferramentas-externas/mcp/esquema-api";
import {
  aplicarSelecao,
  buscarServidor,
  ferramentasEscolhidasDoServidor,
} from "@/lib/ai/ferramentas-externas/mcp/repositorio";
import { recusaSeMcpDesligado } from "@/lib/ai/ferramentas-externas/mcp/rotas";
import { descreverFerramentasDescobertas, prepararSelecao } from "@/lib/ai/ferramentas-externas/mcp/selecao";
import { FRASE_DA_FERRAMENTA_NAO_SUPORTADA } from "@/lib/ai/ferramentas-externas/mcp/tipos";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  // Conecta ao servidor e grava o resultado do teste: como o teste de conexão, suporte temporário não faz.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp_servers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;

  const admin = createAdminClient();
  try {
    const desligado = await recusaSeMcpDesligado(admin, org.orgId, t, requestId);
    if (desligado) return desligado;
    const servidor = await buscarServidor(admin, org.orgId, id);
    if (!servidor) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });

    const conexao = await conectarAoServidor(admin, org.orgId, id);
    if (!conexao.ok) {
      return ok({ ok: false as const, reason: conexao.motivo, http_status: conexao.httpStatus, message: t(conexao.frase) }, { requestId });
    }
    const escolhidas = await ferramentasEscolhidasDoServidor(admin, org.orgId, id);
    return ok(
      {
        ok: true as const,
        server: { name: conexao.servidor.nome, version: conexao.servidor.versao },
        list_incomplete: conexao.listaIncompleta,
        tools: descreverFerramentasDescobertas({ oferecidas: conexao.ferramentas, escolhidas, servidorNome: servidor.name }),
      },
      { requestId },
    );
  } catch {
    return fail("internal_error", t("Não foi possível ler as ferramentas do servidor."), 500, { requestId });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp_servers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = selecionarFerramentasSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira a escolha das ferramentas: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const admin = createAdminClient();
  try {
    const desligado = await recusaSeMcpDesligado(admin, org.orgId, t, requestId);
    if (desligado) return desligado;
    const servidor = await buscarServidor(admin, org.orgId, id);
    if (!servidor) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });

    // A definição de cada ferramenta vem do servidor, AGORA — o que o administrador viu é o que vale.
    const conexao = await conectarAoServidor(admin, org.orgId, id);
    if (!conexao.ok) {
      return fail("mcp_unreachable", t(conexao.frase), 422, { requestId, details: { reason: conexao.motivo } });
    }

    const preparada = prepararSelecao({
      servidorNome: servidor.name,
      oferecidas: conexao.ferramentas,
      escolhidas: parsed.data.ferramentas,
    });
    if (!preparada.ok) {
      const primeira = preparada.erros[0]!;
      return fail(
        "validation_failed",
        primeira.motivo === "nao_existe_no_servidor"
          ? t("O servidor não oferece mais uma das ferramentas escolhidas. Recarregue a lista.")
          : t(FRASE_DA_FERRAMENTA_NAO_SUPORTADA[primeira.motivo]),
        422,
        { requestId, details: { erros: preparada.erros } },
      );
    }

    const resumo = await aplicarSelecao(admin, {
      organizationId: org.orgId,
      atorId: user.id,
      servidorId: id,
      itens: preparada.itens,
    });
    void audit({
      action: "ai.mcp_tools_selected",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "mcp_server",
      resourceId: id,
      requestId,
      // Os NOMES das ferramentas no servidor e o risco que o administrador marcou — nunca descrição nem esquema.
      metadata: {
        selected: preparada.itens.length,
        created: resumo.criadas,
        updated: resumo.atualizadas,
        deactivated: resumo.desativadas,
        removed: resumo.removidas,
        tools: preparada.itens.slice(0, 40).map((i) => ({ tool: i.nomeNoServidor, effect: i.efeito, require_approval: i.pedirAprovacao })),
      },
    });

    const escolhidas = await ferramentasEscolhidasDoServidor(admin, org.orgId, id);
    return ok(
      {
        ok: true as const,
        summary: resumo,
        tools: descreverFerramentasDescobertas({ oferecidas: conexao.ferramentas, escolhidas, servidorNome: servidor.name }),
      },
      { requestId },
    );
  } catch {
    return fail("internal_error", t("Não foi possível salvar a escolha das ferramentas."), 500, { requestId });
  }
}
