"use client";
/**
 * Form principal de configuração de um mcp_agent (Spec 12 §3 / S-13.11).
 *
 * Renderiza o agent + sua draft mais recente. Carregamento inicial vem do
 * Server Component pai (initial props). Mutations passam por:
 *   - `saveAgentDraftAction` (cria draft nova ou PATCH na existente)
 *   - `publishAgentAction` (versão draft → published; flip atômico via fn)
 *
 * Estados visíveis ao usuário:
 *   - "Publicado vN" (sem draft, valores espelham published)
 *   - "Rascunho vN+1" (sem published)
 *   - "Publicado vN + Rascunho vM" (formulário mostra a draft)
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { Icon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TokenCounter } from "@/lib/ui/TokenCounter";
import {
  BookOpen,
  Brain,
  ChatsCircle,
  HandCoins,
  IdentificationCard,
  Info,
  PaperPlaneTilt,
  PuzzlePiece,
  ShieldCheck,
  Smiley,
  TreeStructure,
  WhatsappLogo,
} from "@/lib/ui/icons";
import { PassagemParaHumano } from "@/components/icons/produto";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { sugerirIcone, type IconeDoAgente } from "@/lib/ai/agents/icone-do-agente";
import { EscolherIcone } from "./EscolherIcone";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import type { Idioma } from "@/lib/i18n/idiomas";
import {
  IDIOMAS_DO_AGENTE,
  LIMITES_DO_PERFIL,
  LIMITES_DOS_TEMAS,
  perfilPreenchido,
  type IdiomaDoAgente,
  type TomDoAgente,
} from "@/lib/ai/agents/perfil";
import { aplicarModelo, type IdDoModelo } from "@/lib/ai/agents/modelos";
import Link from "next/link";

import { TETO_TOOLS_POR_AGENTE } from "@/lib/mcp/tools/selecao-por-pacote";
import { PROVEDORES } from "@/lib/ai/pontos/provedores";

import { ModelPicker, useModelMeta } from "./ModelPicker";
import { CHAVE_DA_INSTALACAO, CredentialPicker, STATUS_LABEL, findCredential } from "./CredentialPicker";
import { rotuloDoEstadoDoCanal } from "@/lib/channels/estado";
import { bloqueioDePublicacao } from "@/lib/ai/agents/bloqueio-de-publicacao";
import { mesmoRascunho } from "@/lib/ai/agents/mesmo-rascunho";
import { ToolPicker } from "./ToolPicker";
import { TriggerEditor, type TriggerValue } from "./TriggerEditor";
import { HandoffKeywordsInput } from "./HandoffKeywordsInput";
import { FollowupFlowPicker } from "./FollowupFlowPicker";
import {
  FollowupWindowEditor,
  type FollowupWindowValue,
} from "./FollowupWindowEditor";
import { PainelDoOperador } from "./PainelDoOperador";
import { RespostaEmAudioDoAgente } from "./RespostaEmAudioDoAgente";
import { PainelDeSeguranca } from "./PainelDeSeguranca";
import { BasesDoAgente, type MaterialDoAcervo } from "./BasesDoAgente";
import { FunisDoAgente, type CoberturaPorFunil } from "./FunisDoAgente";
import { PublishConfirmDialog } from "./PublishConfirmDialog";
import { ComandosDoCelular } from "./ComandosDoCelular";
import {
  PerfilGuiado,
  assuntosDoTexto,
  perfilDoContrato,
  type PerfilDoFormulario,
} from "./PerfilGuiado";
import { ModelosDoAgente } from "./ModelosDoAgente";
import {
  saveAgentDraftAction,
  publishAgentAction,
  createMcpAgentAction,
} from "../_actions";

import {
  versionCreateSchema,
  agentMcpCreateSchema,
  agentMcpPatchSchema,
  passaDoTetoDeCapacidades,
} from "@/lib/ai/agents/validation";
import type { SelectableChannel as ChannelSessionLite } from "@/lib/channels/selectable";
import type { AgentRow } from "@/hooks/ai/useAgent";
import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";
import type { CredentialRow, Provider } from "@/hooks/ai/useCredentials";
import { credentialStatus } from "@/hooks/ai/useCredentials";
import type { FunilDaResposta } from "@/hooks/pipelines/usePipelines";
import { callbacksHabilitados } from "@/lib/followup/callback-policy";

/**
 * O canal oferecido no seletor é exatamente o que `listSelectableChannels`
 * devolve — alias, e não uma cópia da forma, para que a tela não possa divergir
 * de quem monta a lista (é lá que mora o filtro de canal arquivado).
 */
export type { ChannelSessionLite };

/**
 * O id que liga o botão "Publicar" ao TEXTO que diz por que ele está desabilitado.
 *
 * O motivo vivia só no `title` de um span: aparecia com o ponteiro parado em
 * cima. Em tela de toque não existe hover — nunca aparecia —, e o botão
 * desabilitado nem entra na ordem do Tab, então quem navega de teclado também
 * não sabia o que faltava para o agente entrar no ar. Além do texto na tela, o
 * `aria-describedby` do botão aponta para cá: quem chega pelo leitor de tela
 * ouve o motivo junto do rótulo, sem depender de hover.
 */
const ID_DO_MOTIVO_DO_PUBLICAR = "motivo-do-publicar";

interface BaseProps {
  credentials: CredentialRow[];
  /**
   * Provedores cujas chaves vieram na INSTALAÇÃO (o `.env`), e não da tela de
   * Credenciais. Sem isto, o editor exigia uma linha em `ai_provider_credentials`
   * que a instalação pelo kit nunca cria — e o dono caía numa tela onde não
   * conseguia salvar nada.
   */
  provedoresDaInstalacao?: string[];
  /**
   * O provedor que a organização já usa — `organizations.settings.llm.provider`,
   * lido pela página de CRIAÇÃO junto com as credenciais.
   *
   * É o defeito do "agente novo já nasce Anthropic": o formulário oferecia
   * `anthropic` (e "Cadastrar credencial anthropic") para uma organização cuja
   * única chave é da OpenAI. Aqui só o valor chega; quem lê `settings` é a
   * página server component, do mesmo jeito que as credenciais.
   */
  provedorPadrao?: string;
  channelSessions: ChannelSessionLite[];
  routerMembership?: { routerId: string; routerName: string } | null;
  readOnly?: boolean;
  organizationTimezone?: string;
}

interface EditProps extends BaseProps {
  mode: "edit";
  agent: AgentRow;
  /** Rascunho VIGENTE (mais novo que a publicada) — `null` se não há. */
  draft: AgentVersionRow | null;
  published: AgentVersionRow | null;
  /**
   * A versão de onde o formulário se hidrata: rascunho vigente > publicada >
   * última que existiu. Decidida em `lib/ai/agents/versoes-da-tela.ts`.
   */
  base?: AgentVersionRow | null;
  /** Rascunho anterior à publicada — mostrado como aviso, nunca aberto. */
  draftObsoleto?: AgentVersionRow | null;
}

/**
 * O que o editor completo recebe do assistente quando a pessoa clica em "Prefiro o editor
 * completo": os mesmos campos que o assistente compõe (`comporAgente`), mais as capacidades e
 * o escopo de funil do modelo. Só vale na criação.
 */
export interface InicialDoEditor {
  name: string;
  system_prompt: string;
  profile_persona: string;
  profile_tone: TomDoAgente;
  profile_objective: string;
  profile_welcome: string;
  profile_language: IdiomaDoAgente;
  restrict_topics: boolean;
  allowed_topics: string[];
  off_topic_reply: string;
  tool_ids: string[];
  pipeline_ids: string[];
}

interface CreateProps extends BaseProps {
  mode: "create";
  /**
   * O que cada modelo da galeria liga (capacidades e uso de funil), calculado no SERVIDOR:
   * os handlers das ferramentas não vão para o navegador. Ausente = a galeria só preenche o
   * perfil e as instruções, como antes.
   */
  capacidadesPorModelo?: Record<IdDoModelo, { tool_ids: string[]; usa_funil: boolean }>;
  /** O funil de entrada da organização, para o modelo que mexe no funil já nascer com escopo. */
  funilPadraoId?: string | null;
  /** O estado que o assistente entrega ao editor. */
  inicial?: InicialDoEditor;
}

type Props = (EditProps | CreateProps) & {
  /**
   * Os funis da organização, para a marcação de escopo (spec 17 passo 3).
   *
   * Vem por PROP e não por hook: a página já é server component e busca o resto
   * do contexto lá: um fetch client-side aqui faria a lista piscar vazia no
   * primeiro render, e "nenhum funil" é exatamente o estado que esta tela usa
   * para dizer algo importante.
   */
  funis?: FunilDaResposta[];
  /** Quanto de cada funil o assistente sabe percorrer (spec 17 passo 4). */
  cobertura?: CoberturaPorFunil;
  /**
   * O acervo da organização, para o assistente escolher o que consulta (0181).
   *
   * Vem por PROP pelo mesmo motivo dos funis: a página já é server component, e
   * um fetch client-side faria a lista piscar vazia no primeiro render — sendo
   * que "nenhum material" é exatamente o estado que esta seção usa para dizer
   * algo importante.
   */
  materiais?: MaterialDoAcervo[];
};

