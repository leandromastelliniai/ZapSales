/**
 * A rodada da campanha OFICIAL (issue #8): modelo aprovado pela API Oficial da
 * Meta, em LOTES PARALELOS, sem o ritmo anti-ban do modo de texto livre.
 *
 * ═══ Por que outra rodada, e não um ramo dentro de `./rodada.ts` ═══
 *
 * O modo de texto livre manda UM por número por rodada porque o ritmo é o que protege o
 * número de banimento — e pergunta ao motor de pacing do agente antes de cada
 * envio. Na API Oficial esse risco não existe da mesma forma: o que governa o
 * volume é o limite do portfólio e a qualidade do número, que a própria Meta
 * mede (issue #9). Um ramo `if (oficial)` no meio da rodada de texto livre misturaria as
 * duas cadências na mesma função, e a primeira mudança numa delas quebraria a
 * outra em silêncio. O que as duas COMPARTILHAM é chamado daqui, não copiado:
 * a promoção das agendadas, o pool de números, os vetos por pessoa, a janela e
 * os tetos da campanha, e a mesma cadeia de envio (`sendMessageHandler`).
 *
 * ═══ Quem chama ═══
 *
 * O laço contínuo do worker (`workers/agent-worker/main.ts`), a cada poucos
 * segundos, e o cron de campanha de cada minuto, como rede de segurança. Os dois
 * podem rodar juntos: a reserva é `FOR UPDATE SKIP LOCKED`
 * (`fn_campanha_reservar_lote`, migration 0538), e o segundo pula o que o
 * primeiro pegou.
 *
 * ═══ Relógio ═══
 *
 * `agora` é injetado: agendamento, janela e a regra das 24 h do 131049 são
 * testados com relógio controlado.
 *
 * Nunca lança para quem chama: uma campanha quebrada não derruba a rodada.
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { fusoDaJanela } from "@/lib/agent-engine/pacing/store";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { isStatusSendable } from "@/lib/channels/meta/template-binding";
import { logger } from "@/lib/logger";
import { OrgNaoOperanteError, STATUS_OPERANTE, ehOperante, statusDaOrgEmbutida } from "@/lib/organizacao/operante";

import { aplicarDesfecho } from "./desfecho-oficial";
import { motivoParaExcluir, recusouMarketing } from "./elegibilidade";
import { hashDoEndereco } from "./exclusoes";
import { desfechoDaFalhaOficial } from "./falha-oficial";
import { carregarModelo, type ModeloDaCampanha } from "./modelo-da-campanha";
import { podeMandarAgora } from "./ritmo";
import {
  estadoDeEnvio,
  numeroDoHistorico,
  numerosDaCampanha,
  promoverAgendadas,
  registrarExcecaoDoEnvio,
} from "./rodada";

export interface ResultadoDaRodadaOficial {
  enviadas: number;
  pulados: number;
  /** Destinatários que voltaram à fila por erro temporário ou pela regra das 24 h. */
  reenfileirados: number;
  falharam: number;
  concluidas: number;
  promovidas: number;
  detalhe: string;
}

/** Quantos destinatários uma campanha reserva por rodada. */
const LOTE_POR_CAMPANHA = 50;
/** Quantos envios à Meta correm ao mesmo tempo dentro do lote. */
const ENVIOS_EM_PARALELO = 10;
/** Campanhas oficiais atendidas por rodada. */
const CAMPANHAS_POR_RODADA = 20;
/**
 * Destinatário em `sending` há mais que isto, sem mensagem ligada, é de um lote
 * que o worker não terminou (queda, redeploy). Bem acima do tempo de um lote.
 */
const TRAVADO_APOS_MS = 10 * 60_000;
/** A regra das 24 h do limite de marketing por usuário (131049). */
const UM_DIA_MS = 24 * 60 * 60 * 1000;
const CODIGO_LIMITE_DE_MARKETING = "131049";

