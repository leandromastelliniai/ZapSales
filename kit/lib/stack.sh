# shellcheck shell=bash
# Operações sobre a stack em Docker: compose, banco e espera de saúde.
#
# Tudo aqui supõe RAIZ (a pasta da instalação, com o .env) já definida.

# garantir_docker — instala o Docker pelo script oficial se faltar, e o deixa
# habilitado no boot (é o que traz a stack de volta depois de um reboot).
garantir_docker() {
  if ! command -v docker >/dev/null; then
    msg "  Docker ausente — instalando pelo script oficial (get.docker.com)."
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
}

# dc — o `docker compose` da instalação. O COMPOSE_FILE e o
# COMPOSE_PROJECT_NAME moram no .env, que o Compose lê sozinho na pasta do
# projeto: é o que faz um `docker compose up -d` digitado à mão, sem o kit,
# subir o MESMO conjunto de arquivos (incluindo o override do modo convivendo).
dc() { (cd "$RAIZ" && docker compose "$@"); }

# psql_db [args...] — psql dentro do contêiner do banco, como o DONO (postgres).
psql_db() { dc exec -T db psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# psql_admin [args...] — como supabase_admin, o superusuário da imagem do
# Supabase. Só para o que o dono não pode: restauração com gatilhos
# desligados e o papel do worker (BYPASSRLS).
psql_admin() { dc exec -T db psql -U supabase_admin -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# sql_valor "SELECT ..." — imprime o valor de uma consulta de uma célula.
sql_valor() { psql_db -At -c "$1" 2>/dev/null | tr -d '[:space:]'; }

# esperar NOME SEGUNDOS COMANDO... — repete o comando até dar certo.
esperar() {
  local nome="$1" limite="$2" i=0
  shift 2
  until "$@" >/dev/null 2>&1; do
    i=$((i + 2))
    if [ "$i" -ge "$limite" ]; then
      aviso "$nome não ficou pronto em ${limite}s."
      return 1
    fi
    sleep 2
  done
  msg "  $nome pronto."
}

banco_aceita_conexao() { dc exec -T db pg_isready -U postgres -h localhost; }

# O GoTrue e o Storage criam os schemas `auth` e `storage` nas próprias
# migrations, no primeiro boot. O baseline tem chave estrangeira para
# auth.users e insere em storage.buckets: aplicar antes disso falha.
schemas_do_supabase_prontos() {
  [ "$(sql_valor "select (to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null)::int")" = "1" ]
}

servico_saudavel() { # NOME
  local id estado
  id="$(dc ps -q "$1")"
  [ -n "$id" ] || return 1
  estado="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
  [ "$estado" = "healthy" ] || [ "$estado" = "running" ]
}

# aplicar_schema — extensões + baseline.sql (o MESMO arquivo em instalação e
# atualização: ele é idempotente, e o CI prova as duas passadas com
# ON_ERROR_STOP=1) + semente da chave de cifra das integrações + papel do
# worker. Mesmo roteiro do e2e (.github/workflows/e2e.yml).
aplicar_schema() {
  local chave_integracoes senha_worker
  chave_integracoes="$(env_ler "$RAIZ/.env" INTEGRATIONS_OAUTH_ENCRYPTION_KEY)"
  senha_worker="$(env_ler "$RAIZ/.env" AGENT_WORKER_DB_PASSWORD)"

  psql_db <<'SQL'
create schema if not exists extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema public;
create extension if not exists citext with schema public;
create extension if not exists pg_trgm with schema public;
SQL
  psql_db < "$RAIZ/supabase/baseline.sql"

  # Sem a chave, `fn_encrypt_oauth` recusa salvar qualquer segredo de
  # integração. `do nothing`: a chave de uma instalação existente nunca muda,
  # senão o que já foi cifrado vira lixo.
  psql_db -v chave="$chave_integracoes" <<'SQL'
insert into private.app_secrets (name, value) values ('integrations_oauth_key', :'chave')
on conflict (name) do nothing;
SQL

  psql_admin -v senha="$senha_worker" < "$RAIZ/kit/sql/papel-do-worker.sql"
}

# O Realtime precisa reiniciar DEPOIS do baseline: ele lê a publication
# `supabase_realtime` no boot, e é o baseline que põe as tabelas nela. Sem o
# restart, o canal responde SUBSCRIBED e nunca entrega (medido no e2e, PR #327).
reiniciar_realtime() {
  dc restart realtime >/dev/null
  esperar "Realtime" 120 servico_saudavel realtime
}
