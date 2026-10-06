/**
 * As AÇÕES da campanha — preparar, iniciar, agendar, pausar, retomar, cancelar,
 * duplicar e testar.
 *
 * Moram aqui, e não em oito rotas, porque as oito fazem a mesma coisa em volta:
 * carregar a campanha da organização certa, perguntar à máquina de estados se a
 * transição vale, escrever, auditar. Espalhado, esse "em volta" diverge — e o
 * dia em que uma rota esquecer de conferir o estado é o dia em que uma campanha
 * cancelada volta a enviar.
 *
 * Cada função devolve `{ ok: false, codigo, mensagem, status }` em vez de lançar:
 * a rota traduz para `fail()` sem interpretar exceção, e o motivo chega ao
 * operador com o texto real (Regra nº 1).
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiErrorCode } from "@/lib/api/errors";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";

import { baseLegalValida, motivoParaExcluir, recusouMarketing } from "./elegibilidade";
import { ehStatusDaCampanha, podeTransitar } from "./maquina-de-estados";
import { prepararCampanha } from "./preparacao";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import {
  carregarModelo,
  contratoDoModelo,
  ehOficial,
  numeroDeAtendimento,
  recusaDoModelo,
  textoDoModelo,
} from "./modelo-da-campanha";
import { mapaComNumeroDeAtendimento, recusaDoBotaoWaMe } from "./dois-numeros";
import { ehQualidadeVermelha } from "@/lib/channels/meta/saude";
import { numerosDaCampanha } from "./rodada";
import type { ConteudoOficial } from "./preparacao";
import { renderizar } from "./renderizador";
import type { StatusDaCampanha } from "./tipos";
import { mapaDeVariaveisSchema, valoresDoDestinatario, type MapaDeVariaveis } from "./variaveis-do-modelo";

export interface CampanhaCarregada {
  id: string;
  organization_id: string;
  name: string;
  status: StatusDaCampanha;
  channel_session_id: string;
  message_body: string | null;
  base_legal: string;
  lia_ref: string | null;
  audience_filter: unknown;
  audience_version: number;
  content_version: number;
  scheduled_at: string | null;
  intervalo_segundos: number | null;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
  teto_diario: number | null;
  teto_horario: number | null;
  description: string | null;
  /** Com modelo, a campanha é OFICIAL (migration 0538). */
  meta_template_id: string | null;
  template_variables: unknown;
  /** Por que o sistema pausou sozinho (migration 0539); nulo = pausa manual ou nenhuma. */
  pausa_motivo: string | null;
  pausa_detalhe: string | null;
  /** Aceite do aviso de risco de banimento do modo de texto livre (0539). */
  risco_de_banimento_aceito_em: string | null;
  /** Modo "dois números": o número de QR code que o botão wa.me abre (0539). */
  numero_de_atendimento_id: string | null;
}

export type Recusa = { ok: false; codigo: ApiErrorCode; mensagem: string; status: number };
export type Desfecho<T = unknown> = ({ ok: true } & T) | Recusa;

const COLUNAS =
  "id, organization_id, name, status, channel_session_id, message_body, base_legal, lia_ref, " +
  "audience_filter, audience_version, content_version, scheduled_at, description, " +
  "intervalo_segundos, janela_inicio_hora, janela_fim_hora, teto_diario, teto_horario, " +
  "meta_template_id, template_variables, pausa_motivo, pausa_detalhe, risco_de_banimento_aceito_em, " +
  "numero_de_atendimento_id";

export async function carregarCampanha(
  admin: SupabaseClient,
  organizationId: string,
  campanhaId: string,
): Promise<Desfecho<{ campanha: CampanhaCarregada }>> {
  const { data } = await admin
    .from("campaigns")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("id", campanhaId)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      codigo: "campanha_nao_encontrada",
      mensagem: "Campanha não encontrada.",
      status: 404,
    };
  }
  const campanha = data as unknown as CampanhaCarregada;
  if (!ehStatusDaCampanha(campanha.status)) {
    return {
      ok: false,
      codigo: "campanha_estado_invalido",
      mensagem: `A campanha está num estado que este sistema não conhece ("${campanha.status}").`,
      status: 409,
    };
  }
  return { ok: true, campanha };
}

