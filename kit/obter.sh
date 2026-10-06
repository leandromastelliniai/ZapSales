#!/usr/bin/env bash
# kit/obter.sh — o comando único: baixa o ZapSales para /opt/zapsales e instala.
#
#   curl -fsSL https://raw.githubusercontent.com/leandromastelliniai/ZapSales/main/kit/obter.sh | sudo bash
#
# Feito para a VPS que ainda não tem nada (issue #12): ele é baixado SOZINHO,
# então não pode depender de nenhum outro arquivo do kit. O que faz:
#
#   1. instala o git, se faltar;
#   2. escolhe a versão: a última release publicada (a tag vX.Y.Z); sem release
#      nenhuma, o topo da `main`, com as imagens construídas na própria VPS
#      (ver abaixo);
#   3. clona em /opt/zapsales — ou, se já existe, atualiza para essa versão;
#   4. chama kit/instalar.sh, que pergunta o que precisa e faz o resto.
#
# Rodar de novo é a atualização: traz a versão nova e roda o kit outra vez.
#
# Variáveis (passe DEPOIS do sudo: `curl … | sudo ZAPSALES_DOMINIO=x bash`):
#   ZAPSALES_REF     tag ou ramo a instalar (padrão: a última release)
#   ZAPSALES_PASTA   onde fica o código (padrão: /opt/zapsales)
#   ZAPSALES_REPO    de onde clonar (padrão: o repositório público do projeto)
#   + todas as do kit/instalar.sh (ZAPSALES_DOMINIO, ZAPSALES_EMAIL, …)
#
# ─── Por que a `main` constrói as imagens ──────────────────────────────────
#
# A doutrina de packaging (docs/doctrine/packaging.md) diz que instalação de
# cliente aponta para NÚMERO de versão, nunca para tag móvel — e as imagens com
# número só existem a partir da primeira release. Antes dela, o único jeito de
# instalar sem apontar para `latest` é construir na VPS (ZAPSALES_IMAGENS=
# construir), que é exceção documentada. Com uma release publicada, este
# arquivo nunca toma esse caminho.
set -Eeuo pipefail

REPO="${ZAPSALES_REPO:-https://github.com/leandromastelliniai/ZapSales}"
PASTA="${ZAPSALES_PASTA:-/opt/zapsales}"

msg()   { printf '%s\n' "$*"; }
passo() { printf '\n\033[32m▶ %s\033[0m\n' "$*"; }
aviso() { printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }
falha() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# tag_da_ultima_release — lê o JSON de /releases/latest da API do GitHub na
# entrada e imprime o tag_name (vazio se não há release). Sem jq: a VPS nova
# não o tem, e o campo é uma linha simples.
tag_da_ultima_release() {
  sed -nE 's/^[[:space:]]*"tag_name":[[:space:]]*"([^"]+)".*/\1/p' | head -1
}

# api_do_repo — https://github.com/dono/repo → https://api.github.com/repos/dono/repo
api_do_repo() {
  printf '%s\n' "$1" | sed -E 's#^https://github\.com/#https://api.github.com/repos/#; s#\.git$##; s#/$##'
}

# ref_pela_resposta CODIGO_HTTP TAG_ATUAL — decide a ref pela resposta da API
# (o corpo vem na entrada). Pura, para o gate de shell.
#
# Só o 404 quer dizer "não há release": aí vale a `main`. Qualquer outra falha
# (sem rede, limite de 60 consultas/hora da API anônima, 5xx) NÃO pode virar
# `main` — uma instalação fixada numa versão iria parar na tag móvel e começar
# a construir na VPS por causa de um soluço do GitHub (packaging, invariante
# 3). Nesse caso fica a tag que já está em uso, ou o kit para.
ref_pela_resposta() {
  local codigo="$1" atual="$2" tag
  tag="$(tag_da_ultima_release)"
  if [ "$codigo" = "200" ] && [ -n "$tag" ]; then printf '%s\n' "$tag"; return; fi
  if [ "$codigo" = "404" ]; then printf 'main\n'; return; fi
  if [ -n "$atual" ]; then printf '%s\n' "$atual"; return; fi
  printf 'erro:Não consegui perguntar ao GitHub qual é a última versão (resposta %s). Tente de novo em alguns minutos, ou fixe a versão com ZAPSALES_REF=vX.Y.Z.\n' "${codigo:-sem rede}"
}

