/**
 * O REGISTRO do custo da Meta (issue #10) — as escritas em `meta_message_costs`.
 *
 * Dois tempos para a mesma linha (única por organização + mensagem):
 *
 *   1. a rodada da campanha oficial grava a ESTIMATIVA quando a Meta aceita o
 *      envio (`registrarEstimativaDoEnvio`) — é ela que faz o teto valer antes
 *      de o webhook chegar;
 *   2. o webhook de status traz o `pricing` e a linha vira REAL
 *      (`registrarCustoDoWebhook`) — ou nasce real, se o webhook chegou antes da
 *      estimativa (a corrida perde a estimativa no 23505, e é o certo).
 *
 * O contador das 1.000 grátis de atendimento sai daqui também: é o webhook que
 * diz que a mensagem foi de atendimento, e é ali que um limiar é cruzado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { fusoDaJanela } from "@/lib/agent-engine/pacing/store";
import { logger } from "@/lib/logger";
import { idiomaPeloCliente, preencher } from "@/lib/i18n/aviso-no-idioma";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMAS, type Idioma } from "@/lib/i18n/idiomas";

import { GRATIS_POR_MES, inicioDoMesNoFuso, limiarAtingido } from "./atendimento-gratis";
import { custoDaMensagem } from "./custo-real";
import { carregarTabela, precoPara, type CategoriaDePreco, type LinhaDePreco } from "./tabela-de-precos";

/** De onde veio o custo da linha — o CHECK `meta_message_costs_origem_check` (migration 0540). */
export const ORIGENS_DO_CUSTO = ["estimado", "webhook"] as const;
export type OrigemDoCusto = (typeof ORIGENS_DO_CUSTO)[number];

const ESTIMADO: OrigemDoCusto = "estimado";
const WEBHOOK: OrigemDoCusto = "webhook";

/** O `metadata.campaign_id` da mensagem é jsonb: só vira FK se for uuid. */
const uuid = z.string().uuid();

function ehDuplicada(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

export async function registrarEstimativaDoEnvio(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    mensagemId: string;
    campanhaId: string;
    channelSessionId: string;
    telefone: string;
    categoria: CategoriaDePreco;
    tabela: readonly LinhaDePreco[];
  },
): Promise<void> {
  const linha = precoPara(entrada.telefone, entrada.categoria, entrada.tabela);
  const { error } = await admin.from("meta_message_costs").insert({
    organization_id: entrada.organizationId,
    message_id: entrada.mensagemId,
    campaign_id: entrada.campanhaId,
    channel_session_id: entrada.channelSessionId,
    origem: ESTIMADO,
    billable: true,
    category: entrada.categoria,
    country: linha?.country ?? null,
    unit_price_cents: linha?.unit_price_cents ?? null,
    cost_cents: linha?.unit_price_cents ?? null,
    currency: linha?.currency ?? "BRL",
  });
  // 23505: o webhook chegou primeiro e a linha já é real — a estimativa sobra.
  if (error && !ehDuplicada(error)) {
    logger.warn("[custo] estimativa do envio não gravada", { mensagem: entrada.mensagemId, motivo: error.message });
  }
}

export type DesfechoDoCusto = "sem_pricing" | "mensagem_desconhecida" | "registrado" | "ja_registrado" | "erro";

interface MensagemDoCusto {
  id: string;
  channel_session_id: string | null;
  metadata: Record<string, unknown> | null;
  contacts?: { phone_number?: string | null } | Array<{ phone_number?: string | null }> | null;
}

function telefoneDoEmbed(c: MensagemDoCusto["contacts"]): string | null {
  const um = Array.isArray(c) ? c[0] : c;
  return um?.phone_number ?? null;
}

/**
 * O `pricing` de um status da Meta vira o custo REAL da mensagem. Idempotente:
 * a Meta manda o mesmo `pricing` em `sent`, `delivered` e `read`, e só o
 * primeiro grava.
 */
export async function registrarCustoDoWebhook(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    externalId: string;
    /** `recipient_id` do status — só dígitos. */
    destinatario: string | null;
    pricing: unknown;
    agora: Date;
  },
): Promise<DesfechoDoCusto> {
  if (!entrada.pricing) return "sem_pricing";
  const org = entrada.organizationId;
  const { data: msg } = await admin
    .from("messages")
    .select("id, channel_session_id, metadata, contacts:contact_id(phone_number)")
    .eq("organization_id", org)
    .eq("external_id", entrada.externalId)
    .maybeSingle();
  const mensagem = msg as MensagemDoCusto | null;
  if (!mensagem) return "mensagem_desconhecida";

  const telefone = entrada.destinatario ?? telefoneDoEmbed(mensagem.contacts) ?? "";
  const custo = custoDaMensagem(entrada.pricing, telefone, await carregarTabela(admin));
  if (!custo) return "sem_pricing";

  const { data: existente } = await admin
    .from("meta_message_costs")
    .select("id, origem, category")
    .eq("organization_id", org)
    .eq("message_id", mensagem.id)
    .maybeSingle();
  const atual = existente as { id: string; origem: string; category: string } | null;
  if (atual?.origem === WEBHOOK) return "ja_registrado";

  const campanha = mensagem.metadata?.campaign_id;
  const valores = {
    origem: WEBHOOK,
    billable: custo.billable,
    category: custo.category,
    pricing_type: custo.pricing_type,
    country: custo.country,
    unit_price_cents: custo.unit_price_cents,
    cost_cents: custo.cost_cents,
    currency: custo.currency,
    janela_gratis_de_anuncio: custo.janela_gratis_de_anuncio,
  };
  if (atual) {
    const { error } = await admin
      .from("meta_message_costs")
      .update(valores)
      .eq("organization_id", org)
      .eq("id", atual.id)
      .eq("origem", ESTIMADO);
    if (error) return "erro";
  } else {
    const { error } = await admin.from("meta_message_costs").insert({
      organization_id: org,
      message_id: mensagem.id,
      channel_session_id: mensagem.channel_session_id,
      campaign_id: uuid.safeParse(campanha).success ? (campanha as string) : null,
      ...valores,
    });
    if (ehDuplicada(error)) return "ja_registrado";
    if (error) return "erro";
  }

  // Esta escrita fez a mensagem contar como atendimento: talvez cruze um limiar.
  if (custo.category === "service" && atual?.category !== "service" && mensagem.channel_session_id) {
    await avisarSeCruzouLimiar(admin, org, mensagem.channel_session_id, entrada.agora);
  }
  return "registrado";
}

