import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * AS FERRAMENTAS EXTERNAS DO AGENTE (Agente de IA › Ferramentas externas) — issue #94.
 *
 *   GET  — a lista da organização, sem nenhuma chave (só os 4 últimos caracteres). Manager.
 *   POST — cadastra um webhook: de CONSULTA ou de AÇÃO que altera algo no outro sistema. Manager. A chave de assinatura nasce aqui e
 *          volta em claro UMA vez, no corpo desta resposta (`signing_secret`); depois
 *          disso só a tela "nova chave" a troca.
 *
 * A organização vem da sessão, nunca do corpo (o schema é `strict` e recusa
 * `organization_id`). O endereço passa pela rede segura única ANTES de gravar —
 * `https`, público, nunca da rede interna — e de novo a cada chamada. «Altera dados»
 * é aceito (issue #95) e nasce com «pedir aprovação» no PADRÃO DO EFEITO: ação que altera
 * pede aprovação a menos que quem cadastra desligue a chave de propósito (`pedir_aprovacao:
 * false`). Só manager+ chega aqui; o modelo nunca escolhe a chave.
 *
 * `Idempotency-Key` (uuid, TTL 24h) é aceito. O recibo guardado e reenviado NÃO leva a
 * chave de assinatura: ela só viaja na primeira resposta, e quem a perdeu pede outra.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { criarFerramentaSchema } from "@/lib/ai/ferramentas-externas/esquema";
import { fraseDaRecusaDeEndereco } from "@/lib/ai/ferramentas-externas/tipos";
import { criarFerramenta, listarFerramentas, type FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ENDPOINT = "POST /api/v1/ai/external-tools";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tools" });
  if (!authz.ok) return authz.response;
  try {
    const ferramentas = await listarFerramentas(createAdminClient(), authz.org.orgId);
    return ok(ferramentas, { requestId });
  } catch {
    return fail("internal_error", traduzir("Não consegui ler as ferramentas externas.", authz.user.idioma), 500, {
      requestId,
    });
  }
}

/** A recusa atravessa o `comIdempotencia` como exceção — assim ela não vira recibo. */
class CadastroRecusado extends Error {
  constructor(
    readonly codigo: string,
    readonly texto: string,
    readonly status: number,
  ) {
    super(texto);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_external_tools" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = criarFerramentaSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os campos da ferramenta: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const dados = parsed.data;

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success) {
    return fail("validation_failed", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  // O endereço de uma ferramenta é escolhido por uma ORGANIZAÇÃO: a régua de destino de
  // organização recusa a rede interna, privada e local ANTES de gravar.
  const recusa = await motivoDaRecusaDeDestino(dados.url, "organizacao");
  if (recusa) {
    return fail(
      "validation_failed",
      t(fraseDaRecusaDeEndereco(recusa)),
      422,
      { requestId, details: { url: recusa } },
    );
  }

  const admin = createAdminClient();
  let chaveGerada: string | null = null;

  async function criar(): Promise<FerramentaExterna> {
    const criada = await criarFerramenta(admin, { organizationId: org.orgId, atorId: user.id, dados });
    if (!criada.ok) {
      throw criada.erro === "cifra_indisponivel"
        ? new CadastroRecusado(
            "encryption_unavailable",
            t("Não consigo guardar a chave de assinatura com segurança: a cifra do servidor não está configurada. Peça a quem instalou o sistema para conferir."),
            422,
          )
        : new CadastroRecusado("internal_error", t("Não foi possível cadastrar a ferramenta."), 500);
    }
    chaveGerada = criada.chave;
    // Sem a chave, sem o corpo e sem o endereço inteiro: a auditoria guarda o fato.
    void audit({
      action: "ai.external_tool_created",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "agent_external_tool",
      resourceId: criada.ferramenta.id,
      requestId,
      metadata: {
        slug: criada.ferramenta.slug,
        effect: criada.ferramenta.effect,
        // A decisão de quem cadastra: `null` = o padrão do efeito (altera pede aprovação).
        require_approval: criada.ferramenta.require_approval,
        approval_ttl_hours: criada.ferramenta.approval_ttl_hours,
        host: new URL(criada.ferramenta.url ?? "http://invalido").host,
        parameters: criada.ferramenta.parameters.length,
      },
    });
    return criada.ferramenta;
  }

  try {
    if (chave === null) {
      const ferramenta = await criar();
      return ok({ ...ferramenta, signing_secret: chaveGerada }, { requestId, status: 201 });
    }

    const desfecho = await comIdempotencia({
      db: await createClient(),
      organizationId: org.orgId,
      endpoint: ENDPOINT,
      chave,
      corpo: dados,
      executar: async () => ({ resposta: await criar(), status: 201 }),
    });
    if (desfecho.tipo === "conflito") {
      return fail("idempotency_conflict", "Esta chave de idempotência já foi usada com outro conteúdo.", 409, {
        requestId,
      });
    }
    if (desfecho.tipo === "em_curso") {
      return fail("idempotency_in_progress", "A mesma requisição ainda está em curso. Tente de novo em instantes.", 409, {
        requestId,
      });
    }
    // O recibo gravado não tem a chave. Só quem EXECUTOU a criação a recebe.
    return ok(
      desfecho.tipo === "executou" ? { ...desfecho.resposta, signing_secret: chaveGerada } : { ...desfecho.resposta, signing_secret: null },
      { requestId, status: 201 },
    );
  } catch (err) {
    if (err instanceof CadastroRecusado) return fail(err.codigo, err.texto, err.status, { requestId });
    return fail("internal_error", t("Não foi possível cadastrar a ferramenta."), 500, { requestId });
  }
}