interface FormState {
  name: string;
  description: string;
  priority: number;
  provider: Provider;
  model: string;
  credential_id: string;
  channel_session_id: string;
  system_prompt: string;
  /**
   * Perfil guiado (#89). Tudo vazio = agente sem perfil: só o prompt livre.
   * Chaves PLANAS e com o nome da coluna, de propósito: a cerca "todo campo do
   * formulário viaja em algum payload" casa FormState com o envio pelo nome.
   */
  profile_persona: string;
  profile_tone: PerfilDoFormulario["tom"];
  profile_objective: string;
  profile_welcome: string;
  profile_language: PerfilDoFormulario["idioma"];
  /**
   * Restringir temas (#92). `allowed_topics` é o TEXTO do campo (um assunto por
   * linha) e vira lista só em `toVersionPayload`; a chave plana com o nome da
   * coluna é o que a cerca de payload exige.
   */
  restrict_topics: boolean;
  allowed_topics: string;
  off_topic_reply: string;
  /** Temperatura (0 a 1). `null` = padrão do modelo. Campo avançado. */
  temperature: number | null;
  tool_ids: string[];
  trigger_config: TriggerValue;
  max_steps: number;
  token_budget: number;
  cost_budget_cents: number;
  history_message_window: number;
  history_token_window: number;
  handoff_keywords: string[];
  handoff_tool_enabled: boolean;
  proposal_ai_draft_enabled: boolean;
  cases_enabled: boolean;
  split_messages: boolean;
  split_max_chars: number;
  /** Janela de rajada (ms) do agente. `null` = usa a env da instalação. */
  inbound_debounce_ms: number | null;
  /** Resposta em áudio (issue #91): desligada por padrão. Voz/modelo `null` = os da organização. */
  audio_reply_enabled: boolean;
  audio_reply_voice_id: string | null;
  audio_reply_model_id: string | null;
  followup: FollowupValue;
  // Papel OPERADOR (spec 16 §3.2) — o que mexe no sistema depois da conversa.
  operator_enabled: boolean;
  /** "" = herda o modelo do Conversador (vira null no payload). */
  operator_model: string;
  operator_tool_ids: string[];
  pipeline_ids: string[];
  knowledge_source_ids: string[];
  /** Ferramentas externas (webhook de consulta, #94) que o agente pode chamar. */
  external_tool_ids: string[];
}

interface FollowupValue {
  enabled: boolean;
  flow_pointer_ids: string[];
  callback_enabled: boolean;
  /** Ausente em versões antigas; null = sem janela própria. */
  send_window?: FollowupWindowValue | null;
}

const DEFAULT_FOLLOWUP: FollowupValue = {
  enabled: false,
  flow_pointer_ids: [],
  send_window: null,
  callback_enabled: true,
};

const DEFAULT_TRIGGER: TriggerValue = {
  events: ["message"],
  filters: {
    ignore_groups: true,
    ignore_self: true,
    keyword_regex: null,
    business_hours: null,
  },
  concurrency: "one_per_conversation",
};

/**
 * O provedor inicial de um agente que ainda não tem versão.
 *
 * Só a lista que o seletor OFERECE vale como resposta: `settings.llm` é jsonb
 * gravado por várias telas, e um id que `PROVEDORES` não conhece cairia num
 * `<Select>` sem opção correspondente — o campo abrindo em branco e o
 * formulário pedindo para escolher de novo. Fora da lista, `anthropic` (o que
 * o seed da instalação sempre teve).
 */
export function provedorInicial(provedorPadrao?: string): Provider {
  if (provedorPadrao && PROVEDORES.some((p) => p.id === provedorPadrao)) {
    return provedorPadrao as Provider;
  }
  return "anthropic";
}

export function buildState(args: {
  agent?: AgentRow;
  version: AgentVersionRow | null;
  t: (texto: string) => string;
  /**
   * O provedor que a ORGANIZAÇÃO já usa (`organizations.settings.llm.provider`).
   *
   * Sem isto, um agente NOVO nascia `anthropic` — e o formulário mostrava
   * "Cadastrar credencial anthropic" para uma organização que só tem chave da
   * OpenAI. A escolha passa a herdar o que a instalação já decidiu; o `anthropic`
   * continua sendo o último degrau, para instalação que ainda não escolheu nada.
   */
  provedorPadrao?: string;
  /**
   * O idioma da tela de quem está CRIANDO o agente: o perfil de um agente novo
   * nasce com ele (e tom "normal"), para o dono só ajustar. Agente que já existe
   * mostra o que a versão tem — vazio, se nunca teve perfil.
   */
  idiomaDaTela?: Idioma;
}): FormState {
  const { agent, version, t, provedorPadrao, idiomaDaTela } = args;
  const idiomaInicial = (IDIOMAS_DO_AGENTE as readonly string[]).includes(idiomaDaTela ?? "")
    ? (idiomaDaTela as PerfilDoFormulario["idioma"])
    : "";
  return {
    name: agent?.name ?? "",
    description: agent?.description ?? "",
    priority: agent?.priority ?? 0,
    provider: (version?.provider as Provider) ?? provedorInicial(provedorPadrao),
    model: version?.model ?? "",
    // `null` gravado = a versão usa a chave da instalação. Sem esta tradução,
    // reabrir o agente mostraria o campo em branco e pediria para escolher de novo.
    credential_id: version ? (version.credential_id ?? CHAVE_DA_INSTALACAO) : "",
    channel_session_id: version?.channel_session_id ?? "",
    // O DEFAULT vira o prompt real do agente se ninguém editar — por isso é
    // traduzido de verdade (não só a interface): em espanhol ele instrui a IA
    // a responder em espanhol, não em pt-BR.
    system_prompt:
      version?.system_prompt ??
      t("Você é um atendente. Responda de forma educada e clara, em pt-BR."),
    // Agente novo nasce com tom "normal" e o idioma da tela; o que já existe
    // mostra o que a versão tem (vazio, se nunca teve perfil).
    profile_persona: version?.profile_persona ?? "",
    profile_tone: version ? (version.profile_tone ?? "") : agent ? "" : "normal",
    profile_objective: version?.profile_objective ?? "",
    profile_welcome: version?.profile_welcome ?? "",
    profile_language: version ? (version.profile_language ?? "") : agent ? "" : idiomaInicial,
    restrict_topics: version?.restrict_topics ?? false,
    allowed_topics: (version?.allowed_topics ?? []).join("\n"),
    off_topic_reply: version?.off_topic_reply ?? "",
    temperature: version?.temperature ?? null,
    tool_ids: version?.tool_ids ?? [],
    trigger_config: (version?.trigger_config as unknown as TriggerValue) ?? DEFAULT_TRIGGER,
    max_steps: version?.max_steps ?? 10,
    token_budget: version?.token_budget ?? 50_000,
    cost_budget_cents: version?.cost_budget_cents ?? 50,
    history_message_window: version?.history_message_window ?? 20,
    history_token_window: version?.history_token_window ?? 8_000,
    handoff_keywords: version?.handoff_keywords ?? [
      "falar com humano",
      "atendente",
      "pessoa real",
    ],
    handoff_tool_enabled: version?.handoff_tool_enabled ?? true,
    proposal_ai_draft_enabled: version?.proposal_ai_draft_enabled ?? true,
    cases_enabled: version?.cases_enabled ?? false,
    split_messages: version?.split_messages ?? false,
    split_max_chars: version?.split_max_chars ?? 600,
    inbound_debounce_ms: version?.inbound_debounce_ms ?? null,
    audio_reply_enabled: version?.audio_reply_enabled ?? false,
    audio_reply_voice_id: version?.audio_reply_voice_id ?? null,
    audio_reply_model_id: version?.audio_reply_model_id ?? null,
    followup: version?.followup
      ? {
          ...DEFAULT_FOLLOWUP,
          ...version.followup,
          callback_enabled: callbacksHabilitados(version.followup),
        }
      : DEFAULT_FOLLOWUP,
    operator_enabled: version?.operator_enabled ?? false,
    // O form usa "" onde o banco usa null — Select controlado não aceita null.
    // A conversão de volta acontece em `toVersionPayload`, num ponto só.
    operator_model: version?.operator_model ?? "",
    operator_tool_ids: version?.operator_tool_ids ?? [],
    // `?? []` = nenhum funil. Agente novo nasce fechado, como o banco.
    pipeline_ids: version?.pipeline_ids ?? [],
    // `?? []` = nenhum material. Mesma direção segura: agir de menos.
    knowledge_source_ids: version?.knowledge_source_ids ?? [],
    external_tool_ids: version?.external_tool_ids ?? [],
  };
}

/**
 * As três colunas que moram em `ai_agents`, não em `ai_agent_versions`.
 *
 * Existir separado não é gosto: `versionCreateSchema` é `.strict()` e recusa
 * estes campos, com razão — eles não descrevem a versão. O que faltava era o
 * segundo construtor, e sem ele o modo EDIÇÃO mandava só a versão: a pessoa
 * digitava o nome, via "Rascunho vN salvo.", publicava com sucesso, e o cartão
 * da lista seguia com o nome antigo (issue #463). O modo CRIAÇÃO sempre
 * mandou os três, e é por isso que o defeito só aparecia ao editar.
 */
function toCadastroPayload(s: FormState) {
  return {
    name: s.name.trim(),
    // "" na tela é APAGAR, e apagar é `null` no banco — `undefined` seria
    // "não mexi", e a descrição antiga sobreviveria a um campo esvaziado.
    description: s.description.trim() === "" ? null : s.description.trim(),
    priority: s.priority,
  };
}

/** As chaves planas do estado, no formato que o `PerfilGuiado` segura. */
function perfilDoFormulario(s: FormState): PerfilDoFormulario {
  return {
    persona: s.profile_persona,
    tom: s.profile_tone,
    objetivo: s.profile_objective,
    boasVindas: s.profile_welcome,
    idioma: s.profile_language,
    restringirTemas: s.restrict_topics,
    temasPermitidos: s.allowed_topics,
    respostaForaDoTema: s.off_topic_reply,
  };
}

