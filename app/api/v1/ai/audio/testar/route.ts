import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * "Testar" a resposta em áudio: sintetiza uma frase curta de verdade no provedor
 * escolhido e converte para nota de voz, SEM enviar nada a ninguém e SEM gravar
 * o arquivo. Com `api_key` no corpo, testa ESSA chave antes de gravar; sem ela,
 * testa a gravada.
 *
 * Existe porque os erros de voz só aparecem numa chamada de verdade: chave
 * errada, conta sem créditos, voz que não existe, endereço recusado, ffmpeg
 * ausente. Sem este botão, a configuração ficaria "ligada" e toda resposta
 * voltaria a sair em texto sem ninguém saber por quê. A resposta é sempre 200
 * com `ok: true|false` e a frase do que fazer — o erro de voz é resultado do
 * teste, não falha da rota (o mesmo contrato do teste da chave de mapas).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { LIMITE_MAXIMO_DE_CARACTERES, enderecoSchema, lerConfigDeAudio } from "@/lib/ai/resposta-em-audio/config";
import { chaveDeVozSchema, lerChaveDeVoz } from "@/lib/ai/resposta-em-audio/credencial";
import { fraseDoMotivo } from "@/lib/ai/resposta-em-audio/frases";
import { paraNotaDeVoz } from "@/lib/ai/resposta-em-audio/nota-de-voz";
import { criarProvedorDeVoz } from "@/lib/ai/resposta-em-audio/provedores";
import { ehErroDeVoz, PROVEDORES_DE_VOZ } from "@/lib/ai/resposta-em-audio/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const FRASE_DE_TESTE = "Olá! Este é um teste da resposta em áudio.";

const postSchema = z
  .object({
    provedor: z.enum(PROVEDORES_DE_VOZ).optional(),
    api_key: chaveDeVozSchema.optional(),
    endereco: enderecoSchema.nullable().optional(),
    modelo: z.string().trim().min(1).max(120).nullable().optional(),
    voz: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  // Não grava nada, mas gasta a conta do provedor da organização: suporte
  // temporário não dispara chamada paga em nome dela.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_audio" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  let bruto: unknown = {};
  try {
    const texto = await req.text();
    if (texto.trim()) bruto = JSON.parse(texto);
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = postSchema.safeParse(bruto);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os campos do teste: algum valor está fora do permitido."), 422, { requestId });
  }

  const admin = createAdminClient();
  const orgId = authz.org.orgId;
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const salva = lerConfigDeAudio((org as { settings?: unknown } | null)?.settings ?? {});

  // O teste usa o que está NA TELA (ainda sem gravar) por cima do que está gravado.
  const provedor = parsed.data.provedor ?? salva.provedor;
  // A chave GRAVADA só viaja para o endereço GRAVADO: aceitar um endereço do corpo com a
  // chave guardada deixaria qualquer admin mandar a chave da empresa a um servidor dele.
  // Endereço novo no teste exige a chave colada junto (ela já é do próprio admin).
  const usaAChaveGravada = parsed.data.api_key === undefined;
  const config = {
    endereco: !usaAChaveGravada && parsed.data.endereco !== undefined ? parsed.data.endereco : salva.endereco,
    modelo: parsed.data.modelo !== undefined ? parsed.data.modelo : salva.modelo,
    voz: parsed.data.voz !== undefined ? parsed.data.voz : salva.voz,
  };

  const chave = parsed.data.api_key ?? (await lerChaveDeVoz(admin, orgId, provedor));
  if (!chave) {
    return fail("validation_failed", t("Cole uma chave para testar, ou grave uma antes."), 422, { requestId });
  }

  const falhou = (motivo: string) =>
    ok({ ok: false as const, motivo, mensagem: t(fraseDoMotivo(motivo)) }, { requestId });

  const voz = criarProvedorDeVoz({ provedor, chave, config });
  const inicio = performance.now();
  try {
    // ElevenLabs sem voz padrão: só dá para provar a chave, listando as vozes da conta.
    if (provedor === "elevenlabs" && !config.voz) {
      const vozes = await voz.listarVozes!();
      return ok(
        {
          ok: true as const,
          somente_a_chave: true,
          vozes: vozes.length,
          latencia_ms: Math.round(performance.now() - inicio),
        },
        { requestId },
      );
    }
    const audio = await voz.sintetizar({ texto: FRASE_DE_TESTE, voz: config.voz, modelo: config.modelo });
    // A conversão faz parte do teste: servidor sem ffmpeg não entrega nota de voz.
    await paraNotaDeVoz(audio);
    return ok(
      {
        ok: true as const,
        somente_a_chave: false,
        caracteres: Math.min(FRASE_DE_TESTE.length, LIMITE_MAXIMO_DE_CARACTERES),
        latencia_ms: Math.round(performance.now() - inicio),
      },
      { requestId },
    );
  } catch (err) {
    return falhou(ehErroDeVoz(err) ? err.motivo : "indisponivel");
  }
}
