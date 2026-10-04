#!/usr/bin/env bash
# Prova de vida do dublê de SaaS do e2e (issue #179).
#
# Exercita o CONTRATO inteiro do `scripts/duble-saas-e2e.mjs` (Resend) contra
# a porta onde ele subiu. Serve
# a dois consumidores, e é por isso que ele existe como script e não como um
# bloco de `curl` solto dentro do YAML:
#
#   1. o job do CI, que o roda ANTES da spec. Se o dublê não responde o
#      contrato, o job falha aqui, com a rota nomeada, em vez de falhar 6
#      minutos depois dentro do Playwright com "elemento não encontrado";
#   2. quem está na VPS sem Docker, onde a spec Playwright não roda: dá para
#      provar o dublê localmente com `bash scripts/duble-saas-e2e-smoke.sh`.
#
# Uso:  bash scripts/duble-saas-e2e-smoke.sh [http://127.0.0.1:3997]
#
# Sem dependência de `jq` (o runner tem, a VPS pode não ter): o que se cobra é
# o status HTTP e a presença de campos, com `grep -q`.
set -u -o pipefail

BASE="${1:-http://127.0.0.1:3997}"
CHAVE_RESEND="${E2E_RESEND_API_KEY:-re_placeholder_nao_e_segredo}"
FALHAS=0

# `-s -o corpo -w status`: o corpo fica no arquivo, o status na variável.
CORPO="$(mktemp)"
trap 'rm -f "$CORPO"' EXIT

# checar <nome> <status-esperado> <substring-no-corpo> -- <curl...>
checar() {
  local nome="$1" esperado="$2" trecho="$3"
  shift 3
  [ "${1:-}" = "--" ] && shift
  local status
  status="$(curl -s -o "$CORPO" -w '%{http_code}' "$@" || echo 000)"
  local corpo
  corpo="$(cat "$CORPO")"
  if [ "$status" != "$esperado" ]; then
    printf 'FALHOU  %-34s status=%s (esperado %s)\n' "$nome" "$status" "$esperado"
    printf '        corpo: %s\n' "${corpo:0:200}"
    FALHAS=$((FALHAS + 1))
    return 1
  fi
  if [ -n "$trecho" ] && ! printf '%s' "$corpo" | grep -q "$trecho"; then
    printf 'FALHOU  %-34s status ok, mas sem "%s" no corpo\n' "$nome" "$trecho"
    printf '        corpo: %s\n' "${corpo:0:200}"
    FALHAS=$((FALHAS + 1))
    return 1
  fi
  printf 'ok      %-34s %s\n' "$nome" "$status"
  return 0
}

echo "── dublê de SaaS do e2e em $BASE ──"

# ── Plano de controle ──
checar "saúde"                     200 '"ok":true'  "$BASE/__duble/saude"
curl -s -X DELETE "$BASE/__duble/recebidos" >/dev/null

# ── Resend ──
# Sem chave o SaaS real devolve 401: dublê permissivo esconderia do teste que o
# produto parou de mandar o `Authorization`.
checar "resend: sem chave → 401"   401 'missing_api_key' \
  -X POST "$BASE/emails" -H 'content-type: application/json' -d '{"to":"qa@zapsales.test"}'
checar "resend: POST /emails"      200 '"id"' \
  -X POST "$BASE/emails" \
  -H "authorization: Bearer $CHAVE_RESEND" -H 'content-type: application/json' \
  -d '{"from":"qa@zapsales.test","to":"dono@qa.local","subject":"convite","html":"<p>oi</p>"}'
ID_EMAIL="$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$CORPO")"
checar "resend: GET /emails/:id"   200 '"last_event"' \
  "$BASE/emails/$ID_EMAIL"

# ── Registro ──
# É o que permite ao teste afirmar "o e-mail saiu" sem mock em processo.
checar "registro de recebidos"      200 '"total"' "$BASE/__duble/recebidos"
echo "        requisições registradas: $(cat "$CORPO" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')"

# ── Rota desconhecida ──
checar "rota desconhecida → 404"    404 'rota_desconhecida' "$BASE/nao-existe"

if [ "$FALHAS" -ne 0 ]; then
  echo "── $FALHAS de 13 verificações FALHARAM ──"
  exit 1
fi
echo "── 13 de 13 verificações passaram ──"