function recusaDeTransicao(de: StatusDaCampanha, para: StatusDaCampanha): Recusa | null {
  const r = podeTransitar(de, para);
  return r.pode ? null : { ok: false, codigo: "campanha_estado_invalido", mensagem: r.motivo, status: 409 };
}

/** O mapa de variáveis guardado, ou vazio quando o jsonb não tem a forma esperada. */
function mapaGuardado(valor: unknown): MapaDeVariaveis {
  const r = mapaDeVariaveisSchema.safeParse(valor ?? {});
  return r.success ? r.data : {};
}

/**
 * O conteúdo oficial da campanha (modelo + mapa), conferido. `null` = campanha
 * do modo de texto livre. Modelo inexistente, não aprovado ou com variável sem fonte vira
 * recusa com o motivo — é o mesmo portão para preparar, iniciar e testar.
 */
async function conteudoOficial(
  admin: SupabaseClient,
  c: CampanhaCarregada,
): Promise<{ ok: true; oficial: ConteudoOficial | null } | Recusa> {
  if (!ehOficial(c)) return { ok: true, oficial: null };
  const modelo = await carregarModelo(admin, c.organization_id, c.meta_template_id!);
  let mapa = mapaGuardado(c.template_variables);
  // Modo "dois números": o botão wa.me do modelo tem de abrir o número de
  // atendimento — e, quando a URL é dinâmica, a variável dele SAI desse número.
  if (modelo && c.numero_de_atendimento_id) {
    const doAtendimento = await numeroDeAtendimento(admin, c.organization_id, c.numero_de_atendimento_id);
    const recusa = doAtendimento.ok
      ? recusaDoBotaoWaMe(modelo.components, doAtendimento.telefone)
      : doAtendimento.motivo;
    if (recusa) return { ok: false, codigo: "campanha_conteudo_invalido", mensagem: recusa, status: 422 };
    mapa = mapaComNumeroDeAtendimento(modelo.components, mapa, doAtendimento.ok ? doAtendimento.telefone! : "");
  }
  const motivo = recusaDoModelo(modelo, mapa);
  if (motivo || !modelo) {
    return { ok: false, codigo: "campanha_conteudo_invalido", mensagem: motivo ?? "Modelo indisponível.", status: 422 };
  }
  return { ok: true, oficial: { modelo, mapa } };
}

/**
 * Campanha do modo de texto livre (número de QR code) só inicia ou agenda depois
 * de alguém aceitar o aviso de risco de banimento (issue #9). O teste não passa
 * por aqui: uma mensagem para um contato escolhido não é disparo em massa.
 */
function riscoNaoAceito(c: CampanhaCarregada): Recusa | null {
  if (ehOficial(c) || c.risco_de_banimento_aceito_em) return null;
  return {
    ok: false,
    codigo: "campanha_risco_nao_aceito",
    mensagem:
      "Disparar em massa por um número conectado por QR code arrisca o banimento do número. " +
      "Leia e aceite o aviso de risco antes de iniciar ou agendar esta campanha.",
    status: 422,
  };
}

/**
 * Campanha oficial não (re)começa com número de qualidade vermelha no pool: a
 * pausa automática voltaria na primeira rodada, e cada envio no meio disso piora
 * a situação do número com a Meta (issue #9).
 */
