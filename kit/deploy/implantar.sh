#!/usr/bin/env bash
# kit/deploy/implantar.sh — leva um commit da `main` para a produção, e volta
# sozinho para a versão anterior se a nova não provar que está de pé.
#
# Quem chama é o GitHub Actions (.github/workflows/deploy.yml), por SSH, com a
# chave do usuário `zapsales-deploy`, que só consegue rodar kit/deploy/porta.sh.
# A porta chama isto via sudo:
#
#   sudo /usr/local/lib/zapsales-deploy/implantar.sh implantar <sha de 40>
#
# Instalado (e reinstalado, quando muda) por kit/deploy/instalar-acesso.sh — é
# uma CÓPIA fora de /opt/zapsales de propósito: o deploy troca o código de
# /opt/zapsales no meio do caminho, e o roteiro que comanda a troca não pode ser
# um dos arquivos trocados.
#
# O roteiro, e o que cada falha deixa para trás:
#
#   1. procedência  — o commit está na `main` e é MAIS NOVO que o que está no ar.
#                     Recusa → nada foi tocado (código 1).
#   2. imagens      — puxa as três `sha-<commit>` do GHCR e confere que cada uma
#                     diz ser daquele commit. Recusa → nada foi tocado (código 1).
#   3. troca        — guarda o .env, traz o código do commit e roda o
#                     kit/instalar.sh (dump do banco, baseline, `up -d`, prova
#                     do 307).
#   4. prova        — a rota de saúde responde a versão NOVA, nenhuma
#                     dependência que estava ok antes piorou, e app, worker e
#                     agendador ficam saudáveis e sem reiniciar durante a
#                     observação.
#   5. volta        — qualquer falha em 3 ou 4 traz de volta o código e as
#                     imagens anteriores. Voltou e provou → código 2. A volta
#                     também falhou → código 3 (alguém precisa olhar já).
#
# O banco NÃO volta. O baseline só acrescenta (doutrina de migrations), então o
# app anterior roda sobre o schema novo; e o kit faz um dump antes de aplicar o
# baseline, que é o caminho manual se algum dia isso não bastar.
#
# O deploy roda numa unidade própria do systemd (systemd-run): se a conexão SSH
# cair no meio — runner do GitHub cancelado, rede —, a troca termina do mesmo
# jeito, em vez de morrer pela metade. Quem chamou só deixa de ver o log.
set -Eeuo pipefail

LIB="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
SELF="$LIB/$(basename "${BASH_SOURCE[0]}")"
# Instalado, comum.sh mora ao lado (instalar-acesso.sh o copia); no repositório,
# em kit/lib/.
if [ -f "$LIB/comum.sh" ]; then
  # shellcheck source=../lib/comum.sh
  . "$LIB/comum.sh"
else
  # shellcheck source=../lib/comum.sh
  . "$LIB/../lib/comum.sh"
fi

RAIZ="${ZAPSALES_RAIZ:-/opt/zapsales}"
ESTADO="${ZAPSALES_DEPLOY_ESTADO:-/var/lib/zapsales-deploy}"
LOGS=/var/log/zapsales
REPO_URL="https://github.com/leandromastelliniai/ZapSales.git"
REGISTRO="ghcr.io/leandromastelliniai"
IMAGENS=(zapsales zapsales-worker zapsales-scheduler)
SERVICOS=(app worker scheduler)
# O que define QUAL código roda — e só isso. A volta restaura estas chaves e
# nenhuma outra: um segredo que o kit novo tenha gerado (env_garantir) precisa
# ficar, porque o próximo deploy o reusa e o que ele cifrou depende dele.
CHAVES_DE_IMAGEM=(ZAPSALES_IMAGENS COMPOSE_FILE APP_VERSION APP_IMAGE WORKER_IMAGE SCHEDULER_IMAGE
  APP_PULL_POLICY WORKER_PULL_POLICY SCHEDULER_PULL_POLICY)