interface CampanhaOficialRow {
  id: string;
  organization_id: string;
  channel_session_id: string;
  name: string;
  meta_template_id: string;
  content_version: number;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
  teto_diario: number | null;
  teto_horario: number | null;
}

const COLUNAS =
  "id, organization_id, channel_session_id, name, meta_template_id, content_version, " +
  "janela_inicio_hora, janela_fim_hora, teto_diario, teto_horario, organizations:organization_id!inner(status)";

interface Reservado {
  id: string;
  contact_id: string;
  recipient_address: string | null;
  attempt_count: number;
  variables: Record<string, unknown> | null;
  rendered_body: string | null;
}

interface ContatoRow {
  id: string;
  name: string | null;
  display_name: string | null;
  phone_number: string | null;
  is_blocked: boolean;
  is_anonymized: boolean;
  consent: unknown;
}

type Placar = Omit<ResultadoDaRodadaOficial, "concluidas" | "promovidas" | "detalhe">;

/**
 * A rodada mexeu em alguma campanha? É a pergunta que decide auditar — o cron e
 * o laço do worker fazem a MESMA (rodada vazia não audita; a que fez, audita).
 */
export function rodadaOficialMexeu(r: ResultadoDaRodadaOficial): boolean {
  return r.enviadas + r.pulados + r.reenfileirados + r.falharam + r.concluidas + r.promovidas > 0;
}

/** O que a auditoria da rodada guarda: contagens, nunca telefone nem texto. */
export function resumoDaRodadaOficial(r: ResultadoDaRodadaOficial): Record<string, number | string> {
  return {
    enviadas: r.enviadas,
    pulados: r.pulados,
    reenfileirados: r.reenfileirados,
    falharam: r.falharam,
    concluidas: r.concluidas,
    promovidas: r.promovidas,
    detalhe: r.detalhe,
  };
}

/**
 * O id da mensagem de UMA tentativa de UM destinatário — determinístico.
 *
 * É ele que deixa o worker se recuperar de uma queda sem mandar em dobro: o
 * destinatário só aponta para a mensagem DEPOIS do envio (a FK de `message_id`
 * exige a linha), então, se o worker cai no meio, a única ponte entre os dois é
 * poder recalcular este id. Ver `recuperarTravados`.
 */
