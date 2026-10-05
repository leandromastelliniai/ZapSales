-- manifest: **Cópia da mídia do cabeçalho de modelo (issue #7).** `meta_templates` ganha `header_media` (jsonb objeto, default `{}`): onde está, no bucket `whatsapp-media` (`<org>/templates/<uuid>.<ext>`), a cópia de cada mídia de cabeçalho do modelo criado no editor, pela chave do slot do envio (`header:1`, `card0:header:1`) — a Meta guarda só a amostra da revisão, e o arquivo de cada disparo sai daqui. Sobrevive à sincronização, que não lista a coluna no upsert. Idempotente.

-- 0537: a cópia da mídia do cabeçalho de modelo.
--
-- ─── Por que uma coluna e não `saved_values` ────────────────────────────────
--
-- `saved_values` (0382) guarda LINKS públicos `https://` que o operador colou
-- para reaproveitar em cada disparo, e a rota de escrita recusa qualquer outra
-- coisa. A cópia que o editor guarda é um CAMINHO num bucket privado: quem
-- dispara assina o link na hora, com validade curta. Misturar os dois faria o
-- painel da janela fechada mandar um caminho à Meta como se fosse link.
--
-- ─── A chave é a do slot do envio ───────────────────────────────────────────
--
-- `header:1` para o cabeçalho e `card<i>:header:1` para o de cada card — a
-- mesma `slotKey` de `template_values` e de `saved_values`
-- (`lib/channels/meta/build-components.ts`). O valor é
-- `{ path, mime_type, file_name }`, montado por `midiasDoModelo`
-- (`lib/channels/meta/novo-modelo.ts`), que é o schema central desta coluna.
--
-- ─── A pasta não é podada ───────────────────────────────────────────────────
--
-- `fn_enfileirar_midia_vencida` (passo 2) só trata como órfão o que mora em
-- `<org>/<conversa>/…` e `<org>/avatars/…`; `<org>/templates/…` nunca entra.
-- O cabeçalho é reusado a cada disparo, por meses.
--
-- Exposição: a coluna herda o acesso das vizinhas (RLS de isolamento por
-- organização). Nenhum grant novo, nenhuma policy nova.

alter table public.meta_templates
  add column if not exists header_media jsonb not null default '{}'::jsonb;

alter table public.meta_templates
  drop constraint if exists meta_templates_header_media_objeto;
alter table public.meta_templates
  add constraint meta_templates_header_media_objeto
  check (jsonb_typeof(header_media) = 'object');

comment on column public.meta_templates.header_media is
  'Cópia, no bucket whatsapp-media (<org>/templates/<uuid>.<ext>), de cada mídia de cabeçalho do modelo criado no editor, pela chave do slot do envio (header:1, card0:header:1) → { path, mime_type, file_name }. Montado por midiasDoModelo (lib/channels/meta/novo-modelo.ts). Sobrevive à sincronização, que não lista esta coluna no upsert.';

notify pgrst, 'reload schema';