async function recusaPorQualidade(admin: SupabaseClient, c: CampanhaCarregada): Promise<Recusa | null> {
  if (!ehOficial(c)) return null;
  const pool = await numerosDaCampanha(admin, c);
  const { data } = await admin
    .from("channel_sessions")
    .select("id, meta_qualidade, display_name, phone_number")
    .eq("organization_id", c.organization_id)
    .in("id", pool);
  const vermelho = ((data ?? []) as Array<{
    meta_qualidade: string | null;
    display_name: string | null;
    phone_number: string | null;
  }>).find((n) => ehQualidadeVermelha(n.meta_qualidade));
  if (!vermelho) return null;
  const apelido = [vermelho.display_name, vermelho.phone_number].filter(Boolean).join(" ") || "oficial";
  return {
    ok: false,
    codigo: "campanha_canal_indisponivel",
    mensagem:
      `A qualidade do número ${apelido} está vermelha na Meta. Espere ela voltar a amarelo ou verde ` +
      "antes de retomar — ou tire o número da campanha numa cópia.",
    status: 409,
  };
}

/**
 * O aceite do aviso de risco de banimento (issue #9). Grava quem e quando na
 * campanha; repetir não regrava (vale o primeiro aceite) e devolve
 * `jaAceito: true` para a rota não auditar duas vezes.
 */
export async function aceitarRiscoAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  autorId: string,
  agora: Date,
): Promise<Desfecho<{ jaAceito: boolean }>> {
  if (ehOficial(c)) {
    return {
      ok: false,
      codigo: "campanha_estado_invalido",
      mensagem: "Campanha pela API Oficial não tem risco de banimento a aceitar.",
      status: 409,
    };
  }
  if (c.risco_de_banimento_aceito_em) return { ok: true, jaAceito: true };
  const { data } = await admin
    .from("campaigns")
    .update({ risco_de_banimento_aceito_em: agora.toISOString(), risco_de_banimento_aceito_por: autorId })
    .eq("organization_id", c.organization_id)
    .eq("id", c.id)
    .is("risco_de_banimento_aceito_em", null)
    .select("id");
  return { ok: true, jaAceito: (data ?? []).length === 0 };
}

/** O que toda campanha precisa ter antes de qualquer envio — inclusive o de teste. */
function faltaParaEnviar(c: CampanhaCarregada): Recusa | null {
  if (!ehOficial(c) && (c.message_body ?? "").trim() === "") {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: "Escreva a mensagem antes de preparar a campanha.",
      status: 422,
    };
  }
  if (!baseLegalValida({ baseLegal: c.base_legal, liaRef: c.lia_ref })) {
    return {
      ok: false,
      codigo: "campanha_base_legal_invalida",
      mensagem:
        "Interesse legítimo exige a referência da avaliação (LIA). Sem ela não há como responder " +
        "a quem perguntar com base em quê recebeu a mensagem.",
      status: 422,
    };
  }
  return null;
}

/** Já saiu alguma mensagem desta campanha? Reconstruir snapshot depois disso é proibido. */
async function jaEnviou(admin: SupabaseClient, campanhaId: string): Promise<boolean> {
  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campanhaId)
    .not("sent_at", "is", null);
  return (count ?? 0) > 0;
}

