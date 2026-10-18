-- manifest: **Servidores MCP externos para o agente (issue #96, parte da #86).** Tabela `mcp_servers` (o servidor de terceiro que um administrador cadastra: endereço, credencial cifrada e nunca devolvida, cabeçalho que a leva, último teste de conexão — server-side only como `agent_external_tools`) e, em `agent_external_tools`, a coluna `kind` (`webhook` | `mcp`) com as colunas da ferramenta escolhida num servidor (`mcp_server_id`, `mcp_tool_name`, impressão da definição, dica de risco do servidor); `url` e a chave de assinatura passam a ser nulas SÓ para `mcp`, e um CHECK de forma garante que cada tipo tem exatamente as suas colunas. O interruptor da organização mora em `organizations.settings.mcp_externo` (desligado por padrão), sem migration.
-- 0553 — Servidores MCP externos para o agente.
--
-- O agente passa a poder usar as ferramentas de um servidor MCP de terceiros. A #94 deu
-- o registro de ferramentas externas (webhook) e a #95 a aprovação das que alteram algo;
-- esta etapa acrescenta o SEGUNDO tipo de ferramenta externa, que entra no mesmo registro
-- e herda tudo: o seletor do agente, o teto de 27 capacidades, a chave «pedir aprovação»,
-- o pedido na Central, a execução única e a expiração.
--
--   * `mcp_servers` — o servidor, por organização. Server-side only (RLS ligada, zero
--     policies, grants revogados de anon/authenticated): a linha carrega a credencial
--     (cifrada por `fn_encrypt_oauth`; não é hash porque precisa ser USADA a cada
--     chamada) e quem lê é o servidor, com o filtro de organização à mão. A tela vê só
--     os 4 últimos caracteres. `auth_header` diz em que cabeçalho a credencial viaja
--     (`authorization` = `Bearer <credencial>`; outro nome = o valor cru).
--   * `agent_external_tools.kind` — `webhook` (as linhas de sempre) ou `mcp`: uma ferramenta
--     que o servidor oferece e o administrador escolheu. As linhas `mcp` NÃO têm endereço
--     nem chave de assinatura (o endereço é o do servidor; DIRC: uma fonte só), e têm
--     `mcp_server_id` + `mcp_tool_name` (o nome NO servidor, o que `tools/call` envia). Um
--     CHECK de forma amarra cada tipo às suas colunas: uma linha `mcp` sem servidor, ou
--     `webhook` sem endereço, não existe.
--   * FK composta `(organization_id, mcp_server_id)`: a ferramenta nunca aponta para o
--     servidor de OUTRA organização, nem por escrita direta com a service key.
--   * `mcp_definition_hash` — a impressão do que o servidor declarou (descrição + esquema)
--     quando o administrador escolheu a ferramenta. O agente usa a definição que o
--     administrador viu; se o servidor muda a ferramenta depois, a tela avisa.
--   * `mcp_hint_read_only` — o que o servidor DECLAROU (`readOnlyHint`). É só uma dica para
--     a tela: o risco que vale é `effect`, que nasce `altera` e só o administrador muda.
--
-- Função NOVA em `public`: nenhuma ⇒ o item 9 da doutrina de migrations não é acionado.
-- O vocabulário `kind` é `text` + CHECK (não enum) e vive no TypeScript em
-- `lib/ai/ferramentas-externas/tipos.ts` (TIPOS_DA_FERRAMENTA), vigiado por
-- `tests/invariants/vocabulario-banco-x-typescript.test.ts`.

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  url text not null,
  -- Em que cabeçalho a credencial viaja. `authorization` manda `Bearer <credencial>`.
  auth_header text not null default 'authorization',
  credential_encrypted bytea,
  -- Para a tela reconhecer QUAL credencial está gravada sem ver a credencial.
  credential_last4 text,
  active boolean not null default true,
  -- O que o servidor disse de si na última conexão que deu certo.
  server_name text,
  server_version text,
  last_check_at timestamptz,
  last_check_ok boolean,
  -- Vocabulário fechado em TypeScript (MOTIVOS_DE_FALHA); null quando deu certo.
  last_check_reason text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mcp_servers_name_len check (char_length(name) between 3 and 60),
  constraint mcp_servers_url_len check (char_length(url) between 8 and 2000),
  constraint mcp_servers_auth_header_check check (auth_header ~ '^[A-Za-z][A-Za-z0-9-]{0,39}$'),
  constraint mcp_servers_credential_pair check ((credential_encrypted is null) = (credential_last4 is null)),
  -- O alvo da FK composta de `agent_external_tools`.
  constraint mcp_servers_org_id_uk unique (organization_id, id)
);

create unique index if not exists mcp_servers_org_name_uk
  on public.mcp_servers (organization_id, lower(name));

