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

# ─── O que sai pelo SSH (issue #39) ──────────────────────────────────────────
#
# O repositório é público: o que a frente devolve pelo SSH vai para o log do
# job `implantar` (que qualquer pessoa lê) e para o corpo da issue
# `implantacao-falhou`. A máscara do Actions não conhece nenhum segredo da VPS.
# O registro completo fica só em /var/log/zapsales/implantar-*; pela sessão
# saem só as linhas que o executor escreveu, e redigidas.

# MARCA_DE_ETAPA — prefixo de toda linha que o executor escreve por conta
# própria. Saída bruta (docker, psql, curl, kit/instalar.sh) não o tem e fica
# só no registro, mesmo quando imita uma etapa.
MARCA_DE_ETAPA='[implantar] '

# _etapa TEXTO — uma linha marcada por linha de TEXTO (um motivo pode citar um
# estado de várias linhas, e a 2ª linha sem marca sumiria da saída).
_etapa() {
  local l
  while IFS= read -r l || [ -n "$l" ]; do printf '%s%s\n' "$MARCA_DE_ETAPA" "$l"; done <<< "${1:-}"
}

# usar_saida_de_etapa — troca msg/passo/aviso/falha (kit/lib/comum.sh) por
# versões que marcam cada linha, sem cor: o registro é arquivo, e a sessão é
# log de CI. Só o executor chama; acesso e frente seguem com as de comum.sh.
usar_saida_de_etapa() {
  msg()   { _etapa "$*"; }
  passo() { _etapa ""; _etapa "▶ $*"; }
  aviso() { _etapa "⚠ $*" >&2; }
  falha() { { _etapa ""; _etapa "✖ $*"; } >&2; exit 1; }
}

# titulos_do_kit — lê a saída bruta do kit/instalar.sh e devolve, como etapa,
# só os títulos dos passos dele: a linha que COMEÇA com `▶ ` (o `passo` de
# kit/lib/comum.sh, frases fixas do kit). Uma linha bruta com `▶ ` no meio
# não é título e fica só no registro do kit.
titulos_do_kit() {
  local l
  sed -u 's/\x1b\[[0-9;]*[A-Za-z]//g' | while IFS= read -r l || [ -n "$l" ]; do
    case "$l" in "▶ "*) msg "  kit: ${l#"▶ "}" ;; esac
  done
  return 0
}

# etapas_do_registro — camada 1: do registro, só as linhas marcadas, sem a
# marca e sem código de cor ou \r. `sed -u`: linha a linha, sem esperar
# encher buffer. A regex é MARCA_DE_ETAPA escapada à mão — se as duas
# divergirem, nenhuma etapa sai, e tests/shell/kit-implantar-saida.test.sh
# reprova.
etapas_do_registro() {
  sed -u -n -e '/^\[implantar\] /!d' -e 's/^\[implantar\] //' \
    -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's/\r//g' -e p
}

# redigir — camada 2: troca por [redigido] os formatos conhecidos de segredo,
# para o que a camada 1 deixar passar (um segredo interpolado numa etapa). O
# nome da variável e a forma da URL ficam: o motivo continua legível.
#   GitHub (ghp_ ghs_ gho_ ghu_ ghr_ github_pat_) · bearer da API (zps_) ·
#   JWT (as chaves do Supabase) · sk-… (Anthropic, OpenAI) · Bearer/Basic
#   seguido de algo com cara de credencial (8+ caracteres) · credencial em URL
#   (postgres://usuario:senha@, inclusive senha com @) · chave privada PEM,
#   do BEGIN ao END · NOME=valor, NOME: valor e "nome": "valor" quando o nome
#   tem forma de segredo (é o que cobre os nomes de .env.example e do .env que
#   o kit grava). A lista em vigor é este corpo, não a documentação.
redigir() {
  local nome='[A-Za-z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|_PASS|_PWD|SENHA|DSN|CREDENTIAL|DB_URL|DB_ADMIN_URL|DATABASE_URL)[A-Za-z0-9_]*'
  sed -u -E \
    -e "s/\b($nome)([\"']?[[:space:]]*[=:][[:space:]]*)(\"[^\"]*\"|'[^']*'|[^[:space:]\"',;]+)/\1\3[redigido]/Ig" \
    -e 's#([A-Za-z][A-Za-z0-9+.-]*://)[^/[:space:]]+@#\1[redigido]@#g' \
    -e 's/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]{8,}/[redigido]/g' \
    -e 's/\bzps_[A-Za-z0-9_-]{8,}/[redigido]/g' \
    -e 's/eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]*)*/[redigido]/g' \
    -e 's/(^|[^A-Za-z0-9_-])sk-[A-Za-z0-9_-]{8,}/\1[redigido]/g' \
    -e 's#\b(bearer|basic)([[:space:]]+)[A-Za-z0-9._~+/=-]{8,}#\1\2[redigido]#Ig' \
    -e 's/-----BEGIN [A-Z ]*PRIVATE KEY-----.*-----END [A-Z ]*PRIVATE KEY-----/[redigido]/' \
    -e '/-----BEGIN [A-Z ]*PRIVATE KEY-----/,/-----END [A-Z ]*PRIVATE KEY-----/s/.*/[redigido]/'
}

# saida_para_o_ssh — as duas camadas, em fluxo (linha a linha: a sessão mostra
# a implantação andando).
saida_para_o_ssh() { etapas_do_registro | redigir; }
