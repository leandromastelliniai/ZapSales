import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * A RESPOSTA EM ÁUDIO da organização (Agente de IA › Provedores, cartão
 * "Resposta em áudio") — issue #91.
 *
 *   GET    — o estado: ligado?, provedor, padrões, quais chaves estão gravadas
 *            (os 4 últimos caracteres, NUNCA a chave), o uso do mês e a última
 *            falha. Manager.
 *   PUT    — grava a configuração e, se vier `api_key`, a chave (cifrada). Admin.
 *   DELETE — remove a chave de um provedor (`?provedor=`). Admin.
 *
 * O recurso nasce DESLIGADO. Ligar exige duas coisas, as duas conferidas AQUI e
 * não só na tela: o aceite do administrador (o texto das respostas passa a ir
 * para um fornecedor de voz) e uma chave gravada para o provedor escolhido.
 * Ligar sem uma delas é 422 com a frase do que falta — o recurso nunca fica
 * "ligado" sem poder funcionar.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import {
  LIMITE_MAXIMO_DE_CARACTERES,
  LIMITE_MINIMO_DE_CARACTERES,
  gravarConfigDeAudio,
  lerConfigDeAudio,
} from "@/lib/ai/resposta-em-audio/config";
import {
  chaveDeVozSchema,
  estadoDaChaveDeVoz,
  guardarChaveDeVoz,
  removerChaveDeVoz,
} from "@/lib/ai/resposta-em-audio/credencial";
import { corpoDoEstado, estadoDaRespostaEmAudio } from "@/lib/ai/resposta-em-audio/estado";
import { PROVEDORES_DE_VOZ } from "@/lib/ai/resposta-em-audio/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const enderecoSchema = z.string().trim().max(300).url();

const putSchema = z
  .object({
    ligado: z.boolean().optional(),
    provedor: z.enum(PROVEDORES_DE_VOZ).optional(),
    endereco: enderecoSchema.nullable().optional(),
    modelo: z.string().trim().min(1).max(120).nullable().optional(),
    voz: z.string().trim().min(1).max(120).nullable().optional(),
    limite_de_caracteres: z.number().int().min(LIMITE_MINIMO_DE_CARACTERES).max(LIMITE_MAXIMO_DE_CARACTERES).optional(),
    custo_por_mil_caracteres_cents: z.number().min(0).max(10_000).nullable().optional(),
    /** O administrador marcou o aceite nesta chamada. */
    aceitar: z.literal(true).optional(),
    api_key: chaveDeVozSchema.optional(),
  })
  .strict();

