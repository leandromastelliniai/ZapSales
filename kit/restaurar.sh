#!/usr/bin/env bash
# kit/restaurar.sh — traz o ZapSales de volta a partir da cópia semanal (restic/R2).
#
#   sudo kit/restaurar.sh ensaio [--snapshot ID] [--porta 18088]
#       Restaura num AMBIENTE SEPARADO nesta mesma VPS (outro projeto do
#       Compose, outros volumes, outra porta no loopback) e prova que o app
#       abre e que os dados voltaram. Não toca na instalação que está no ar.
#       É o teste mensal de restauração (docs/runbooks/backup-e-restauracao.md).
#   sudo kit/restaurar.sh ensaio --remover
#       Derruba o ensaio e apaga os volumes dele.
#   sudo kit/restaurar.sh desastre [--snapshot ID]
#       VPS NOVA, perdida a antiga: restaura na pasta deste kit e termina com o
#       kit/instalar.sh (proxy, backups, tudo de pé com as sessões do WhatsApp).
#
# Nos dois casos as credenciais do R2 e a senha do restic precisam estar em
# /etc/zapsales/backup.env (kit/backup.sh configurar-r2, com a MESMA senha).
#
# ═══ POR QUE O ENSAIO NÃO SOBE WORKER, AGENDADOR NEM WHATSAPP ═══
#
# O banco restaurado tem campanhas, follow-ups e filas como estavam. Um worker
# de pé no ensaio as executaria DE NOVO, para clientes reais; e um WAHA com as
# sessões restauradas disputaria o número com o WAHA de produção. O ensaio sobe
# só o que prova a restauração: banco, Supabase, app e o proxy da stack. As
# sessões do WhatsApp são conferidas como arquivos, não conectadas.
set -Eeuo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ_KIT="$(dirname "$KIT")"
RAIZ="$RAIZ_KIT"
# shellcheck source=lib/comum.sh
. "$KIT/lib/comum.sh"
# shellcheck source=lib/stack.sh
. "$KIT/lib/stack.sh"
# shellcheck source=lib/restic.sh
. "$KIT/lib/restic.sh"

MODO="${1:-}"
shift || true
SNAPSHOT="latest"
PORTA="18088"
REMOVER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot) SNAPSHOT="$2"; shift 2 ;;
    --porta) PORTA="$2"; shift 2 ;;
    --remover) REMOVER=1; shift ;;
    *) falha "Opção desconhecida: $1" ;;
  esac
done

DESTINO_ENSAIO="/opt/zapsales-ensaio"
PREPARO="/var/tmp/zapsales-restauro"

exigir_root

# ─── Peças comuns ────────────────────────────────────────────────────────────

baixar_snapshot() {
  passo "Baixando o snapshot '$SNAPSHOT' de $RESTIC_REPOSITORY"
  rm -rf "$PREPARO"
  mkdir -p "$PREPARO"
  chmod 700 "$PREPARO"
  restic_ -v "$PREPARO:/restauro" restore "$SNAPSHOT" --host zapsales --target /restauro
  [ -s "$PREPARO/backup/preparo/banco/zapsales.dump" ] || falha "O snapshot não tem o dump do banco."
  [ -s "$PREPARO/backup/preparo/config/.env" ] || falha "O snapshot não tem o .env da instalação."
  msg "  banco: $(du -h "$PREPARO/backup/preparo/banco/zapsales.dump" | cut -f1) · mídias: $(du -sh "$PREPARO/backup/storage" 2>/dev/null | cut -f1) · sessões do WhatsApp: $(find "$PREPARO/backup/preparo/waha-sessoes" -type f | wc -l) arquivo(s)"
  sed 's/^/  origem: /' "$PREPARO/backup/preparo/config/origem" 2>/dev/null || true
}

# json_texto VALOR — o valor escapado para dentro de uma string JSON (aspas e
# barra invertida), para uma senha com `"` não quebrar o corpo da requisição.
json_texto() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# copiar_para_volume ORIGEM VOLUME — conteúdo da pasta para dentro do volume.
copiar_para_volume() {
  docker volume create "$2" >/dev/null
  docker run --rm --memory 256m --cpus 0.5 -v "$1:/de:ro" -v "$2:/para" --entrypoint /bin/sh "$IMAGEM_RESTIC" -c 'cp -a /de/. /para/'
}

