/**
 * O ASSISTENTE DE CONEXÃO OFICIAL, do lado da Meta (issue #5).
 *
 * O administrador cola o token do System User (e o App Secret do app dele) e o
 * assistente faz o resto: diz o que está errado com a credencial — com a causa,
 * não "não deu" —, lista as contas e os números que o token alcança para a
 * pessoa ESCOLHER (ninguém digita id), mostra o checklist da Meta e, na
 * conexão, registra o número com o PIN e assina os campos do webhook no app.
 *
 * Mora em `lib/channels/meta/` pela catraca do canal (`pnpm lint:channels`):
 * chamada à Graph fora da fronteira não passa, e a rota não deve saber com quem
 * fala.
 *
 * ─── De onde vem cada diagnóstico (pesquisa na documentação, 05/10/2026) ────
 *
 * - **Token expirado/inválido e permissões**: `GET /debug_token` com o próprio
 *   token no cabeçalho. Erro 190 (subcódigo 463 = expirado), ou `is_valid:
 *   false`; `scopes` diz o que foi concedido e `granular_scopes[].target_ids`
 *   traz as WABAs que o token alcança — é daí que sai a lista, sem ninguém
 *   digitar id. O `input_token` vai na busca porque é assim que a Meta define a
 *   chamada; o mesmo valor já vai no cabeçalho dela, para ela, por TLS.
 * - **App Secret do app certo**: `appsecret_proof` (HMAC-SHA256 do token com o
 *   segredo). Prova errada é recusada pela Graph com código 100 — o segredo em
 *   si nunca sai daqui.
 * - **Modo de desenvolvimento**: a Meta NÃO expõe campo de modo no app (medido:
 *   o nó `Application` não tem). O sinal documentado é o `health_status` da WABA:
 *   a entidade `APP` em `LIMITED`/`BLOCKED` "confere a situação de revisão do
 *   app". É o que se usa aqui, com o motivo da Meta junto quando ela manda. Um
 *   app em Dev também não recebe webhook de produção — por isso bloqueia.
 * - **Forma de pagamento**: `primary_funding_id` da WABA. É inferência (a Meta
 *   não diz "tem cartão"), e por isso o item ORIENTA, não bloqueia — quem paga
 *   descobre pelo erro 131042 no envio, que o mapa de erros já traduz.
 * - **Empresa verificada**: `business_verification_status` da WABA.
 * - **Limite**: `whatsapp_business_manager_messaging_limit` (o
 *   `messaging_limit_tier` foi descontinuado quando o limite passou a ser do
 *   portfólio, em 2025).
 */
import { createHmac } from "node:crypto";

import { graphBaseUrl } from "./graph-base";

/** As duas permissões sem as quais o canal não funciona. */
export const PERMISSOES_NECESSARIAS = ["whatsapp_business_management", "whatsapp_business_messaging"] as const;

export type CodigoDoProblema =
  | "token_invalido"
  | "token_expirado"
  | "sem_permissao"
  | "app_em_desenvolvimento"
  | "segredo_nao_confere"
  | "sem_conta"
  | "rede";

/** Um problema que IMPEDE conectar — com a frase que a pessoa lê. */
export interface ProblemaDaCredencial {
  codigo: CodigoDoProblema;
  mensagem: string;
  /** O dado concreto (permissão que falta, texto da Meta). Não traduzido. */
  detalhe?: string | null;
}

/** Um aviso que NÃO impede conectar. */
export interface AvisoDaCredencial {
  codigo: "token_temporario";
  mensagem: string;
  detalhe?: string | null;
}

export type ItemDoChecklistMeta = "app_live" | "forma_de_pagamento" | "empresa_verificada";

export interface ItemDoChecklist {
  item: ItemDoChecklistMeta;
  estado: "ok" | "pendente" | "desconhecido";
  mensagem: string;
  /** O que a Meta disse, quando disse. */
  detalhe?: string | null;
}

export interface NumeroDaConta {
  id: string;
  numeroExibido: string | null;
  nomeVerificado: string | null;
  /** GREEN | YELLOW | RED | NA | UNKNOWN — vocabulário da Meta. */
  qualidade: string | null;
  /** TIER_250 … TIER_UNLIMITED — limite do portfólio. */
  limite: string | null;
  /** CONNECTED | PENDING | FLAGGED | RESTRICTED … */
  status: string | null;
  /** SANDBOX | LIVE */
  modo: string | null;
}

export interface ContaDoToken {
  wabaId: string;
  nome: string | null;
  checklist: ItemDoChecklist[];
  numeros: NumeroDaConta[];
  /** A conta não pôde ser lida (a lista vem vazia, e o motivo diz por quê). */
  erro: string | null;
}