function toVersionPayload(s: FormState) {
  const perfil = perfilDoContrato(perfilDoFormulario(s));
  return {
    system_prompt: s.system_prompt,
    // "" na tela é "não preenchido", e no contrato é `null` (`perfilDoContrato`).
    profile_persona: perfil.persona,
    profile_tone: perfil.tom,
    profile_objective: perfil.objetivo,
    profile_welcome: perfil.boasVindas,
    profile_language: perfil.idioma,
    restrict_topics: perfil.restringirTemas,
    allowed_topics: perfil.temasPermitidos,
    off_topic_reply: perfil.respostaForaDoTema,
    temperature: s.temperature,
    provider: s.provider,
    model: s.model,
    // O token é da TELA; o contrato da versão é `null` = chave da instalação.
    credential_id: s.credential_id === CHAVE_DA_INSTALACAO ? null : s.credential_id,
    // "" na tela é "ainda não escolhi o número", e no contrato da versão isso é
    // `null`. Sem a tradução, o Zod recusaria a string vazia e o rascunho de
    // quem ainda não conectou o WhatsApp não salvaria — o defeito de origem.
    channel_session_id: s.channel_session_id === "" ? null : s.channel_session_id,
    tool_ids: s.tool_ids,
    trigger_config: s.trigger_config,
    max_steps: s.max_steps,
    token_budget: s.token_budget,
    cost_budget_cents: s.cost_budget_cents,
    history_message_window: s.history_message_window,
    history_token_window: s.history_token_window,
    handoff_keywords: s.handoff_keywords,
    handoff_tool_enabled: s.handoff_tool_enabled,
    proposal_ai_draft_enabled: s.proposal_ai_draft_enabled,
    cases_enabled: s.cases_enabled,
    split_messages: s.split_messages,
    split_max_chars: s.split_max_chars,
    inbound_debounce_ms: s.inbound_debounce_ms,
    audio_reply_enabled: s.audio_reply_enabled,
    audio_reply_voice_id: s.audio_reply_voice_id,
    audio_reply_model_id: s.audio_reply_model_id,
    followup: s.followup,
    operator_enabled: s.operator_enabled,
    // "" (não escolheu) → null (herda o do Conversador). São o mesmo conceito em
    // camadas diferentes, e o mapeamento vive AQUI para não se espalhar.
    operator_model: s.operator_model.trim() === "" ? null : s.operator_model.trim(),
    operator_tool_ids: s.operator_tool_ids,
    pipeline_ids: s.pipeline_ids,
    knowledge_source_ids: s.knowledge_source_ids,
    external_tool_ids: s.external_tool_ids,
  };
}

type Papel = "conversa" | "operacao" | "seguranca";

/** Os três papéis do agente (spec 16 §6), com o que cada um quer dizer para quem configura. */
const PAPEIS: ReadonlyArray<{ id: Papel; Icone: Icon }> = [
  { id: "conversa", Icone: ChatsCircle },
  { id: "operacao", Icone: TreeStructure },
  // O TERCEIRO PAPEL. O rótulo diz o que ele FAZ, como os outros dois:
  // "Segurança" é o nosso nome; quem configura quer saber o que é
  // conferido antes de a mensagem chegar ao cliente dele.
  { id: "seguranca", Icone: ShieldCheck },
];

const ROTULO_DO_PAPEL: Record<Papel, string> = {
  conversa: "Conversa com o cliente",
  operacao: "Organiza o sistema",
  seguranca: "Confere antes de enviar",
};

const FRASE_DO_PAPEL: Record<Papel, string> = {
  conversa: "O que o cliente vê e ouve",
  operacao: "O que ele faz por dentro, depois da conversa",
  seguranca: "As conferências de cada mensagem antes de sair",
};

type IdDaSecao =
  | "quem"
  | "personalidade"
  | "respostas"
  | "conhecimento"
  | "capacidades"
  | "onde"
  | "pessoas"
  | "vendas"
  | "inteligencia";

/**
 * As partes da conversa com o cliente, NA ORDEM EM QUE SE PENSA nelas: quem ele
 * é, como fala, o que sabe, o que faz, onde atende, quando chama alguém, e só
 * no fim a parte técnica (modelo, chave, limites) — que o leigo pode nem abrir.
 * Antes eram 14 cartões em duas colunas, com "Freios de segurança" em tokens
 * antes da personalidade.
 */
const SECOES: ReadonlyArray<{ id: IdDaSecao; indice: string }> = [
  { id: "quem", indice: "Quem é" },
  { id: "personalidade", indice: "Personalidade" },
  { id: "respostas", indice: "Jeito de responder" },
  { id: "conhecimento", indice: "O que ele sabe" },
  { id: "capacidades", indice: "O que ele faz" },
  { id: "onde", indice: "Onde e quando atende" },
  { id: "pessoas", indice: "Passar para uma pessoa" },
  { id: "vendas", indice: "Propostas e retornos" },
  { id: "inteligencia", indice: "Inteligência e limites" },
];

/** Em que seção mora cada campo que a validação pode acusar — o índice marca onde corrigir. */
const SECAO_DO_CAMPO: Record<string, IdDaSecao> = {
  name: "quem",
  description: "quem",
  priority: "quem",
  system_prompt: "personalidade",
  temperature: "personalidade",
  profile_persona: "personalidade",
  profile_objective: "personalidade",
  profile_welcome: "personalidade",
  allowed_topics: "personalidade",
  off_topic_reply: "personalidade",
  split_max_chars: "respostas",
  tool_ids: "capacidades",
  channel_session_id: "onde",
  trigger_config: "onde",
  model: "inteligencia",
  credential_id: "inteligencia",
  provider: "inteligencia",
  max_steps: "inteligencia",
  token_budget: "inteligencia",
  cost_budget_cents: "inteligencia",
  history_message_window: "inteligencia",
  history_token_window: "inteligencia",
  inbound_debounce_ms: "inteligencia",
};

/**
 * Uma parte do formulário: o que ela é e, numa frase, o que muda para o cliente
 * quando se mexe nela. É um painel só — o que vem dentro se separa por filete
 * (`Subsecao`), nunca por outro cartão.
 */