export async function prepararAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ resumo: { total: number; elegiveis: number; excluidos: number } }>> {
  const recusa = recusaDeTransicao(c.status, "preparing") ?? faltaParaEnviar(c);
  if (recusa) return recusa;
  const conteudo = await conteudoOficial(admin, c);
  if (!conteudo.ok) return conteudo;
  if (await jaEnviou(admin, c.id)) {
    return {
      ok: false,
      codigo: "campanha_nao_editavel",
      mensagem: "Esta campanha já enviou mensagens; refazer a lista mudaria o que já foi dito.",
      status: 409,
    };
  }

  // Compare-and-set: dois cliques simultâneos, e só um entra em `preparing`.
  const { data: entrou } = await admin
    .from("campaigns")
    .update({ status: "preparing" })
    .eq("id", c.id)
    .eq("status", "draft")
    .select("id");
  if ((entrou ?? []).length === 0) {
    return {
      ok: false,
      codigo: "campanha_preparando",
      mensagem: "A preparação desta campanha já está em andamento.",
      status: 409,
    };
  }

  try {
    const resumo = await prepararCampanha(admin, {
      campanhaId: c.id,
      organizationId: c.organization_id,
      filtro: c.audience_filter,
      corpo: c.message_body ?? "",
      contentVersion: c.content_version,
      agora,
      ...(conteudo.oficial ? { oficial: conteudo.oficial } : {}),
    });
    if (resumo.total === 0) {
      await voltarAoRascunho(admin, c.id, "audiencia_vazia");
      return {
        ok: false,
        codigo: "campanha_sem_audiencia",
        mensagem: "O recorte não encontrou nenhum contato. Ajuste o filtro.",
        status: 422,
      };
    }
    if (resumo.elegiveis === 0) {
      await voltarAoRascunho(admin, c.id, "sem_elegiveis");
      return {
        ok: false,
        codigo: "campanha_sem_elegiveis",
        mensagem:
          "O recorte encontrou contatos, mas nenhum pode receber — veja os motivos na prévia.",
        status: 422,
      };
    }

    await admin
      .from("campaigns")
      .update({
        status: "ready",
        prepared_at: agora.toISOString(),
        snapshot_total: resumo.total,
        snapshot_eligible: resumo.elegiveis,
        snapshot_excluded: resumo.excluidos,
        audience_version: c.audience_version + 1,
      })
      .eq("id", c.id)
      .eq("status", "preparing");

    return { ok: true, resumo };
  } catch (err) {
    // A campanha não pode ficar presa em `preparing`: quem tentou preparar
    // precisa poder corrigir o filtro e tentar de novo.
    await voltarAoRascunho(admin, c.id, "erro_na_preparacao");
    return {
      ok: false,
      codigo: "campanha_sem_audiencia",
      mensagem: err instanceof Error ? err.message : String(err),
      status: 422,
    };
  }
}

async function voltarAoRascunho(admin: SupabaseClient, id: string, codigo: string): Promise<void> {
  await admin
    .from("campaigns")
    .update({ status: "draft", failure_code: codigo })
    .eq("id", id)
    .eq("status", "preparing");
}

export async function iniciarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ retomada: boolean }>> {
  const recusa = recusaDeTransicao(c.status, "running") ?? faltaParaEnviar(c) ?? riscoNaoAceito(c);
  if (recusa) return recusa;
  // O modelo pode ter sido pausado ou rejeitado na Meta entre preparar e iniciar.
  const conteudo = await conteudoOficial(admin, c);
  if (!conteudo.ok) return conteudo;
  const vermelho = await recusaPorQualidade(admin, c);
  if (vermelho) return vermelho;

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", c.id)
    .eq("eligibility_status", "eligible");
  if ((count ?? 0) === 0) {
    return {
      ok: false,
      codigo: "campanha_sem_elegiveis",
      mensagem: "Nenhum destinatário elegível. Prepare a campanha antes de iniciar.",
      status: 422,
    };
  }

  const retomada = c.status === "paused";
  const { data } = await admin
    .from("campaigns")
    .update({
      status: "running",
      started_at: agora.toISOString(),
      paused_at: null,
      scheduled_at: null,
      pausa_motivo: null,
      pausa_detalhe: null,
    })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  return { ok: true, retomada };
}

export async function agendarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  quando: Date,
  agora: Date,
): Promise<Desfecho> {
  const recusa = recusaDeTransicao(c.status, "scheduled") ?? faltaParaEnviar(c) ?? riscoNaoAceito(c);
  if (recusa) return recusa;
  const conteudo = await conteudoOficial(admin, c);
  if (!conteudo.ok) return conteudo;
  const vermelho = await recusaPorQualidade(admin, c);
  if (vermelho) return vermelho;
  if (quando.getTime() <= agora.getTime()) {
    return {
      ok: false,
      codigo: "campanha_agenda_invalida",
      mensagem: "Escolha uma data no futuro — para enviar agora, use Iniciar.",
      status: 422,
    };
  }
  const { data } = await admin
    .from("campaigns")
    .update({
      status: "scheduled",
      scheduled_at: quando.toISOString(),
      paused_at: null,
      pausa_motivo: null,
      pausa_detalhe: null,
    })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  return { ok: true };
}