export interface DiagnosticoDaCredencial {
  /** Sem problema que impeça conectar. */
  ok: boolean;
  problemas: ProblemaDaCredencial[];
  avisos: AvisoDaCredencial[];
  appId: string | null;
  permissoes: string[];
  contas: ContaDoToken[];
}

/** Teto de contas consultadas: um token de agência pode alcançar centenas. */
const MAX_CONTAS = 20;

interface ErroDaGraph {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
}

interface Resposta<T> {
  ok: boolean;
  status: number;
  corpo: T & { error?: ErroDaGraph };
  /** A chamada não chegou à Meta. */
  semRede?: string;
}

async function chamar<T>(
  caminho: string,
  token: string,
  init: { metodo?: "GET" | "POST"; busca?: Record<string, string>; corpo?: unknown; appSecret?: string | null } = {},
): Promise<Resposta<T>> {
  const busca = new URLSearchParams(init.busca ?? {});
  if (init.appSecret) busca.set("appsecret_proof", provaDoSegredo(token, init.appSecret));
  const qs = busca.toString();
  try {
    const res = await fetch(`${graphBaseUrl()}${caminho}${qs ? `?${qs}` : ""}`, {
      method: init.metodo ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.corpo !== undefined ? { body: JSON.stringify(init.corpo) } : {}),
    });
    const corpo = (await res.json().catch(() => ({}))) as T & { error?: ErroDaGraph };
    return { ok: res.ok && !corpo.error, status: res.status, corpo };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      corpo: {} as T & { error?: ErroDaGraph },
      semRede: err instanceof Error ? err.message : "erro",
    };
  }
}

/** HMAC-SHA256 do token com o App Secret, em hex — o `appsecret_proof` da Graph. */
export function provaDoSegredo(token: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(token).digest("hex");
}

/** O texto útil do erro da Graph: `error_data.details` diz mais que `message`. */
function textoDoErro(erro: ErroDaGraph | undefined, status: number): string {
  return erro?.error_data?.details ?? erro?.message ?? `http_${status}`;
}

const MENSAGEM: Record<CodigoDoProblema, string> = {
  token_expirado:
    "O token expirou. Gere um token PERMANENTE do usuário do sistema em Configurações do negócio › Usuários do sistema › Gerar token, sem data de validade.",
  token_invalido:
    "Este token não é válido. Confira se copiou o token inteiro do usuário do sistema — sem espaços e sem cortar o final.",
  sem_permissao:
    "O token não tem as permissões do WhatsApp. Gere o token de novo marcando whatsapp_business_management e whatsapp_business_messaging.",
  app_em_desenvolvimento:
    "O app da Meta não está liberado para produção — em geral porque está em modo de desenvolvimento. Coloque-o em Live no painel de apps da Meta; em desenvolvimento a Meta não entrega as mensagens dos clientes. O motivo que a Meta informou aparece abaixo.",
  segredo_nao_confere:
    "A chave secreta não é do mesmo app do token. Copie a chave secreta do app em Configurações do app › Básico, no app em que o token foi gerado.",
  sem_conta:
    "O token não alcança nenhuma conta do WhatsApp Business. Em Configurações do negócio › Usuários do sistema, atribua a conta do WhatsApp ao usuário do sistema e gere o token de novo.",
  rede: "Não consegui falar com a Meta agora. Confira a conexão do servidor e tente de novo — o token pode estar certo.",
};

function problema(codigo: CodigoDoProblema, detalhe?: string | null): ProblemaDaCredencial {
  return { codigo, mensagem: MENSAGEM[codigo], ...(detalhe ? { detalhe } : {}) };
}

/** O erro de leitura do token, na causa que a pessoa consegue corrigir. */
function problemaDoErroDoToken(erro: ErroDaGraph | undefined, status: number): ProblemaDaCredencial {
  const texto = textoDoErro(erro, status);
  if (erro?.code === 100 && /appsecret_proof/i.test(erro.message ?? "")) {
    return problema("segredo_nao_confere");
  }
  if (erro?.code === 190 && erro.error_subcode === 463) return problema("token_expirado", texto);
  if (/expired/i.test(erro?.message ?? "")) return problema("token_expirado", texto);
  return problema("token_invalido", texto);
}

interface DebugToken {
  data?: {
    app_id?: string;
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
    error?: { code?: number; subcode?: number; message?: string };
  };
}

/**
 * Testa a credencial e devolve o que a pessoa precisa para escolher o número.
 * Nunca lança: rede caída é um problema com nome, não uma exceção.
 */