export function idDaMensagemDoEnvio(destinatarioId: string, tentativa: number): string {
  const h = createHash("sha256").update(`campanha-oficial:${destinatarioId}:${tentativa}`).digest("hex");
  const variante = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function rodarUmaRodadaOficial(
  admin: SupabaseClient,
  agora: Date = new Date(),
): Promise<ResultadoDaRodadaOficial> {
  const total: ResultadoDaRodadaOficial = {
    enviadas: 0,
    pulados: 0,
    reenfileirados: 0,
    falharam: 0,
    concluidas: 0,
    promovidas: await promoverAgendadas(admin, agora),
    detalhe: "",
  };

  const { data, error } = await admin
    .from("campaigns")
    .select(COLUNAS)
    .eq("status", "running")
    .not("meta_template_id", "is", null)
    .eq("organizations.status", STATUS_OPERANTE)
    .order("started_at", { ascending: true })
    .limit(CAMPANHAS_POR_RODADA);
  if (error) {
    logger.warn("[campanha oficial] busca das campanhas em andamento falhou", { motivo: error.message });
    return { ...total, detalhe: "busca_falhou" };
  }
  const campanhas = ((data ?? []) as unknown as Array<
    CampanhaOficialRow & { organizations?: { status?: string | null } | Array<{ status?: string | null }> | null }
  >).filter((c) => ehOperante(statusDaOrgEmbutida(c.organizations)));

  const detalhes: string[] = [];
  for (const campanha of campanhas) {
    try {
      const r = await rodarUmaCampanhaOficial(admin, campanha, agora);
      total.enviadas += r.placar.enviadas;
      total.pulados += r.placar.pulados;
      total.reenfileirados += r.placar.reenfileirados;
      total.falharam += r.placar.falharam;
      total.concluidas += r.concluida ? 1 : 0;
      detalhes.push(`${campanha.id.slice(0, 8)}:${r.detalhe}`);
    } catch (err) {
      logger.warn("[campanha oficial] rodada falhou", {
        campanha: campanha.id,
        motivo: err instanceof Error ? err.message : String(err),
      });
      detalhes.push(`${campanha.id.slice(0, 8)}:erro`);
    }
  }
  total.detalhe =
    detalhes.join(" ") || (total.promovidas > 0 ? "promovidas" : "nada_a_fazer");
  return total;
}

async function rodarUmaCampanhaOficial(
  admin: SupabaseClient,
  campanha: CampanhaOficialRow,
  agora: Date,
): Promise<{ placar: Placar; concluida: boolean; detalhe: string }> {
  const placar: Placar = { enviadas: 0, pulados: 0, reenfileirados: 0, falharam: 0 };

  await recuperarTravados(admin, campanha, agora, placar);

  // ─── O modelo tem de estar aprovado AGORA ───
  // Modelo pausado ou rejeitado depois do início faria cada envio voltar com
  // 132xxx. A pausa da campanha por isso é da issue #9; aqui só não se gasta
  // o lote com algo que a Meta vai recusar.
  const modelo = await carregarModelo(admin, campanha.organization_id, campanha.meta_template_id);
  if (!modelo || !isStatusSendable(modelo.status)) {
    return { placar, concluida: false, detalhe: "modelo_indisponivel" };
  }

  // ─── A janela e os tetos DA CAMPANHA ───
  // Sem intervalo: o anti-ban é do modo de texto livre. A janela em branco herda
  // a do número principal (7h–22h por padrão), como no modo de texto livre — ali
  // ela chega pelo motor de ritmo do número; aqui, lida direto. O fuso também é
  // o do número principal: a campanha tem um relógio só.
  const doNumero = await janelaDoNumero(admin, campanha.organization_id, campanha.channel_session_id);
  const fuso = doNumero.fuso;
  const campanhaTemJanela = campanha.janela_inicio_hora !== null && campanha.janela_fim_hora !== null;
  const estado = await estadoDeEnvio(admin, campanha.id, agora, fuso);
  const ritmo = podeMandarAgora(
    {
      intervaloSegundos: null,
      janelaInicioHora: campanhaTemJanela ? campanha.janela_inicio_hora : doNumero.inicio,
      janelaFimHora: campanhaTemJanela ? campanha.janela_fim_hora : doNumero.fim,
      tetoDiario: campanha.teto_diario,
      tetoHorario: campanha.teto_horario,
    },
    estado,
    agora,
    fuso,
  );
  if (!ritmo.pode) return { placar, concluida: false, detalhe: `ritmo:${ritmo.motivo}` };
  const folga = Math.min(
    LOTE_POR_CAMPANHA,
    campanha.teto_diario === null ? Infinity : campanha.teto_diario - estado.enviadasHoje,
    campanha.teto_horario === null ? Infinity : campanha.teto_horario - estado.enviadasNaUltimaHora,
  );

  // ─── Os números: do pool, oficiais, no ar e da conta do modelo ───
  const numeros = await numerosOficiais(admin, campanha, modelo);
  if (numeros.length === 0) return { placar, concluida: false, detalhe: "canal:sem_numero_oficial" };

  // ─── A reserva ───
  const { data: reservados, error } = await admin.rpc("fn_campanha_reservar_lote", {
    p_campaign_id: campanha.id,
    p_limite: folga,
    p_agora: agora.toISOString(),
  });
  if (error) {
    logger.warn("[campanha oficial] reserva do lote falhou", { campanha: campanha.id, motivo: error.message });
    return { placar, concluida: false, detalhe: `erro_na_reserva:${error.message.slice(0, 40)}` };
  }
  const lote = (reservados ?? []) as Reservado[];
  if (lote.length === 0) {
    return await talvezConcluir(admin, campanha, agora, placar);
  }

  for (let i = 0; i < lote.length; i += ENVIOS_EM_PARALELO) {
    const fatia = lote.slice(i, i + ENVIOS_EM_PARALELO);
    const desfechos = await Promise.all(
      fatia.map((alvo, j) => enviarUm(admin, campanha, modelo, numeros, i + j, alvo, agora)),
    );
    for (const d of desfechos) if (d) placar[d] += 1;
  }

  return {
    placar,
    concluida: false,
    detalhe: `lote:${lote.length}:enviadas:${placar.enviadas}`,
  };
}

/** Nada pendente AGORA não é nada pendente: só conclui quem não tem ninguém em voo. */
async function talvezConcluir(
  admin: SupabaseClient,
  campanha: CampanhaOficialRow,
  agora: Date,
  placar: Placar,
): Promise<{ placar: Placar; concluida: boolean; detalhe: string }> {
  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", campanha.organization_id)
    .eq("campaign_id", campanha.id)
    .in("status", ["pending", "queued", "sending"]);
  if ((count ?? 0) > 0) return { placar, concluida: false, detalhe: "aguardando" };

  const { data } = await admin
    .from("campaigns")
    .update({ status: "completed", completed_at: agora.toISOString() })
    .eq("organization_id", campanha.organization_id)
    .eq("id", campanha.id)
    .eq("status", "running")
    .select("id");
  const concluida = (data ?? []).length > 0;
  return { placar, concluida, detalhe: concluida ? "concluida" : "ja_concluida" };
}

/**
 * Envia a UM destinatário já reservado (`sending`) e grava o desfecho. Devolve a
 * casa do placar. Nunca lança: uma falha vira falha DESTE destinatário.
 */
async function enviarUm(
  admin: SupabaseClient,
  campanha: CampanhaOficialRow,
  modelo: ModeloDaCampanha,
  numeros: string[],
  ordem: number,
  alvo: Reservado,
  agora: Date,
): Promise<keyof Placar | null> {
  const org = campanha.organization_id;
  try {
    // ─── Os vetos por pessoa, revalidados na hora do envio ───
    const { data: contatoRaw } = await admin
      .from("contacts")
      .select("id, name, display_name, phone_number, is_blocked, is_anonymized, consent")
      .eq("organization_id", org)
      .eq("id", alvo.contact_id)
      .maybeSingle();
    const contato = contatoRaw as ContatoRow | null;
    const motivo = motivoParaExcluir({
      contactId: alvo.contact_id,
      telefone: contato?.phone_number ?? alvo.recipient_address,
      bloqueado: !!contato?.is_blocked,
      anonimizado: !!contato?.is_anonymized,
      recusouMarketing: recusouMarketing(contato?.consent),
    });
    const endereco = (contato?.phone_number ?? alvo.recipient_address ?? "").trim();
    const suprimido = !motivo && endereco !== "" && (await estaSuprimido(admin, org, endereco));
    if (motivo || suprimido) {
      const razao = motivo ?? "suprimido";
      await admin
        .from("campaign_recipients")
        .update({
          status: razao === "opt_out" ? "opted_out" : "skipped",
          eligibility_status: "excluded",
          exclusion_reason: razao,
          opted_out_at: razao === "opt_out" ? agora.toISOString() : null,
        })
        .eq("organization_id", org)
        .eq("id", alvo.id)
        .eq("status", "sending");
      return "pulados";
    }

    // ─── A regra das 24 h do 131049, entre campanhas ───
    // A espera do próprio destinatário já está no `next_attempt_at`; esta é a
    // do CONTATO: se outra campanha levou 131049 para ele há menos de um dia,
    // esta também espera.
    const liberadoEm = await bloqueioDeMarketingAte(admin, org, alvo, agora);
    if (liberadoEm) {
      await admin
        .from("campaign_recipients")
        .update({
          status: "pending",
          sending_at: null,
          next_attempt_at: liberadoEm.toISOString(),
          attempt_count: Math.max(0, alvo.attempt_count - 1),
        })
        .eq("organization_id", org)
        .eq("id", alvo.id)
        .eq("status", "sending");
      return "reenfileirados";
    }

    // ─── O número ───
    const doHistorico = await numeroDoHistorico(admin, campanha, alvo.contact_id);
    const numero = doHistorico && numeros.includes(doHistorico) ? doHistorico : numeros[ordem % numeros.length]!;

    const boundary = await beginServiceAtOrigin(admin, org, alvo.contact_id, numero);
    await admin
      .from("campaign_recipients")
      .update({ conversation_id: boundary.conversation_id, channel_session_id: numero })
      .eq("organization_id", org)
      .eq("id", alvo.id);

    const valores = Object.fromEntries(
      Object.entries(alvo.variables ?? {}).filter((par): par is [string, string] => typeof par[1] === "string"),
    );
    const mensagem = (await sendMessageHandler(
      admin,
      {
        organization_id: org,
        serviceBoundary: boundary,
        proactiveContext: { organizationId: org, contactId: alvo.contact_id },
        actor: { type: "webhook_source", id: `campaign:${campanha.id}` },
        requestId: `campaign:${campanha.id}:${alvo.id}:${alvo.attempt_count}`,
        internalMessageId: idDaMensagemDoEnvio(alvo.id, alvo.attempt_count),
      } as Parameters<typeof sendMessageHandler>[1],
      {
        conversation_id: boundary.conversation_id,
        type: "template",
        body: alvo.rendered_body || modelo.name,
        template_name: modelo.name,
        template_language: modelo.language,
        template_values: valores,
        metadata: {
          source: "campaign",
          campaign_id: campanha.id,
          campaign_recipient_id: alvo.id,
          campaign_content_version: campanha.content_version,
          idempotency_key: `campaign:${alvo.id}:${alvo.attempt_count}`,
        },
      } as Parameters<typeof sendMessageHandler>[2],
    )) as {
      id?: string;
      status?: string;
      error_code?: string | null;
      error_message?: string | null;
      metadata?: Record<string, unknown> | null;
    };

    if (mensagem.status === "sent") {
      // `.eq("status","sending")`: o ack pode ter chegado antes desta linha, e o
      // trigger já teria avançado o destinatário — escrever por cima o rebaixaria.
      await admin
        .from("campaign_recipients")
        .update({
          status: "sent",
          sent_at: agora.toISOString(),
          message_id: mensagem.id ?? null,
          last_error_code: null,
          last_error_detail: null,
          next_attempt_at: null,
        })
        .eq("organization_id", org)
        .eq("id", alvo.id)
        .eq("status", "sending");
      return "enviadas";
    }

    // A mensagem existe e não saiu. O `message_id` é gravado para o painel
    // apontar a linha com o motivo; a próxima tentativa cria outra mensagem.
    await admin
      .from("campaign_recipients")
      .update({ message_id: mensagem.id ?? null })
      .eq("organization_id", org)
      .eq("id", alvo.id)
      .eq("status", "sending");

    if (mensagem.status !== "failed") {
      // `queued`/`sending`: o canal não mandou AGORA, e a mensagem tem dono —
      // pode sair sozinha depois, ou o `recover-stuck-messages` a falha. O
      // destinatário fica `sending`, já ligado a ela (`message_id` acima), e o
      // trigger de ack o leva junto. Reenfileirar mandaria em dobro; marcar
      // falha mentiria se ela sair.
      return null;
    }

    const classificada = falhaClassificada(mensagem);
    const desfecho = classificada
      ? desfechoDaFalhaOficial(classificada, alvo.attempt_count, agora)
      : ({ acao: "falhar", motivo: mensagem.error_message ?? "O envio falhou no canal." } as const);
    await aplicarDesfecho(
      admin,
      { organizationId: org, destinatarioId: alvo.id, contactId: alvo.contact_id, de: "sending" },
      desfecho,
      mensagem.error_code ?? null,
      agora,
    );
    if (desfecho.acao === "tentar_de_novo") return "reenfileirados";
    if (desfecho.acao === "recusou_marketing") return "pulados";
    return "falharam";
  } catch (err) {
    logger.warn("[campanha oficial] envio falhou", { campanha: campanha.id, destinatario: alvo.id });
    // A mesma decisão da rodada de texto livre: organização que parou no meio do
    // lote (`OrgNaoOperanteError` da porta de saída) devolve o destinatário à
    // fila — ele sai na reativação; qualquer outra exceção é falha DELE.
    await registrarExcecaoDoEnvio(admin, alvo.id, err);
    if (!(err instanceof OrgNaoOperanteError)) return "falharam";
    // A tentativa não foi gasta pela pessoa: devolve, para cinco pausas da
    // organização não esgotarem as tentativas de quem nunca recebeu nada.
    await admin
      .from("campaign_recipients")
      .update({ attempt_count: Math.max(0, alvo.attempt_count - 1) })
      .eq("organization_id", org)
      .eq("id", alvo.id)
      .eq("status", "pending");
    return "reenfileirados";
  }
}

/** A falha que o handler de mensagens classificou (`metadata.falha_do_canal`). */
function falhaClassificada(m: {
  error_code?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const f = m.metadata?.falha_do_canal as { categoria?: unknown; temporario?: unknown } | undefined;
  if (!f || typeof f.categoria !== "string") return null;
  return {
    codigo: m.error_code ?? null,
    categoria: f.categoria,
    temporario: f.temporario === true,
    motivo: m.error_message ?? "",
  };
}

async function estaSuprimido(admin: SupabaseClient, organizationId: string, endereco: string): Promise<boolean> {
  const { data } = await admin
    .from("campaign_suppressions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("recipient_address_hash", hashDoEndereco(endereco))
    .maybeSingle();
  return !!data;
}

/**
 * Até quando o contato está proibido de receber marketing por causa de um
 * 131049 recente — em QUALQUER campanha. `null` = liberado.
 */
async function bloqueioDeMarketingAte(
  admin: SupabaseClient,
  organizationId: string,
  alvo: Reservado,
  agora: Date,
): Promise<Date | null> {
  const desde = new Date(agora.getTime() - UM_DIA_MS).toISOString();
  const { data } = await admin
    .from("campaign_recipients")
    .select("last_attempt_at")
    .eq("organization_id", organizationId)
    .eq("contact_id", alvo.contact_id)
    .eq("last_error_code", CODIGO_LIMITE_DE_MARKETING)
    .neq("id", alvo.id)
    .gt("last_attempt_at", desde)
    .order("last_attempt_at", { ascending: false })
    .limit(1);
  const ultimo = ((data ?? []) as Array<{ last_attempt_at: string }>)[0];
  return ultimo ? new Date(new Date(ultimo.last_attempt_at).getTime() + UM_DIA_MS) : null;
}

/** Os números do pool que podem mandar ESTE modelo agora. */
async function numerosOficiais(
  admin: SupabaseClient,
  campanha: CampanhaOficialRow,
  modelo: ModeloDaCampanha,
): Promise<string[]> {
  const pool = await numerosDaCampanha(admin, campanha);
  const { data } = await admin
    .from("channel_sessions")
    .select("id, provider, status, meta_waba_id")
    .eq("organization_id", campanha.organization_id)
    .in("id", pool);
  const linhas = (data ?? []) as Array<{ id: string; provider: string; status: string; meta_waba_id: string | null }>;
  // Na ordem do pool (principal primeiro), para o rodízio ser estável.
  return pool.filter((id) => {
    const l = linhas.find((x) => x.id === id);
    return (
      !!l && l.provider === CHANNEL_PROVIDER_META && l.status === "WORKING" && l.meta_waba_id === modelo.waba_id
    );
  });
}

/**
 * A janela e o fuso do NÚMERO — a mesma régua do motor de ritmo
 * (`lib/agent-engine/pacing/store.ts`): `channel_knobs` do número, senão o
 * padrão do produto; o fuso do número, senão o da organização.
 */
async function janelaDoNumero(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<{ fuso: string; inicio: number; fim: number }> {
  const [{ data: knobs }, { data: org }] = await Promise.all([
    admin
      .from("channel_knobs")
      .select("timezone, window_start_hour, window_end_hour")
      .eq("organization_id", organizationId)
      .eq("channel_session_id", channelSessionId)
      .maybeSingle(),
    admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle(),
  ]);
  const k = knobs as { timezone?: string | null; window_start_hour?: number | null; window_end_hour?: number | null } | null;
  return {
    fuso: fusoDaJanela(k?.timezone ?? null, (org as { timezone?: string | null } | null)?.timezone ?? null),
    inicio: k?.window_start_hour ?? PACING_DEFAULTS.windowStartHour,
    fim: k?.window_end_hour ?? PACING_DEFAULTS.windowEndHour,
  };
}

/**
 * Os destinatários de um lote que o worker não terminou (queda, redeploy no
 * meio): `sending` há mais de 10 minutos, sem mensagem ligada.
 *
 * O id determinístico (`idDaMensagemDoEnvio`) diz se a mensagem chegou a
 * existir:
 * - **não existe**: nada saiu — a mensagem nasce antes de qualquer chamada à
 *   Meta. O destinatário volta à fila e a tentativa é devolvida;
 * - **existe**: o destinatário passa a segui-la — enviada, falhou (a política
 *   de falha decide) ou ainda em voo (fica ligado, e o trigger de ack o leva).
 *   Nunca se reenvia o que pode ter saído.
 */
async function recuperarTravados(
  admin: SupabaseClient,
  campanha: CampanhaOficialRow,
  agora: Date,
  placar: Placar,
): Promise<void> {
  const org = campanha.organization_id;
  const { data } = await admin
    .from("campaign_recipients")
    .select("id, contact_id, attempt_count")
    .eq("organization_id", org)
    .eq("campaign_id", campanha.id)
    .eq("status", "sending")
    .is("message_id", null)
    .lt("sending_at", new Date(agora.getTime() - TRAVADO_APOS_MS).toISOString())
    .limit(LOTE_POR_CAMPANHA);
  for (const r of (data ?? []) as Array<{ id: string; contact_id: string; attempt_count: number }>) {
    const { data: msg } = await admin
      .from("messages")
      .select("id, status, error_code, error_message, metadata")
      .eq("organization_id", org)
      .eq("id", idDaMensagemDoEnvio(r.id, r.attempt_count))
      .maybeSingle();
    const mensagem = msg as {
      id: string;
      status: string;
      error_code: string | null;
      error_message: string | null;
      metadata: Record<string, unknown> | null;
    } | null;
    await admin
      .from("campaign_recipients")
      .update(
        !mensagem
          ? { status: "pending", sending_at: null, attempt_count: Math.max(0, r.attempt_count - 1) }
          : ["sent", "delivered", "read"].includes(mensagem.status)
            ? { status: "sent", sent_at: agora.toISOString(), message_id: mensagem.id }
            : { message_id: mensagem.id },
      )
      .eq("organization_id", org)
      .eq("id", r.id)
      .eq("status", "sending");
    if (!mensagem) {
      placar.reenfileirados += 1;
    } else if (["sent", "delivered", "read"].includes(mensagem.status)) {
      placar.enviadas += 1;
    } else if (mensagem.status === "failed") {
      const classificada = falhaClassificada(mensagem);
      const desfecho = classificada
        ? desfechoDaFalhaOficial(classificada, r.attempt_count, agora)
        : ({ acao: "falhar", motivo: mensagem.error_message ?? "O envio falhou no canal." } as const);
      await aplicarDesfecho(
        admin,
        { organizationId: org, destinatarioId: r.id, contactId: r.contact_id, de: "sending" },
        desfecho,
        mensagem.error_code,
        agora,
      );
      placar[desfecho.acao === "tentar_de_novo" ? "reenfileirados" : desfecho.acao === "falhar" ? "falharam" : "pulados"] += 1;
    }
  }
}
