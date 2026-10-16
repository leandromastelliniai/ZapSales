/**
 * As VOZES que o provedor oferece para a chave da organização — a lista de onde
 * cada agente escolhe a sua (Agente de IA › editar › Resposta em áudio).
 *
 * Só a ElevenLabs tem catálogo de vozes por conta (inclusive as clonadas); o
 * provedor compatível com a OpenAI recebe a voz como texto na configuração da
 * organização, e aqui responde `disponivel: false`. A chave é lida do banco e
 * usada no servidor — nunca vem do corpo nem volta na resposta.
 *
 * Falha de provedor é resultado, não erro da rota (200 com `ok: false` e a frase
 * do que fazer), porque a tela mostra a frase no lugar da lista.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { lerChaveDeVoz } from "@/lib/ai/resposta-em-audio/credencial";
import { fraseDoMotivo } from "@/lib/ai/resposta-em-audio/frases";
import { criarProvedorDeVoz } from "@/lib/ai/resposta-em-audio/provedores";
import { ehErroDeVoz, PROVEDORES_DE_VOZ } from "@/lib/ai/resposta-em-audio/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const querySchema = z.object({ provedor: z.enum(PROVEDORES_DE_VOZ).default("elevenlabs") });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  // Quem edita o agente (gerente ou acima) escolhe a voz.
  const authz = await requireRole("manager", { requestId, resource: "ai_audio" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = querySchema.safeParse({ provedor: req.nextUrl.searchParams.get("provedor") ?? undefined });
  if (!parsed.success) {
    return fail("validation_failed", t("Provedor de voz desconhecido."), 422, { requestId });
  }
  const provedor = parsed.data.provedor;
  if (provedor !== "elevenlabs") {
    return ok({ ok: true as const, disponivel: false as const, vozes: [] }, { requestId });
  }

  const admin = createAdminClient();
  const chave = await lerChaveDeVoz(admin, authz.org.orgId, provedor);
  if (!chave) {
    return ok(
      {
        ok: false as const,
        motivo: "sem_chave",
        mensagem: t("Grave a chave da ElevenLabs em Provedores para escolher a voz."),
      },
      { requestId },
    );
  }

  try {
    const vozes = await criarProvedorDeVoz({
      provedor,
      chave,
      config: { endereco: null, modelo: null, voz: null },
    }).listarVozes!();
    return ok({ ok: true as const, disponivel: true as const, vozes }, { requestId });
  } catch (err) {
    const motivo = ehErroDeVoz(err) ? err.motivo : "indisponivel";
    return ok({ ok: false as const, motivo, mensagem: t(fraseDoMotivo(motivo)) }, { requestId });
  }
}