export async function diagnosticarCredencial(input: {
  token: string;
  appSecret?: string | null;
  agora?: Date;
}): Promise<DiagnosticoDaCredencial> {
  const agora = input.agora ?? new Date();
  const vazio = (problemas: ProblemaDaCredencial[]): DiagnosticoDaCredencial => ({
    ok: false,
    problemas,
    avisos: [],
    appId: null,
    permissoes: [],
    contas: [],
  });

  const dbg = await chamar<DebugToken>("/debug_token", input.token, {
    busca: { input_token: input.token },
    appSecret: input.appSecret,
  });
  if (dbg.semRede) return vazio([problema("rede", dbg.semRede)]);
  if (!dbg.ok) return vazio([problemaDoErroDoToken(dbg.corpo.error, dbg.status)]);

  const dados = dbg.corpo.data ?? {};
  if (dados.is_valid === false) {
    const expirou =
      dados.error?.subcode === 463 ||
      (typeof dados.expires_at === "number" && dados.expires_at > 0 && dados.expires_at * 1000 <= agora.getTime());
    return vazio([problema(expirou ? "token_expirado" : "token_invalido", dados.error?.message ?? null)]);
  }

  const permissoes = (dados.scopes ?? []).filter((s): s is string => typeof s === "string");
  const faltando = PERMISSOES_NECESSARIAS.filter((p) => !permissoes.includes(p));
  if (faltando.length > 0) {
    return { ...vazio([problema("sem_permissao", faltando.join(", "))]), appId: dados.app_id ?? null, permissoes };
  }

  const avisos: AvisoDaCredencial[] = [];
  if (typeof dados.expires_at === "number" && dados.expires_at > 0) {
    avisos.push({
      codigo: "token_temporario",
      mensagem:
        "Este token tem data para expirar. Funciona agora, mas o canal para quando ele vencer — prefira um token permanente do usuário do sistema.",
      detalhe: new Date(dados.expires_at * 1000).toISOString(),
    });
  }

  // As contas: primeiro a permissão de GERENCIAR (é ela que lista números), e a
  // de mensagens como reserva. A Meta põe a conta mais recente primeiro.
  const alvos = (escopo: string) =>
    (dados.granular_scopes ?? []).find((g) => g.scope === escopo)?.target_ids ?? [];
  const wabaIds = [
    ...new Set([...alvos("whatsapp_business_management"), ...alvos("whatsapp_business_messaging")]),
  ].slice(0, MAX_CONTAS);
  if (wabaIds.length === 0) {
    return { ...vazio([problema("sem_conta")]), appId: dados.app_id ?? null, permissoes, avisos };
  }

  const contas = await Promise.all(wabaIds.map((wabaId) => lerConta(wabaId, input.token, input.appSecret ?? null)));

  const problemas: ProblemaDaCredencial[] = [];
  const appParado = contas
    .flatMap((c) => c.checklist)
    .find((i) => i.item === "app_live" && i.estado === "pendente");
  if (appParado) problemas.push(problema("app_em_desenvolvimento", appParado.detalhe ?? null));

  return {
    ok: problemas.length === 0,
    problemas,
    avisos,
    appId: dados.app_id ?? null,
    permissoes,
    contas,
  };
}

interface EntidadeDeSaude {
  entity_type?: string;
  can_send_message?: string;
  errors?: Array<{ error_code?: number; error_description?: string; possible_solution?: string }>;
  additional_info?: string[];
}

interface NoDaWaba {
  name?: string;
  business_verification_status?: string;
  primary_funding_id?: string;
  health_status?: { can_send_message?: string; entities?: EntidadeDeSaude[] };
}

interface NumeroDaGraph {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  status?: string;
  account_mode?: string;
  whatsapp_business_manager_messaging_limit?: string;
}

const CAMPOS_DA_WABA = "name,business_verification_status,primary_funding_id,account_review_status,health_status";
const CAMPOS_DO_NUMERO =
  "id,display_phone_number,verified_name,quality_rating,code_verification_status,status,name_status,account_mode,whatsapp_business_manager_messaging_limit";