OBSERVAR_SEGUNDOS="${ZAPSALES_DEPLOY_OBSERVAR:-120}"

# ─── Funções puras (testadas em tests/shell/deploy.test.sh) ──────────────────

sha_valido() { [[ "$1" =~ ^[0-9a-f]{40}$ ]]; }

# restaurar_chaves ANTERIOR ATUAL — devolve ao .env atual as chaves que dizem
# qual código roda, com o valor que tinham antes (ou ausentes, se não existiam).
restaurar_chaves() {
  local anterior="$1" atual="$2" chave valor
  for chave in "${CHAVES_DE_IMAGEM[@]}"; do
    valor="$(env_ler "$anterior" "$chave")"
    if [ -n "$valor" ]; then env_definir "$atual" "$chave" "$valor"; else env_remover "$atual" "$chave"; fi
  done
}

# resumo_saude — lê o JSON de /api/v1/health no stdin e imprime
# "<versão> <dep>=<estado> ...", em ordem. JSON ilegível vira "ilegivel".
resumo_saude() {
  python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)["data"]
except Exception:
    print("ilegivel"); sys.exit(0)
cs = d.get("checks") or {}
print(d.get("version") or "?", *sorted("%s=%s" % (k, (v or {}).get("status")) for k, v in cs.items()))
'
}

# saude_atende ANTES DEPOIS SHA — a versão no ar é o SHA (o app reporta o
# prefixo curto) e toda dependência que estava `ok` ANTES continua `ok`.
# "Não piorar", e não "tudo verde": um WAHA que já estava fora antes do deploy
# não pode impedir o deploy do conserto — nem disparar uma volta.
saude_atende() {
  local antes="$1" depois="$2" sha="$3" versao item
  versao="${depois%% *}"
  [ "${#versao}" -ge 7 ] && [[ "$sha" == "$versao"* ]] || return 1
  for item in ${antes#* }; do
    case "$item" in
      *=ok) [[ " $depois " == *" $item "* ]] || return 1 ;;
    esac
  done
}

# ─── Operações na VPS ────────────────────────────────────────────────────────

dc() { (cd "$RAIZ" && docker compose "$@"); }

sondar_saude() {
  curl -sk --max-time 10 --resolve "$DOMINIO:443:127.0.0.1" "https://$DOMINIO/api/v1/health" 2>/dev/null | resumo_saude
}

# estado_dos_servicos — "<serviço>:<id curto>:<status>:<saúde>:<reinícios>" por serviço.
estado_dos_servicos() {
  local s id
  for s in "${SERVICOS[@]}"; do
    id="$(dc ps -q "$s" 2>/dev/null | head -1)"
    if [ -z "$id" ]; then printf '%s:ausente ' "$s"; continue; fi
    printf '%s:%s:%s ' "$s" "${id:0:12}" \
      "$(docker inspect -f '{{.State.Status}}:{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}:{{.RestartCount}}' "$id")"
  done
}

servicos_saudaveis() {
  local item
  for item in $(estado_dos_servicos); do
    case "$item" in
      *:running:healthy:* | *:running:sem-healthcheck:*) ;;
      *) return 1 ;;
    esac
  done
}

esperar_servicos() { # SEGUNDOS
  local limite="$1" i=0
  until servicos_saudaveis; do
    i=$((i + 5))
    [ "$i" -lt "$limite" ] || return 1
    sleep 5
  done
}

trazer_codigo() { # SHA
  git -C "$ESTADO/repo.git" archive --format=tar "$1" | tar -x -C "$RAIZ" --no-same-owner
}

registrar() { # RESULTADO
  printf '%s %s %s→%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${REV_ANTERIOR:0:12}" "${SHA:0:12}" "$LOG" \
    >> "$ESTADO/historico"
}

# ─── 1. Procedência ──────────────────────────────────────────────────────────

SHA=""
REV_ANTERIOR=""
REV_ANTERIOR_TXT=""
SAUDE_ANTES=""
DOMINIO=""
LOG="${LOG:-}"

