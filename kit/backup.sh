#!/usr/bin/env bash
# kit/backup.sh — backups do ZapSales instalado pelo kit.
#
#   sudo kit/backup.sh diario         dump do banco em /var/backups/zapsales/db, retenção de 30 dias
#   sudo kit/backup.sh semanal        dump novo + cópia CRIPTOGRAFADA (restic) de banco, mídias,
#                                     sessões do WhatsApp e .env para o Cloudflare R2
#   sudo kit/backup.sh configurar-r2  grava as credenciais do R2 (pergunta, ou lê R2_* do ambiente)
#   sudo kit/backup.sh status         o que existe e quando foi o último de cada
#   sudo kit/backup.sh listar         snapshots no R2
#
# Os dois primeiros rodam pelo cron (/etc/cron.d/zapsales, escrito pelo kit).
#
# ═══ O QUE ENTRA NA CÓPIA SEMANAL, E POR QUÊ ═══
#
#   banco/         o dump mais novo + a contagem de linhas que ele tinha (a
#                  restauração confere contra ela)
#   storage/       o volume do Supabase Storage — as mídias do WhatsApp
#   waha-sessoes/  as sessões pareadas do WhatsApp (perder = parear de novo)
#   waha-midia/    a pasta de mídia do WAHA
#   config/        o .env: sem ele o banco volta ILEGÍVEL — as chaves de cifra
#                  (CPF, credenciais de IA, integrações) só existem ali
#
# A senha do restic e as credenciais do R2 ficam em /etc/zapsales/backup.env e
# NÃO entram na cópia (quem tem a cópia sem a senha não lê nada). Guarde a
# senha do restic FORA da VPS: perdida a VPS, ela é o que abre o backup.
set -Eeuo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$KIT")"
# shellcheck source=lib/comum.sh
. "$KIT/lib/comum.sh"
# shellcheck source=lib/segredos.sh
. "$KIT/lib/segredos.sh"
# shellcheck source=lib/backup.sh
. "$KIT/lib/backup.sh"
# shellcheck source=lib/stack.sh
. "$KIT/lib/stack.sh"
# shellcheck source=lib/restic.sh
. "$KIT/lib/restic.sh"

BACKUPS="${ZAPSALES_BACKUPS:-/var/backups/zapsales}"
ESTADO="${ZAPSALES_ESTADO:-/etc/zapsales}"
RETENCAO_DIAS="${ZAPSALES_RETENCAO_DIAS:-30}"

carimbo() { date -u +%Y%m%dT%H%M%SZ; }
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

cmd_diario() {
  exigir_root
  mkdir -p "$BACKUPS/db"
  chmod 700 "$BACKUPS"
  local nome tmp
  nome="zapsales-$(carimbo).dump"
  tmp="$BACKUPS/db/.$nome.parcial"
  # supabase_admin (superusuário da imagem) e não postgres: o dump inclui os
  # schemas `auth` e `storage`, que são de outros donos — com o papel errado o
  # pg_dump sai parcial e sai verde.
  # O dump é escrito num ARQUIVO dentro do contêiner, não no stdout: o formato
  # custom só grava os deslocamentos dos dados quando a saída é um arquivo, e
  # sem eles a restauração seletiva (só alguns schemas, na ordem que o kit
  # pede) falha com "could not find block ID".
  dc exec -T db pg_dump -U supabase_admin -h localhost -d postgres --format=custom -f /tmp/zapsales-backup.dump
  # O arquivo só sai do contêiner depois de o próprio pg_restore conseguir ler
  # o índice dele: dump truncado não entra na retenção como se fosse bom.
  dc exec -T db pg_restore -l /tmp/zapsales-backup.dump > /dev/null \
    || { dc exec -T db rm -f /tmp/zapsales-backup.dump; falha "O dump gerado não é legível pelo pg_restore."; }
  contar_linhas_do_dump /tmp/zapsales-backup.dump > "$BACKUPS/db/${nome%.dump}.contagem.tsv"
  dc cp db:/tmp/zapsales-backup.dump "$tmp" >/dev/null
  dc exec -T db rm -f /tmp/zapsales-backup.dump
  [ -s "$tmp" ] || { rm -f "$tmp"; falha "O dump copiado do contêiner está vazio."; }
  mv "$tmp" "$BACKUPS/db/$nome"
  chmod 600 "$BACKUPS/db/$nome"
  log "dump ok: $BACKUPS/db/$nome ($(du -h "$BACKUPS/db/$nome" | cut -f1))"
  local podados
  podados="$(podar_dumps "$BACKUPS/db" "$RETENCAO_DIAS" | wc -l)"
  log "retenção de ${RETENCAO_DIAS} dias aplicada ($podados dump(s) antigo(s) removido(s))"
  printf '%s\n' "$BACKUPS/db/$nome" > "$BACKUPS/ultimo-diario"
}

