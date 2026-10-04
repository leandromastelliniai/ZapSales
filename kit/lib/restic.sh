# shellcheck shell=bash
# O restic do backup semanal — usado por kit/backup.sh e kit/restaurar.sh.
#
# Roda pela imagem oficial pinada (doutrina de packaging: upstream com tag
# fixa), então a VPS não precisa do pacote restic instalado. As credenciais
# vêm de /etc/zapsales/backup.env e entram no contêiner variável por
# variável — nunca o ambiente inteiro.

IMAGEM_RESTIC="restic/restic:0.19.1"
CONFIG_R2="${ZAPSALES_ESTADO:-/etc/zapsales}/backup.env"

carregar_r2() {
  [ -s "$CONFIG_R2" ] || falha "Sem credenciais do backup em $CONFIG_R2. Rode: sudo $KIT/backup.sh configurar-r2"
  set -a
  # shellcheck source=/dev/null
  . "$CONFIG_R2"
  set +a
  : "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY ausente em $CONFIG_R2}" "${RESTIC_PASSWORD:?RESTIC_PASSWORD ausente em $CONFIG_R2}"
}

# restic_ [-v ORIGEM:DESTINO ...] ARGS... — o restic, com volumes extras.
restic_() {
  local volumes=()
  while [ "${1:-}" = "-v" ]; do volumes+=(-v "$2"); shift 2; done
  # Repositório numa pasta local (ensaio sem R2): monta no mesmo caminho.
  case "$RESTIC_REPOSITORY" in
    /*) mkdir -p "$RESTIC_REPOSITORY"; volumes+=(-v "$RESTIC_REPOSITORY:$RESTIC_REPOSITORY") ;;
  esac
  # Teto como o de todo contêiner da stack: o backup roda de madrugada, mas na
  # MESMA máquina dos outros apps.
  docker run --rm -i --memory 1g --cpus 1 \
    -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
    -e AWS_DEFAULT_REGION=auto -e RESTIC_CACHE_DIR=/cache \
    -v zapsales-restic-cache:/cache \
    "${volumes[@]}" "$IMAGEM_RESTIC" "$@"
}

garantir_repositorio() {
  if ! restic_ cat config >/dev/null 2>&1; then
    msg "  repositório novo em $RESTIC_REPOSITORY — inicializando"
    restic_ init
  fi
}

# volume_do_projeto NOME — o nome real do volume (o Compose prefixa com o projeto).
volume_do_projeto() {
  local projeto
  projeto="$(env_ler "$RAIZ/.env" COMPOSE_PROJECT_NAME)"
  printf '%s_%s' "${projeto:-zapsales}" "$1"
}

# As tabelas cuja contagem o backup grava e a restauração confere. Lista curta e
# estável: o que importa provar é que login, contatos, conversas e mídias voltaram.
TABELAS_CONFERIDAS="auth.users public.organizations public.user_organizations public.contacts public.conversations public.messages public.crm_leads storage.objects"

# contar_linhas_do_dump ARQUIVO — "tabela<TAB>linhas" do que está DENTRO do
# dump (caminho no contêiner db). Conta o próprio arquivo, e não o banco no
# momento do backup: com o sistema no ar, uma mensagem que chega entre o fim
# do pg_dump e a contagem faria a restauração "falhar" sem ter perdido nada.
contar_linhas_do_dump() {
  local indice t s n
  indice="$(dc exec -T db pg_restore -l "$1")"
  for t in $TABELAS_CONFERIDAS; do
    s="${t%%.*}"; n="${t#*.}"
    # Here-string, não `printf | grep -q`: com pipefail, o grep -q sai no
    # primeiro acerto, o printf leva SIGPIPE e o `if` lê FALHA (medido: a
    # contagem saía vazia com as tabelas no dump).
    if grep -qE " TABLE DATA $s $n " <<<"$indice"; then
      printf '%s\t%s\n' "$t" "$(dc exec -T db pg_restore --data-only -n "$s" -t "$n" -f - "$1" \
        | awk '/^COPY /{c=1;next} /^\\\.$/{c=0;next} c{k++} END{print k+0}')"
    fi
  done
}

# contar_linhas — "tabela<TAB>linhas" do banco da instalação em RAIZ.
contar_linhas() {
  local t
  for t in $TABELAS_CONFERIDAS; do
    if [ "$(sql_valor "select (to_regclass('$t') is not null)::int")" = "1" ]; then
      printf '%s\t%s\n' "$t" "$(psql_admin -At -c "select count(*) from $t" | tr -d '[:space:]')"
    fi
  done
}