async function lerConta(wabaId: string, token: string, appSecret: string | null): Promise<ContaDoToken> {
  const [no, numeros] = await Promise.all([
    chamar<NoDaWaba>(`/${wabaId}`, token, { busca: { fields: CAMPOS_DA_WABA }, appSecret }),
    chamar<{ data?: NumeroDaGraph[] }>(`/${wabaId}/phone_numbers`, token, {
      busca: { fields: CAMPOS_DO_NUMERO, limit: "100" },
      appSecret,
    }),
  ]);

  const erro = !no.ok
    ? no.semRede ?? textoDoErro(no.corpo.error, no.status)
    : !numeros.ok
      ? numeros.semRede ?? textoDoErro(numeros.corpo.error, numeros.status)
      : null;

  return {
    wabaId,
    nome: no.ok ? (no.corpo.name ?? null) : null,
    checklist: no.ok ? checklistDaConta(no.corpo) : checklistDesconhecido(),
    numeros: numeros.ok
      ? (numeros.corpo.data ?? [])
          .filter((n): n is NumeroDaGraph & { id: string } => typeof n.id === "string" && n.id.length > 0)
          .map((n) => ({
            id: n.id,
            numeroExibido: n.display_phone_number ?? null,
            nomeVerificado: n.verified_name ?? null,
            qualidade: n.quality_rating ?? null,
            limite: n.whatsapp_business_manager_messaging_limit ?? null,
            status: n.status ?? null,
            modo: n.account_mode ?? null,
          }))
      : [],
    erro,
  };
}

function checklistDesconhecido(): ItemDoChecklist[] {
  return [
    { item: "app_live", estado: "desconhecido", mensagem: "Não deu para conferir a situação do app na Meta." },
    { item: "forma_de_pagamento", estado: "desconhecido", mensagem: "Não deu para conferir a forma de pagamento." },
    { item: "empresa_verificada", estado: "desconhecido", mensagem: "Não deu para conferir a verificação da empresa." },
  ];
}

/** O checklist da Meta para UMA conta. Pendente orienta; só o app parado bloqueia. */
export function checklistDaConta(no: NoDaWaba): ItemDoChecklist[] {
  const app = (no.health_status?.entities ?? []).find((e) => e.entity_type === "APP");
  const estadoDoApp = (app?.can_send_message ?? "").toUpperCase();
  const motivoDoApp =
    app?.errors?.map((e) => e.error_description).filter(Boolean).join("; ") ||
    app?.additional_info?.join("; ") ||
    null;

  const verificacao = (no.business_verification_status ?? "").toLowerCase();

  return [
    !app || !estadoDoApp
      ? { item: "app_live", estado: "desconhecido", mensagem: "A Meta não informou a situação do app." }
      : estadoDoApp === "AVAILABLE"
        ? { item: "app_live", estado: "ok", mensagem: "App liberado para enviar (Live)." }
        : {
            item: "app_live",
            estado: "pendente",
            mensagem: "O app não está liberado: coloque-o em Live no painel de apps da Meta.",
            detalhe: motivoDoApp,
          },
    no.primary_funding_id
      ? { item: "forma_de_pagamento", estado: "ok", mensagem: "Forma de pagamento cadastrada." }
      : {
          item: "forma_de_pagamento",
          estado: "pendente",
          mensagem:
            "Nenhuma forma de pagamento na conta. Cadastre no WhatsApp Manager › Faturamento — sem ela, só as mensagens de atendimento grátis saem.",
        },
    !verificacao
      ? { item: "empresa_verificada", estado: "desconhecido", mensagem: "A Meta não informou a verificação da empresa." }
      : verificacao === "verified"
        ? { item: "empresa_verificada", estado: "ok", mensagem: "Empresa verificada na Meta." }
        : {
            item: "empresa_verificada",
            estado: "pendente",
            mensagem:
              "A empresa ainda não foi verificada na Meta. Sem a verificação, o limite de mensagens fica baixo. Faça em Central de segurança do negócio.",
            detalhe: verificacao,
          },
  ];
}

/**
 * O PORTFÓLIO de negócio dono da WABA (`owner_business_info.id`) — o limite
 * diário de mensagens é dele, compartilhado por todos os números de todas as
 * WABAs do portfólio (issue #9). Melhor esforço: `null` quando a Graph não
 * responde ou não diz, e o motor de campanhas trata o número como de portfólio
 * desconhecido (conta junto com todos os oficiais da organização).
 */