export async function pausarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho> {
  const recusa = recusaDeTransicao(c.status, "paused");
  if (recusa) return recusa;
  const { data } = await admin
    .from("campaigns")
    // Pausa do operador: nenhum motivo automático fica pendurado nela.
    .update({ status: "paused", paused_at: agora.toISOString(), pausa_motivo: null, pausa_detalhe: null })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  // Quem já estava `sending` NÃO é desfeito: a mensagem pode estar na borda
  // externa neste instante, e prometer cancelamento do que já saiu é mentir.
  return { ok: true };
}

export async function cancelarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ cancelados: number }>> {
  const recusa = recusaDeTransicao(c.status, "cancelled");
  if (recusa) return recusa;
  const { data } = await admin
    .from("campaigns")
    .update({ status: "cancelled", cancelled_at: agora.toISOString() })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();

  // A campanha já está cancelada quando esta linha roda: a rodada não escolhe
  // mais esta campanha, então não há corrida com o worker por estes pendentes.
  const { data: cancelados } = await admin
    .from("campaign_recipients")
    .update({ status: "cancelled", cancelled_at: agora.toISOString() })
    .eq("campaign_id", c.id)
    .in("status", ["pending", "queued"])
    .select("id");
  return { ok: true, cancelados: (cancelados ?? []).length };
}

export async function duplicarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  autorId: string,
): Promise<Desfecho<{ id: string }>> {
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      organization_id: c.organization_id,
      name: `${c.name} (cópia)`.slice(0, 160),
      description: c.description,
      channel_session_id: c.channel_session_id,
      message_body: c.message_body,
      base_legal: c.base_legal,
      lia_ref: c.lia_ref,
      audience_filter: c.audience_filter,
      intervalo_segundos: c.intervalo_segundos,
      janela_inicio_hora: c.janela_inicio_hora,
      janela_fim_hora: c.janela_fim_hora,
      teto_diario: c.teto_diario,
      teto_horario: c.teto_horario,
      // O modelo e o mapa vão junto: a cópia de uma campanha oficial é oficial.
      meta_template_id: c.meta_template_id,
      template_variables: mapaGuardado(c.template_variables),
      numero_de_atendimento_id: c.numero_de_atendimento_id,
      // O aceite do risco de banimento NÃO vem junto: a cópia é uma intenção
      // nova, e o aceite é sobre ESTA campanha.
      created_by: autorId,
      // Nada de destinatário, resultado, agenda ou carimbo de execução: a cópia
      // é uma INTENÇÃO nova, e herdar números faria a tela mostrar entrega de
      // mensagem que esta campanha nunca mandou.
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      codigo: "campanha_estado_invalido",
      mensagem: error?.message ?? "Não foi possível duplicar a campanha.",
      status: 422,
    };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * O teste: a MESMA conexão, o MESMO renderizador, a MESMA camada de envio.
 *
 * Um teste que passasse por outro caminho provaria o outro caminho. E ele não
 * toca nos contadores da execução oficial — não cria destinatário, não gasta
 * fila —, mas gasta o ritmo do número, porque para o WhatsApp é uma mensagem
 * como qualquer outra.
 */