function SecaoDoAgente({
  id,
  Icone,
  titulo,
  explicacao,
  children,
}: {
  id: IdDaSecao;
  Icone: Icon;
  titulo: string;
  explicacao: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`secao-${id}`}
      data-secao={id}
      aria-labelledby={`titulo-secao-${id}`}
      className="scroll-mt-40 overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
    >
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-foreground">
          <Icone size={18} weight="duotone" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h2 id={`titulo-secao-${id}`} className="text-base leading-tight font-semibold tracking-tight">
            {titulo}
          </h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">{explicacao}</p>
        </div>
      </header>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

/** Um bloco dentro de uma seção, separado do anterior por filete. */
function Subsecao({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      {titulo ? <h3 className="text-sm font-semibold">{titulo}</h3> : null}
      {children}
    </div>
  );
}

export function AgentForm(props: Props) {
  const t = useT();
  const idiomaDaTela = useIdioma();
  const funis = props.funis ?? [];
  const materiais = props.materiais ?? [];
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const readOnly = props.readOnly ?? false;

  const baseline = React.useMemo(() => {
    if (isEdit) {
      // `base` já traz a regra (rascunho vigente > publicada > última versão).
      // O fallback existe para chamadores que ainda não a passam; sem ele, um
      // agente pausado abriria no texto padrão e o prompt "sumiria".
      const ref = props.base ?? props.draft ?? props.published;
      return buildState({ agent: props.agent, version: ref, t });
    }
    const novo = buildState({
      version: null,
      t,
      provedorPadrao: props.provedorPadrao,
      idiomaDaTela,
    });
    return props.mode === "create" && props.inicial
      ? { ...novo, ...props.inicial, allowed_topics: props.inicial.allowed_topics.join("\n") }
      : novo;
  }, [isEdit, props, t, idiomaDaTela]);

  const [form, setForm] = React.useState<FormState>(baseline);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  /**
   * Qual papel está aberto. Estado LOCAL e não rota: trocar de papel não é
   * navegação — o rascunho é um só, e uma URL por papel faria o usuário achar
   * que salvou um e não o outro.
   */
  const [papel, setPapel] = React.useState<Papel>("conversa");
  /** A seção da conversa que está na tela agora, para o índice acompanhar a rolagem. */
  const [secaoVisivel, setSecaoVisivel] = React.useState<IdDaSecao>("quem");
  /** Na criação o ícone não tem onde morar até o agente existir; guardado aqui e gravado depois. */
  const [iconeDaCriacao, setIconeDaCriacao] = React.useState<IconeDoAgente | null>(null);

  React.useEffect(() => {
    if (papel !== "conversa" || typeof IntersectionObserver === "undefined") return;
    const alvos = Array.from(document.querySelectorAll<HTMLElement>("[data-secao]"));
    const observador = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visivel) setSecaoVisivel(visivel.target.getAttribute("data-secao") as IdDaSecao);
      },
      // A faixa de cima da tela, logo abaixo das barras grudadas, decide qual é a "atual".
      { rootMargin: "-160px 0px -55% 0px" },
    );
    alvos.forEach((a) => observador.observe(a));
    return () => observador.disconnect();
  }, [papel]);

  function irPara(p: Papel) {
    setPapel(p);
  }

  function rolarPara(id: IdDaSecao) {
    const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`secao-${id}`)
      ?.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" });
    setSecaoVisivel(id);
  }
  /** O ramo escolhido na galeria (#92), só para marcar o card. */
  const [modeloEscolhido, setModeloEscolhido] = React.useState<IdDoModelo | null>(null);
  const capacidadesPorModelo = props.mode === "create" ? props.capacidadesPorModelo : undefined;
  const funilPadraoId = props.mode === "create" ? (props.funilPadraoId ?? null) : null;
  /** O modelo vem no idioma da tela de quem cria; idioma sem modelo cai em português. */
  const idiomaDoModelo: IdiomaDoAgente = (IDIOMAS_DO_AGENTE as readonly string[]).includes(idiomaDaTela)
    ? (idiomaDaTela as IdiomaDoAgente)
    : "pt-BR";
  /**
   * O modo avançado (instruções livres + temperatura). Abre sozinho para quem NÃO
   * tem perfil — o agente que já existia vive nas instruções livres, e escondê-las
   * seria sumir com o que ele faz —, e fecha para quem tem, porque aí o formulário
   * guiado é a porta. Erro dentro dele força abrir (ver `avancadoVisivel`).
   */
  const [avancadoAberto, setAvancadoAberto] = React.useState(
    () => !perfilPreenchido(perfilDoContrato(perfilDoFormulario(baseline))),
  );

  /**
   * A pergunta é "salvar mudaria alguma coisa?", e não "os dois objetos são
   * idênticos". Por isso a comparação é feita sobre o que SERIA GRAVADO, de
   * forma canônica (ver `lib/ai/agents/mesmo-rascunho.ts`): campo que o servidor
   * completa sozinho e ordem de chaves do `jsonb` deixavam `dirty` verdadeiro
   * para sempre, e o botão "Publicar" cinza com "Salve o rascunho antes de
   * publicar" — medido numa instalação em produção, com o agente preso na versão
   * anterior até alguém publicar por fora da tela.
   */
  const dirty = !mesmoRascunho(
    { cadastro: toCadastroPayload(form), versao: toVersionPayload(form) },
    { cadastro: toCadastroPayload(baseline), versao: toVersionPayload(baseline) },
  );

  function patch(p: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  // Quando provider muda, limpa credential e modelo (eles dependem do provider).
  function changeProvider(p: Provider) {
    patch({ provider: p, credential_id: "", model: "" });
  }

  const cred = findCredential(props.credentials, form.credential_id);
  const credSt = cred ? credentialStatus(cred) : null;
  const channelSession = props.channelSessions.find((c) => c.id === form.channel_session_id);
  const modelMeta = useModelMeta(form.provider, form.model);

  // ---------------------------------------------------------------------
  // Validação (espelha versionCreateSchema, no client; server revalida).
  // ---------------------------------------------------------------------
  const validation = React.useMemo(() => {
    const errors: Record<string, string> = {};
    // As mensagens abaixo aparecem embaixo do campo ANTES de a pessoa tentar
    // salvar, então são escritas como INSTRUÇÃO ("dê um nome") e não como
    // acusação ("nome obrigatório") — um formulário recém-aberto acusando o
    // usuário de errar é a primeira coisa que ele vê nesta tela.
    if (form.name.trim().length === 0) errors.name = t("Dê um nome para este agente.");
    if (form.name.length > 120) errors.name = t("O nome pode ter até 120 caracteres.");
    // A rota REST já cobra `0..1000` (`app/api/v1/ai/agents/[id]/route.ts:90`).
    // Sem a mesma régua aqui, o número inválido só reprovaria no servidor e o
    // aviso chegaria como erro genérico, depois de a versão já ter sido gravada.
    if (!Number.isInteger(form.priority) || form.priority < 0 || form.priority > 1000)
      errors.priority = t("A ordem de preferência vai de 0 a 1000.");
    if (form.system_prompt.trim().length < 10)
      errors.system_prompt = t("Escreva as instruções do agente (pelo menos uma frase).");
    // `.trim()` porque é o que o servidor mede: `z.string().trim().max(20000)`
    // em lib/ai/agents/validation.ts — o trim roda ANTES do max. Duas réguas
    // diferentes barrariam aqui um texto que o servidor aceitaria.
    const tamanhoDoPrompt = form.system_prompt.trim().length;
    if (tamanhoDoPrompt > 20000)
      errors.system_prompt =
        `${t("As instruções têm")} ${tamanhoDoPrompt.toLocaleString("pt-BR")} ${t("caracteres, e o máximo é 20.000. Corte")} ` +
        `${(tamanhoDoPrompt - 20000).toLocaleString("pt-BR")} ${t("para conseguir salvar.")}`;
    // Perfil guiado: a mesma régua de tamanho do servidor (`perfilTexto`, que apara
    // antes de medir). Mensagem na tela, e não o "Too big" cru do Zod.
    for (const [campo, chave, limite] of [
      ["persona", "profile_persona", LIMITES_DO_PERFIL.persona],
      ["objetivo", "profile_objective", LIMITES_DO_PERFIL.objetivo],
      ["boasVindas", "profile_welcome", LIMITES_DO_PERFIL.boasVindas],
    ] as const) {
      if (perfilDoFormulario(form)[campo].trim().length > limite)
        errors[chave] = `${t("Pode ter até")} ${limite} ${t("caracteres.")}`;
    }
    // Restringir temas: as mesmas réguas do servidor (`LIMITES_DOS_TEMAS`).
    const assuntos = assuntosDoTexto(form.allowed_topics);
    if (assuntos.length > LIMITES_DOS_TEMAS.assuntos)
      errors.allowed_topics = `${t("No máximo")} ${LIMITES_DOS_TEMAS.assuntos} ${t("assuntos.")}`;
    else if (assuntos.some((a) => a.length > LIMITES_DOS_TEMAS.assunto))
      errors.allowed_topics = `${t("Cada assunto pode ter até")} ${LIMITES_DOS_TEMAS.assunto} ${t("caracteres.")}`;
    if (form.off_topic_reply.trim().length > LIMITES_DOS_TEMAS.respostaFora)
      errors.off_topic_reply = `${t("Pode ter até")} ${LIMITES_DOS_TEMAS.respostaFora} ${t("caracteres.")}`;
    if (form.temperature !== null && (form.temperature < 0 || form.temperature > 1))
      errors.temperature = t("A temperatura vai de 0 a 1.");
    if (!form.model) errors.model = t("Escolha o modelo de inteligência artificial.");
    if (!form.credential_id)
      errors.credential_id = t("Escolha a chave de acesso da empresa de inteligência artificial.");
    // Escolher "a chave desta instalação" para um provedor que a instalação NÃO
    // tem seria publicar um agente que morre em toda mensagem. A mesma recusa
    // existe no servidor (rota de versões); aqui ela chega antes do clique.
    if (
      form.credential_id === CHAVE_DA_INSTALACAO &&
      !(props.provedoresDaInstalacao ?? []).includes(form.provider)
    )
      errors.credential_id = `${t("Esta instalação não tem chave de")} ${form.provider}. ${t("Escolha outra empresa de IA ou cadastre uma chave.")}`;
    // ⚠️ O NÚMERO NÃO ENTRA AQUI — de propósito, e não por esquecimento.
    //
    // Esta lista é o que impede de SALVAR. Exigir o número aqui travava o
    // rascunho de toda instalação fresca: sem WhatsApp pareado não existe uma
    // linha em `channel_sessions`, o seletor abria vazio, e o dono que acabou de
    // escrever o prompt do atendente não conseguia guardá-lo — tinha de escolher
    // de uma lista sem opção. Escrever quem o agente é e conectar o aparelho são
    // dois dias diferentes na vida de quem instala.
    //
    // Quem cobra o número é `bloqueioDePublicacao` (logo abaixo): sem ele o
    // agente não vai ao ar, e o botão "Publicar" explica o que falta.
    if (passaDoTetoDeCapacidades(form.tool_ids, form.external_tool_ids))
      errors.tool_ids = `${t("Máximo de")} ${TETO_TOOLS_POR_AGENTE} ${t("capacidades por agente.")}`;

    // Tenta o schema completo:
    if (Object.keys(errors).length === 0) {
      const parsed = versionCreateSchema.safeParse(toVersionPayload(form));
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        const first = Object.entries(flat.fieldErrors)[0];
        if (first) errors[first[0]] = first[1]?.[0] ?? t("Campo inválido.");
      }
    }
    return errors;
  }, [form, t]);

  const isValid = Object.keys(validation).length === 0;
  // Erro dentro do modo avançado nunca fica escondido atrás do <details> fechado.
  const avancadoVisivel =
    avancadoAberto || !!validation.system_prompt || !!validation.temperature;

  const errosPorSecao = React.useMemo(() => {
    const porSecao: Partial<Record<IdDaSecao, number>> = {};
    for (const campo of Object.keys(validation)) {
      const secao = SECAO_DO_CAMPO[campo];
      if (secao) porSecao[secao] = (porSecao[secao] ?? 0) + 1;
    }
    return porSecao;
  }, [validation]);

  /** Uma linha por seção no índice: como ela está AGORA, sem precisar abrir. */
  const resumoDaSecao: Record<IdDaSecao, string> = (() => {
    const capacidades = form.tool_ids.length + form.external_tool_ids.length;
    const materiais = form.knowledge_source_ids.length;
    const tom: Record<string, string> = {
      formal: t("Tom formal"),
      normal: t("Tom normal"),
      descontraido: t("Tom descontraído"),
    };
    return {
      quem: form.name.trim() || t("Sem nome"),
      personalidade: form.profile_tone
        ? (tom[form.profile_tone] ?? t("Perfil preenchido"))
        : form.system_prompt.trim()
          ? t("Só as instruções livres")
          : t("Ainda não preenchido"),
      respostas:
        (form.split_messages ? t("Mensagens curtas") : t("Texto único")) +
        (form.audio_reply_enabled ? ` · ${t("áudio")}` : ""),
      conhecimento:
        materiais === 0
          ? t("Nenhum material")
          : `${materiais} ${materiais === 1 ? t("material") : t("materiais")}`,
      capacidades:
        capacidades === 0
          ? t("Nenhuma ação ligada")
          : `${capacidades} ${capacidades === 1 ? t("ação ligada") : t("ações ligadas")}`,
      onde: channelSession?.display_name ?? t("Sem número"),
      pessoas: form.handoff_tool_enabled
        ? t("Chama a equipe quando precisa")
        : t("Não chama ninguém sozinho"),
      vendas: form.followup.enabled ? t("Follow-up ligado") : t("Follow-up desligado"),
      inteligencia: form.model || t("Escolha o modelo"),
    };
  })();

  /**
   * A dica do botão "Publicar" — uma frase, vinda de UM motivo.
   *
   * A régua é `lib/ai/agents/bloqueio-de-publicacao.ts`, e ela saiu daqui porque
   * aqui ela estava errada para o caso mais comum do produto: perguntava por uma
   * LINHA de credencial (`cred`), e "a chave desta instalação" não é uma linha —
   * é `credential_id: null`. Quem instalou pelo kit e nunca abriu a tela de
   * Credenciais via o botão desabilitado para sempre, pedindo para escolher a
   * chave que tinha acabado de escolher.
   */
  const publishBlockReason = React.useMemo(() => {
    if (!isEdit) return t("Salve o agent antes de publicar.");
    const motivo = bloqueioDePublicacao({
      temRascunhoVigente: !!props.draft,
      formularioValido: isValid,
      alteracoesNaoSalvas: dirty,
      provedor: form.provider,
      chave: {
        daInstalacao: form.credential_id === CHAVE_DA_INSTALACAO,
        instalacaoTemChaveDoProvedor: (props.provedoresDaInstalacao ?? []).includes(
          form.provider,
        ),
        estadoDaCredencialDaOrg: credSt,
      },
      numero: { estado: channelSession?.status ?? null },
    });
    if (!motivo) return null;
    switch (motivo.codigo) {
      case "sem_rascunho":
        return t("Sem rascunho para publicar.");
      case "formulario_invalido":
        return t("Resolva os erros do formulário.");
      case "alteracoes_nao_salvas":
        return t("Salve o rascunho antes de publicar.");
      case "instalacao_sem_chave_do_provedor":
        return `${t("Esta instalação não tem chave de")} ${motivo.provedor}. ${t("Escolha outra empresa de IA ou cadastre uma chave.")}`;
      case "sem_chave":
        return t("Escolha a chave de acesso da empresa de inteligência artificial.");
      case "chave_nao_utilizavel":
        return `${t("Credencial")} ${motivo.provedor} ${motivo.estado === "invalid" ? t("inválida") : t("ainda não validada")}.`;
      case "sem_numero":
        return t(
          "Escolha por qual número de WhatsApp ele atende. O rascunho está salvo; conecte um número em Conexões e volte aqui para publicar.",
        );
      case "numero_desconectado":
        return `${t("Número WhatsApp não está conectado (status:")} ${motivo.estado}).`;
    }
  }, [isEdit, props, isValid, dirty, credSt, form.provider, form.credential_id, channelSession, t]);

  // ---------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------

  async function handleSave() {
    if (!isValid) {
      const first = Object.values(validation)[0];
      toast.error(first ?? t("Formulário inválido."));
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        // A mesma régua do cadastro que a Server Action valida de novo
        // (_actions.ts, `agentMcpPatchSchema` — não a da rota REST, que é
        // `agentPatchSchema` e diverge em name/description), aqui só para o erro
        // aparecer no campo em vez de voltar como 500 depois de a versão já ter
        // sido gravada.
        const cadastro = agentMcpPatchSchema.safeParse(toCadastroPayload(form));
        if (!cadastro.success) {
          toast.error(t("Validação falhou."));
          return;
        }
        const res = await saveAgentDraftAction(
          props.agent.id,
          toVersionPayload(form),
          cadastro.data,
        );
        if (!res.ok) {
          toast.error(res.message ?? `${t("Erro")}: ${res.error}`);
          return;
        }
        toast.success(`${t("Rascunho")} v${res.data!.version_number} ${t("salvo.")}`);
        router.refresh();
      } else {
        const payload = {
          name: form.name,
          description: form.description.trim() === "" ? undefined : form.description,
          priority: form.priority,
          version: toVersionPayload(form),
        };
        const validated = agentMcpCreateSchema.safeParse(payload);
        if (!validated.success) {
          toast.error(t("Validação falhou."));
          return;
        }
        const res = await createMcpAgentAction(validated.data);
        if (!res.ok) {
          toast.error(res.message ?? `${t("Erro")}: ${res.error}`);
          return;
        }
        if (iconeDaCriacao) {
          // Identidade, não conteúdo: falhar aqui não desfaz o agente criado — ele
          // só fica com o ícone sugerido pelo nome, que se troca no editor.
          await apiClient
            .patch(`/api/v1/ai/agents/${res.data!.agent_id}`, { config: { icone: iconeDaCriacao } })
            .catch(() => undefined);
        }
        toast.success(t("Agent criado."));
        router.push(`/app/ai/agents/${res.data!.agent_id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!isEdit || !props.draft) return;
    setPublishing(true);
    try {
      const res = await publishAgentAction(props.agent.id, props.draft.id);
      if (!res.ok) {
        toast.error(`${t("Falha ao publicar:")} ${res.error}`);
        return;
      }
      toast.success(`v${props.draft.version_number} ${t("publicada e ativa.")}`);
      setConfirmOpen(false);
      router.refresh();
    } finally {
      setPublishing(false);
    }
  }

  function handleReset() {
    setForm(baseline);
  }

  const disabled = readOnly || saving || publishing;

  // Status badge
  const statusBadge = (() => {
    if (!isEdit) return <Badge variant="secondary">{t("Novo")}</Badge>;
    const pubN = props.published?.version_number;
    const draftN = props.draft?.version_number;
    if (pubN && draftN) {
      return (
        <Badge variant="secondary">
          {t("Publicado")} v{pubN} + {t("Rascunho")} v{draftN}
        </Badge>
      );
    }
    if (pubN) {
      // O rascunho anterior à publicada não abre nem publica — mas some da tela
      // sem explicação se ninguém o nomear, e aí o autor procura por um trabalho
      // que acha ter perdido. Ele continua no Histórico.
      const obsoleta = props.draftObsoleto?.version_number;
      return (
        <Badge
          variant="default"
          title={
            obsoleta
              ? `${t("O rascunho v")}${obsoleta}${t(" é anterior a esta versão e foi superado por ela — ele continua no Histórico.")}`
              : undefined
          }
        >
          {t("Publicado")} v{pubN}
          {obsoleta ? ` ${t("(rascunho v")}${obsoleta}${t(" superado)")}` : ""}
        </Badge>
      );
    }
    if (draftN) return <Badge variant="outline">{t("Rascunho")} v{draftN}</Badge>;
    // Sem rascunho e sem publicada: o formulário abriu da última versão que
    // existiu (props.base), e não do texto padrão. Dizer isso é o que impede o
    // autor de achar que o prompt sumiu — e de salvar por cima achando que não.
    if (props.base) {
      return (
        <Badge variant="outline">
          {t("Pausado")} {t("· editando a v")}{props.base.version_number}
        </Badge>
      );
    }
    return <Badge variant="outline">{t("Sem versão")}</Badge>;
  })();

  return (
    <div className="flex flex-col gap-5">
      {/*
        A BARRA DE SALVAR. Fica grudada no topo enquanto a pessoa rola as seções:
        numa página com nove partes, o botão que guarda o trabalho não pode ficar
        lá em cima, fora de vista — e ela diz, em palavras, se há algo por salvar.
      */}
      <div
        className="z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-xs backdrop-blur supports-[backdrop-filter]:bg-surface/85 md:sticky md:top-16"
        data-testid="barra-de-salvar"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isEdit ? null : (
            <>
              <h1 className="mr-1 text-xl font-semibold tracking-tight">{t("Novo agente")}</h1>
              <Link
                href="/app/ai/agents/new?modo=assistente"
                className="text-sm text-ia underline-offset-2 hover:underline"
                data-testid="abrir-assistente"
              >
                {t("Prefere ser guiado? Abrir o assistente")}
              </Link>
            </>
          )}
          {statusBadge}
          {isEdit ? (
            dirty ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-funil" role="status">
                <span aria-hidden className="size-1.5 rounded-full bg-current" />
                {t("Alterações não salvas")}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">{t("Tudo salvo")}</span>
            )
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEdit ? (
            <Button
              variant="ghost"
              onClick={handleReset}
              disabled={!dirty || disabled}
            >
              {t("Descartar alterações")}
            </Button>
          ) : null}
          <Button
            variant={isEdit ? "outline" : "default"}
            onClick={handleSave}
            disabled={(!dirty && isEdit) || disabled || !isValid}
          >
            {saving ? t("Salvando…") : isEdit ? t("Salvar rascunho") : t("Criar agente")}
          </Button>
          {isEdit ? (
            <span title={publishBlockReason ?? undefined}>
              <Button
                variant="default"
                onClick={() => setConfirmOpen(true)}
                disabled={disabled || publishBlockReason !== null}
                aria-describedby={publishBlockReason ? ID_DO_MOTIVO_DO_PUBLICAR : undefined}
                data-testid="publicar-agente"
              >
                <PaperPlaneTilt size={16} aria-hidden />
                {publishing
                  ? t("Publicando…")
                  : props.draft
                    ? `${t("Publicar v")}${props.draft.version_number}`
                    : t("Publicar")}
              </Button>
            </span>
          ) : null}
        </div>

        {/*
          O MOTIVO NA TELA, não só no `title` (issue #951).

          O `title` do span acima continua ali para quem usa mouse, mas ele é
          hover: em tela de toque não existe, e um botão desabilitado nem entra na
          ordem do Tab — a explicação do bloqueio ficava inalcançável justamente
          para quem mais precisa dela. Aqui o MESMO motivo (`publishBlockReason`) é
          texto da tela, e o `aria-describedby` do botão o anuncia junto do rótulo.
        */}
        {isEdit && publishBlockReason ? (
          <p
            id={ID_DO_MOTIVO_DO_PUBLICAR}
            data-testid={ID_DO_MOTIVO_DO_PUBLICAR}
            role="status"
            aria-live="polite"
            className="w-full text-sm text-muted-foreground"
          >
            {publishBlockReason}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/*
          NAVEGAÇÃO POR PAPEL (spec 16 §6), agora com o índice das seções. Um form
          só, um save só — os papéis são SEÇÕES, não telas separadas: separá-las em
          abas com save próprio faria o usuário publicar metade da configuração e
          criaria dois caminhos para o mesmo `ai_agent_versions`.

          Os rótulos dizem o que cada papel FAZ. "Conversador"/"Operador" é o nosso
          vocabulário interno; quem configura pensa em "quem fala com meu cliente" e
          "quem organiza minha casa". Um elemento por papel (o mesmo no celular e no
          computador): os testes procuram `papel-*` e não podem achar dois.
        */}
        <nav aria-label={t("Partes do agente")} className="min-w-0 lg:sticky lg:top-44 lg:max-h-[calc(100vh-12rem)] lg:self-start lg:overflow-y-auto">
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
            {PAPEIS.map(({ id, Icone }) => {
              const ativo = papel === id;
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    data-testid={`papel-${id}`}
                    onClick={() => irPara(id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      ativo
                        ? "bg-surface-elevated font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground",
                    )}
                  >
                    <Icone size={18} weight={ativo ? "fill" : "regular"} aria-hidden className="mt-px shrink-0" />
                    <span className="min-w-0">
                      <span className="block whitespace-nowrap">{t(ROTULO_DO_PAPEL[id])}</span>
                      <span className="hidden text-xs font-normal text-muted-foreground lg:block">
                        {t(FRASE_DO_PAPEL[id])}
                      </span>
                    </span>
                  </button>
                  {id === "conversa" && ativo ? (
                    <ol className="mt-1 mb-2 hidden space-y-0.5 border-l border-border pl-2 ml-5 lg:block">
                      {SECOES.map((secao) => (
                        <li key={secao.id}>
                          <a
                            href={`#secao-${secao.id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              rolarPara(secao.id);
                            }}
                            aria-current={secaoVisivel === secao.id ? "location" : undefined}
                            className={cn(
                              "block rounded-md px-2 py-1.5 transition-colors",
                              secaoVisivel === secao.id
                                ? "bg-ia-fundo text-foreground"
                                : "text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground",
                            )}
                          >
                            <span className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate">{t(secao.indice)}</span>
                              {errosPorSecao[secao.id] ? (
                                <span
                                  className="size-2 shrink-0 rounded-full bg-error"
                                  title={t("Há um campo a corrigir nesta parte.")}
                                />
                              ) : null}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {resumoDaSecao[secao.id]}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          {papel === "seguranca" ? <PainelDeSeguranca /> : null}

          {papel === "operacao" ? (
            <PainelDoOperador
              enabled={form.operator_enabled}
              onEnabledChange={(v) => patch({ operator_enabled: v })}
              model={form.operator_model}
              onModelChange={(v) => patch({ operator_model: v })}
              provider={form.provider}
              toolIds={form.operator_tool_ids}
              onToolIdsChange={(ids) => patch({ operator_tool_ids: ids })}
              modeloDoConversador={form.model}
              agentId={props.mode === "edit" ? props.agent.id : null}
              disabled={disabled}
            />
          ) : null}

          {/* Fica na aba de OPERAÇÃO e não na de conversa: é permissão de mexer em
              negócio, não de falar com cliente — a mesma separação que a spec 16
              impôs no resto da tela. */}
          {papel === "operacao" ? (
            <FunisDoAgente
              funis={funis}
              cobertura={props.cobertura}
              value={form.pipeline_ids}
              onChange={(ids) => patch({ pipeline_ids: ids })}
              disabled={disabled}
            />
          ) : null}

          {/* Galeria de modelos por ramo (#92): só na criação — num agente que já existe,
              trocar de modelo apagaria o que o dono configurou. */}
          {!isEdit && papel === "conversa" ? (
            <ModelosDoAgente
              idioma={idiomaDoModelo}
              escolhido={modeloEscolhido}
              onEscolher={(id) => {
                const campos = aplicarModelo(id, idiomaDoModelo);
                setModeloEscolhido(id);
                patch({
                  // O nome só é sugerido se o dono ainda não digitou o dele.
                  ...(form.name.trim() === "" ? { name: campos.name } : {}),
                  system_prompt: campos.system_prompt,
                  profile_persona: campos.profile_persona,
                  profile_tone: campos.profile_tone,
                  profile_objective: campos.profile_objective,
                  profile_welcome: campos.profile_welcome,
                  profile_language: campos.profile_language,
                  restrict_topics: campos.restrict_topics,
                  allowed_topics: campos.allowed_topics.join("\n"),
                  off_topic_reply: campos.off_topic_reply,
                  // O modelo também liga o que o agente pode fazer (decisão do dono: um
                  // conjunto por modelo), e o que mexe no funil já nasce com o funil de entrada.
                  ...(capacidadesPorModelo
                    ? {
                        tool_ids: capacidadesPorModelo[id].tool_ids,
                        pipeline_ids:
                          capacidadesPorModelo[id].usa_funil && funilPadraoId ? [funilPadraoId] : [],
                      }
                    : {}),
                });
              }}
              disabled={disabled}
            />
          ) : null}

          <div className={papel === "conversa" ? "space-y-5" : "hidden"}>
            <SecaoDoAgente
              id="quem"
              Icone={IdentificationCard}
              titulo={t("Quem é este agente")}
              explicacao={t("Como a sua equipe reconhece este agente nas listas e na Inbox. O cliente não vê esta parte.")}
            >
              {isEdit ? null : (
                <div className="flex items-center gap-3">
                  <EscolherIcone
                    icone={iconeDaCriacao ?? sugerirIcone(form.name, form.description)}
                    onEscolher={setIconeDaCriacao}
                    tamanho="md"
                    disabled={disabled}
                  />
                  <p className="text-sm text-muted-foreground">
                    {t("O ícone é sugerido pelo nome. Clique nele para escolher outro.")}
                  </p>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="name">{t("Nome")}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  disabled={disabled}
                  maxLength={120}
                  aria-invalid={!!validation.name}
                />
                {validation.name ? (
                  <p className="text-xs text-destructive">{validation.name}</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">{t("Descrição")}</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  disabled={disabled}
                  rows={2}
                  maxLength={2000}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="priority">{t("Ordem de preferência (0 a 1000)")}</Label>
                <Input
                  id="priority"
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  value={form.priority}
                  onChange={(e) => patch({ priority: Number(e.target.value) })}
                  disabled={disabled}
                  aria-invalid={!!validation.priority}
                />
                {validation.priority ? (
                  <p className="text-xs text-destructive">{validation.priority}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Quando mais de um agente puder atender a mesma conversa, o de número maior tenta primeiro. Se você só tem um agente, pode deixar como está.",
                  )}
                </p>
              </div>
            </SecaoDoAgente>

            <SecaoDoAgente
              id="personalidade"
              Icone={Smiley}
              titulo={t("Como ele se apresenta")}
              explicacao={t("Muda o jeito como ele fala com o seu cliente: quem ele diz ser, o tom e sobre o que aceita conversar.")}
            >
              <PerfilGuiado
                semTitulo
                value={perfilDoFormulario(form)}
                onChange={(parte) =>
                  patch({
                    ...(parte.persona !== undefined ? { profile_persona: parte.persona } : {}),
                    ...(parte.tom !== undefined ? { profile_tone: parte.tom } : {}),
                    ...(parte.objetivo !== undefined ? { profile_objective: parte.objetivo } : {}),
                    ...(parte.boasVindas !== undefined ? { profile_welcome: parte.boasVindas } : {}),
                    ...(parte.idioma !== undefined ? { profile_language: parte.idioma } : {}),
                    ...(parte.restringirTemas !== undefined ? { restrict_topics: parte.restringirTemas } : {}),
                    ...(parte.temasPermitidos !== undefined ? { allowed_topics: parte.temasPermitidos } : {}),
                    ...(parte.respostaForaDoTema !== undefined
                      ? { off_topic_reply: parte.respostaForaDoTema }
                      : {}),
                  })
                }
                instrucoesLivres={form.system_prompt}
                disabled={disabled}
                erros={{
                  persona: validation.profile_persona,
                  objetivo: validation.profile_objective,
                  boasVindas: validation.profile_welcome,
                  temasPermitidos: validation.allowed_topics,
                  respostaForaDoTema: validation.off_topic_reply,
                }}
              />
              <Subsecao>
                <details
                  open={avancadoVisivel}
                  onToggle={(e) => {
                    const aberto = (e.currentTarget as HTMLDetailsElement).open;
                    if (aberto !== avancadoAberto) setAvancadoAberto(aberto);
                  }}
                  data-testid="modo-avancado"
                  className="space-y-2"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {t("Avançado: instruções livres e temperatura")}
                  </summary>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "As instruções livres continuam valendo por inteiro: o perfil acima entra antes delas, e nada do que você escrever aqui é trocado.",
                    )}
                  </p>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{t("As instruções dele")}</h3>
                    <div className="flex items-center gap-2">
                      {/* O contador é o aviso que chega ANTES do erro: quem cola um
                          texto grande vê na hora que ele não vai caber, em vez de
                          descobrir depois — ou nunca. */}
                      <span
                        data-testid="contador-do-prompt"
                        className={
                          form.system_prompt.trim().length > 20000
                            ? "text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {form.system_prompt.trim().length.toLocaleString("pt-BR")}/20.000
                      </span>
                      <TokenCounter
                        text={form.system_prompt}
                        contextWindow={modelMeta?.context_window ?? null}
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <Textarea
                    value={form.system_prompt}
                    onChange={(e) => patch({ system_prompt: e.target.value })}
                    disabled={disabled}
                    rows={12}
                    /**
                     * SEM `maxLength`, e é o conserto — não um esquecimento.
                     *
                     * O navegador aplica o atributo na COLAGEM, sem evento e sem
                     * aviso: o que passa do limite não entra no campo. Cinco versões
                     * de um agente em produção foram salvas com exatamente 19.999
                     * caracteres, a última cortada no meio de uma frase, e o aviso
                     * logo acima — "passaram de 20.000" — era inalcançável, porque o
                     * estado nunca podia exceder o teto que o atributo já impunha.
                     *
                     * Sem ele o texto inteiro entra, a validação dispara e o autor lê
                     * quanto precisa cortar. Limite que recusa é honesto; limite que
                     * corta em silêncio faz o autor publicar o que não escreveu.
                     */
                    spellCheck={false}
                    className="font-mono text-xs"
                    aria-invalid={!!validation.system_prompt}
                  />
                  {validation.system_prompt ? (
                    <p className="text-xs text-destructive">{validation.system_prompt}</p>
                  ) : null}

                  <div className="space-y-1 pt-2">
                    <Label htmlFor="temperature">{t("Temperatura (0 a 1)")}</Label>
                    <Input
                      id="temperature"
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      placeholder={t("Vazio = padrão do modelo")}
                      value={form.temperature === null ? "" : String(form.temperature)}
                      onChange={(e) => {
                        const raw = e.target.value;
                        patch({ temperature: raw === "" ? null : Number(raw) });
                      }}
                      disabled={disabled}
                      aria-invalid={!!validation.temperature}
                    />
                    {validation.temperature ? (
                      <p className="text-xs text-destructive">{validation.temperature}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Perto de 0, as respostas ficam mais previsíveis; perto de 1, mais variadas. Se você não entende o parâmetro, deixe em branco.",
                      )}
                    </p>
                  </div>
                </details>
              </Subsecao>
            </SecaoDoAgente>

            <SecaoDoAgente
              id="respostas"
              Icone={ChatsCircle}
              titulo={t("Jeito de responder")}
              explicacao={t("O formato das mensagens que chegam ao cliente: um texto único ou várias mensagens curtas, e se ele também responde em áudio.")}
            >
              <Subsecao titulo={t("Estilo de resposta")}>
                <div className="flex items-center gap-2">
                  <Switch
                    id="split_messages"
                    checked={form.split_messages}
                    onCheckedChange={(v) => patch({ split_messages: v })}
                    disabled={disabled}
                  />
                  <Label htmlFor="split_messages">
                    {t("Responder em várias mensagens curtas (como uma pessoa digita)")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Em vez de um bloco único, a resposta sai em bolhas separadas, espaçadas pelo mesmo ritmo anti-banimento do envio. O agente também é instruído a escrever em parágrafos curtos.",
                  )}
                </p>
                {form.split_messages ? (
                  <div className="space-y-1">
                    <Label htmlFor="split_max_chars">{t("Tamanho máximo por bolha (80–4000)")}</Label>
                    <Input
                      id="split_max_chars"
                      type="number"
                      min={80}
                      max={4000}
                      step={20}
                      value={form.split_max_chars}
                      onChange={(e) => patch({ split_max_chars: Number(e.target.value) })}
                      disabled={disabled}
                      aria-invalid={!!validation.split_max_chars}
                    />
                    {validation.split_max_chars ? (
                      <p className="text-xs text-destructive">{validation.split_max_chars}</p>
                    ) : null}
                  </div>
                ) : null}
              </Subsecao>
              <Subsecao>
                <RespostaEmAudioDoAgente
                  value={{
                    enabled: form.audio_reply_enabled,
                    voiceId: form.audio_reply_voice_id,
                    modelId: form.audio_reply_model_id,
                  }}
                  onChange={(v) =>
                    patch({
                      audio_reply_enabled: v.enabled,
                      audio_reply_voice_id: v.voiceId,
                      audio_reply_model_id: v.modelId,
                    })
                  }
                  disabled={disabled}
                  riscoDeBanimento={channelSession?.riscoDeBanimento === true}
                />
              </Subsecao>
            </SecaoDoAgente>

            <SecaoDoAgente
              id="conhecimento"
              Icone={BookOpen}
              titulo={t("O que ele consulta antes de responder")}
              explicacao={t("Marque o material do seu negócio que este assistente pode ler. Ele procura ali antes de responder, em vez de improvisar — e cita de onde tirou.")}
            >
              <BasesDoAgente
                semTitulo
                materiais={materiais}
                value={form.knowledge_source_ids}
                onChange={(ids) => patch({ knowledge_source_ids: ids })}
                disabled={disabled}
              />
            </SecaoDoAgente>

            <SecaoDoAgente
              id="capacidades"
              Icone={PuzzlePiece}
              titulo={t("O que o agente pode fazer")}
              explicacao={t("Ligue por jornada de trabalho. O agente só consegue fazer o que estiver ligado aqui — e o que estiver ligado, ele fará sozinho durante o atendimento.")}
            >
              <ToolPicker
                value={form.tool_ids}
                onChange={(ids) => patch({ tool_ids: ids })}
                externas={{
                  value: form.external_tool_ids,
                  onChange: (ids) => patch({ external_tool_ids: ids }),
                }}
                disabled={disabled}
              />
              {validation.tool_ids ? (
                <p className="text-xs text-destructive">{validation.tool_ids}</p>
              ) : null}
            </SecaoDoAgente>

            <SecaoDoAgente
              id="onde"
              Icone={WhatsappLogo}
              titulo={t("Onde e quando ele atende")}
              explicacao={t("Por qual número de WhatsApp ele responde e em que situações ele entra na conversa sozinho.")}
            >
              <Subsecao titulo={t("Por qual número ele atende")}>
                {props.routerMembership && (
                  <div className="flex items-start gap-2 rounded-md bg-accent-soft p-3 text-xs text-text-muted">
                    <Info className="mt-0.5 shrink-0" aria-hidden />
                    <p>
                      {t("Este agente é acionado pelo roteador")}{" "}
                      <Link
                        href={`/app/ai/routers/${props.routerMembership.routerId}`}
                        className="font-medium underline underline-offset-2"
                      >
                        «{props.routerMembership.routerName}»
                      </Link>{" "}
                      {t("— o campo de número abaixo não se aplica.")}
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="channel_session_id">{t("Número conectado")}</Label>
                  <Select
                    value={form.channel_session_id || undefined}
                    onValueChange={(v) => patch({ channel_session_id: v })}
                    disabled={disabled}
                  >
                    <SelectTrigger id="channel_session_id">
                      <SelectValue placeholder={t("Selecione um número")} />
                    </SelectTrigger>
                    <SelectContent>
                      {props.channelSessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {/*
                            O estado vinha CRU daqui — a opção lia "org_2dd5e6ea ·
                            STARTING", juntando o identificador interno da sessão com
                            o enum em inglês do banco. O nome agora nunca é o
                            identificador (ver `nomeDoCanal`), e o estado passa pela
                            mesma tradução que a tela de Conexões usa.
                          */}
                          {s.display_name}
                          {s.phone_number ? ` · ${s.phone_number}` : ""} ·{" "}
                          {rotuloDoEstadoDoCanal(s.status, t)}
                        </SelectItem>
                      ))}
                      {props.channelSessions.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          {t("Nenhum número conectado")}
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                  {/*
                    NÃO é erro: é o estado normal de quem ainda não pareou o aparelho.
                    Antes, esta linha era vermelha e vinha de `validation`, que também
                    travava o botão de salvar — o dono de uma instalação nova escrevia
                    o prompt inteiro e não conseguia guardar nada.
                  */}
                  {!form.channel_session_id ? (
                    <p className="text-xs text-muted-foreground">
                      {props.channelSessions.length === 0 ? (
                        <>
                          {t("Nenhum número conectado ainda — o rascunho salva sem ele.")}{" "}
                          <Link
                            href="/app/connections"
                            className="font-medium text-foreground underline underline-offset-4"
                          >
                            {t("Conectar WhatsApp")}
                          </Link>{" "}
                          {t("para poder publicar.")}
                        </>
                      ) : (
                        t("Escolha o número para poder publicar. Sem ele, o rascunho salva mas não atende.")
                      )}
                    </p>
                  ) : null}
                </div>
              </Subsecao>
              <Subsecao titulo={t("Quando ele entra em ação")}>
                <TriggerEditor
                  value={form.trigger_config}
                  onChange={(v) => patch({ trigger_config: v })}
                  disabled={disabled}
                  organizationTimezone={props.organizationTimezone}
                />
              </Subsecao>
            </SecaoDoAgente>

            <SecaoDoAgente
              id="pessoas"
              Icone={PassagemParaHumano}
              titulo={t("Passar para uma pessoa")}
              explicacao={t("Quando ele chama alguém da equipe, e como vocês assumem ou devolvem a conversa.")}
            >
              <Subsecao>
                <div className="flex items-center gap-2">
                  <Switch
                    id="handoff_tool_enabled"
                    checked={form.handoff_tool_enabled}
                    onCheckedChange={(v) => patch({ handoff_tool_enabled: v })}
                    disabled={disabled}
                  />
                  <Label htmlFor="handoff_tool_enabled">
                    {t("Deixar o agente chamar uma pessoa quando perceber que não é caso dele")}
                  </Label>
                </div>
                <HandoffKeywordsInput
                  value={form.handoff_keywords}
                  onChange={(v) => patch({ handoff_keywords: v })}
                  disabled={disabled}
                />
              </Subsecao>
              <Subsecao titulo={t("Pedir ajuda sem sair da conversa")}>
                <div className="flex items-center gap-2">
                  <Switch
                    id="cases_enabled"
                    checked={form.cases_enabled}
                    onCheckedChange={(v) => patch({ cases_enabled: v })}
                    disabled={disabled}
                  />
                  <Label htmlFor="cases_enabled">
                    {t("Deixar o agente pedir uma tarefa a alguém e seguir conversando")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Diferente de passar a conversa: aqui o agente continua atendendo. Quando esbarra em algo que só uma pessoa resolve — aprovar um desconto, por exemplo — ele abre um pedido interno e retoma assim que for respondido.",
                  )}
                </p>
              </Subsecao>
              {isEdit && (
                <Subsecao>
                  <ComandosDoCelular
                  agentId={props.agent.id}
                  inicial={(props.agent.config ?? {}).aceita_comandos_celular}
                  disabled={disabled}
                  />
                </Subsecao>
              )}
            </SecaoDoAgente>

            <SecaoDoAgente
              id="vendas"
              Icone={HandCoins}
              titulo={t("Propostas e retornos")}
              explicacao={t("Se ele pode montar um orçamento quando o cliente pede, e se volta a procurar quem parou de responder.")}
            >
              <Subsecao titulo={t("Propostas comerciais")}>
                <div className="flex items-center gap-2">
                  <Switch
                    id="proposal_ai_draft_enabled"
                    checked={form.proposal_ai_draft_enabled}
                    onCheckedChange={(v) => patch({ proposal_ai_draft_enabled: v })}
                    disabled={disabled}
                  />
                  <Label htmlFor="proposal_ai_draft_enabled">
                    {t("Deixar o agente rascunhar uma proposta quando o cliente pedir orçamento")}
                  </Label>
                </div>
              </Subsecao>
              <Subsecao titulo={t("Follow-up")}>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Retomar sozinho quem parou de responder, para o interessado não sumir sem ninguém perceber.",
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Switch
                    id="callback_enabled"
                    checked={form.followup.callback_enabled}
                    onCheckedChange={(v) =>
                      patch({ followup: { ...form.followup, callback_enabled: v } })
                    }
                    disabled={disabled}
                  />
                  <Label htmlFor="callback_enabled">
                    {t("Permitir que o agente marque novos retornos por conta própria")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Desligar impede novos retornos prometidos pelo agente. Os fluxos configurados abaixo e a consulta ou o cancelamento de retornos existentes continuam disponíveis.",
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Switch
                    id="followup_enabled"
                    checked={form.followup.enabled}
                    onCheckedChange={(v) =>
                      patch({ followup: { ...form.followup, enabled: v } })
                    }
                    disabled={disabled}
                  />
                  <Label htmlFor="followup_enabled">
                    {t("Habilitar gatilhos automáticos de follow-up")}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Os fluxos abaixo só entram em ação para um cliente se este agente estiver publicado com follow-up habilitado.",
                  )}
                </p>
                <FollowupWindowEditor
                  value={form.followup.send_window ?? null}
                  onChange={(send_window) =>
                    patch({ followup: { ...form.followup, send_window } })
                  }
                  disabled={disabled || !form.followup.enabled}
                />
                <FollowupFlowPicker
                  value={form.followup.flow_pointer_ids}
                  onChange={(ids) =>
                    patch({ followup: { ...form.followup, flow_pointer_ids: ids } })
                  }
                  disabled={disabled}
                />
              </Subsecao>
            </SecaoDoAgente>

            <SecaoDoAgente
              id="inteligencia"
              Icone={Brain}
              titulo={t("Inteligência e limites")}
              explicacao={t("Qual inteligência artificial escreve as respostas, com qual chave, e até onde ele pode ir em cada atendimento. Se não sabe o que mudar aqui, deixe como está.")}
            >
              <Subsecao titulo={t("A inteligência que ele usa")}>
                <div className="space-y-1">
                  <Label htmlFor="provider">{t("Empresa de inteligência artificial")}</Label>
                  <Select
                    value={form.provider}
                    onValueChange={(v) => changeProvider(v as Provider)}
                    disabled={disabled}
                  >
                    <SelectTrigger id="provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/*
                        Derivado de PROVEDORES, nunca escrito à mão: esta lista tinha
                        três itens fixos enquanto o sistema executava quatro, e a
                        OpenRouter — a opção [1] do instalador — não aparecia. Um
                        agente publicado nela abria com o campo em BRANCO, porque
                        nenhum item casava com o valor, e o primeiro save silencioso
                        trocava o provedor do dono por outro.
                      */}
                      {PROVEDORES.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <ModelPicker
                  provider={form.provider}
                  value={form.model}
                  onChange={(modelId) => patch({ model: modelId })}
                  disabled={disabled}
                  id="model"
                />
                {validation.model ? (
                  <p className="text-xs text-destructive">{validation.model}</p>
                ) : null}

                <CredentialPicker
                  provider={form.provider}
                  credentials={props.credentials}
                  value={form.credential_id}
                  onChange={(id) => patch({ credential_id: id })}
                  disabled={disabled}
                  id="credential_id"
                  instalacaoTemChave={(props.provedoresDaInstalacao ?? []).includes(form.provider)}
                />
                {validation.credential_id ? (
                  <p className="text-xs text-destructive">{validation.credential_id}</p>
                ) : null}
                {cred && credSt && credSt !== "validated" ? (
                  <p className="text-xs text-warning-fg">
                    {t("Credencial selecionada está com status")} {t(STATUS_LABEL[credSt])}
                    {t(". Publish bloqueado até validar.")}
                  </p>
                ) : null}
              </Subsecao>
              <Subsecao titulo={t("Freios de segurança")}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="max_steps">{t("Ações por atendimento (1 a 25)")}</Label>
                    <Input
                      id="max_steps"
                      type="number"
                      min={1}
                      max={25}
                      value={form.max_steps}
                      onChange={(e) => patch({ max_steps: Number(e.target.value) })}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="token_budget">{t("Volume de texto por atendimento")}</Label>
                    <Input
                      id="token_budget"
                      type="number"
                      min={1000}
                      max={500000}
                      step={1000}
                      value={form.token_budget}
                      onChange={(e) => patch({ token_budget: Number(e.target.value) })}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="cost_budget_cents">{t("Custo máximo por atendimento (centavos)")}</Label>
                    <Input
                      id="cost_budget_cents"
                      type="number"
                      min={1}
                      max={10000}
                      value={form.cost_budget_cents}
                      onChange={(e) => patch({ cost_budget_cents: Number(e.target.value) })}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="history_message_window">{t("Mensagens anteriores que ele lê")}</Label>
                    <Input
                      id="history_message_window"
                      type="number"
                      min={0}
                      max={200}
                      value={form.history_message_window}
                      onChange={(e) =>
                        patch({ history_message_window: Number(e.target.value) })
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="history_token_window">{t("Tamanho máximo desse histórico")}</Label>
                    <Input
                      id="history_token_window"
                      type="number"
                      min={0}
                      max={50000}
                      step={500}
                      value={form.history_token_window}
                      onChange={(e) =>
                        patch({ history_token_window: Number(e.target.value) })
                      }
                      disabled={disabled}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="inbound_debounce_ms">
                      {t("Esperar antes de responder (segundos)")}
                    </Label>
                    <Input
                      id="inbound_debounce_ms"
                      type="number"
                      min={0}
                      max={60}
                      step={1}
                      placeholder={t("Vazio = padrão da instalação")}
                      value={
                        form.inbound_debounce_ms === null
                          ? ""
                          : String(Math.round(form.inbound_debounce_ms / 1000))
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        // Vazio = usa a env da instalação (campo null). A UI fala em
                        // SEGUNDOS; o banco e o worker falam em ms (conversão aqui,
                        // num ponto só). Teto de 60s no campo espelha o do worker.
                        patch({
                          inbound_debounce_ms:
                            raw === ""
                              ? null
                              : Math.round(Math.max(0, Math.min(60, Number(raw))) * 1000),
                        });
                      }}
                      disabled={disabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Mensagens do mesmo contato dentro desse tempo viram uma resposta só. Vazio usa a janela padrão da instalação (máximo 60 segundos).",
                      )}
                    </p>
                  </div>
                </div>
              </Subsecao>
            </SecaoDoAgente>
          </div>
        </div>
      </div>

      {/* Publish dialog */}
      {isEdit && props.draft ? (
        <PublishConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          draft={props.draft}
          published={props.published}
          onConfirm={handlePublish}
          isPending={publishing}
        />
      ) : null}
    </div>
  );
}
