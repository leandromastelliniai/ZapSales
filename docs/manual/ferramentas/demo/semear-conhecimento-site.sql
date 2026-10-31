-- Dados FICTÍCIOS: material do tipo Site com 4 páginas (lida, lida, falhou com 404, pendente). Nada lê o site de verdade.
-- Uso: psql -v ON_ERROR_STOP=1 -v org="'<uuid>'" -f semear-conhecimento-site.sql (depois de semear-ia-acompanhar.sql)
begin;
with s as (
  insert into ai_knowledge_sources (organization_id, source_type, name, status, is_active, source_metadata, last_index_status, last_index_error, last_indexed_at, chunks_count, ingested_at, created_at)
  values (:org,'site','Site da loja','ready',true,'{}','partial',null, now()-interval '2 hours',6, now()-interval '2 hours', now()-interval '1 day')
  returning id
)
insert into ai_knowledge_source_pages (organization_id, knowledge_source_id, url, position, status, error_code, error_message, title, content_hash, chunks_count, last_read_at, last_changed_at)
select :org, s.id, v.url, v.pos, v.st, v.cod, v.msg, v.titulo, v.hash, v.ch, v.lida, v.mudou
from s, (values
 ('https://loja-aurora.example/', 0, 'lida', null::text, null::text, 'Loja Aurora — Início', 'h-inicio', 4, now()-interval '2 hours', now()-interval '1 day'),
 ('https://loja-aurora.example/trocas-e-devolucoes', 1, 'lida', null, null, 'Trocas e devoluções', 'h-trocas', 2, now()-interval '2 hours', now()-interval '2 hours'),
 ('https://loja-aurora.example/promocoes-de-2025', 2, 'falhou', 'http_404', 'O site respondeu 404.', null, null, 0, now()-interval '2 hours', null),
 ('https://loja-aurora.example/contato', 3, 'pendente', null, null, null, null, 0, null, null)
) as v(url,pos,st,cod,msg,titulo,hash,ch,lida,mudou);
commit;
select (select count(*) from ai_knowledge_sources where organization_id=:org) fontes, (select count(*) from ai_knowledge_source_pages where organization_id=:org) paginas;