# restaurar_banco — banco NOVO da instalação em RAIZ: schema pelo baseline e
# DADOS pelo dump. O dump não é aplicado inteiro de propósito: os schemas
# internos do Supabase (realtime, extensões, papéis) já nascem certos no banco
# novo, e reaplicá-los por cima briga com o que a imagem criou. Voltam os
# dados de quem é dado: public, private, auth e storage.
restaurar_banco() {
  passo "Subindo um banco novo e aplicando o schema"
  dc up -d db
  esperar "Banco" 180 banco_aceita_conexao || falha "O banco não subiu."
  dc up -d auth rest storage realtime
  esperar "Schemas do Auth e do Storage" 240 schemas_do_supabase_prontos || falha "Auth/Storage não criaram os schemas."
  aplicar_schema

  passo "Restaurando os dados do dump"
  dc cp "$PREPARO/backup/preparo/banco/zapsales.dump" db:/tmp/restauro.dump >/dev/null
  # O índice do dump, filtrado: só os DADOS dos quatro schemas, e nunca as
  # tabelas de controle de migration do Auth e do Storage (o contêiner novo
  # já as preencheu, na versão dele).
  dc exec -T db pg_restore -l /tmp/restauro.dump \
    | grep -E '^[0-9]+; [0-9]+ [0-9]+ (TABLE DATA|SEQUENCE SET) (public|private|auth|storage) ' \
    | grep -vE ' TABLE DATA auth schema_migrations | TABLE DATA storage migrations ' > "$PREPARO/indice"
  msg "  $(grep -c 'TABLE DATA' "$PREPARO/indice") tabelas e $(grep -c 'SEQUENCE SET' "$PREPARO/indice") sequências a restaurar."
  dc cp "$PREPARO/indice" db:/tmp/restauro.indice >/dev/null
  # O baseline semeia linhas (catálogos, buckets) que o dump também traz:
  # esvazia antes, numa transação só com a carga.
  psql_admin <<'SQL'
-- Um NOTICE por tabela alcançada pelo cascade afogaria a saída do ensaio.
set client_min_messages = warning;
do $$
declare r record;
begin
  for r in
    select schemaname, tablename from pg_tables
     where schemaname in ('public', 'private', 'auth', 'storage')
       and not (schemaname = 'auth' and tablename = 'schema_migrations')
       and not (schemaname = 'storage' and tablename = 'migrations')
  loop
    execute format('truncate table %I.%I cascade', r.schemaname, r.tablename);
  end loop;
end $$;
SQL
  dc exec -T db pg_restore -U supabase_admin -h localhost -d postgres \
    --data-only --disable-triggers --single-transaction --exit-on-error \
    -L /tmp/restauro.indice /tmp/restauro.dump \
    || falha "O pg_restore falhou (nada foi gravado: a carga é uma transação só)."
  dc exec -T db rm -f /tmp/restauro.dump /tmp/restauro.indice
  reiniciar_realtime
}

restaurar_arquivos() { # so-midias | com-sessoes-do-whatsapp
  passo "Restaurando as mídias"
  copiar_para_volume "$PREPARO/backup/storage" "$(volume_do_projeto supabase-storage)"
  if [ "$1" = "com-sessoes-do-whatsapp" ]; then
    passo "Restaurando as sessões do WhatsApp e a mídia do WAHA"
    copiar_para_volume "$PREPARO/backup/preparo/waha-sessoes" "$(volume_do_projeto waha-data)"
    copiar_para_volume "$PREPARO/backup/waha-midia" "$(volume_do_projeto waha-media)"
  fi
}

conferir_contagens() {
  passo "Conferindo os dados contra a contagem gravada no backup"
  local esperado="$PREPARO/backup/preparo/banco/contagem.tsv" obtido="$PREPARO/contagem-restaurada.tsv"
  contar_linhas > "$obtido"
  local ruim=0 t n m
  while IFS=$'\t' read -r t n; do
    m="$(awk -F'\t' -v t="$t" '$1 == t {print $2}' "$obtido")"
    if [ "$n" = "$m" ]; then msg "  ✓ $t: $m"; else msg "  ✗ $t: backup $n, restaurado ${m:-ausente}"; ruim=1; fi
  done < "$esperado"
  [ "$ruim" = "0" ] || falha "Os dados restaurados não batem com o backup."
}

# ─── Ensaio ──────────────────────────────────────────────────────────────────

ensaio_remover() {
  passo "Removendo o ensaio"
  if [ -f "$DESTINO_ENSAIO/.env" ]; then
    RAIZ="$DESTINO_ENSAIO" dc down -v --remove-orphans || true
  fi
  rm -rf "$DESTINO_ENSAIO" "$PREPARO"
  msg "  ensaio removido; a instalação no ar não foi tocada."
}

