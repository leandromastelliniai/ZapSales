/**
 * LGPD export PDF renderer — no idioma da ORGANIZAÇÃO (pt-BR, es, en).
 *
 * Muda de idioma só o texto fixo do relatório (títulos, rótulos, estados). O
 * que ele NOMEIA não muda: o controlador continua `legal_name`, e a lei citada
 * continua o nome da lei ("LGPD", "Lei nº 13.709/2018"), em qualquer idioma.
 *
 * Template para Art. 18, II — direito de acesso aos dados. Renderizado para
 * Buffer via @react-pdf/renderer e entregue ao titular via Resend.
 *
 * ── ESTE DOCUMENTO NÃO LEVA MARCA. É decisão, não esquecimento ──────────────
 *
 * O rodapé imprime o CONTROLADOR (`organizations.legal_name`) e o Encarregado
 * resolvido. Não imprime a marca do revendedor, não imprime a nossa, não leva
 * logo e não leva cor.
 *
 * O motivo: o relatório do Art. 18 II responde a um DIREITO LEGAL do titular.
 * Nomear ali o revendedor — que é OPERADOR, não controlador — inverteria os
 * papéis num documento jurídico. Trocar `ZapSales` por `Vendas Turbo CRM`
 * no rodapé não é "completar o white-label": é piorar o defeito, porque hoje o
 * nome é obviamente o do software, e depois passaria a parecer a declaração de
 * quem responde pelos dados.
 *
 * Consequência boa e deliberada: a armadilha do @react-pdf não nos alcança.
 * `var(--x)` e `oklch()` renderizam PDF VÁLIDO e descartam a cor em silêncio
 * (medido: 1514 bytes contra 1538 do hex), então qualquer prova do tipo "gerei
 * o PDF e ele abriu" passaria com a marca perdida. Como o documento não recebe
 * cor de marca nenhuma, o `styles` de módulo abaixo pode continuar de módulo:
 * zero risco assumido. Não parametrize, não mova para dentro do componente.
 *
 * A tela que resolve o outro lado disto é `/app/settings/tenant` (campo "Razão
 * social"): `legal_name` nasce IGUAL a `display_name` no bootstrap
 * (`scripts/bootstrap-owner.ts`, os dois recebem `ORG_NAME`), então o caso ruim
 * aqui não é o campo vazio — é o nome fantasia impresso como razão social. Uma
 * guarda "se vazio, use X" nunca dispararia; o que resolve é preencher a tela.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { env } from "@/lib/env";
import { preencher } from "@/lib/i18n/aviso-no-idioma";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO, type Idioma } from "@/lib/i18n/idiomas";

import type { ExportPayload } from "./export-collector";

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1f2937",
  },
  header: {
    borderBottom: "1pt solid #d1d5db",
    paddingBottom: 8,
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#6b7280" },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    backgroundColor: "#f3f4f6",
    padding: 4,
    marginBottom: 6,
  },
  row: { flexDirection: "row", marginBottom: 2 },
  label: { width: 110, color: "#6b7280" },
  value: { flex: 1 },
  small: { fontSize: 8, color: "#9ca3af" },
  itemBlock: {
    marginBottom: 4,
    paddingBottom: 4,
    borderBottom: "0.5pt dashed #e5e7eb",
  },
  warningBanner: {
    marginTop: 14,
    padding: 6,
    border: "1pt solid #f59e0b",
    backgroundColor: "#fffbeb",
    fontSize: 9,
    color: "#92400e",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 8,
    color: "#9ca3af",
    borderTop: "0.5pt solid #e5e7eb",
    paddingTop: 4,
  },
});

interface Props {
  data: ExportPayload;
  /** When true, appends an unsigned-PADES warning banner. */
  unsignedWarning?: boolean;
  /**
   * O idioma da ORGANIZAÇÃO (o controlador), lido por quem chama — o worker usa
   * `idiomaDaOrganizacao`. Muda só o texto FIXO do relatório: a entidade que ele
   * nomeia continua o controlador, e a lei citada continua o nome da lei, em
   * qualquer idioma. Ausente: português, o texto de sempre.
   */
  idioma?: Idioma;
}

/** `tag` é a etiqueta BCP-47 do idioma do relatório (`tagDeIdioma`). */
function fmtDate(s: string | null | undefined, tag: string): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString(tag, { timeZone: "America/Sao_Paulo" });
  } catch {
    return s;
  }
}

function fmtMoney(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null) return "—";
  const v = cents / 100;
  return `${currency ?? "BRL"} ${v.toFixed(2)}`;
}

