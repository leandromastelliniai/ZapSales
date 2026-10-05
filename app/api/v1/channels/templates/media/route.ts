import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/channels/templates/media — sobe a mídia do cabeçalho de um modelo
 * (multipart `file`, e `format` opcional: IMAGE, VIDEO ou DOCUMENT) — issue #7.
 *
 * Dois destinos, nesta ordem:
 *
 *  1. a API de upload retomável da Meta, que devolve o `handle` da amostra que
 *     a revisão do modelo exige (`example.header_handle`);
 *  2. a cópia no bucket `whatsapp-media`, em `<org>/templates/<uuid>.<ext>` —
 *     a Meta guarda só a amostra, e o arquivo de cada disparo sai daqui.
 *
 * A Meta vem primeiro: se ela recusar, nada fica no storage (a pasta de modelos
 * não é podada pela retenção, e um arquivo ali sem modelo seria custo para
 * sempre). Se o storage falhar depois, sobra só o handle na Meta, que expira
 * sozinho, e a nova tentativa é segura.
 *
 * Devolve o `handle`, o caminho, o tipo e um link assinado curto para o preview
 * do editor. O editor põe `handle` e caminho no modelo, e a rota de criação
 * (`../submit`) confere que o caminho é desta organização antes de gravá-lo no
 * espelho.
 *
 * Mesmo papel e mesma trava de suporte das irmãs: é configuração do canal. O tipo
 * é decidido pelo CONTEÚDO do arquivo, nunca pelo nome nem pelo `content-type`
 * declarado, e o caminho é gerado AQUI.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { resolveMetaCreds } from "@/lib/channels/meta/credentials";
import {
  BUCKET_DA_MIDIA_DE_MODELO,
  caminhoDaMidia,
  enviarMidiaParaMeta,
  farejarArquivo,
  TETO_POR_FORMATO,
} from "@/lib/channels/meta/midia-de-modelo";
import {
  FORMATOS_DE_MIDIA,
  MIDIAS_DO_CABECALHO,
  type FormatoDeMidia,
} from "@/lib/channels/meta/novo-modelo";
import { metaSessionForOrg } from "@/lib/channels/meta/session";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** O link do preview do editor: só para a tela, enquanto o operador edita. */
const VALIDADE_DO_PREVIEW_S = 60 * 60;

const MAIOR_TETO = Math.max(...Object.values(TETO_POR_FORMATO));
const MB = 1024 * 1024;

/** O que a tela mostra quando o arquivo não serve para o formato pedido. */
const FRASE_DO_FORMATO: Record<FormatoDeMidia, string> = {
  IMAGE: "A imagem precisa ser JPG ou PNG.",
  VIDEO: "O vídeo precisa ser MP4.",
  DOCUMENT: "O documento precisa ser PDF.",
};

export interface MidiaEnviadaView {
  handle: string;
  path: string;
  mime_type: keyof typeof MIDIAS_DO_CABECALHO;
  file_name: string;
  size_bytes: number;
  format: FormatoDeMidia;
  /** Link assinado de 1 hora, só para o preview. */
  preview_url: string | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_templates" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  // Recusa pelo Content-Length declarado ANTES de bufferizar o corpo; o
  // `file.size` abaixo continua sendo o check autoritativo.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAIOR_TETO + MB) {
    return fail("payload_too_large", `O arquivo precisa ter até ${MAIOR_TETO / MB} MB.`, 413, {
      requestId,
    });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return fail("validation_failed", "Campo 'file' (multipart) obrigatório.", 422, { requestId });
  }
  const pedido = form?.get("format");
  const formatoPedido =
    typeof pedido === "string" && (FORMATOS_DE_MIDIA as readonly string[]).includes(pedido)
      ? (pedido as FormatoDeMidia)
      : null;
  if (file.size > MAIOR_TETO) {
    return fail("payload_too_large", `O arquivo precisa ter até ${MAIOR_TETO / MB} MB.`, 413, {
      requestId,
    });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const tipo = farejarArquivo(bytes);
  const formato = tipo ? MIDIAS_DO_CABECALHO[tipo].formato : null;
  if (!tipo || !formato || (formatoPedido && formato !== formatoPedido)) {
    return fail(
      "unsupported_media_type",
      formatoPedido
        ? FRASE_DO_FORMATO[formatoPedido]
        : "O arquivo precisa ser JPG, PNG, MP4 ou PDF.",
      415,
      { requestId, details: { content_type_declarado: file.type || null } },
    );
  }
  if (bytes.length > TETO_POR_FORMATO[formato]) {
    return fail(
      "payload_too_large",
      `Este tipo de arquivo precisa ter até ${TETO_POR_FORMATO[formato] / MB} MB.`,
      413,
      { requestId },
    );
  }

  const sessao = await metaSessionForOrg(orgId);
  if (!sessao?.wabaId) return fail("invalid_request", "no_meta_channel", 400, { requestId });
  const admin = createAdminClient();
  // A credencial da SESSÃO, com o ambiente de reserva — a mesma porta do sync e da criação.
  const creds = await resolveMetaCreds(admin, {
    organizationId: orgId,
    phoneNumberId: sessao.phoneNumberId ?? "",
  });
  if (!creds) return fail("invalid_request", "missing_meta_token", 400, { requestId });

  // O nome vai à Meta junto da amostra e volta à tela: sem pasta e sem controle.
  const nome = (file.name || `cabecalho.${MIDIAS_DO_CABECALHO[tipo].extensao}`)
    .replace(/^.*[\\/]/, "")
    .replace(/[\u0000-\u001f]/g, "")
    .slice(0, 200);

  const meta = await enviarMidiaParaMeta({
    token: creds.token,
    graphVersion: creds.graphVersion,
    bytes,
    tipo,
    nome,
  });
  if (!meta.ok) {
    return fail("meta_media_refused", meta.mensagem, 422, {
      requestId,
      details: { etapa: meta.etapa, codigo: meta.codigo, subcodigo: meta.subcodigo },
    });
  }

  const arquivoId = randomUUID();
  const path = caminhoDaMidia(orgId, tipo, arquivoId);
  const bucket = admin.storage.from(BUCKET_DA_MIDIA_DE_MODELO);
  const { error: erroUp } = await bucket.upload(path, bytes, { contentType: tipo, upsert: false });
  if (erroUp) {
    logger.error("[templates/media] upload ao storage falhou", {
      detalhe: erroUp.message,
      requestId,
    });
    return fail(
      "internal_error",
      "A mídia foi à Meta, mas não ficou guardada aqui. Tente de novo.",
      500,
      {
        requestId,
      },
    );
  }
  const { data: assinado } = await bucket.createSignedUrl(path, VALIDADE_DO_PREVIEW_S);

  void audit({
    action: "meta_template.media_uploaded",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "meta_template_media",
    resourceId: arquivoId,
    requestId,
    metadata: { path, format: formato, mime_type: tipo, size_bytes: bytes.length },
  });

  const resposta: MidiaEnviadaView = {
    handle: meta.handle,
    path,
    mime_type: tipo,
    file_name: nome,
    size_bytes: bytes.length,
    format: formato,
    preview_url: assinado?.signedUrl ?? null,
  };
  return ok(resposta, { requestId, status: 201 });
}