cmd_semanal() {
  exigir_root
  carregar_r2
  cmd_diario
  local dump preparo
  dump="$(cat "$BACKUPS/ultimo-diario")"
  preparo="$BACKUPS/semanal"
  rm -rf "$preparo"
  mkdir -p "$preparo/banco" "$preparo/config" "$preparo/waha-sessoes"
  chmod 700 "$preparo"
  cp -p "$dump" "$preparo/banco/zapsales.dump"
  cp -p "${dump%.dump}.contagem.tsv" "$preparo/banco/contagem.tsv"
  cp -p "$RAIZ/.env" "$preparo/config/.env"
  printf 'revisao=%s\ncriado=%s\n' "$(env_ler "$RAIZ/.env" APP_VERSION)" "$(date -u +%FT%TZ)" > "$preparo/config/origem"

  # Sessões do WhatsApp com o WAHA PAUSADO: são arquivos que ele reescreve, e
  # uma cópia no meio da escrita volta corrompida. A pausa dura o tempo de
  # copiar uma pasta pequena; as mensagens que chegarem esperam na fila do
  # WhatsApp, não se perdem.
  local waha_pausado=0
  if dc pause waha >/dev/null 2>&1; then waha_pausado=1; fi
  docker run --rm --memory 256m --cpus 0.5 -v "$(volume_do_projeto waha-data):/de:ro" -v "$preparo/waha-sessoes:/para" \
    --entrypoint /bin/sh "$IMAGEM_RESTIC" -c 'cp -a /de/. /para/' || { [ "$waha_pausado" = 1 ] && dc unpause waha; falha "Falha copiando as sessões do WAHA."; }
  [ "$waha_pausado" = 1 ] && dc unpause waha >/dev/null

  garantir_repositorio
  restic_ -v "$preparo:/backup/preparo:ro" \
          -v "$(volume_do_projeto supabase-storage):/backup/storage:ro" \
          -v "$(volume_do_projeto waha-media):/backup/waha-midia:ro" \
    backup /backup --host zapsales --tag semanal
  restic_ forget --host zapsales --tag semanal --keep-weekly 8 --keep-monthly 6 --prune
  restic_ check
  rm -rf "$preparo"
  date -u +%FT%TZ > "$BACKUPS/ultimo-semanal"
  log "cópia semanal ok em $RESTIC_REPOSITORY"
}

cmd_configurar_r2() {
  exigir_root
  mkdir -p "$ESTADO"
  chmod 700 "$ESTADO"
  local conta="${R2_ACCOUNT_ID:-}" chave="${R2_ACCESS_KEY_ID:-}" segredo="${R2_SECRET_ACCESS_KEY:-}" bucket="${R2_BUCKET:-}" repo="${RESTIC_REPOSITORY:-}"
  if [ -z "$repo" ]; then
    [ -n "$conta" ]   || read -r -p "ID da conta Cloudflare (Account ID): " conta
    [ -n "$bucket" ]  || read -r -p "Nome do bucket R2: " bucket
    [ -n "$chave" ]   || read -r -p "Access Key ID do token R2: " chave
    [ -n "$segredo" ] || { read -r -s -p "Secret Access Key do token R2: " segredo; echo; }
    repo="$(repositorio_r2 "$conta" "$bucket")"
  fi
  case "$repo" in
    s3:*) [ -n "$chave" ] && [ -n "$segredo" ] || falha "Repositório S3/R2 sem Access Key ID ou Secret Access Key." ;;
  esac
  local senha
  senha="$( [ -s "$CONFIG_R2" ] && (. "$CONFIG_R2"; printf '%s' "${RESTIC_PASSWORD:-}") || true)"
  senha="${senha:-${RESTIC_PASSWORD:-$(segredo_b64 32)}}"
  # `%q`, e não o valor cru: o arquivo é LIDO com `.` pelo cron, como root. Um
  # segredo com `$`, espaço, `;` ou crase seria executado como comando.
  (umask 077 && {
    printf '# Gerenciado por kit/backup.sh configurar-r2. NÃO versionar, NÃO copiar para o repositório.\n'
    printf 'RESTIC_REPOSITORY=%q\n' "$repo"
    printf 'AWS_ACCESS_KEY_ID=%q\n' "$chave"
    printf 'AWS_SECRET_ACCESS_KEY=%q\n' "$segredo"
    printf '# A senha que cifra o backup. Guarde uma cópia FORA desta VPS.\n'
    printf 'RESTIC_PASSWORD=%q\n' "$senha"
  } > "$CONFIG_R2")
  carregar_r2
  garantir_repositorio
  restic_ snapshots >/dev/null
  log "R2 configurado: $RESTIC_REPOSITORY"
  msg "IMPORTANTE: guarde a senha do backup fora desta VPS. Para vê-la: sudo grep RESTIC_PASSWORD $CONFIG_R2"
}

cmd_status() {
  local u
  msg "Dumps diários em $BACKUPS/db:"
  find "$BACKUPS/db" -maxdepth 1 -name 'zapsales-*.dump' -printf '  %TY-%Tm-%Td %TH:%TM  %s bytes  %f\n' 2>/dev/null | sort | tail -5
  msg "  total: $(find "$BACKUPS/db" -maxdepth 1 -name 'zapsales-*.dump' 2>/dev/null | wc -l) (retenção: $RETENCAO_DIAS dias)"
  u="$(cat "$BACKUPS/ultimo-semanal" 2>/dev/null || echo nunca)"
  msg "Última cópia semanal: $u"
  [ -s "$CONFIG_R2" ] && msg "R2: configurado" || msg "R2: NÃO configurado (sudo $KIT/backup.sh configurar-r2)"
}

cmd_listar() { exigir_root; carregar_r2; restic_ snapshots; }

# Uma rodada por vez: o diário e o semanal usam o mesmo arquivo temporário no
# contêiner do banco, e o semanal de domingo pode cruzar com um diário lento.
case "${1:-}" in
  diario|semanal|configurar-r2)
    exec 8>/run/zapsales-backup.lock
    flock -w 3600 8 || falha "Outra rodada de backup não terminou em 1 hora."
    ;;
esac

case "${1:-}" in
  diario) cmd_diario ;;
  semanal) cmd_semanal ;;
  configurar-r2) cmd_configurar_r2 ;;
  status) cmd_status ;;
  listar) cmd_listar ;;
  *) msg "Uso: $0 {diario|semanal|configurar-r2|status|listar}"; exit 2 ;;
esac
