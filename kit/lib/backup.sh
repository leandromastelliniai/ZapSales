# shellcheck shell=bash
# Funções puras do backup (o roteiro que as usa é kit/backup.sh).

# podar_dumps PASTA DIAS — apaga os `zapsales-*.dump` com mais de DIAS dias, e
# a contagem que acompanha cada um (sem o dump ela não serve para nada).
# Imprime os dumps apagados. Só toca arquivos do kit: o resto da pasta fica.
podar_dumps() {
  local pasta="$1" dias="$2" dump
  case "$dias" in ''|*[!0-9]*) return 1 ;; esac
  [ "$dias" -ge 1 ] || return 1
  while IFS= read -r dump; do
    rm -f "$dump" "${dump%.dump}.contagem.tsv"
    printf '%s\n' "$dump"
  done < <(find "$pasta" -maxdepth 1 -type f -name 'zapsales-*.dump' -mtime +"$((dias - 1))")
}

# repositorio_r2 CONTA BUCKET — o endereço do repositório restic no Cloudflare R2.
repositorio_r2() {
  printf 's3:https://%s.r2.cloudflarestorage.com/%s/zapsales\n' "$1" "$2"
}