conferir_procedencia() {
  passo "Procedência de ${SHA:0:12}"
  local repo="$ESTADO/repo.git"
  [ -d "$repo" ] || git init --quiet --bare "$repo"
  git -C "$repo" fetch --quiet --no-tags "$REPO_URL" "+refs/heads/main:refs/remotes/origin/main" \
    || falha "Não consegui buscar a main em $REPO_URL. Nada foi alterado."
  git -C "$repo" cat-file -e "$SHA^{commit}" 2>/dev/null \
    || falha "O commit $SHA não existe na main do repositório. Nada foi alterado."
  git -C "$repo" merge-base --is-ancestor "$SHA" refs/remotes/origin/main \
    || falha "O commit $SHA não está na main. Só código que passou pela main vai para a produção."

  REV_ANTERIOR_TXT="$(tr -d '[:space:]' < "$RAIZ/.zapsales-revisao" 2>/dev/null || true)"
  [ -n "$REV_ANTERIOR_TXT" ] || falha "Não sei qual revisão está no ar: $RAIZ/.zapsales-revisao está vazio ou ausente."
  REV_ANTERIOR="$(git -C "$repo" rev-parse --verify -q "$REV_ANTERIOR_TXT^{commit}")" \
    || falha "A revisão no ar ($REV_ANTERIOR_TXT) não está na história da main. Ela foi publicada à mão de outra branch? O deploy automático não sobrescreve o que não sabe refazer."
  msg "  no ar: ${REV_ANTERIOR:0:12} · pedido: ${SHA:0:12}"

  if [ "$REV_ANTERIOR" = "$SHA" ]; then
    msg "  a produção já está neste commit — nada a fazer."
    exit 0
  fi
  git -C "$repo" merge-base --is-ancestor "$REV_ANTERIOR" "$SHA" \
    || falha "${SHA:0:12} é mais VELHO que o que está no ar (${REV_ANTERIOR:0:12}). O deploy automático não rebaixa a produção."

  DOMINIO="$(env_ler "$RAIZ/.env" DOMAIN)"
  [ -n "$DOMINIO" ] || falha "O .env de $RAIZ não tem DOMAIN."
  SAUDE_ANTES="$(sondar_saude)"
  msg "  saúde antes: $SAUDE_ANTES"
}

# ─── 2. Imagens ──────────────────────────────────────────────────────────────

baixar_imagens() {
  passo "Imagens sha-${SHA:0:12} do registro"
  local img ref rev
  for img in "${IMAGENS[@]}"; do
    ref="$REGISTRO/$img:sha-$SHA"
    docker pull --quiet "$ref" >/dev/null \
      || falha "A imagem $ref não está publicada (o CI de imagens terminou?). Nada foi alterado."
    rev="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$ref")"
    [ "$rev" = "$SHA" ] || falha "A imagem $ref diz ser do commit '$rev', não de $SHA. Nada foi alterado."
    msg "  $img: ok"
  done
}

# ─── 3 e 4. Troca e prova ────────────────────────────────────────────────────

trocar() {
  passo "Trocando o código para ${SHA:0:12}"
  cp -p "$RAIZ/.env" "$ESTADO/env.anterior"
  chmod 600 "$ESTADO/env.anterior"
  trazer_codigo "$SHA" || voltar "Não consegui extrair o código de ${SHA:0:12}."
  printf '%s\n' "$SHA" > "$RAIZ/.zapsales-revisao"

  passo "Rodando o kit de instalação (dump do banco, schema, stack, proxy)"
  local rc=0
  ZAPSALES_IMAGENS=registro ZAPSALES_VERSAO="sha-$SHA" "$RAIZ/kit/instalar.sh" || rc=$?
  [ "$rc" = "0" ] || voltar "O kit de instalação falhou (código $rc)."
}

