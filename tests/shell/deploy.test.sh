#!/usr/bin/env bash
# tests/shell/deploy.test.sh — as decisões do deploy automático que não precisam
# de VPS: kit/deploy/porta.sh (o que a chave consegue pedir) e as funções puras
# de kit/deploy/implantar.sh (versão no ar, "não piorar", volta do .env).
#
# A prova de ponta a ponta — deploy, observação e volta numa VPS de verdade — não
# cabe aqui; ela está registrada no PR que criou o deploy automático e no runbook
# (docs/runbooks/deploy.md).
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FALHAS=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
ruim() { printf '  \033[31m✗\033[0m %s\n' "$1"; FALHAS=$((FALHAS + 1)); }
checar() { # DESCRIÇÃO COMANDO...
  local d="$1"; shift
  if "$@"; then ok "$d"; else ruim "$d"; fi
}
nao() { ! "$@"; }

SHA_A="$(printf 'a%.0s' {1..40})"
SHA_B="d3c0ddd$(printf '0%.0s' {1..33})"

# ─── porta.sh ────────────────────────────────────────────────────────────────
echo "porta: a chave só consegue pedir 'implantar <sha de 40>'"

porta_recusa() { # PEDIDO — a porta sai com 64 sem chegar ao sudo
  local saida rc
  saida="$(SSH_ORIGINAL_COMMAND="$1" PATH="/nao-existe" /bin/sh "$RAIZ/kit/deploy/porta.sh" 2>&1)"
  rc=$?
  [ "$rc" = "64" ] || { echo "    (saiu com $rc: $saida)"; return 1; }
}
checar "sem comando (ssh interativo) é recusado"          porta_recusa ""
checar "shell arbitrário é recusado"                      porta_recusa "bash -i"
checar "outro verbo é recusado"                           porta_recusa "voltar $SHA_A"
checar "sha curto é recusado"                             porta_recusa "implantar d3c0ddd"
checar "sha com maiúsculas é recusado"                    porta_recusa "implantar ${SHA_A^^}"
checar "sha com ';' grudado é recusado"                   porta_recusa "implantar $SHA_A;id"
checar "sha com espaço e argumento extra é recusado"      porta_recusa "implantar $SHA_A --x"
checar "sha com quebra de linha embutida é recusado"      porta_recusa "implantar $SHA_A
id"
checar "substituição de comando no sha é recusada"        porta_recusa 'implantar $(id)'

porta_aceita() { # o pedido válido passa da validação e chega ao exec do sudo
  local saida
  saida="$(SSH_ORIGINAL_COMMAND="implantar $SHA_A" PATH="/nao-existe" /bin/sh "$RAIZ/kit/deploy/porta.sh" 2>&1)"
  [ "$?" != "64" ] && [[ "$saida" == *sudo* ]]
}
checar "o pedido válido chega ao sudo (controle positivo)" porta_aceita

# ─── implantar.sh: funções puras ─────────────────────────────────────────────
# shellcheck source=../../kit/deploy/implantar.sh
. "$RAIZ/kit/deploy/implantar.sh"
set +e

echo "implantar: sha_valido"
checar "40 hex minúsculos é válido"   sha_valido "$SHA_A"
checar "curto não é"                  nao sha_valido "d3c0ddd"
checar "com quebra de linha não é"    nao sha_valido "$SHA_A
x"

echo "implantar: saude_atende (versão no ar + não piorar)"
ANTES="d3c0ddd redis=ok supabase=ok waha=ok"
checar "versão nova e tudo ok atende" \
  saude_atende "$ANTES" "aaaaaaa redis=ok supabase=ok waha=ok" "$SHA_A"
checar "versão VELHA no ar não atende (a troca não pegou)" \
  nao saude_atende "$ANTES" "d3c0ddd redis=ok supabase=ok waha=ok" "$SHA_A"
checar "dependência que estava ok e piorou não atende" \
  nao saude_atende "$ANTES" "aaaaaaa redis=ok supabase=error waha=ok" "$SHA_A"
checar "dependência que já estava fora antes não impede" \
  saude_atende "d3c0ddd redis=ok supabase=ok waha=error" "aaaaaaa redis=ok supabase=ok waha=error" "$SHA_A"