/**
 * A MESMA cadeia que `lib/lgpd/sla-alarm.ts:93` já usa
 * (organização acima, instalação abaixo — resolvida pelo coletor). Reusar a ordem, e não
 * inventar outra, é o que impede o documento e o alarme de apontarem para
 * encarregados diferentes na mesma organização.
 *
 * O texto anterior era `DPO: contato via canal oficial do controlador` — um
 * não-resposta num campo cuja função é dizer a quem o titular reclama.
 */
function encarregado(data: ExportPayload, idioma: Idioma): string {
  // O renderizador não consulta configuração: ele desenha o que recebeu. Quem
  // resolve o encarregado (organização acima, instalação abaixo) é o coletor,
  // que é assíncrono e já busca `dpo_email` da organização. Deixar a busca aqui
  // obrigaria um componente de PDF a falar com o banco no meio do desenho.
  return data.dpo_email || traduzir("não informado pelo controlador", idioma);
}

// Concluir o processamento do job não comprova envio: ele também pode terminar
// com um bloqueio. O relatório conserva essa diferença, sem anunciar entrega.
// Um `switch`, e não um mapa de textos: a frase fica LITERAL na chamada de
// `traduzir`, onde o guarda de cobertura do catálogo a enxerga.
function estadoDaEntrega(status: string, idioma: Idioma): string {
  switch (status) {
    case "pending":
      return traduzir("Pendente", idioma);
    case "running":
      return traduzir("Em processamento", idioma);
    case "done":
      return traduzir("Processamento concluído", idioma);
    case "failed":
      return traduzir("Falha no processamento", idioma);
    case "dead":
      return traduzir("Tentativas encerradas", idioma);
    default:
      return status;
  }
}

function estadoDoAviso(status: string, idioma: Idioma): string {
  switch (status) {
    case "open":
      return traduzir("Aberto", idioma);
    case "resolved":
      return traduzir("Resolvido", idioma);
    case "dismissed":
      return traduzir("Dispensado", idioma);
    default:
      return status;
  }
}