escolher_ref() {
  if [ -n "${ZAPSALES_REF:-}" ]; then printf '%s\n' "$ZAPSALES_REF"; return; fi
  local corpo codigo atual=""
  corpo="$(mktemp)"
  codigo="$(curl -sSL --max-time 20 -o "$corpo" -w '%{http_code}' "$(api_do_repo "$REPO")/releases/latest" 2>/dev/null || true)"
  [ -d "$PASTA/.git" ] && atual="$(git -C "$PASTA" describe --tags --exact-match 2>/dev/null || true)"
  ref_pela_resposta "$codigo" "$atual" < "$corpo"
  rm -f "$corpo"
}

obter_codigo() { # REF
  local ref="$1"
  if [ -d "$PASTA/.git" ]; then
    passo "Atualizando o código em $PASTA para $ref"
    if [ -n "$(git -C "$PASTA" status --porcelain --untracked-files=no)" ]; then
      falha "$PASTA tem arquivos do projeto alterados à mão (git status). O kit não os sobrescreve: guarde a alteração e rode de novo."
    fi
    git -C "$PASTA" fetch --quiet --tags origin
    if git -C "$PASTA" rev-parse --verify --quiet "refs/tags/$ref" >/dev/null; then
      git -C "$PASTA" -c advice.detachedHead=false checkout --quiet "refs/tags/$ref"
    else
      git -C "$PASTA" checkout --quiet -B "$ref" "origin/$ref"
    fi
  elif [ -e "$PASTA" ] && [ -n "$(ls -A "$PASTA" 2>/dev/null)" ]; then
    falha "$PASTA já existe e não é uma cópia do repositório. Escolha outra pasta com ZAPSALES_PASTA=… ou esvazie esta."
  else
    passo "Baixando o ZapSales ($ref) para $PASTA"
    # `blob:none`: o histórico vem só como índice, e cada arquivo quando é
    # preciso — o clone de uma VPS nova não carrega anos de blobs.
    git clone --quiet --filter=blob:none --branch "$ref" "$REPO" "$PASTA"
  fi
  msg "  $(git -C "$PASTA" log -1 --format='%h %s' | cut -c1-90)"
}

principal() {
  [ "$(id -u)" -eq 0 ] || falha "Rode como root: curl -fsSL … | sudo bash"
  command -v apt-get >/dev/null || falha "Este kit é para Ubuntu ou Debian (não achei o apt-get)."

  passo "Preparando a máquina"
  if ! command -v git >/dev/null || ! command -v curl >/dev/null; then
    apt-get update -qq && apt-get install -y -qq git curl ca-certificates >/dev/null
  fi
  msg "  git e curl prontos."

  local ref
  ref="$(escolher_ref)"
  case "$ref" in erro:*) falha "${ref#erro:}" ;; esac
  if [ "$ref" = "main" ] && [ -z "${ZAPSALES_REF:-}" ]; then
    aviso "Ainda não há versão publicada do ZapSales: instalando o topo da main, com as imagens construídas nesta VPS (leva mais tempo — de 10 a 40 minutos, conforme a máquina)."
    export ZAPSALES_IMAGENS="${ZAPSALES_IMAGENS:-construir}"
  elif [[ "$ref" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    # Versão publicada tem imagem publicada: puxar, nunca construir. Sem isto o
    # `construir` que o .env lembra de antes da primeira release seguiria
    # valendo para sempre. Quem precisa construir passa ZAPSALES_IMAGENS.
    export ZAPSALES_IMAGENS="${ZAPSALES_IMAGENS:-registro}"
  fi
  obter_codigo "$ref"

  # O kit pergunta pelo terminal. Num `curl | bash` a entrada padrão é o próprio
  # script, então as perguntas vão para o terminal de quem rodou — quando há um.
  if [ ! -t 0 ] && { : < /dev/tty; } 2>/dev/null; then
    exec "$PASTA/kit/instalar.sh" < /dev/tty
  fi
  exec "$PASTA/kit/instalar.sh"
}

# O gate de shell carrega as funções sem rodar a instalação.
[ "${ZAPSALES_OBTER_SO_FUNCOES:-}" = "1" ] || principal "$@"