comment on table public.mcp_servers is
  'Servidor MCP de terceiro que o agente pode usar (issue #96). Por organização. Server-side only: RLS ligada sem policies e grants revogados de anon/authenticated; a credencial nunca volta ao browser.';
comment on column public.mcp_servers.credential_encrypted is
  'Cifrada por fn_encrypt_oauth (pgp_sym/aes256), a mesma cifra de agent_external_tools, channel_sessions e voice_provider_credentials. Enviada a cada chamada no cabeçalho auth_header. Nula = servidor sem credencial.';
comment on column public.mcp_servers.auth_header is
  'Nome do cabeçalho que leva a credencial. authorization = "Bearer <credencial>"; outro nome = o valor cru.';

alter table public.mcp_servers enable row level security;
revoke all on public.mcp_servers from anon, authenticated;
grant select, insert, update, delete on public.mcp_servers to service_role;

drop trigger if exists trg_mcp_servers_updated_at on public.mcp_servers;
create trigger trg_mcp_servers_updated_at
  before update on public.mcp_servers
  for each row execute function public.fn_set_updated_at();

-- ─── A ferramenta que vem de um servidor MCP entra no mesmo registro ───────

alter table public.agent_external_tools
  add column if not exists kind text not null default 'webhook',
  add column if not exists mcp_server_id uuid,
  add column if not exists mcp_tool_name text,
  add column if not exists mcp_definition_hash text,
  add column if not exists mcp_hint_read_only boolean;

alter table public.agent_external_tools alter column url drop not null;
alter table public.agent_external_tools alter column signing_secret_encrypted drop not null;
alter table public.agent_external_tools alter column signing_secret_last4 drop not null;

alter table public.agent_external_tools drop constraint if exists agent_external_tools_kind_check;
alter table public.agent_external_tools
  add constraint agent_external_tools_kind_check check (kind in ('webhook', 'mcp'));

-- Cada tipo tem exatamente as suas colunas. As linhas de antes são todas `webhook` (o default) e já
-- têm endereço e chave: o CHECK vale sem tocar em nenhuma.
alter table public.agent_external_tools drop constraint if exists agent_external_tools_kind_shape;
alter table public.agent_external_tools
  add constraint agent_external_tools_kind_shape check (
    (kind = 'webhook'
      and url is not null
      and signing_secret_encrypted is not null
      and signing_secret_last4 is not null
      and mcp_server_id is null
      and mcp_tool_name is null)
    or
    (kind = 'mcp'
      and url is null
      and signing_secret_encrypted is null
      and signing_secret_last4 is null
      and mcp_server_id is not null
      and mcp_tool_name is not null)
  );

alter table public.agent_external_tools drop constraint if exists agent_external_tools_mcp_tool_name_len;
alter table public.agent_external_tools
  add constraint agent_external_tools_mcp_tool_name_len
  check (mcp_tool_name is null or char_length(mcp_tool_name) between 1 and 128);

-- A ferramenta nunca aponta para o servidor de OUTRA organização. MATCH SIMPLE: a linha `webhook`
-- (servidor nulo) não é conferida.
alter table public.agent_external_tools drop constraint if exists agent_external_tools_mcp_server_fk;
alter table public.agent_external_tools
  add constraint agent_external_tools_mcp_server_fk
  foreign key (organization_id, mcp_server_id)
  references public.mcp_servers (organization_id, id) on delete cascade;

-- Uma ferramenta do servidor entra no registro uma vez só.
create unique index if not exists agent_external_tools_mcp_uk
  on public.agent_external_tools (organization_id, mcp_server_id, mcp_tool_name)
  where kind = 'mcp';

create index if not exists agent_external_tools_mcp_server_idx
  on public.agent_external_tools (mcp_server_id)
  where mcp_server_id is not null;

comment on column public.agent_external_tools.kind is
  'webhook = o endereço que a pessoa cadastrou e o ZapSales assina (#94). mcp = uma ferramenta que um servidor MCP de terceiro oferece e o administrador escolheu (#96): sem endereço nem chave de assinatura, com mcp_server_id e mcp_tool_name.';
comment on column public.agent_external_tools.mcp_tool_name is
  'O nome da ferramenta NO servidor MCP (o que tools/call envia). O nome que o modelo vê é ext_<slug>.';
comment on column public.agent_external_tools.mcp_definition_hash is
  'SHA-256 da descrição + esquema que o servidor declarou quando o administrador escolheu a ferramenta. Mudou na descoberta seguinte = a tela avisa; o agente segue com a definição que o administrador viu.';
comment on column public.agent_external_tools.mcp_hint_read_only is
  'O que o servidor DECLAROU (annotations.readOnlyHint). Só uma dica para a tela: o risco que vale é effect.';

notify pgrst, 'reload schema';
