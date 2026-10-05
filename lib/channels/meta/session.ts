/**
 * Resolução da sessão dona de um webhook da Meta.
 *
 * Existe porque o `lint-channels` me pegou: a rota `/api/v1/webhooks/meta/[token]`
 * cravava `.eq("provider", "meta_cloud")`, e nome de provider fora de
 * `lib/channels/` viola o invariante 1 da doutrina de restrição de canal.
 *
 * A tentação era pôr a rota na allowlist do lint — afinal, um endpoint de webhook
 * É inerentemente específico do provider (o protocolo da Meta não é o do WAHA).
 * Mas allowlist sem conserto é dívida silenciosa: o nome continuaria espalhado, e a
 * próxima rota copiaria o padrão. Mover a query para cá custa 20 linhas e mantém a
 * regra valendo de verdade — a rota vira transporte puro e não sabe com quem fala.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "../archived";
import { CHANNEL_PROVIDER_META } from "../capabilities";

export interface MetaWebhookSession {
  id: string;
  organizationId: string;
  wabaId: string | null;
  /**
   * O par do app PRÓPRIO do número (assistente de conexão, issue #5), cifrado.
   * Ausente/nulo = o número usa o app da instalação. Quem decifra e decide é
   * `appDaMetaDoNumero` — a sessão só carrega as colunas.
   */
  appSecretCifrado?: string | null;
  verifyTokenCifrado?: string | null;
}

/**
 * A sessão oficial ATIVA da organização **e o número dela**.
 *
 * O par `(organization_id, meta_phone_number_id)` é a chave com que
 * `resolveMetaCreds` acha a credencial que o operador salvou na tela — a mesma porta
 * que `send`, `checkHealth` e `fetchInboundMedia` já usam. Mora aqui, e não na rota,
 * porque nome de provider fora de `lib/channels/` viola o invariante 1 (o
 * `lint-channels` pegou isso uma vez e a lição ficou); e existe como interface
 * própria para não obrigar a sessão do WEBHOOK, que não tem número, a carregar um
 * campo que ela nunca preenche.
 */
export interface MetaSessaoDaOrg extends MetaWebhookSession {
  /** `channel_sessions.meta_phone_number_id` — `null` em base anterior à 0144. */
  phoneNumberId: string | null;
}

/**
 * Sessão amarrada a este token de webhook. `null` = token desconhecido (a rota
 * responde 404 sem revelar por quê).
 *
 * O token no path é o que amarra o payload a UMA organização. O App Secret da Meta
 * é do APP e vale para todas as WABAs de todos os tenants — sozinho, ele autentica
 * a origem mas não decide o destino. Sem o token, quem conhecesse o segredo
 * escreveria em qualquer organização.
 *
 * Canal ARQUIVADO conta como token desconhecido, e essa é a única resposta
 * honesta: o usuário mandou excluir o canal. A exclusão já revoga a credencial e
 * rotaciona este token, mas o evento em voo (e a re-entrega que a plataforma faz
 * de tudo que não recebe 2xx) chegaria com o token antigo e ressuscitaria o
 * canal — criando contato, conversa e mensagem num inbox onde o operador nem
 * consegue responder, porque o arquivamento deixa a sessão STOPPED.
 */
export async function metaSessionByWebhookToken(
  token: string,
): Promise<MetaWebhookSession | null> {
  if (!token || token.length < 8) return null;

  const admin = createAdminClient();
  const base = (colunas: string) =>
    admin
      .from("channel_sessions")
      .select(colunas)
      .eq("webhook_path_token", token)
      .eq("provider", CHANNEL_PROVIDER_META);
  // O par do app próprio chega na 0536. Banco que ainda não a aplicou devolve
  // 42703 no select com as colunas novas — e perder a SESSÃO por causa de um
  // extra seria recusar toda entrega. Sem as colunas, vale o app da instalação.
  const ler = async (colunas: string) =>
    queryTolerantToMissingArchived(
      () => base(colunas).is(ARCHIVED_AT, null).maybeSingle(),
      () => base(colunas).maybeSingle(),
    );
  const comPar = await ler(
    "id, organization_id, meta_waba_id, meta_app_secret_encrypted, meta_verify_token_encrypted",
  );
  const { data } = comPar.error ? await ler("id, organization_id, meta_waba_id") : comPar;

  if (!data) return null;
  const linha = data as unknown as {
    id: string;
    organization_id: string;
    meta_waba_id: string | null;
    meta_app_secret_encrypted?: string | null;
    meta_verify_token_encrypted?: string | null;
  };
  return {
    id: linha.id,
    organizationId: linha.organization_id,
    wabaId: linha.meta_waba_id ?? null,
    appSecretCifrado: linha.meta_app_secret_encrypted ?? null,
    verifyTokenCifrado: linha.meta_verify_token_encrypted ?? null,
  };
}

/**
 * A sessão oficial ATIVA da organização (se houver). Usada pela tela de templates
 * para saber QUAL WABA espelhar — e para dizer ao operador o que fazer quando não
 * há nenhuma, em vez de mostrar uma tabela vazia sem explicação.
 *
 * Arquivada não conta: sem o filtro, a tela seguia nomeando a WABA de um canal
 * que o operador excluiu e o botão de sincronizar continuava puxando templates
 * dela — o token do env não foi revogado junto com o da linha, então a chamada
 * ia mesmo. "Excluído" que continua operando é a promessa quebrada.
 */
export async function metaSessionForOrg(
  organizationId: string,
): Promise<MetaSessaoDaOrg | null> {
  const admin = createAdminClient();
  const base = () =>
    admin
      .from("channel_sessions")
      // `meta_phone_number_id` entra na seleção porque é a segunda metade da chave da
      // credencial (`organization_id` + ele): sem o número, quem chama não tem como
      // pedir a credencial DESTA sessão e volta a olhar o ambiente — que é o defeito
      // que a fatia F4 da #850 fecha.
      .select("id, organization_id, meta_waba_id, meta_phone_number_id")
      .eq("organization_id", organizationId)
      .eq("provider", CHANNEL_PROVIDER_META)
      .order("created_at", { ascending: true })
      .limit(1);
  const { data } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );

  if (!data) return null;
  return {
    id: data.id,
    organizationId: data.organization_id,
    wabaId: data.meta_waba_id ?? null,
    phoneNumberId: data.meta_phone_number_id ?? null,
  };
}
