import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/channels/templates/submit — cria um modelo no editor e o envia à
 * Meta para aprovação (issue #6).
 *
 * O corpo é o do editor básico (`novoModeloSchema`): nome, idioma, categoria,
 * formato das variáveis, corpo com exemplos, rodapé e botões. O que a Meta
 * recusaria por regra conhecida volta 422 aqui, campo a campo, sem ida à Meta.
 * O que só a Meta sabe recusar volta 422 `meta_template_refused` com a frase dela.
 *
 * Mesmo papel e mesma trava de suporte das irmãs (`../route.ts`): modelo é
 * configuração do canal e, depois de aprovado, custa a cada envio.
 *
 * Aceita `Idempotency-Key` (UUID): a retentativa com a mesma chave devolve a
 * mesma resposta sem pedir à Meta de novo. Recusa não grava recibo — corrigir e
 * reenviar com a mesma chave é o caminho natural de quem errou.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { resolveMetaCreds } from "@/lib/channels/meta/credentials";
import { novoModeloSchema } from "@/lib/channels/meta/novo-modelo";
import { metaSessionForOrg } from "@/lib/channels/meta/session";
import {
  submeterModelo,
  type DesfechoDaSubmissao,
  type ModeloSubmetido,
} from "@/lib/channels/meta/submeter-modelo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tag do endpoint no recibo de idempotência. */
const ENDPOINT = "/api/v1/channels/templates/submit";

/** A recusa atravessa o `comIdempotencia` como exceção — assim ela não vira recibo. */
class SubmissaoRecusada extends Error {
  constructor(readonly desfecho: Exclude<DesfechoDaSubmissao, { ok: true }>) {
    super(desfecho.motivo);
  }
}

function respostaDaRecusa(d: SubmissaoRecusada["desfecho"], requestId: string): NextResponse {
  if (d.motivo === "modelo_ja_existe") {
    return fail("meta_template_exists", "Já existe um modelo com este nome e idioma.", 409, {
      requestId,
    });
  }
  if (d.motivo === "meta_recusou") {
    return fail("meta_template_refused", d.mensagem, 422, {
      requestId,
      details: { codigo: d.codigo, subcodigo: d.subcodigo },
    });
  }
  if (d.motivo === "falha_na_leitura") {
    // Nada foi à Meta: tentar de novo é seguro.
    return fail("internal_error", "Não deu para conferir os modelos salvos. Tente de novo.", 500, {
      requestId,
    });
  }
  // A Meta aceitou e o espelho não gravou: a sincronização traz o modelo.
  return fail(
    "internal_error",
    "O modelo foi enviado à Meta, mas não ficou salvo aqui. Clique em Sincronizar com a Meta para trazê-lo.",
    502,
    { requestId },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_templates" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const userId = authz.user.id;

  const parsed = novoModeloSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "O modelo tem campos a corrigir.", 422, {
      requestId,
      details: {
        problemas: parsed.error.issues.map((i) => ({ campo: i.path.join("."), motivo: i.message })),
      },
    });
  }

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success) {
    return fail("validation_failed", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  const sessao = await metaSessionForOrg(orgId);
  if (!sessao?.wabaId) return fail("invalid_request", "no_meta_channel", 400, { requestId });

  const admin = createAdminClient();
  // A credencial da SESSÃO, com o ambiente de reserva — a mesma porta do sync e do envio.
  const creds = await resolveMetaCreds(admin, {
    organizationId: orgId,
    phoneNumberId: sessao.phoneNumberId ?? "",
  });
  if (!creds) return fail("invalid_request", "missing_meta_token", 400, { requestId });
  const wabaId = sessao.wabaId;

  async function submeter(): Promise<ModeloSubmetido> {
    const r = await submeterModelo(admin, {
      organizationId: orgId,
      wabaId,
      token: creds!.token,
      graphVersion: creds!.graphVersion,
      modelo: parsed.data!,
    });
    if (!r.ok) throw new SubmissaoRecusada(r);
    void audit({
      action: "meta_template.submitted",
      actorUserId: userId,
      organizationId: orgId,
      resourceType: "meta_template",
      resourceId: r.modelo.id,
      requestId,
      metadata: {
        name: r.modelo.name,
        language: r.modelo.language,
        category_requested: parsed.data!.category,
        category: r.modelo.category,
        status: r.modelo.status,
      },
    });
    return r.modelo;
  }

  try {
    if (chave === null) return ok(await submeter(), { requestId, status: 201 });

    const desfecho = await comIdempotencia({
      db: await createClient(),
      organizationId: orgId,
      endpoint: ENDPOINT,
      chave,
      corpo: parsed.data,
      executar: async () => ({ resposta: await submeter(), status: 201 }),
    });
    if (desfecho.tipo === "conflito") {
      return fail(
        "idempotency_conflict",
        "Esta chave de idempotência já foi usada com outro conteúdo.",
        409,
        {
          requestId,
        },
      );
    }
    if (desfecho.tipo === "em_curso") {
      return fail(
        "idempotency_in_progress",
        "A mesma requisição ainda está em curso. Tente de novo em instantes.",
        409,
        {
          requestId,
        },
      );
    }
    return ok(desfecho.resposta, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof SubmissaoRecusada) return respostaDaRecusa(err.desfecho, requestId);
    return fail("internal_error", err instanceof Error ? err.message : "submit_failed", 502, {
      requestId,
    });
  }
}