checar "app sem responder (ilegivel) não atende" \
  nao saude_atende "$ANTES" "ilegivel" "$SHA_A"
checar "versão curta demais ('?') não atende" \
  nao saude_atende "" "? supabase=ok" "$SHA_A"
checar "produção fora antes (ilegivel): basta a versão nova" \
  saude_atende "ilegivel" "aaaaaaa supabase=error" "$SHA_A"
checar "a volta confere a versão anterior pelo prefixo" \
  saude_atende "" "d3c0ddd supabase=ok" "$SHA_B"

if command -v python3 >/dev/null && python3 -c 'import json' 2>/dev/null; then
  echo "implantar: resumo_saude"
  r="$(printf '%s' '{"data":{"status":"healthy","version":"d3c0ddd","checks":{"waha":{"status":"ok"},"supabase":{"status":"ok","latency_ms":3},"redis":{"status":"error"}}}}' | resumo_saude)"
  checar "lê versão e dependências em ordem ('$r')" [ "$r" = "d3c0ddd redis=error supabase=ok waha=ok" ]
  r="$(printf '%s' '<html>502</html>' | resumo_saude)"
  checar "HTML de erro vira 'ilegivel'" [ "$r" = "ilegivel" ]
  r="$(printf '' | resumo_saude)"
  checar "resposta vazia vira 'ilegivel'" [ "$r" = "ilegivel" ]
else
  echo "implantar: resumo_saude — PULADO (sem python3 nesta máquina; a VPS e o CI têm)"
fi

echo "implantar: restaurar_chaves (a volta mexe só no que diz qual código roda)"
TMP="$(mktemp -d)"
cat > "$TMP/anterior" <<'EOF'
POSTGRES_PASSWORD=velha
ZAPSALES_IMAGENS=construir
COMPOSE_FILE=a.yml:b.yml:docker-compose.build.yml
APP_VERSION=d3c0ddd
APP_IMAGE=zapsales-app:d3c0ddd
WORKER_IMAGE=zapsales-worker:d3c0ddd
SCHEDULER_IMAGE=zapsales-scheduler:d3c0ddd
EOF
cat > "$TMP/atual" <<'EOF'
POSTGRES_PASSWORD=velha
CHAVE_NOVA_DO_KIT=gerada-agora
ZAPSALES_IMAGENS=registro
COMPOSE_FILE=a.yml:b.yml
APP_IMAGE=ghcr.io/x/zapsales:sha-aaaa
WORKER_IMAGE=ghcr.io/x/zapsales-worker:sha-aaaa
SCHEDULER_IMAGE=ghcr.io/x/zapsales-scheduler:sha-aaaa
APP_PULL_POLICY=missing
EOF
chmod 600 "$TMP/atual"
restaurar_chaves "$TMP/anterior" "$TMP/atual"
checar "a imagem do app volta"              [ "$(env_ler "$TMP/atual" APP_IMAGE)" = "zapsales-app:d3c0ddd" ]
checar "o modo de imagens volta"            [ "$(env_ler "$TMP/atual" ZAPSALES_IMAGENS)" = "construir" ]
checar "o COMPOSE_FILE volta"               [ "$(env_ler "$TMP/atual" COMPOSE_FILE)" = "a.yml:b.yml:docker-compose.build.yml" ]
checar "APP_VERSION volta (existia antes)"  [ "$(env_ler "$TMP/atual" APP_VERSION)" = "d3c0ddd" ]
checar "chave que não existia antes some"   nao grep -q '^APP_PULL_POLICY=' "$TMP/atual"
checar "segredo gerado pelo kit novo FICA"  [ "$(env_ler "$TMP/atual" CHAVE_NOVA_DO_KIT)" = "gerada-agora" ]
checar "segredo antigo intocado"            [ "$(env_ler "$TMP/atual" POSTGRES_PASSWORD)" = "velha" ]
if [ "$(uname -s)" = "Linux" ]; then
  checar "o .env continua 600"              [ "$(stat -c %a "$TMP/atual")" = "600" ]
fi
rm -rf "$TMP"

echo
if [ "$FALHAS" -eq 0 ]; then echo "OK — todas as provas passaram."; else echo "FALHOU — $FALHAS prova(s)."; exit 1; fi