export async function testarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  contactId: string,
  agora: Date,
  fuso: string,
): Promise<Desfecho<{ status: string }>> {
  const recusa = faltaParaEnviar(c);
  if (recusa) return recusa;
  const conteudo = await conteudoOficial(admin, c);
  if (!conteudo.ok) return conteudo;

  const { data: contato } = await admin
    .from("contacts")
    .select("id, name, display_name, phone_number, email, custom_fields, is_blocked, is_anonymized, consent")
    .eq("organization_id", c.organization_id)
    .eq("id", contactId)
    .maybeSingle();
  if (!contato) {
    return {
      ok: false,
      codigo: "campanha_nao_encontrada",
      mensagem: "Contato de teste não encontrado nesta organização.",
      status: 404,
    };
  }
  const linha = contato as {
    id: string;
    name: string | null;
    display_name: string | null;
    phone_number: string | null;
    email: string | null;
    custom_fields: unknown;
    is_blocked: boolean;
    is_anonymized: boolean;
    consent: unknown;
  };

  // O teste respeita os MESMOS vetos: mandar teste para quem pediu para parar
  // seria furar o opt-out pela porta dos fundos.
  const motivo = motivoParaExcluir({
    contactId: linha.id,
    telefone: linha.phone_number,
    bloqueado: linha.is_blocked,
    anonimizado: linha.is_anonymized,
    recusouMarketing: recusouMarketing(linha.consent),
  });
  if (motivo) {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: `Este contato não pode receber: ${motivo}.`,
      status: 422,
    };
  }

  // O conteúdo do teste: o modelo com os valores DESTE contato (oficial) ou o
  // texto renderizado (texto livre). Faltar dado no cadastro recusa nos dois modos.
  let conteudoDoEnvio: {
    type: "text" | "template";
    body: string;
    template_name?: string;
    template_language?: string;
    template_values?: Record<string, string>;
  };
  if (conteudo.oficial) {
    const { modelo, mapa } = conteudo.oficial;
    const r = valoresDoDestinatario(contratoDoModelo(modelo), mapa, linha);
    if (r.faltando.length > 0) {
      return {
        ok: false,
        codigo: "campanha_conteudo_invalido",
        mensagem: `Falta ${r.faltando.map((k) => `{{${k}}}`).join(", ")} no cadastro deste contato — escolha outro para o teste.`,
        status: 422,
      };
    }
    conteudoDoEnvio = {
      type: "template",
      body: textoDoModelo(modelo, r.valores) || modelo.name,
      template_name: modelo.name,
      template_language: modelo.language,
      template_values: r.valores,
    };
  } else {
    const render = renderizar(c.message_body ?? "", { nome: nomeDoContato(linha) }, { agora, fuso });
    if (render.faltando.length > 0) {
      return {
        ok: false,
        codigo: "campanha_conteudo_invalido",
        mensagem: `Falta ${render.faltando.join(", ")} no cadastro deste contato — escolha outro para o teste.`,
        status: 422,
      };
    }
    conteudoDoEnvio = { type: "text", body: render.texto };
  }

  const boundary = await beginServiceAtOrigin(admin, c.organization_id, linha.id, c.channel_session_id);
  const mensagem = await sendMessageHandler(
    admin,
    {
      organization_id: c.organization_id,
      serviceBoundary: boundary,
      proactiveContext: { organizationId: c.organization_id, contactId: linha.id },
      actor: { type: "webhook_source", id: `campaign-test:${c.id}` },
      requestId: `campaign-test:${c.id}:${randomUUID()}`,
    } as Parameters<typeof sendMessageHandler>[1],
    {
      conversation_id: boundary.conversation_id,
      ...conteudoDoEnvio,
      metadata: { source: "campaign_test", campaign_id: c.id },
    } as Parameters<typeof sendMessageHandler>[2],
  );

  const status = (mensagem as { status?: string }).status ?? "desconhecido";
  if (status === "failed") {
    return {
      ok: false,
      codigo: "campanha_canal_indisponivel",
      mensagem: "O envio de teste falhou no canal. Verifique a conexão antes de iniciar a campanha.",
      status: 409,
    };
  }
  return { ok: true, status };
}

function conflitoDeCorrida(): Recusa {
  return {
    ok: false,
    codigo: "campanha_estado_invalido",
    mensagem: "O estado da campanha mudou enquanto esta ação era processada. Recarregue a tela.",
    status: 409,
  };
}
