-- manifest: **Treino do agente por site (issue #93, parte da #86).** Tabela `ai_knowledge_source_pages` (uma linha por página de uma fonte do tipo `site`: endereço, estado `pendente`/`lida`/`falhou`, motivo, título, `content_hash`, trechos) com RLS por organização, e o CHECK de `ai_knowledge_sources.source_type` volta com o vocabulário fechado `faq|documento|conversas|catalogo|site` (nomes legados traduzidos antes; validação auto-curativa). Fontes existentes não mudam.
-- 0549 — O agente aprende com um SITE: o estado de cada página e o vocabulário de `source_type`.
--
-- Uma fonte do tipo `site` guarda uma LISTA de endereços (https, até 20 por padrão).
-- Cada endereço é uma linha em `ai_knowledge_source_pages`, com o que a tela precisa
-- mostrar ao dono do negócio: se a página foi lida ou falhou, e por quê; o título;
-- o `content_hash` do texto lido (é ele que faz a página inalterada não ser
-- reembedada); quantos trechos ela rendeu; e quando foi lida/quando mudou pela
-- última vez. O TEXTO da página não é guardado aqui: ele vive em `ai_chunks`, como o
-- de qualquer outro material — duplicar o texto seria uma segunda cópia a manter.
--
-- Tabela tenant-aware: `organization_id`, RLS ligada, leitura só para os membros da
-- organização. A ESCRITA é do servidor (service_role), que resolve a organização de
-- fonte confiável (sessão/evento) e filtra à mão — o mesmo desenho de `meta_message_costs`.
--
-- `ai_knowledge_sources.source_type`: o CHECK saiu na 0181 ("vocabulário aberto") e a
-- garantia passou a morar só no TypeScript. A #93 pede a restrição de volta no banco:
-- o vocabulário agora é FECHADO e vigiado por
-- `tests/invariants/vocabulario-banco-x-typescript.test.ts` contra
-- `IDS_DE_TIPO_DE_FONTE`. Os nomes legados são traduzidos ANTES (a 0181 já fez; um
-- clone que parou no meio do `update.sh` ainda pode ter linha antiga — e uma constraint
-- nova sobre dado velho é o que derruba a atualização), e a constraint entra `not valid`
-- seguida de uma validação que, se achar valor desconhecido, NÃO derruba a migration:
-- fica valendo para o que entra daqui em diante.
--
-- Função: nenhuma. O item 9 da doutrina de migrations não é acionado por este arquivo.

create table if not exists public.ai_knowledge_source_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_source_id uuid not null references public.ai_knowledge_sources(id) on delete cascade,
  url text not null,
  position integer not null default 0,
  status text not null default 'pendente',
  error_code text,
  error_message text,
  title text,
  content_hash text,
  chunks_count integer not null default 0,
  last_read_at timestamptz,
  last_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_knowledge_source_pages_status_check
    check (status in ('pendente', 'lida', 'falhou')),
  constraint ai_knowledge_source_pages_url_len
    check (char_length(url) between 9 and 2048),
  constraint ai_knowledge_source_pages_chunks_nonneg
    check (chunks_count >= 0)
);

comment on table public.ai_knowledge_source_pages is
  'Uma página de uma fonte de conhecimento do tipo site (issue #93): endereço, estado (pendente/lida/falhou), motivo da falha, título, hash do texto lido e trechos gerados. O texto em si vive em ai_chunks.';
comment on column public.ai_knowledge_source_pages.status is
  'pendente = ainda não lida; lida = o texto foi lido na última leitura; falhou = a última leitura falhou (error_code/error_message dizem por quê). Vocabulário em TypeScript: lib/ai/rag/ingest/site-paginas.ts (ESTADOS_DA_PAGINA).';
comment on column public.ai_knowledge_source_pages.content_hash is
  'SHA-256 do texto principal da última leitura bem-sucedida. Igual ao anterior = página inalterada: nenhum trecho é reembedado.';

create unique index if not exists ai_knowledge_source_pages_source_url_uk
  on public.ai_knowledge_source_pages (knowledge_source_id, url);
create index if not exists ai_knowledge_source_pages_org_idx
  on public.ai_knowledge_source_pages (organization_id);

drop trigger if exists trg_ai_knowledge_source_pages_updated_at on public.ai_knowledge_source_pages;
create trigger trg_ai_knowledge_source_pages_updated_at
  before update on public.ai_knowledge_source_pages
  for each row execute function public.fn_set_updated_at();

alter table public.ai_knowledge_source_pages enable row level security;
drop policy if exists tenant_isolation_ai_knowledge_source_pages_all on public.ai_knowledge_source_pages;
create policy tenant_isolation_ai_knowledge_source_pages_all on public.ai_knowledge_source_pages
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );
revoke all on public.ai_knowledge_source_pages from anon, authenticated;
grant select on public.ai_knowledge_source_pages to authenticated;
grant all on public.ai_knowledge_source_pages to service_role;

-- ─── O vocabulário de `source_type` volta a ser FECHADO ─────────────────────

update public.ai_knowledge_sources
   set source_type = case source_type
         when 'policy'            then 'documento'
         when 'conversation'      then 'conversas'
         when 'conversations'     then 'conversas'
         when 'nuvemshop_catalog' then 'catalogo'
         when 'catalog'           then 'catalogo'
         else source_type
       end
 where source_type in ('policy', 'conversation', 'conversations', 'nuvemshop_catalog', 'catalog');

alter table public.ai_knowledge_sources
  drop constraint if exists ai_knowledge_sources_source_type_check;
alter table public.ai_knowledge_sources
  add constraint ai_knowledge_sources_source_type_check
  check (source_type in ('faq', 'documento', 'conversas', 'catalogo', 'site')) not valid;

do $$
begin
  alter table public.ai_knowledge_sources validate constraint ai_knowledge_sources_source_type_check;
exception when others then
  -- Um valor desconhecido num clone antigo: a restrição segue valendo para as linhas novas
  -- e para as que forem alteradas; o dado velho não derruba a atualização.
  raise notice 'ai_knowledge_sources_source_type_check ficou NOT VALID: %', sqlerrm;
end $$;

comment on column public.ai_knowledge_sources.source_type is
  'Vocabulário FECHADO (CHECK da 0549): faq | documento | conversas | catalogo | site. A lista que a tela oferece vive em lib/ai/rag/tipos-de-fonte.ts, vigiada por tests/invariants/vocabulario-banco-x-typescript.test.ts.';
