/**
 * O MODELO APROVADO de uma campanha oficial (issue #8): carregar a linha de
 * `meta_templates` da organização certa, dizer se ela pode sair e montar o texto
 * que o contato lê.
 *
 * O modo da campanha é CALCULADO de `meta_template_id` (migration 0538): com
 * modelo é oficial, sem modelo é de texto livre. `ehOficial` é a única pergunta — espalhar
 * `meta_template_id !== null` pelo código faria cada lugar decidir o modo de um
 * jeito.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { CHANNEL_PROVIDER_META, transportaMensagem } from "@/lib/channels/capabilities";
import { renderTemplateBody } from "@/lib/channels/meta/render-template";
import { isStatusSendable } from "@/lib/channels/meta/template-binding";
import { deriveTemplateContract, type TemplateContract } from "@/lib/channels/meta/template-contract";

import { recusaDoBotaoWaMe } from "./dois-numeros";
import { problemasDoMapa, type MapaDeVariaveis } from "./variaveis-do-modelo";

export interface ModeloDaCampanha {
  id: string;
  waba_id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  parameter_format: string | null;
  components: unknown;
}

const COLUNAS_DO_MODELO = "id, waba_id, name, language, status, category, parameter_format, components";

export function ehOficial(c: { meta_template_id?: string | null }): boolean {
  return typeof c.meta_template_id === "string" && c.meta_template_id !== "";
}

export async function carregarModelo(
  admin: SupabaseClient,
  organizationId: string,
  modeloId: string,
): Promise<ModeloDaCampanha | null> {
  const { data } = await admin
    .from("meta_templates")
    .select(COLUNAS_DO_MODELO)
    .eq("organization_id", organizationId)
    .eq("id", modeloId)
    .maybeSingle();
  return (data as unknown as ModeloDaCampanha | null) ?? null;
}

export function contratoDoModelo(m: ModeloDaCampanha): TemplateContract {
  return deriveTemplateContract({
    name: m.name,
    language: m.language,
    ...(m.parameter_format ? { parameter_format: m.parameter_format } : {}),
    components: m.components as never,
  });
}

/** O texto que o contato lê, com os valores dele — o corpo da mensagem na conversa e no painel. */
export function textoDoModelo(m: ModeloDaCampanha, valores: Record<string, string>): string {
  return renderTemplateBody(m.components, valores, {
    name: m.name,
    language: m.language,
    ...(m.parameter_format ? { parameterFormat: m.parameter_format } : {}),
  });
}

const FRASE_NUMERO_OFICIAL_SEM_MODELO =
  "Número da API Oficial só dispara campanha com modelo aprovado pela Meta. Escolha um modelo aprovado.";

/**
 * A conexão e o modelo combinam? `null` = sim. As duas direções valem:
 *
 * - modelo da Meta só sai por número do canal oficial, e só por número da
 *   MESMA conta (WABA) — o modelo é da conta, e a Meta recusa o envio por
 *   número de outra;
 * - número oficial só dispara com modelo: fora da janela de 24 h a Meta recusa
 *   texto livre, e campanha é, quase sempre, o primeiro toque.
 */
export async function recusaDaConexaoComModelo(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  modeloId: string | null,
): Promise<string | null> {
  const { data: canal } = await admin
    .from("channel_sessions")
    .select("provider, meta_waba_id")
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .maybeSingle();
  const conexao = canal as { provider?: string; meta_waba_id?: string | null } | null;
  if (!modeloId) {
    return conexao?.provider === CHANNEL_PROVIDER_META ? FRASE_NUMERO_OFICIAL_SEM_MODELO : null;
  }
  if (!conexao) return "Escolha uma conexão de WhatsApp desta organização.";
  if (conexao.provider !== CHANNEL_PROVIDER_META) {
    return "Modelo aprovado só sai por um número da API Oficial. Escolha um número oficial ou escreva o texto da campanha.";
  }
  const modelo = await carregarModelo(admin, organizationId, modeloId);
  if (!modelo) return "O modelo escolhido não existe nesta organização.";
  if (modelo.waba_id !== conexao.meta_waba_id) {
    return "Este modelo é de outra conta da Meta. Escolha um modelo da conta do número da campanha.";
  }
  return null;
}

/**
 * Por que este modelo, com este mapa, não pode sair — ou `null`. A frase é para
 * o operador: diz o que fazer, não o código interno.
 */
export function recusaDoModelo(m: ModeloDaCampanha | null, mapa: MapaDeVariaveis): string | null {
  if (!m) return "O modelo escolhido não existe mais nesta organização. Escolha outro modelo aprovado.";
  if (!isStatusSendable(m.status)) {
    return `O modelo ${m.name} (${m.language}) não está aprovado na Meta (situação: ${m.status}). Escolha um modelo aprovado.`;
  }
  const { semFonte, desconhecidas } = problemasDoMapa(contratoDoModelo(m), mapa);
  if (semFonte.length > 0) {
    return `Diga de onde vem cada variável do modelo — falta: ${semFonte.map((c) => `{{${c}}}`).join(", ")}.`;
  }
  if (desconhecidas.length > 0) {
    return `O mapa de variáveis tem campos que este modelo não usa (${desconhecidas.join(", ")}). Revise as variáveis.`;
  }
  return null;
}

/**
 * O número de atendimento do modo "dois números" (issue #9): um número desta
 * organização, conectado por QR code (é ele que conversa fora da API Oficial),
 * com o telefone que o botão wa.me abre.
 */
export async function numeroDeAtendimento(
  admin: SupabaseClient,
  organizationId: string,
  numeroId: string,
): Promise<{ ok: true; telefone: string | null } | { ok: false; motivo: string }> {
  const { data } = await admin
    .from("channel_sessions")
    .select("provider, phone_number")
    .eq("organization_id", organizationId)
    .eq("id", numeroId)
    .maybeSingle();
  const linha = data as { provider?: string; phone_number?: string | null } | null;
  if (!linha) return { ok: false, motivo: "O número de atendimento escolhido não existe nesta organização." };
  if (!transportaMensagem(linha.provider) || linha.provider === CHANNEL_PROVIDER_META) {
    return {
      ok: false,
      motivo:
        "O número de atendimento é o que recebe a conversa fora da API Oficial — escolha um número conectado por QR code.",
    };
  }
  return { ok: true, telefone: linha.phone_number ?? null };
}

/**
 * O modo "dois números" cabe nesta campanha? `null` = sim. Só com modelo (o
 * botão é do modelo), com número de QR code desta organização, e com o botão
 * wa.me do modelo abrindo esse número.
 */
export async function recusaDoNumeroDeAtendimento(
  admin: SupabaseClient,
  organizationId: string,
  numeroId: string | null,
  modeloId: string | null,
): Promise<string | null> {
  if (!numeroId) return null;
  if (!modeloId) {
    return "O modo dois números manda o modelo pelo número oficial — escolha um modelo aprovado antes do número de atendimento.";
  }
  const numero = await numeroDeAtendimento(admin, organizationId, numeroId);
  if (!numero.ok) return numero.motivo;
  const modelo = await carregarModelo(admin, organizationId, modeloId);
  if (!modelo) return "O modelo escolhido não existe nesta organização.";
  return recusaDoBotaoWaMe(modelo.components, numero.telefone);
}