/**
 * Falhou: a Meta não cobra mensagem que não saiu. O custo da mensagem — a
 * estimativa da rodada ou um `pricing` que veio num status anterior — vira
 * zero; senão o teto contaria para sempre um gasto que não houve.
 */
export async function zerarCustoDaFalha(admin: SupabaseClient, organizationId: string, externalId: string): Promise<void> {
  const { data: msg } = await admin
    .from("messages")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("external_id", externalId)
    .maybeSingle();
  const id = (msg as { id: string } | null)?.id;
  if (!id) return;
  await admin
    .from("meta_message_costs")
    .update({ billable: false, cost_cents: 0 })
    .eq("organization_id", organizationId)
    .eq("message_id", id);
}

/** O fuso da conta de um número: o do número, senão o da organização. */
async function fusoDoNumero(admin: SupabaseClient, organizationId: string, channelSessionId: string): Promise<string> {
  const [{ data: knobs }, { data: org }] = await Promise.all([
    admin
      .from("channel_knobs")
      .select("timezone")
      .eq("organization_id", organizationId)
      .eq("channel_session_id", channelSessionId)
      .maybeSingle(),
    admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle(),
  ]);
  return fusoDaJanela(
    (knobs as { timezone?: string | null } | null)?.timezone ?? null,
    (org as { timezone?: string | null } | null)?.timezone ?? null,
  );
}

export interface ContadorDoAtendimentoGratis {
  channel_session_id: string;
  usadas: number;
  gratis: number;
  /** O instante em que o contador zerou pela última vez (início do mês no fuso). */
  desde: string;
  fuso: string;
}

/** Quantas mensagens de atendimento o número já teve neste mês, no fuso da conta. */
export async function contadorDoAtendimentoGratis(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  agora: Date,
): Promise<ContadorDoAtendimentoGratis> {
  const fuso = await fusoDoNumero(admin, organizationId, channelSessionId);
  const desde = inicioDoMesNoFuso(agora, fuso);
  const { count } = await admin
    .from("meta_message_costs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", channelSessionId)
    .eq("category", "service")
    .gte("created_at", desde.toISOString());
  return { channel_session_id: channelSessionId, usadas: count ?? 0, gratis: GRATIS_POR_MES, desde: desde.toISOString(), fuso };
}

async function avisarSeCruzouLimiar(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  agora: Date,
): Promise<void> {
  const c = await contadorDoAtendimentoGratis(admin, organizationId, channelSessionId, agora);
  const limiar = limiarAtingido(c.usadas);
  if (!limiar) return;
  const mes = c.desde.slice(0, 7);
  // O título leva o mês e o limiar, e é a chave do índice único
  // `agent_inbox_atendimento_gratis_unico` (migration 0540): dois webhooks
  // simultâneos que alcançam o limiar juntos abrem um aviso só — o segundo
  // recebe 23505. A consulta abaixo só poupa a tentativa de cada mensagem.
  // O aviso sai no idioma da organização (issue #12); a consulta abaixo procura
  // o título em TODO idioma, para uma troca de idioma no meio do mês não abrir
  // um segundo aviso do mesmo limiar.
  const idioma = await idiomaPeloCliente(admin, organizationId);
  const tituloEm = (i: Idioma) =>
    preencher(
      limiar === 100
        ? traduzir("As 1.000 mensagens de atendimento grátis de {mes} deste número acabaram", i)
        : traduzir("Este número já usou 80% das 1.000 mensagens de atendimento grátis de {mes}", i),
      { mes },
    );
  const title = tituloEm(idioma);
  const { data: jaAberto } = await admin
    .from("agent_inbox_items")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("kind", "atendimento_gratis_do_numero")
    .eq("ref_id", channelSessionId)
    .in("title", IDIOMAS.map(tituloEm))
    .limit(1);
  if ((jaAberto ?? []).length > 0) return;
  const { error } = await admin.from("agent_inbox_items").insert({
    organization_id: organizationId,
    kind: "atendimento_gratis_do_numero",
    severity: limiar === 100 ? "warn" : "info",
    title,
    body: preencher(
      limiar === 100
        ? traduzir(
            "A partir de agora, cada mensagem de atendimento deste número é cobrada pela Meta até o dia 1 do mês que vem (fuso {fuso}).",
            idioma,
          )
        : traduzir(
            "{usadas} de {gratis} usadas. Ao passar de {gratis}, a Meta passa a cobrar cada mensagem de atendimento deste número até o fim do mês (fuso {fuso}).",
            idioma,
          ),
      { fuso: c.fuso, usadas: c.usadas, gratis: c.gratis },
    ),
    ref_kind: "channel_session",
    ref_id: channelSessionId,
  });
  if (error && !ehDuplicada(error)) {
    logger.warn("[custo] aviso das grátis não aberto", { numero: channelSessionId, motivo: error.message });
  }
}