export async function lerPortfolioDaConta(input: {
  wabaId: string;
  token: string;
  appSecret?: string | null;
}): Promise<string | null> {
  const r = await chamar<{ owner_business_info?: { id?: unknown } }>(`/${input.wabaId}`, input.token, {
    busca: { fields: "owner_business_info" },
    appSecret: input.appSecret ?? null,
  });
  const id = r.ok ? r.corpo.owner_business_info?.id : null;
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

/** O motivo do registro recusado — o PIN tem nome próprio. */
const MOTIVO_DO_REGISTRO: Record<number, string> = {
  133005: "PIN incorreto. Use o PIN de confirmação em duas etapas que já está no número, ou crie um novo de 6 dígitos no WhatsApp Manager.",
  133006: "O número ainda não foi verificado por código (SMS ou ligação) no WhatsApp Manager.",
  133008: "Tentativas de PIN demais. A Meta bloqueou novas tentativas por algumas horas.",
  133009: "O PIN foi enviado rápido demais. Espere um minuto e tente de novo.",
  133015: "O número foi apagado há pouco. Espere 5 minutos e tente de novo.",
  133016: "Registros demais para este número: a Meta permite 10 em 72 horas.",
};

/**
 * Registra o número na Cloud API com o PIN de confirmação em duas etapas.
 * Número já registrado aceita o registro de novo com o MESMO PIN.
 */
export async function registrarNumero(input: {
  phoneNumberId: string;
  token: string;
  pin: string;
}): Promise<{ ok: true } | { ok: false; motivo: string; codigo: number | null }> {
  const r = await chamar<{ success?: boolean }>(`/${input.phoneNumberId}/register`, input.token, {
    metodo: "POST",
    corpo: { messaging_product: "whatsapp", pin: input.pin },
  });
  if (r.semRede) return { ok: false, motivo: MENSAGEM.rede, codigo: null };
  if (r.ok) return { ok: true };
  const codigo = r.corpo.error?.code ?? null;
  return {
    ok: false,
    codigo,
    motivo: (codigo !== null ? MOTIVO_DO_REGISTRO[codigo] : undefined) ?? textoDoErro(r.corpo.error, r.status),
  };
}

/**
 * Os campos que a Meta SÓ entrega na URL do APP — nunca no override do número
 * nem no da WABA (documentação de overrides, 05/10/2026): modelos (status,
 * qualidade e categoria), qualidade do
 * número, limite do portfólio e conta. `messages` vai junto para o app inteiro
 * cair no mesmo endereço quando não houver override.
 */
export const CAMPOS_DO_WEBHOOK_DO_APP = [
  "messages",
  "smb_message_echoes",
  "message_template_status_update",
  // Qualidade e categoria do modelo (issue #6): a recategorização muda o custo,
  // e sem estes dois campos ela só apareceria na próxima sincronização manual.
  "message_template_quality_update",
  "template_category_update",
  "phone_number_quality_update",
  "business_capability_update",
  "account_update",
] as const;

/**
 * Aponta o webhook do APP para o endereço deste número — só quando o app é do
 * administrador (ele trouxe o App Secret). Sem isto a saúde do número nunca
 * chegaria: `phone_number_quality_update` não aceita override.
 *
 * O token do app (`{app_id}|{app_secret}`) vai no CORPO, nunca na URL.
 */
export async function assinarCamposDoApp(input: {
  appId: string;
  appSecret: string;
  callbackUrl: string;
  verifyToken: string;
}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const corpo = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: input.callbackUrl,
    verify_token: input.verifyToken,
    fields: CAMPOS_DO_WEBHOOK_DO_APP.join(","),
    include_values: "true",
    access_token: `${input.appId}|${input.appSecret}`,
  });
  try {
    const res = await fetch(`${graphBaseUrl()}/${input.appId}/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
    });
    const r = (await res.json().catch(() => ({}))) as { success?: boolean; error?: ErroDaGraph };
    if (res.ok && !r.error) return { ok: true };
    return { ok: false, motivo: textoDoErro(r.error, res.status) };
  } catch (err) {
    return { ok: false, motivo: `${MENSAGEM.rede} (${err instanceof Error ? err.message : "erro"})` };
  }
}

/**
 * O App Secret é do app deste token? A conexão confere de novo, no servidor, o
 * que o diagnóstico já mostrou na tela: o corpo do POST não é fonte de verdade.
 * Devolve o `app_id` — é com ele que os campos do webhook são assinados no app.
 *
 * `GET /app` devolve o app dono do token, e o `appsecret_proof` prova o segredo
 * sem mandá-lo. Ao contrário do `debug_token` do diagnóstico, o token aqui vai
 * SÓ no cabeçalho — a conexão inteira não põe o token em URL nenhuma.
 */
export async function conferirSegredoDoApp(input: {
  token: string;
  appSecret: string;
}): Promise<{ ok: true; appId: string } | { ok: false; problema: ProblemaDaCredencial }> {
  const r = await chamar<{ id?: string }>("/app", input.token, {
    busca: { fields: "id" },
    appSecret: input.appSecret,
  });
  if (r.semRede) return { ok: false, problema: problema("rede", r.semRede) };
  if (!r.ok) return { ok: false, problema: problemaDoErroDoToken(r.corpo.error, r.status) };
  if (!r.corpo.id) return { ok: false, problema: problema("token_invalido") };
  return { ok: true, appId: r.corpo.id };
}