provar() {
  passo "Provando a versão nova"
  local atual="" i
  for i in $(seq 1 36); do
    atual="$(sondar_saude)"
    saude_atende "$SAUDE_ANTES" "$atual" "$SHA" && break
    sleep 5
  done
  saude_atende "$SAUDE_ANTES" "$atual" "$SHA" \
    || voltar "A rota de saúde não confirmou a versão nova em 3 min: '$atual' (antes: '$SAUDE_ANTES')."
  msg "  /api/v1/health: $atual"

  esperar_servicos 180 || voltar "App, worker e agendador não ficaram saudáveis: $(estado_dos_servicos)"
  local foto
  foto="$(estado_dos_servicos)"
  msg "  serviços: $foto"

  msg "  observando por ${OBSERVAR_SEGUNDOS}s (reinício de contêiner ou piora da saúde = volta)..."
  local fim=$((SECONDS + OBSERVAR_SEGUNDOS)) agora
  while [ "$SECONDS" -lt "$fim" ]; do
    sleep 10
    agora="$(estado_dos_servicos)"
    [ "$agora" = "$foto" ] || voltar "Um serviço mudou durante a observação: antes '$foto', agora '$agora'."
    atual="$(sondar_saude)"
    saude_atende "$SAUDE_ANTES" "$atual" "$SHA" || voltar "A saúde piorou durante a observação: '$atual' (antes: '$SAUDE_ANTES')."
  done

  # Gancho de ensaio da volta: só existe quando root roda este arquivo
  # direto. A porta não o alcança — o sudo zera o ambiente.
  if [ "${ZAPSALES_DEPLOY_SIMULAR_FALHA:-}" = "1" ]; then
    voltar "Falha simulada (ZAPSALES_DEPLOY_SIMULAR_FALHA=1) — ensaio da volta."
  fi
  msg "  tudo de pé, versão ${SHA:0:12} confirmada."
}

# ─── 5. Volta ────────────────────────────────────────────────────────────────

voltar() { # MOTIVO
  set +e
  trap - ERR
  aviso "$1"
  passo "Voltando para a versão anterior (${REV_ANTERIOR:0:12})"
  local ok=1
  trazer_codigo "$REV_ANTERIOR" || ok=0
  printf '%s\n' "$REV_ANTERIOR_TXT" > "$RAIZ/.zapsales-revisao"
  restaurar_chaves "$ESTADO/env.anterior" "$RAIZ/.env"
  dc up -d --remove-orphans || ok=0

  local i atual=""
  if [ "$ok" = "1" ]; then
    ok=0
    for i in $(seq 1 48); do
      atual="$(sondar_saude)"
      if saude_atende "" "$atual" "$REV_ANTERIOR" && servicos_saudaveis; then ok=1; break; fi
      sleep 5
    done
  fi
  if [ "$ok" = "1" ]; then
    msg "  a produção voltou para ${REV_ANTERIOR:0:12}: $atual"
    msg "  O banco NÃO voltou (o schema novo é aditivo). Dump de antes da troca: kit/backup.sh status"
    registrar "VOLTOU"
    exit 2
  fi
  aviso "A VOLTA TAMBÉM FALHOU. Saúde: '$atual' · serviços: $(estado_dos_servicos)"
  aviso "Alguém precisa olhar a VPS agora: cd $RAIZ && docker compose ps"
  registrar "QUEBRADO"
  exit 3
}

limpar_imagens_antigas() {
  # Cada deploy traz três imagens novas; sem isto o disco enche em semanas.
  # Fica a do commit no ar e a da revisão anterior (o alvo de uma volta).
  local ref tag
  docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E "^$REGISTRO/zapsales(-worker|-scheduler)?:sha-[0-9a-f]{40}$" \
    | while read -r ref; do
        tag="${ref##*:sha-}"
        [ "$tag" = "$SHA" ] || [ "$tag" = "$REV_ANTERIOR" ] || docker image rm "$ref" >/dev/null 2>&1 || true
      done || true
}