export function LgpdExportPdf({ data, unsignedWarning, idioma: idiomaPedido }: Props): React.ReactElement {
  const shortId = data.request_id.slice(0, 8);
  const idioma = idiomaPedido ?? IDIOMA_PADRAO;
  const tag = tagDeIdioma(idioma);
  const quando = (s: string | null | undefined) => fmtDate(s, tag);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{traduzir("Relatório de Acesso aos Dados", idioma)}</Text>
          <Text style={styles.subtitle}>
            {/* A lei vem do PERFIL do país da organização (issue #1033): país
                sem citação revisada não cita lei nenhuma — citar a errada é
                pior do que não citar artigo nenhum. O nome da lei não se
                traduz: só a frase em volta dele. */}
            {preencher(traduzir("Base legal: {lei} · Solicitação #{id}", idioma), {
              lei: data.lei_citada ?? traduzir("não declarada (país sem citação revisada)", idioma),
              id: shortId,
            })}
          </Text>
        </View>

        {/* Metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{traduzir("Metadados da Solicitação", idioma)}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>ID:</Text>
            <Text style={styles.value}>{data.request_id}</Text>
          </View>
          {/* A razão social vem primeiro e o uuid vira "ID interno": o campo
              existe para o TITULAR saber de quem são os dados, e um uuid cru
              não responde isso a ninguém. O id continua no documento porque é
              o que o suporte pede quando alguém liga citando o relatório. */}
          <View style={styles.row}>
            <Text style={styles.label}>{traduzir("Organização:", idioma)}</Text>
            <Text style={styles.value}>{data.organization_legal_name || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{traduzir("ID interno:", idioma)}</Text>
            <Text style={styles.value}>{data.organization_id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{traduzir("Gerado em:", idioma)}</Text>
            <Text style={styles.value}>{quando(data.generated_at)}</Text>
          </View>
          {data.no_local_footprint ? (
            <View style={styles.row}>
              <Text style={styles.label}>{traduzir("Status:", idioma)}</Text>
              <Text style={styles.value}>
                {traduzir("Nenhum dado pessoal localizado nos sistemas internos.", idioma)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Contact */}
        {data.contact ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Dados Pessoais (Contato)", idioma)}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>{traduzir("Nome:", idioma)}</Text>
              <Text style={styles.value}>{data.contact.name ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{traduzir("Email:", idioma)}</Text>
              <Text style={styles.value}>{data.contact.email ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{traduzir("Telefone:", idioma)}</Text>
              <Text style={styles.value}>{data.contact.phone_number ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{data.documento_rotulo}:</Text>
              <Text style={styles.value}>
                {data.contact.cpf_present
                  ? traduzir("Armazenado (criptografado)", idioma)
                  : data.contact.cpf_informado_na_conversa
                    ? traduzir("Informado na conversa (valor no arquivo de dados)", idioma)
                    : "—"}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{traduzir("Origem:", idioma)}</Text>
              <Text style={styles.value}>{data.contact.source ?? "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{traduzir("Criado em:", idioma)}</Text>
              <Text style={styles.value}>{quando(data.contact.created_at)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{traduzir("Anonimizado:", idioma)}</Text>
              <Text style={styles.value}>
                {data.contact.is_anonymized ? traduzir("Sim", idioma) : traduzir("Não", idioma)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Respostas e campos personalizados (roteiros de atendimento, etc.) */}
        {data.contact && (data.contact.campos_legiveis ?? []).length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Respostas e campos personalizados", idioma)}</Text>
            {/* A pergunta em linha própria: rótulo de roteiro é frase, e na coluna
                de 110pt dos dados fixos ele quebrava no meio da palavra. */}
            {data.contact.campos_legiveis.map((campo, i) => (
              <View key={i} style={styles.itemBlock}>
                <Text style={styles.small}>{campo.rotulo}</Text>
                <Text>{campo.valor}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Consents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{traduzir("Consentimentos", idioma)}</Text>
          {data.consents.length === 0 ? (
            <Text style={styles.small}>{traduzir("Nenhum consentimento registrado.", idioma)}</Text>
          ) : (
            data.consents.map((c, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{c.scope}:</Text>
                <Text style={styles.value}>
                  {c.granted ? traduzir("concedido", idioma) : traduzir("negado", idioma)}
                  {c.granted_at ? ` ${preencher(traduzir("em {data}", idioma), { data: quando(c.granted_at) })}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Conversations */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{traduzir("Histórico de Atendimento", idioma)}</Text>
          <Text style={styles.small}>
            {preencher(
              traduzir(
                "Total de conversas: {conversas} · Total de mensagens: {mensagens} · Amostra incluída neste relatório: {amostra}",
                idioma,
              ),
              {
                conversas: data.conversations.length,
                mensagens: data.messages_count_total,
                amostra: data.messages_recent.length,
              },
            )}
          </Text>
          {data.conversations.slice(0, 10).map((c) => (
            <View key={c.id} style={styles.itemBlock}>
              <Text>
                {preencher(traduzir("Conversa #{id}", idioma), { id: c.id.slice(0, 8) })} · {c.channel} · {c.status}
              </Text>
              <Text style={styles.small}>
                {preencher(traduzir("Última mensagem: {ultima} · Criada em {criada}", idioma), {
                  ultima: quando(c.last_message_at),
                  criada: quando(c.created_at),
                })}
              </Text>
            </View>
          ))}
        </View>

        {/* Recent messages preview */}
        {data.messages_recent.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Mensagens Recentes (amostra)", idioma)}</Text>
            {data.messages_recent.slice(0, 25).map((m) => (
              <View key={m.id} style={styles.itemBlock}>
                <Text style={styles.small}>
                  {quando(m.created_at)} · {m.direction} · {m.type} · {m.status}
                </Text>
                <Text>{m.body ? m.body.slice(0, 280) : m.has_media ? traduzir("[mídia]", idioma) : "—"}</Text>
                {m.media_derived_text ? (
                  <Text style={styles.small}>
                    {preencher(traduzir("transcrição/texto extraído da mídia: {texto}", idioma), {
                      texto: m.media_derived_text.slice(0, 280),
                    })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Mensagens em grupos de WhatsApp escritas pelo titular (migration 0482) */}
        {data.group_messages_authored.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Mensagens em Grupos de WhatsApp", idioma)}</Text>
            {data.group_messages_authored.slice(0, 25).map((m) => (
              <View key={m.id} style={styles.itemBlock}>
                <Text style={styles.small}>
                  {quando(m.created_at)} · {m.type}
                </Text>
                <Text>{m.body ? m.body.slice(0, 280) : m.has_media ? traduzir("[mídia]", idioma) : "—"}</Text>
                {m.media_derived_text ? (
                  <Text style={styles.small}>
                    {preencher(traduzir("transcrição/texto extraído da mídia: {texto}", idioma), {
                      texto: m.media_derived_text.slice(0, 280),
                    })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Leads */}
        {data.leads.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Atividade Comercial — Leads", idioma)}</Text>
            {data.leads.map((l) => (
              <View key={l.id} style={styles.itemBlock}>
                <Text>
                  {l.title ?? traduzir("(sem título)", idioma)} · {l.status} ·{" "}
                  {fmtMoney(l.value_cents, l.currency)}
                </Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Criado em {data}", idioma), { data: quando(l.created_at) })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Orders */}
        {data.orders.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Pedidos", idioma)}</Text>
            {data.orders.map((o) => (
              <View key={o.id} style={styles.itemBlock}>
                <Text>
                  {o.external_provider ?? "—"} #{o.external_id ?? o.id.slice(0, 8)} ·{" "}
                  {o.status} · {fmtMoney(o.total_cents, o.currency)}
                </Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Pedido em {data}", idioma), { data: quando(o.ordered_at) })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Propostas — o documento comercial que a pessoa RECEBEU; sem esta
            seção o relatório não mencionava proposta nenhuma. */}
        {data.proposals?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Propostas comerciais", idioma)}</Text>
            {data.proposals.map((p) => (
              <View key={p.id} style={styles.itemBlock}>
                <Text>
                  {p.numero != null && p.ano != null
                    ? `${preencher(traduzir("Nº {numero}/{ano}", idioma), { numero: p.numero, ano: p.ano })} · `
                    : ""}
                  {p.titulo} · {p.status} · {fmtMoney(p.total_cents, p.moeda)}
                </Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Criada em {data}", idioma), { data: quando(p.created_at) })}
                  {p.sent_at
                    ? ` · ${preencher(traduzir("enviada em {data}", idioma), { data: quando(p.sent_at) })}`
                    : ""}
                  {p.tem_pdf ? ` · ${traduzir("documento em PDF enviado", idioma)}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Agenda — vai no PDF, e não só no JSON, porque é a substância legível
            do Art. 18 II: "houve consulta no dia tal, sobre isto". `activities`
            fica só no JSON de propósito (type/source_module é telemetria); um
            compromisso, não. */}
        {data.appointments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Agenda — Compromissos", idioma)}</Text>
            {data.appointments.map((c) => (
              <View key={c.id} style={styles.itemBlock}>
                <Text>
                  {c.title ?? traduzir("(sem título)", idioma)} · {c.status}
                  {c.location_details ? ` · ${c.location_details}` : ""}
                </Text>
                <Text style={styles.small}>
                  {preencher(traduzir("{inicio} até {fim} ({fuso})", idioma), {
                    inicio: quando(c.starts_at),
                    fim: quando(c.ends_at),
                    fuso: c.time_zone,
                  })}
                </Text>
                {c.description ? <Text style={styles.small}>{c.description}</Text> : null}
                {c.notes ? (
                  <Text style={styles.small}>{preencher(traduzir("Anotação: {texto}", idioma), { texto: c.notes })}</Text>
                ) : null}
                {c.meeting_url ? (
                  <Text style={styles.small}>
                    {preencher(traduzir("Link da reunião: {url}", idioma), { url: c.meeting_url })}
                  </Text>
                ) : null}
                {c.cancellation_reason ? (
                  <Text style={styles.small}>
                    {preencher(traduzir("Cancelado: {motivo}", idioma), { motivo: c.cancellation_reason })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* O fluxo entrega este PDF; armazenar as categorias só no JSON não
            as disponibiliza ao titular. Consumir apenas a projeção do coletor. */}
        {data.reply_drafts?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Sugestões e respostas revisadas", idioma)}</Text>
            {data.reply_drafts.map((reply) => (
              <View key={reply.id} style={styles.itemBlock}>
                <Text>{preencher(traduzir("Estado: {estado}", idioma), { estado: reply.status })}</Text>
                {reply.original_body ? (
                  <Text>{preencher(traduzir("Sugestão: {texto}", idioma), { texto: reply.original_body })}</Text>
                ) : null}
                {reply.edited_body && reply.edited_body !== reply.original_body ? (
                  <Text>{preencher(traduzir("Edição: {texto}", idioma), { texto: reply.edited_body })}</Text>
                ) : null}
                {reply.approved_body ? (
                  <Text>{preencher(traduzir("Texto aprovado: {texto}", idioma), { texto: reply.approved_body })}</Text>
                ) : null}
                {reply.feedback ? (
                  <Text>{preencher(traduzir("Revisão: {texto}", idioma), { texto: JSON.stringify(reply.feedback) })}</Text>
                ) : null}
                {Array.isArray(reply.proposals) && reply.proposals.length ? (
                  <Text>
                    {preencher(traduzir("Propostas: {texto}", idioma), { texto: JSON.stringify(reply.proposals) })}
                  </Text>
                ) : null}
                <Text style={styles.small}>
                  {preencher(traduzir("Criado em {data}", idioma), { data: quando(reply.created_at) })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.meeting_deliveries?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Entregas de links de reunião", idioma)}</Text>
            {data.meeting_deliveries.map((delivery) => (
              <View key={delivery.id} style={styles.itemBlock}>
                <Text>{estadoDaEntrega(delivery.status, idioma)}</Text>
                <Text style={styles.small}>{preencher(traduzir("Registro: {id}", idioma), { id: delivery.id })}</Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Compromisso: {id}", idioma), {
                    id: delivery.appointment_id ?? traduzir("referência indisponível", idioma),
                  })}
                </Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Criado em {criado} · Programado para {programado}", idioma), {
                    criado: quando(delivery.created_at),
                    programado: quando(delivery.run_after),
                  })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.appointment_notices?.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Avisos sobre compromissos", idioma)}</Text>
            {data.appointment_notices.map((notice) => (
              <View key={notice.id} style={styles.itemBlock}>
                <Text>{notice.title} · {estadoDoAviso(notice.status, idioma)}</Text>
                {notice.body ? <Text>{notice.body}</Text> : null}
                <Text style={styles.small}>{preencher(traduzir("Registro: {id}", idioma), { id: notice.id })}</Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Compromisso: {id}", idioma), {
                    id: notice.ref_id ?? traduzir("referência indisponível", idioma),
                  })}
                </Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Criado em {data}", idioma), { data: quando(notice.created_at) })}
                  {notice.resolved_at
                    ? ` · ${preencher(traduzir("Resolvido em {data}", idioma), { data: quando(notice.resolved_at) })}`
                    : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Captação — de onde a pessoa veio. Entra no PDF porque `remote_ip`,
            `user_agent` e `utm` são dados que a organização guarda A RESPEITO
            dela e que ela raramente imagina que existem. */}
        {data.webhook_captures.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Como seus dados chegaram até nós", idioma)}</Text>
            {data.webhook_captures.map((c) => (
              <View key={c.id} style={styles.itemBlock}>
                <Text>
                  {c.source_name ?? traduzir("(origem não identificada)", idioma)} · {c.outcome}
                </Text>
                <Text style={styles.small}>
                  {preencher(traduzir("Recebido em {data}", idioma), { data: quando(c.received_at) })}
                  {c.remote_ip ? ` · IP ${c.remote_ip}` : ""}
                </Text>
                {c.user_agent ? (
                  <Text style={styles.small}>
                    {preencher(traduzir("Navegador: {navegador}", idioma), { navegador: c.user_agent.slice(0, 160) })}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Audit */}
        {data.audit_log_extract.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{traduzir("Atividades de Auditoria", idioma)}</Text>
            {data.audit_log_extract.slice(0, 50).map((a) => (
              <View key={a.id} style={styles.row}>
                <Text style={styles.label}>{quando(a.created_at)}</Text>
                <Text style={styles.value}>
                  {a.action}
                  {a.resource_type ? ` · ${a.resource_type}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Unsigned warning */}
        {unsignedWarning ? (
          <View style={styles.warningBanner}>
            <Text>
              {traduzir(
                "ASSINATURA DIGITAL PAdES PENDENTE — chave LGPD_SIGNING_KEY não configurada. A integridade do documento é garantida por hash SHA-256 registrado em log auditável.",
                idioma,
              )}
            </Text>
          </View>
        ) : null}

        {/* Footer */}
        {/* CONTROLADOR, nunca marca — ver o cabeçalho deste arquivo. O idioma
            muda a frase, nunca a entidade: `{controlador}` é a razão social. */}
        <View style={styles.footer} fixed>
          <Text>
            {preencher(
              traduzir(
                "Controlador: {controlador} · Relatório de Acesso aos Dados{lei} · Encarregado (DPO): {encarregado} · Validade do link de download conforme e-mail recebido",
                idioma,
              ),
              {
                controlador: data.organization_legal_name || "—",
                lei: data.lei_citada ? ` — ${data.lei_citada}` : "",
                encarregado: encarregado(data, idioma),
              },
            )}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderLgpdPdf(
  data: ExportPayload,
  options: { unsignedWarning?: boolean; idioma?: Idioma } = {},
): Promise<Buffer> {
  const element = (
    <LgpdExportPdf data={data} unsignedWarning={options.unsignedWarning} idioma={options.idioma} />
  );
  const buf = await renderToBuffer(element);
  return buf as Buffer;
}