const deleteSchema = z.object({ provedor: z.enum(PROVEDORES_DE_VOZ) });

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_audio" });
  if (!authz.ok) return authz.response;
  try {
    const estado = await estadoDaRespostaEmAudio(createAdminClient(), authz.org.orgId);
    return ok(corpoDoEstado(estado, (x) => traduzir(x, authz.user.idioma)), { requestId });
  } catch {
    return fail("internal_error", traduzir("Não consegui ler a configuração da resposta em áudio.", authz.user.idioma), 500, {
      requestId,
    });
  }
}

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_audio" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = putSchema.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os campos da resposta em áudio: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const { api_key: chaveNova, aceitar, ...resto } = parsed.data;

  const admin = createAdminClient();
  const orgId = authz.org.orgId;

  const { data: org, error: erroDaOrg } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  if (erroDaOrg || !org) {
    return fail("internal_error", t("Não consegui ler a configuração da resposta em áudio."), 500, { requestId });
  }
  const atual = lerConfigDeAudio((org as { settings?: unknown }).settings ?? {});
  const provedorAlvo = resto.provedor ?? atual.provedor;

  // O endereço de um provedor compatível é escolhido pela ORGANIZAÇÃO: a régua de
  // destino de organização recusa a rede interna, privada e local ANTES de gravar.
  if (resto.endereco) {
    const recusa = await motivoDaRecusaDeDestino(resto.endereco, "organizacao");
    if (recusa) {
      return fail(
        "validation_failed",
        t("Este endereço não pode ser usado: endereços da rede interna, privada ou local são recusados por segurança."),
        422,
        { requestId, details: { endereco: recusa } },
      );
    }
  }

  // Ligar exige a chave do provedor escolhido (a que chega agora, ou a gravada) e o aceite.
  if (resto.ligado === true) {
    const temChave = chaveNova !== undefined || (await estadoDaChaveDeVoz(admin, orgId, provedorAlvo).catch(() => null))?.configurada === true;
    if (!temChave) {
      return fail("validation_failed", t("Grave a chave do provedor de voz antes de ligar a resposta em áudio."), 422, {
        requestId,
        details: { motivo: "sem_chave" },
      });
    }
    if (atual.aceite === null && aceitar !== true) {
      return fail(
        "validation_failed",
        t("Para ligar, confirme que concorda em enviar o texto das respostas ao provedor de voz escolhido."),
        422,
        { requestId, details: { motivo: "sem_aceite" } },
      );
    }
  }

  let ultimos4: string | null = null;
  if (chaveNova !== undefined) {
    const r = await guardarChaveDeVoz(admin, { organizationId: orgId, provedor: provedorAlvo, chave: chaveNova, atorId: authz.user.id });
    if (!r.ok) {
      return fail(
        "internal_error",
        r.erro === "cifra_indisponivel"
          ? t("A cifra do servidor não está disponível; a chave não foi gravada.")
          : t("Não consegui gravar a chave."),
        500,
        { requestId },
      );
    }
    ultimos4 = r.ultimos4;
    await audit({
      action: "ai.audio_reply_credential_saved",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "voice_provider_credential",
      resourceId: null,
      requestId,
      // O QUE mudou, jamais o valor.
      metadata: { provedor: provedorAlvo, last4: ultimos4 },
    });
  }

  const mudanca = { ...resto, ...(aceitar === true ? { aceitar: true as const } : {}) };
  const mudouAlgoDaConfig = Object.keys(mudanca).length > 0;
  if (mudouAlgoDaConfig) {
    const r = await gravarConfigDeAudio({ admin, orgId, actorUserId: authz.user.id, mudanca });
    if (!r.ok) {
      return fail(
        r.motivo === "config_invalida" ? "validation_failed" : "internal_error",
        r.motivo === "config_invalida"
          ? t("Confira os campos da resposta em áudio: algum valor está fora do permitido.")
          : t("Não consegui gravar a configuração da resposta em áudio."),
        r.motivo === "config_invalida" ? 422 : 500,
        { requestId },
      );
    }
    await audit({
      action: "ai.audio_reply_config_changed",
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "organization",
      resourceId: orgId,
      requestId,
      // Quais campos mudaram e para quê — sem chave (ela nem chega aqui).
      metadata: {
        campos: Object.keys(resto),
        ligado: r.config.ligado,
        provedor: r.config.provedor,
        aceitou_agora: aceitar === true,
      },
    });
  }

  const estado = await estadoDaRespostaEmAudio(admin, orgId);
  return ok(corpoDoEstado(estado, t), { requestId });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_audio" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = deleteSchema.safeParse({ provedor: req.nextUrl.searchParams.get("provedor") });
  if (!parsed.success) {
    return fail("validation_failed", t("Informe de qual provedor é a chave."), 422, { requestId });
  }

  const admin = createAdminClient();
  let removeu: boolean;
  try {
    removeu = await removerChaveDeVoz(admin, authz.org.orgId, parsed.data.provedor);
  } catch {
    return fail("internal_error", t("Não consegui remover a chave."), 500, { requestId });
  }
  if (removeu) {
    await audit({
      action: "ai.audio_reply_credential_removed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "voice_provider_credential",
      resourceId: null,
      requestId,
      metadata: { provedor: parsed.data.provedor },
    });
  }
  // Sem chave não há como responder em áudio: se era a do provedor em uso, a
  // configuração CONTINUA ligada e o estado devolve `sem_chave` — a tela explica.
  // Desligar por conta própria apagaria uma decisão do administrador (e o aceite).
  const estado = await estadoDaRespostaEmAudio(admin, authz.org.orgId);
  return ok({ removida: removeu, ...corpoDoEstado(estado, t) }, { requestId });
}