ensaio() {
  [ "$REMOVER" = "1" ] && { ensaio_remover; return; }
  [ -f "$RAIZ_KIT/.env" ] || falha "Rode o ensaio na VPS de uma instalação (falta $RAIZ_KIT/.env)."
  carregar_r2
  [ -e "$DESTINO_ENSAIO" ] && falha "Já existe um ensaio em $DESTINO_ENSAIO. Remova antes: sudo $0 ensaio --remover"
  grep -qE "[:.]$PORTA\$" <<<"$(ss -ltn | awk '{print $4}')" && falha "A porta $PORTA está ocupada; escolha outra com --porta."
  baixar_snapshot

  passo "Montando o ambiente separado em $DESTINO_ENSAIO"
  mkdir -p "$DESTINO_ENSAIO"
  # O mesmo código da instalação no ar — a restauração de um backup se faz
  # com a versão que o gerou (o baseline e o dump têm de concordar).
  tar -C "$RAIZ_KIT" --exclude=./.env --exclude=./.git --exclude=./node_modules -cf - . | tar -C "$DESTINO_ENSAIO" -xf -
  cp -p "$PREPARO/backup/preparo/config/.env" "$DESTINO_ENSAIO/.env"
  chmod 600 "$DESTINO_ENSAIO/.env"
  local url="http://localhost:$PORTA" env="$DESTINO_ENSAIO/.env"
  env_definir "$env" COMPOSE_PROJECT_NAME zapsales-ensaio
  env_definir "$env" ZAPSALES_PORTA_LOCAL "$PORTA"
  env_definir "$env" DOMAIN localhost
  env_definir "$env" NEXT_PUBLIC_APP_URL "$url"
  env_definir "$env" NEXT_PUBLIC_ADMIN_URL "$url"
  env_definir "$env" NEXT_PUBLIC_SUPABASE_URL "$url"
  # As imagens do app são as da instalação no ar (no modo `construir` elas só
  # existem neste disco, com a tag que o .env de produção registra).
  for k in APP_IMAGE WORKER_IMAGE SCHEDULER_IMAGE COMPOSE_FILE APP_VERSION; do
    env_definir "$env" "$k" "$(env_ler "$RAIZ_KIT/.env" "$k")"
  done
  RAIZ="$DESTINO_ENSAIO"

  restaurar_banco
  restaurar_arquivos so-midias
  passo "Subindo só o app e o proxy do ensaio (sem worker, agendador nem WhatsApp)"
  dc up -d --no-deps redis srh app
  esperar "App do ensaio" 240 servico_saudavel app || falha "O app do ensaio não ficou saudável."
  dc up -d --no-deps caddy
  esperar "Proxy do ensaio" 60 servico_saudavel caddy || falha "O proxy do ensaio não subiu."
  conferir_contagens

  passo "Provando que o app abre"
  local cod
  cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://127.0.0.1:$PORTA/")"
  [ "$cod" = "307" ] || falha "http://127.0.0.1:$PORTA/ respondeu $cod em vez de 307."
  msg "  http://127.0.0.1:$PORTA/ → 307 (redireciona para o login)."
  cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://127.0.0.1:$PORTA/auth/v1/health" \
    -H "apikey: $(env_ler "$DESTINO_ENSAIO/.env" NEXT_PUBLIC_SUPABASE_ANON_KEY)")"
  [ "$cod" = "200" ] || falha "O login (Auth) do ensaio respondeu $cod."
  msg "  login (Auth) do ensaio de pé."
  if [ -n "${ZAPSALES_TESTE_EMAIL:-}" ] && [ -n "${ZAPSALES_TESTE_SENHA:-}" ]; then
    cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST \
      "http://127.0.0.1:$PORTA/auth/v1/token?grant_type=password" \
      -H "apikey: $(env_ler "$DESTINO_ENSAIO/.env" NEXT_PUBLIC_SUPABASE_ANON_KEY)" -H 'Content-Type: application/json' \
      --data "{\"email\":\"$(json_texto "$ZAPSALES_TESTE_EMAIL")\",\"password\":\"$(json_texto "$ZAPSALES_TESTE_SENHA")\"}")"
    [ "$cod" = "200" ] || falha "Entrar com $ZAPSALES_TESTE_EMAIL no ensaio respondeu $cod."
    msg "  $ZAPSALES_TESTE_EMAIL entrou no ensaio com a senha de produção."
  fi
  rm -rf "$PREPARO"

  passo "Ensaio de restauração concluído"
  msg "  Para abrir no navegador: ssh -L $PORTA:127.0.0.1:$PORTA root@<esta-vps>  e acesse http://localhost:$PORTA"
  msg "  Ao terminar: sudo $0 ensaio --remover"
}

# ─── Desastre ────────────────────────────────────────────────────────────────

desastre() {
  # VPS nova: o restic e o banco rodam em contêiner, e o Docker pode não estar lá.
  garantir_docker
  carregar_r2
  if [ -s "$RAIZ_KIT/.env" ] && [ "${ZAPSALES_SOBRESCREVER:-}" != "1" ]; then
    falha "$RAIZ_KIT/.env já existe: isto parece uma instalação viva. A restauração de desastre é para VPS nova. (Se tem certeza, ZAPSALES_SOBRESCREVER=1.)"
  fi
  baixar_snapshot
  cp -p "$PREPARO/backup/preparo/config/.env" "$RAIZ_KIT/.env"
  chmod 600 "$RAIZ_KIT/.env"
  restaurar_banco
  restaurar_arquivos com-sessoes-do-whatsapp
  conferir_contagens
  rm -rf "$PREPARO"
  passo "Dados de volta — terminando com o kit de instalação"
  "$KIT/instalar.sh"
}

case "$MODO" in
  ensaio) ensaio ;;
  desastre) desastre ;;
  *) msg "Uso: $0 {ensaio [--snapshot ID] [--porta N] [--remover] | desastre [--snapshot ID]}"; exit 2 ;;
esac
