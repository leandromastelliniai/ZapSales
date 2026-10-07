import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/channels/templates/submit — cria um modelo no editor e o envia à
 * Meta para aprovação (issue #6).
 *
 * O corpo é o do editor (`novoModeloSchema`): tipo (padrão, carrossel ou oferta
 * por tempo limitado), nome, idioma, categoria, formato das variáveis, cabeçalho
 * de mídia, corpo com exemplos, rodapé, botões e cards. O que a Meta recusaria
 * por regra conhecida volta 422 aqui, campo a campo, sem ida à Meta.
 *
 * A mídia chega já enviada pela rota irmã (`../media`, issue #7): o `handle` da
 * Meta e o caminho da cópia no storage. O caminho vem do corpo, então é
 * conferido contra a organização da SESSÃO antes de ir para o espelho — e
 * conferido no bucket (issue #30): o editor aberto mais de 7 dias, ou a
 * retentativa de um envio recusado, traz um caminho que a retenção (0542) já
 * apagou ou enfileirou. A Meta aprovaria, porque guarda a própria amostra, e o
 * espelho citaria um arquivo que o disparo não acha.
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
import {
  BUCKET_DA_MIDIA_DE_MODELO,
  caminhoEhDaOrganizacao,
} from "@/lib/channels/meta/midia-de-modelo";
import { novoModeloSchema, type NovoModelo } from "@/lib/channels/meta/novo-modelo";
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

/**
 * Os campos de mídia cujo caminho não é desta organização. A rota de upload
 * gera o caminho; um que volta com outra organização (ou fora de `templates/`)
 * foi forjado, e gravá-lo poria no espelho daqui o arquivo de outra empresa.
 */
function midiasAlheias(m: NovoModelo, orgId: string): string[] {
  return midiasDoCorpo(m)
    .filter(([, path]) => !caminhoEhDaOrganizacao(path, orgId))
    .map(([campo]) => campo);
}

/** Cada mídia do corpo, como `[campo do editor, caminho no storage]`. */
function midiasDoCorpo(m: NovoModelo): Array<[string, string]> {
  const campos: Array<[string, string | undefined]> = [
    ["header.media", m.header?.media?.path],
    ...m.cards.map((c, i): [string, string | undefined] => [`cards.${i}.header.media`, c.header.media?.path]),
  ];
  return campos.filter((c): c is [string, string] => Boolean(c[1]));
}

/**
 * Os campos de mídia cujo arquivo não serve mais (issue #30): saiu do bucket,
 * ou está `pending` na fila de remoção — o worker pode apagá-lo enquanto a
 * Meta revisa. Quem resolve é o operador, enviando o arquivo de novo: um
 * caminho novo nasce fora da fila e com a carência inteira. Lança quando não
 * dá para conferir; nada foi à Meta, e tentar de novo é seguro.
 */
async function midiasIndisponiveis(
  admin: ReturnType<typeof createAdminClient>,
  m: NovoModelo,
  orgId: string,
): Promise<string[]> {
  const campos = midiasDoCorpo(m);
  if (campos.length === 0) return [];

  const { data: naFila, error } = await admin
    .from("storage_redaction_queue")
    .select("object_path")
    .eq("organization_id", orgId)
    .eq("bucket", BUCKET_DA_MIDIA_DE_MODELO)
    .eq("status", "pending")
    .in(
      "object_path",
      campos.map(([, path]) => path),
    );
  if (error) throw new Error(error.message);
  const pendentes = new Set((naFila ?? []).map((r) => r.object_path));

  const disponiveis = await Promise.all(
    campos.map(async ([, path]) => {
      if (pendentes.has(path)) return false;
      const { data } = await admin.storage.from(BUCKET_DA_MIDIA_DE_MODELO).exists(path);
      return data;
    }),
  );
  return campos.filter((_, i) => !disponiveis[i]).map(([campo]) => campo);
}

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

  const alheias = midiasAlheias(parsed.data, orgId);
  if (alheias.length > 0) {
    return fail("validation_failed", "O modelo tem campos a corrigir.", 422, {
      requestId,
      details: { problemas: alheias.map((campo) => ({ campo, motivo: "midia_de_outra_organizacao" })) },
    });
  }

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success) {
    return fail("validation_failed", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  const admin = createAdminClient();

  let indisponiveis: string[];
  try {
    indisponiveis = await midiasIndisponiveis(admin, parsed.data, orgId);
  } catch {
    return fail("internal_error", "Não deu para conferir o arquivo do cabeçalho. Tente de novo.", 500, {
      requestId,
    });
  }
  if (indisponiveis.length > 0) {
    return fail(
      "validation_failed",
      "O arquivo do cabeçalho não está mais guardado. Escolha o arquivo de novo e envie.",
      422,
      {
        requestId,
        details: { problemas: indisponiveis.map((campo) => ({ campo, motivo: "midia_indisponivel" })) },
      },
    );
  }

  const sessao = await metaSessionForOrg(orgId);
  if (!sessao?.wabaId) return fail("invalid_request", "no_meta_channel", 400, { requestId });

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
