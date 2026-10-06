/**
 * A SAÚDE DO NÚMERO OFICIAL — do webhook da Meta para o painel e para a Central
 * (issue #5).
 *
 * A Meta empurra dois eventos: `phone_number_quality_update` (o número mudou de
 * qualidade ou de limite) e `business_capability_update` (o limite do PORTFÓLIO
 * mudou). Este módulo grava o novo estado na sessão (`meta_qualidade`,
 * `meta_limite_de_mensagens`, `meta_saude_evento`, `meta_saude_em` — 0536) e,
 * na QUEDA, abre um `channel_number_alert` na Central, amarrado à sessão como
 * os avisos de conexão (`lib/channels/health.ts`).
 *
 * ─── Por que pergunta à Graph ───────────────────────────────────────────────
 * O evento de qualidade NÃO traz a qualidade — só o número exibido e um nome de
 * evento (`FLAGGED`, `DOWNGRADE`…), cujo vocabulário a própria Meta mudou. A
 * resposta honesta é ler `quality_rating` do número com a credencial da sessão.
 * Se a pergunta falhar, `FLAGGED` vale como vermelha (é o que o evento antigo
 * significa) e o resto mantém o que se sabia — nunca inventa melhora.
 *
 * ─── Por que o aviso sai SÓ na mudança ──────────────────────────────────────
 * A Meta reentrega o que não recebe 2xx e manda vários eventos por dia. O aviso
 * compara o estado GRAVADO com o novo: a segunda entrega do mesmo evento acha o
 * estado já igual e fica calada. É o dedup sem coluna nova.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { campanhasDoNumero, fraseDaPausa, pausarAutomaticamente } from "@/lib/campanhas/pausa-automatica";
import { logger } from "@/lib/logger";

import { REF_KIND_SESSAO } from "../health";
import { resolveMetaCreds } from "./credentials";
import { graphBaseUrl } from "./graph-base";
import { avisoDeSaude, ehQualidadeVermelha, PREFIXO_DO_AVISO_DE_QUALIDADE, type EstadoDeSaude } from "./saude";
import type { BusinessCapabilityEvent, NumberQualityEvent } from "./webhook";

export { avisoDeSaude, limiteDoPortfolio, tamanhoDoLimite, type EstadoDeSaude } from "./saude";

export type EventoDeSaude = NumberQualityEvent | BusinessCapabilityEvent;

export type DesfechoDaSaude = "atualizado" | "avisado" | "outro_numero" | "sem_sessao" | "falhou";

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Qualidade e limite do número, perguntados à Graph. `null` = não deu para saber. */
export async function lerSaudeNaMeta(input: {
  phoneNumberId: string;
  token: string;
  graphVersion?: string;
}): Promise<EstadoDeSaude | null> {
  try {
    const res = await fetch(
      `${graphBaseUrl(input.graphVersion)}/${input.phoneNumberId}?fields=quality_rating,whatsapp_business_manager_messaging_limit`,
      // Roda dentro da rota do webhook: a Meta espera resposta rápida, e uma Graph
      // lenta não pode segurar a entrega. Sem resposta em 5 s, vale o evento.
      { headers: { Authorization: `Bearer ${input.token}` }, signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const corpo = (await res.json().catch(() => ({}))) as {
      quality_rating?: string;
      whatsapp_business_manager_messaging_limit?: string;
    };
    return {
      qualidade: corpo.quality_rating ?? null,
      limite: corpo.whatsapp_business_manager_messaging_limit ?? null,
    };
  } catch {
    return null;
  }
}

interface LinhaDaSessao {
  id: string;
  organization_id: string;
  display_name: string | null;
  phone_number: string | null;
  meta_phone_number_id: string | null;
  meta_qualidade: string | null;
  meta_limite_de_mensagens: string | null;
}

/**
 * Aplica um evento de saúde à sessão do webhook. Nunca lança: roda dentro da
 * rota do webhook, que responde 200 de qualquer jeito (a Meta reentregaria um
 * evento que não vai melhorar).
 *
 * `alvo` vem da sessão resolvida pelo TOKEN DO CAMINHO — a organização nunca sai
 * do corpo.
 */
export async function aplicarEventoDeSaude(
  admin: SupabaseClient,
  alvo: { organizationId: string; channelSessionId: string },
  evento: EventoDeSaude,
  agora: Date = new Date(),
): Promise<DesfechoDaSaude> {
  try {
    const { data, error } = await admin
      .from("channel_sessions")
      .select("id, organization_id, display_name, phone_number, meta_phone_number_id, meta_qualidade, meta_limite_de_mensagens")
      .eq("organization_id", alvo.organizationId)
      .eq("id", alvo.channelSessionId)
      .maybeSingle();
    if (error) {
      logger.error("[meta.saude] não deu para ler a sessão", { codigo: error.code, sessao: alvo.channelSessionId });
      return "falhou";
    }
    const sessao = data as LinhaDaSessao | null;
    if (!sessao) return "sem_sessao";

    // O evento de qualidade nomeia o número EXIBIDO; a mesma WABA pode ter outros
    // números, e o evento de um não é do outro. Sem um dos dois, não há como
    // negar — vale para esta sessão.
    if (evento.kind === "number_quality") {
      const doEvento = digitos(evento.displayPhoneNumber);
      const daSessao = digitos(sessao.phone_number);
      if (doEvento && daSessao && doEvento !== daSessao) return "outro_numero";
    }

    const antes: EstadoDeSaude = { qualidade: sessao.meta_qualidade, limite: sessao.meta_limite_de_mensagens };
    let depois: EstadoDeSaude;

    if (evento.kind === "number_quality") {
      const naMeta = await perguntarAMeta(admin, sessao);
      depois = {
        qualidade: naMeta?.qualidade ?? (evento.event === "FLAGGED" ? "RED" : antes.qualidade),
        limite: evento.limite ?? naMeta?.limite ?? antes.limite,
      };
    } else {
      depois = { qualidade: antes.qualidade, limite: evento.limite };
    }

    const { error: erroUpdate } = await admin
      .from("channel_sessions")
      .update({
        meta_qualidade: depois.qualidade,
        meta_limite_de_mensagens: depois.limite,
        meta_saude_evento: evento.kind === "number_quality" ? evento.event : "CAPABILITY_UPDATE",
        meta_saude_em: agora.toISOString(),
      })
      .eq("organization_id", sessao.organization_id)
      .eq("id", sessao.id);
    if (erroUpdate) {
      logger.error("[meta.saude] não deu para gravar a saúde do número", {
        codigo: erroUpdate.code,
        sessao: sessao.id,
      });
      return "falhou";
    }

    // A qualidade VOLTOU ao verde: o aviso de queda que estava aberto deixa de ser
    // verdade, e aviso que não fecha sozinho ensina a ignorar a Central.
    if ((depois.qualidade ?? "").toUpperCase() === "GREEN" && (antes.qualidade ?? "").toUpperCase() !== "GREEN") {
      // Fechar aviso é consequência: falhar aqui não desfaz a saúde já gravada.
      await fecharAvisosDeQualidade(admin, sessao).catch((err: unknown) =>
        logger.warn("[meta.saude] fechar os avisos de qualidade falhou", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    const apelido = [sessao.display_name, sessao.phone_number].filter(Boolean).join(" ") || "oficial";

    // Qualidade VERMELHA pausa as campanhas oficiais que falam por este número
    // (issue #9), com o motivo na campanha. Toda entrega vermelha, e não só a
    // queda: a pausa só alcança o que está rodando, então repetir não repete
    // efeito — e uma campanha retomada à força enquanto vermelho para de novo.
    if (ehQualidadeVermelha(depois.qualidade)) {
      const campanhas = await campanhasDoNumero(admin, sessao.organization_id, sessao.id);
      await pausarAutomaticamente(
        admin,
        sessao.organization_id,
        campanhas,
        "qualidade_vermelha",
        fraseDaPausa("qualidade_vermelha", { numero: apelido }),
        agora,
      );
    }

    const aviso = avisoDeSaude(antes, depois, apelido);
    if (!aviso) return "atualizado";

    const { error: erroAviso } = await admin.from("agent_inbox_items").insert({
      organization_id: sessao.organization_id,
      kind: "channel_number_alert",
      severity: aviso.severity,
      title: aviso.title,
      body: aviso.body,
      ref_kind: REF_KIND_SESSAO,
      ref_id: sessao.id,
    });
    if (erroAviso) {
      // O estado novo já está no painel; o aviso é que não saiu. Alto no log, que
      // é o único lugar onde isto pode aparecer.
      logger.error("[meta.saude] a qualidade caiu e o aviso não foi gravado", {
        codigo: erroAviso.code,
        sessao: sessao.id,
      });
      return "atualizado";
    }
    return "avisado";
  } catch (err) {
    logger.error("[meta.saude] evento de saúde não aplicado", {
      error: err instanceof Error ? err.message : String(err),
      sessao: alvo.channelSessionId,
    });
    return "falhou";
  }
}

/** Fecha só os avisos de QUALIDADE abertos desta sessão — os de conexão ficam. */
async function fecharAvisosDeQualidade(admin: SupabaseClient, sessao: LinhaDaSessao): Promise<void> {
  const { data, error } = await admin
    .from("agent_inbox_items")
    .select("id, title")
    .eq("organization_id", sessao.organization_id)
    .eq("kind", "channel_number_alert")
    .eq("ref_kind", REF_KIND_SESSAO)
    .eq("ref_id", sessao.id)
    .eq("status", "open");
  if (error) {
    logger.warn("[meta.saude] não deu para ler os avisos de qualidade abertos", { codigo: error.code });
    return;
  }
  const ids = ((data ?? []) as Array<{ id: string; title: string }>)
    .filter((a) => a.title.startsWith(PREFIXO_DO_AVISO_DE_QUALIDADE))
    .map((a) => a.id);
  // Um por id: são um ou dois avisos abertos, nunca uma lista longa.
  for (const id of ids) {
    const { error: erroUpdate } = await admin
      .from("agent_inbox_items")
      .update({ status: "resolved" })
      .eq("organization_id", sessao.organization_id)
      .eq("id", id);
    if (erroUpdate) {
      logger.warn("[meta.saude] não deu para fechar um aviso de qualidade", { codigo: erroUpdate.code });
    }
  }
}

async function perguntarAMeta(admin: SupabaseClient, sessao: LinhaDaSessao): Promise<EstadoDeSaude | null> {
  if (!sessao.meta_phone_number_id) return null;
  try {
    const creds = await resolveMetaCreds(admin, {
      organizationId: sessao.organization_id,
      phoneNumberId: sessao.meta_phone_number_id,
    });
    if (!creds) return null;
    return await lerSaudeNaMeta({
      phoneNumberId: creds.phoneNumberId,
      token: creds.token,
      graphVersion: creds.graphVersion,
    });
  } catch {
    return null;
  }
}