# ─── Entrada ─────────────────────────────────────────────────────────────────

executar() { # SHA ARQUIVO_DE_RESULTADO
  SHA="$1"
  local resultado="$2"
  trap 'echo $? > "'"$resultado"'"' EXIT
  sha_valido "$SHA" || falha "SHA inválido."
  # fd 8: o kit/instalar.sh, filho deste processo, usa o 9 para a trava dele.
  exec 8>/run/zapsales-deploy.lock
  flock -n 8 || { aviso "Outro deploy em andamento."; exit 75; }
  passo "Deploy de $SHA — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  conferir_procedencia
  baixar_imagens
  trocar
  provar
  registrar "OK"
  limpar_imagens_antigas
  passo "Pronto: ${SHA:0:12} está no ar."
}

# Dispara a unidade e acompanha o log até ela terminar; devolve o código dela.
acompanhar() { # SHA
  local sha="$1" carimbo resultado unidade tp codigo
  carimbo="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$LOGS" "$ESTADO"
  chmod 700 "$ESTADO"
  LOG="$LOGS/deploy-$carimbo-${sha:0:7}.log"
  resultado="$ESTADO/resultado-$carimbo"
  unidade="zapsales-deploy-$carimbo"
  : > "$LOG"
  local extra=(--setenv=LOG="$LOG")
  [ -z "${ZAPSALES_DEPLOY_SIMULAR_FALHA:-}" ] || extra+=(--setenv=ZAPSALES_DEPLOY_SIMULAR_FALHA="$ZAPSALES_DEPLOY_SIMULAR_FALHA")
  [ -z "${ZAPSALES_DEPLOY_OBSERVAR:-}" ] || extra+=(--setenv=ZAPSALES_DEPLOY_OBSERVAR="$ZAPSALES_DEPLOY_OBSERVAR")

  systemd-run --quiet --collect --unit="$unidade" \
    --property=StandardOutput="append:$LOG" --property=StandardError="append:$LOG" \
    --setenv=PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" "${extra[@]}" \
    "$SELF" executar "$sha" "$resultado"

  tail -n +1 -F "$LOG" 2>/dev/null &
  tp=$!
  while systemctl is-active --quiet "$unidade"; do sleep 2; done
  sleep 1
  kill "$tp" 2>/dev/null || true
  wait "$tp" 2>/dev/null || true

  if [ ! -s "$resultado" ]; then
    aviso "O deploy terminou sem registrar o resultado. Log: $LOG"
    return 3
  fi
  codigo="$(tr -d '[:space:]' < "$resultado")"
  rm -f "$resultado"
  msg "log completo na VPS: $LOG"
  return "$codigo"
}

principal() {
  [ "$(id -u)" -eq 0 ] || falha "Rode como root."
  case "${1:-}" in
    implantar)
      [ "$#" -eq 2 ] && sha_valido "$2" || falha "Uso: $0 implantar <sha de 40 caracteres>"
      acompanhar "$2"
      ;;
    executar)
      # Uso INTERNO: só a unidade que o `acompanhar` cria chega aqui, com
      # ambiente limpo. Pelo sudo, o terceiro argumento seria um caminho
      # escolhido por quem chama, e o `trap` de saída grava nele como root —
      # sobrescrever /etc/passwd com um "1". Duas travas independentes: o
      # sudoers só libera `implantar *`, e aqui nem isso basta.
      [ -z "${SUDO_USER:-}" ] || falha "executar é uso interno; pelo sudo, só 'implantar <sha>'."
      [ "$#" -eq 3 ] || falha "Uso interno: $0 executar <sha> <arquivo de resultado>"
      [[ "$3" =~ ^${ESTADO}/resultado-[0-9]{8}T[0-9]{6}Z$ ]] || falha "Arquivo de resultado fora de $ESTADO."
      executar "$2" "$3"
      ;;
    *) falha "Uso: $0 implantar <sha de 40 caracteres>" ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then principal "$@"; fi
