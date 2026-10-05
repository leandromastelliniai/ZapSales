/**
 * ENVIA À META UM MODELO CRIADO NO EDITOR, E ESPELHA O QUE ELA RESPONDEU (issue #6).
 *
 * A casca de `novo-modelo.ts`: monta o pedido, faz `POST /{waba}/message_templates`
 * e grava a linha em `meta_templates` — a MESMA tabela que a sincronização
 * preenche, com a mesma chave `(organização, waba, nome, idioma)`. Um modelo
 * criado aqui e um sincronizado são indistinguíveis para o envio, para a lista e
 * para o webhook, que é o que a spec pede ("modelo unificado").
 *
 * O status e a categoria gravados são os que a META devolveu, não os pedidos:
 * ela pode recategorizar já na criação, e o espelho que repetisse o pedido
 * mentiria sobre o custo desde o primeiro minuto.
 *
 * Usa o admin client, então `organizationId` vem do chamador (sessão), nunca do
 * corpo, e filtra toda consulta.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { hashContract } from "./contract-hash";
import { erroDaRespostaDaGraph } from "./erros";
import { graphBaseUrl } from "./graph-base";
import { midiasDoModelo, montarPedidoDeModelo, type NovoModelo } from "./novo-modelo";
import { TEMPLATE_STATUS_DISABLED } from "./template-sync";

export interface EntradaDaSubmissao {
  organizationId: string;
  wabaId: string;
  /** Token da Graph API. Resolvido de fonte confiável pelo chamador, nunca do body. */
  token: string;
  graphVersion: string;
  modelo: NovoModelo;
  agora?: Date;
}

export interface ModeloSubmetido {
  /** O id da linha do espelho (`meta_templates.id`). */
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  /** O id do modelo na Meta, quando ela devolveu. */
  metaTemplateId: string | null;
}

export type DesfechoDaSubmissao =
  | { ok: true; modelo: ModeloSubmetido }
  /** Já existe no espelho, vivo: a Meta recusaria o nome repetido no mesmo idioma. */
  | { ok: false; motivo: "modelo_ja_existe" }
  | {
      ok: false;
      motivo: "meta_recusou";
      /** A frase da Meta para gente (`error_user_msg`), ou o motivo do mapa de erros. */
      mensagem: string;
      codigo: number | null;
      subcodigo: number | null;
    }
  /** Não deu para conferir o espelho; NADA foi à Meta. */
  | { ok: false; motivo: "falha_na_leitura"; mensagem: string }
  /** A Meta ACEITOU, mas o espelho não gravou — a sincronização traz o modelo. */
  | { ok: false; motivo: "falha_no_espelho"; mensagem: string };

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** A frase que a Meta escreveu para gente na recusa de modelo, quando escreveu. */
function fraseDaMeta(corpo: unknown): string | null {
  const erro = (corpo as { error?: Record<string, unknown> } | null)?.error;
  if (!erro || typeof erro !== "object") return null;
  return texto(erro.error_user_msg) ?? texto(erro.error_user_title);
}

export async function submeterModelo(
  admin: SupabaseClient,
  entrada: EntradaDaSubmissao,
): Promise<DesfechoDaSubmissao> {
  const { organizationId, wabaId, modelo } = entrada;
  const agora = (entrada.agora ?? new Date()).toISOString();

  const { data: existentes, error: erroDeLeitura } = await admin
    .from("meta_templates")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("waba_id", wabaId)
    .eq("name", modelo.name)
    .eq("language", modelo.language);
  if (erroDeLeitura)
    return { ok: false, motivo: "falha_na_leitura", mensagem: erroDeLeitura.message };

  const existente = (existentes ?? [])[0] as { id: string; status: string } | undefined;
  // DESATIVADO é o modelo que sumiu da Meta (ver `planSync`) ou que ela desativou:
  // deixa-se tentar de novo, e a linha antiga é reaproveitada em vez de duplicada.
  // Se a Meta ainda segura o nome (ela bloqueia nome apagado por um tempo), a
  // recusa dela chega ao operador com a frase dela — `meta_recusou`.
  if (existente && existente.status !== TEMPLATE_STATUS_DISABLED) {
    return { ok: false, motivo: "modelo_ja_existe" };
  }

  const pedido = montarPedidoDeModelo(modelo);
  const res = await fetch(`${graphBaseUrl(entrada.graphVersion)}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${entrada.token}`, "content-type": "application/json" },
    body: JSON.stringify(pedido),
  });
  const corpo: unknown = await res.json().catch(() => null);

  const erro = erroDaRespostaDaGraph(corpo, res.status);
  if (erro) {
    return {
      ok: false,
      motivo: "meta_recusou",
      mensagem: fraseDaMeta(corpo) ?? erro.motivo,
      codigo: erro.codigo,
      subcodigo: erro.subcodigo,
    };
  }

  const resposta = (corpo ?? {}) as { id?: unknown; status?: unknown; category?: unknown };
  const status = texto(resposta.status) ?? "PENDING";
  const category = texto(resposta.category) ?? modelo.category;
  const linha = {
    status,
    category,
    rejected_reason: null,
    quality_score: null,
    components: pedido.components,
    parameter_format: pedido.parameter_format,
    // Derivado, como na sincronização: o envio confere o contrato por este hash.
    contract_hash: hashContract(pedido.components, pedido.parameter_format),
    // Onde está a cópia de cada mídia do cabeçalho (issue #7). A Meta guarda só
    // a amostra da revisão; o arquivo de cada disparo sai daqui. A linha
    // reaproveitada troca o registro inteiro — o modelo é outro.
    header_media: midiasDoModelo(modelo),
    synced_at: agora,
    updated_at: agora,
  };

  const id = existente?.id ?? randomUUID();
  const { error: erroDeEscrita } = existente
    ? await admin
        .from("meta_templates")
        .update(linha)
        .eq("organization_id", organizationId)
        .eq("id", existente.id)
    : await admin.from("meta_templates").insert({
        id,
        organization_id: organizationId,
        waba_id: wabaId,
        name: modelo.name,
        language: modelo.language,
        ...linha,
      });
  if (erroDeEscrita)
    return { ok: false, motivo: "falha_no_espelho", mensagem: erroDeEscrita.message };

  return {
    ok: true,
    modelo: {
      id,
      name: modelo.name,
      language: modelo.language,
      status,
      category,
      metaTemplateId: texto(resposta.id),
    },
  };
}
