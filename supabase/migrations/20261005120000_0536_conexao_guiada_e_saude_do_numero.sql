-- manifest: **Conexão guiada e saúde do número oficial (issue #5).** `channel_sessions` ganha o par do app PRÓPRIO do número (`meta_app_secret_encrypted`/`meta_verify_token_encrypted`, cifrados por fn_encrypt_oauth — o webhook daquele número confere a assinatura com ele, e a sessão sem par segue no app da instalação), o uso declarado (`uso_declarado`: atendimento/campanha/ambos, com CHECK), a saúde que a Meta empurra pelo webhook (`meta_qualidade`, `meta_limite_de_mensagens`, `meta_saude_evento`, `meta_saude_em`, sem CHECK porque o vocabulário é da Meta) e quando o assistente registrou o número (`meta_numero_registrado_em`). `platform_meta_app` ganha `app_id`, `embedded_signup_config_id` e a chave `embedded_signup_ligado` (default false): o Embedded Signup só aparece quando quem administra a instalação liga. Idempotente.

-- 0536: conexão guiada e saúde do número oficial.
--
-- ─── O par do app PRÓPRIO do número ─────────────────────────────────────────
--
-- O assistente recebe o token do System User, o App Secret e o verify token do
-- app que o administrador criou na Meta. A Meta assina a entrega do webhook com
-- o segredo do app INSCRITO na WABA — o dele —, então o segredo é do número, não
-- da instalação. Cifrados pelas MESMAS RPCs do token (fn_encrypt_oauth), nunca
-- voltam para a tela. Nulos = o número usa o app da instalação (desenho Tech
-- Provider, `platform_meta_app`), e é o estado de todo canal anterior a esta
-- migration. As duas colunas andam juntas: o código só usa o par inteiro.
--
-- Exposição: as colunas herdam o acesso das vizinhas (`meta_token_encrypted`
-- já vive aqui, cifrado, sob a RLS de isolamento por organização). Nenhum grant
-- novo, nenhuma policy nova.
--
-- ─── Uso declarado ──────────────────────────────────────────────────────────
--
-- O administrador diz se o número é de atendimento, de campanha ou de ambos. É
-- vocabulário NOSSO e fechado — por isso tem CHECK (o mesmo de
-- `lib/channels/uso.ts`). Nulo = não declarado (canal conectado antes desta
-- migration); a tela pede a declaração em vez de inventar uma.
--
-- ─── Saúde do número ────────────────────────────────────────────────────────
--
-- Qualidade e limite de mensagens chegam pelo webhook da Meta
-- (`phone_number_quality_update`) e pela leitura do número na conexão. São
-- vocabulário da META (`GREEN`/`YELLOW`/`RED`, `TIER_250`…`TIER_UNLIMITED`), que
-- ela estende quando quer — CHECK aqui faria o webhook de um valor novo falhar
-- no UPDATE, e a doutrina proíbe constraint em vocabulário aberto. A leitura
-- tolerante mora em `lib/channels/meta/saude-do-numero.ts`. Colunas, e não o
-- `metadata` jsonb: a tela lê a cada render (anti-pattern 6).

alter table public.channel_sessions
  add column if not exists meta_app_secret_encrypted bytea,
  add column if not exists meta_verify_token_encrypted bytea,
  add column if not exists uso_declarado text,
  add column if not exists meta_qualidade text,
  add column if not exists meta_limite_de_mensagens text,
  add column if not exists meta_saude_evento text,
  add column if not exists meta_saude_em timestamptz,
  add column if not exists meta_numero_registrado_em timestamptz;

-- Valor fora do vocabulário antes da constraint: a coluna é nova, mas o bloco é
-- re-aplicado na atualização e não pode derrubar o update de um clone.
update public.channel_sessions
   set uso_declarado = null
 where uso_declarado is not null
   and uso_declarado not in ('atendimento', 'campanha', 'ambos');

alter table public.channel_sessions drop constraint if exists channel_sessions_uso_declarado_check;
alter table public.channel_sessions add constraint channel_sessions_uso_declarado_check
  check (uso_declarado is null or uso_declarado in ('atendimento', 'campanha', 'ambos'));

comment on column public.channel_sessions.meta_app_secret_encrypted is
  'App Secret do app da Meta que o administrador trouxe pelo assistente (issue #5), cifrado por fn_encrypt_oauth. O webhook deste número confere a assinatura com ele. Nulo = vale o app da instalação (platform_meta_app). Nunca volta para a tela.';
comment on column public.channel_sessions.meta_verify_token_encrypted is
  'Verify token do webhook deste número (par de meta_app_secret_encrypted), cifrado por fn_encrypt_oauth. Vai no override do webhook e responde ao handshake. Nulo = vale o da instalação.';
comment on column public.channel_sessions.uso_declarado is
  'Para que o administrador declarou o número: atendimento, campanha ou ambos. Nulo = não declarado. Orienta o motor de campanhas; não trava envio.';
comment on column public.channel_sessions.meta_qualidade is
  'Qualidade do número na Meta (GREEN, YELLOW, RED, UNKNOWN), da conexão e do webhook phone_number_quality_update. Vocabulário da Meta, sem CHECK.';
comment on column public.channel_sessions.meta_limite_de_mensagens is
  'Limite de mensagens do portfólio (TIER_250 … TIER_UNLIMITED), da conexão e do webhook. Vocabulário da Meta, sem CHECK.';
comment on column public.channel_sessions.meta_saude_evento is
  'Último evento de saúde que a Meta empurrou para o número (FLAGGED, UNFLAGGED, UPGRADE, DOWNGRADE…).';
comment on column public.channel_sessions.meta_saude_em is
  'Quando a saúde do número foi atualizada pela última vez (conexão ou webhook).';
comment on column public.channel_sessions.meta_numero_registrado_em is
  'Quando o assistente registrou o número na Cloud API com o PIN (POST /{número}/register).';

-- ─── Embedded Signup: chave da instalação ───────────────────────────────────
--
-- O "Conectar com Facebook" depende de um app Tech Provider aprovado. Até lá ele
-- fica DESLIGADO — `embedded_signup_ligado` nasce false e só quem administra a
-- instalação o liga, junto do `app_id` e do `config_id` da configuração de login
-- criada no painel da Meta. A troca do código pelo token acontece no servidor,
-- com o App Secret desta mesma linha: nada disso vai para o navegador além do
-- `app_id` e do `config_id`, que são públicos por natureza (o SDK os exige).
alter table public.platform_meta_app
  add column if not exists app_id text,
  add column if not exists embedded_signup_config_id text,
  add column if not exists embedded_signup_ligado boolean not null default false;

comment on column public.platform_meta_app.app_id is
  'ID do app da Meta desta instalação (público): o SDK do Embedded Signup o exige, e a troca do código o envia como client_id.';
comment on column public.platform_meta_app.embedded_signup_config_id is
  'ID da configuração de login do Embedded Signup (painel da Meta › Facebook Login for Business).';
comment on column public.platform_meta_app.embedded_signup_ligado is
  'Chave da instalação: o botão Conectar com Facebook só aparece com ela ligada (e com app_id + config_id + App Secret). Default desligado até haver app Tech Provider aprovado.';

notify pgrst, 'reload schema';
