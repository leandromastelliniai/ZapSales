# shellcheck shell=bash
# Funções puras da implantação contínua (kit/implantar.sh, issue #24).
#
# Nada aqui toca em Docker, rede ou disco: cada função responde uma pergunta
# sobre um texto. É o que permite provar as recusas em tests/shell/kit-implantar.test.sh
# sem uma VPS — e as recusas são a parte que não pode errar, porque a chave que
# chama este comando mora no GitHub.
#
# JSON é lido com python3, e não com jq: o python3 vem no Ubuntu e no Debian de
# fábrica, e o jq não — dependência nova na VPS de produção é mais uma coisa
# para faltar no dia do deploy.

# sha_valido SHA — commit inteiro, 40 hex minúsculos. Abreviação é recusada:
# é ambígua, e a etiqueta da imagem (`sha-<commit>`) usa o sha inteiro.
sha_valido() { [[ "${1:-}" =~ ^[0-9a-f]{40}$ ]]; }

# sha_do_comando "implantar <sha>" — o ÚNICO comando que a chave do GitHub pode
# pedir (o sshd o entrega em SSH_ORIGINAL_COMMAND). Imprime o sha; qualquer
# outra coisa — sessão interativa, `;`, segundo argumento — falha.
sha_do_comando() {
  local cmd="${1:-}"
  case "$cmd" in *$'\n'*|*$'\r'*) return 1 ;; esac
  [[ "$cmd" =~ ^implantar\ ([0-9a-f]{40})$ ]] || return 1
  printf '%s\n' "${BASH_REMATCH[1]}"
}

# chave_publica_limpa TEXTO — a chave pública como vai para o authorized_keys,
# ou vazio se não for UMA chave ed25519/ecdsa. O `.pub` gerado no Windows chega
# com `\r\n` no fim (foi o primeiro uso real); isso e espaço nas pontas saem.
# Opções embutidas (`command=…`) são recusadas: quem as escreve é o kit.
chave_publica_limpa() {
  local c
  c="$(printf '%s' "${1:-}" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  case "$c" in *$'\n'*) return 0 ;; esac
  [[ "$c" =~ ^(ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521)\ [A-Za-z0-9+/=]+(\ [^[:cntrl:]]*)?$ ]] || return 0
  printf '%s\n' "$c"
}

# sha_esta_na_main STATUS — STATUS é o `status` de GET /compare/<sha>...main.
# `identical` (é o topo) e `ahead` (a main já andou além dele) dizem que o sha
# é ancestral da main. Qualquer outra coisa, inclusive vazio, é "não".
sha_esta_na_main() {
  case "${1:-}" in identical|ahead) return 0 ;; *) return 1 ;; esac
}

# movimento STATUS — STATUS é o `status` de GET /compare/<atual>...<novo>.
movimento() {
  case "${1:-}" in
    identical) printf 'mesma\n' ;;
    ahead)     printf 'avanca\n' ;;
    behind)    printf 'rebaixa\n' ;;
    diverged)  printf 'desvia\n' ;;
    *)         printf 'desconhecido\n' ;;
  esac
}

# versao_bate VERSAO SHA — a versão que /api/v1/health responde é deste commit?
# A imagem do CI grava o sha curto (7); uma imagem construída na VPS gravava o
# inteiro. Prefixo de menos de 7 não prova nada.
versao_bate() {
  local v="${1:-}" sha="${2:-}"
  [ "${#v}" -ge 7 ] || return 1
  [[ "$v" =~ ^[0-9a-f]+$ ]] || return 1
  case "$sha" in "$v"*) return 0 ;; *) return 1 ;; esac
}

# _json_saude JSON EXPR — avalia EXPR (python) sobre o `data` da saúde. JSON
# inválido ou vazio (o app fora do ar devolve HTML do proxy, ou nada) dá vazio.
_json_saude() {
  JSON_SAUDE="${1:-}" python3 -I -X utf8 -c '
import json, os, sys
try:
    d = json.loads(os.environ["JSON_SAUDE"]).get("data") or {}
except Exception:
    sys.exit(0)
'"$2" | tr -d '\r'
}

# versao_da_saude JSON — o campo `data.version`.
versao_da_saude() {
  _json_saude "${1:-}" '
v = d.get("version")
if isinstance(v, str): print(v)'
}

# deps_ok JSON — as dependências com status `ok`, uma por linha, em ordem.
deps_ok() {
  _json_saude "${1:-}" '
c = d.get("checks") or {}
for k in sorted(c):
    if isinstance(c[k], dict) and c[k].get("status") == "ok": print(k)'
}

# dependencias_que_pioraram ANTES DEPOIS — as que estavam `ok` e deixaram de
# estar (inclusive por sumir do relatório, ou por o app não responder mais). O
# que já estava ruim antes da versão nova não é culpa dela.
dependencias_que_pioraram() {
  local antes depois
  antes="$(deps_ok "${1:-}")"
  depois="$(deps_ok "${2:-}")"
  [ -n "$antes" ] || return 0
  comm -23 <(printf '%s\n' "$antes") <(printf '%s\n' "$depois" | sed '/^$/d')
}

# versoes_a_guardar N — lê o histórico (uma versão por linha, da mais velha à
# mais nova) e imprime as N últimas. São as que têm imagem e código guardados
# para uma volta.
versoes_a_guardar() { sed '/^$/d' | tail -n "${1:-3}"; }
