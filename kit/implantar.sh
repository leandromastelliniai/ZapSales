#!/usr/bin/env bash
# kit/implantar.sh — implantação contínua da produção (issue #24).
#
# O workflow `.github/workflows/implantar.yml` decide QUANDO (topo da main com
# ci, e2e, perf e as imagens verdes); este arquivo decide SE e COMO, do lado da
# VPS, sem confiar no que o chamador diz:
#
#   1. recusa, ANTES de tocar em qualquer coisa: commit fora da main (perguntado
#      ao GitHub, não ao chamador), rebaixamento, e imagem cuja revisão gravada
#      não é o commit pedido;
#   2. instala pelo próprio kit (kit/instalar.sh, que faz o dump do banco antes
#      do baseline), com a imagem EXATA do commit — `sha-<commit>`, imutável;
#   3. prova: /api/v1/health responde a versão nova, nenhuma dependência que
#      estava ok piora, e app/worker/agendador ficam saudáveis e sem reinício
#      por 2 minutos;
#   4. qualquer falha depois de tocar volta sozinha para a versão anterior —
#      código, .env e imagens. O banco NÃO volta: o baseline é aditivo.
#
# Três formas de chamar:
#
#   sudo kit/implantar.sh acesso "ssh-ed25519 AAAA… github-implantar" [endereço público]
#       Prepara a VPS uma vez: instala o comando, cria o usuário zapsales-deploy
#       com a chave (sem terminal, sem túnel, um comando só) e imprime a linha
#       de known_hosts que vai para o segredo do GitHub.
#
#   ssh zapsales-deploy@vps "implantar <sha>"  (stdin: token do GitHub, opcional)
#       O que o workflow faz. A chave só alcança este comando; o token (o
#       GITHUB_TOKEN do job, que expira com ele) serve para perguntar ao GitHub
#       e puxar a imagem, e nunca é gravado em disco fora de uma pasta
#       temporária apagada na saída.
#
#   sudo zapsales-implantar <sha>
#       O mesmo, à mão, de dentro da VPS.
#
# Saída: 0 implantado (ou já estava nesta versão) · 2 recusado, nada foi tocado
#        3 falhou e voltou para a anterior · 4 falhou e a volta também falhou
set -Eeuo pipefail

# As bibliotecas ficam ao lado na cópia do repositório (kit/lib) e numa pasta
# própria na cópia instalada — que é a que roda, para o kit poder sobrescrever
# /opt/zapsales no meio de uma implantação sem trocar o script em execução.
AQUI="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
if [ -f "$AQUI/lib/implantar.sh" ]; then LIB="$AQUI/lib"; else LIB=/usr/local/lib/zapsales-implantar; fi
# shellcheck source=lib/comum.sh
. "$LIB/comum.sh"
# shellcheck source=lib/implantar.sh
. "$LIB/implantar.sh"

RAIZ="${ZAPSALES_PASTA:-/opt/zapsales}"
ENV_ARQ="$RAIZ/.env"
REPO_GITHUB="leandromastelliniai/ZapSales"
REGISTRO_IMAGENS="ghcr.io/leandromastelliniai"
IMAGENS=(zapsales zapsales-worker zapsales-scheduler)
USUARIO=zapsales-deploy
COMANDO=/usr/local/sbin/zapsales-implantar
LIB_INSTALADA=/usr/local/lib/zapsales-implantar
ESTADO=/var/lib/zapsales/implantar
VERSOES="$ESTADO/versoes"
LOGS=/var/log/zapsales
CORRIDA=/run/zapsales-implantar
GUARDAR=3
OBSERVAR_S="${ZAPSALES_OBSERVAR_S:-120}"

# ─── Instalação do comando e do acesso ───────────────────────────────────────

# instalar_comando — copia este script e as bibliotecas para fora de
# /opt/zapsales. Cada arquivo entra por `mv` (rename atômico): uma implantação
# em andamento segue lendo o arquivo antigo, intacto. O kit/instalar.sh chama
# isto a cada rodada — é como o comando se atualiza junto com o código.
instalar_comando() {
  exigir_root
  install -d -m 755 "$LIB_INSTALADA"
  local f
  for f in comum implantar; do
    install -m 644 "$AQUI/lib/$f.sh" "$LIB_INSTALADA/.$f.sh.novo"
    mv -f "$LIB_INSTALADA/.$f.sh.novo" "$LIB_INSTALADA/$f.sh"
  done
  install -m 755 "$AQUI/implantar.sh" "$(dirname "$COMANDO")/.zapsales-implantar.novo"
  mv -f "$(dirname "$COMANDO")/.zapsales-implantar.novo" "$COMANDO"
}

acesso() {
  exigir_root
  local chave="${1:-}" host="${2:-}" casa
  [[ "$chave" =~ ^(ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521)\ [A-Za-z0-9+/=]+(\ [^[:cntrl:]]*)?$ ]] \
    || falha "Passe a chave PÚBLICA, numa linha: sudo kit/implantar.sh acesso \"ssh-ed25519 AAAA… comentario\""
  command -v python3 >/dev/null || falha "python3 não está instalado (a implantação lê JSON com ele)."
  instalar_comando
  passo "Usuário $USUARIO"
  if ! id "$USUARIO" >/dev/null 2>&1; then
    # Shell de verdade é obrigatório: o sshd executa o comando forçado por ele.
    # Sem senha: só a chave abaixo entra.
    useradd --system --create-home --home-dir "/var/lib/$USUARIO" --shell /bin/bash "$USUARIO"
    msg "  criado."
  else
    msg "  já existe."
  fi
  passwd -l "$USUARIO" >/dev/null 2>&1 || true
  casa="$(getent passwd "$USUARIO" | cut -d: -f6)"
  # A pasta e o arquivo são do root: o próprio usuário não reescreve a regra
  # que o prende a um comando.
  install -d -m 755 -o root -g root "$casa/.ssh"
  printf 'restrict,command="%s" %s\n' "$COMANDO" "$chave" > "$casa/.ssh/authorized_keys.novo"
  chmod 644 "$casa/.ssh/authorized_keys.novo"
  mv -f "$casa/.ssh/authorized_keys.novo" "$casa/.ssh/authorized_keys"
  msg "  chave autorizada só para '$COMANDO' (sem terminal, sem túnel, sem encaminhamento)."

  passo "Permissão de root só para a implantação"
  local regra=/etc/sudoers.d/zapsales-implantar
  printf '# Gerenciado por kit/implantar.sh (issue #24). A chave do GitHub chega aqui.\n%s ALL=(root) NOPASSWD: %s\n' \
    "$USUARIO" "$COMANDO" > "$regra.novo"
  chmod 440 "$regra.novo"
  if command -v visudo >/dev/null && ! visudo -c -f "$regra.novo" >/dev/null 2>&1; then
    rm -f "$regra.novo"
    falha "O sudo recusou a regra nova; nada foi alterado."
  fi
  mv -f "$regra.novo" "$regra"
  msg "  $regra"

  passo "Para os segredos do GitHub (Settings › Secrets and variables › Actions)"
  # O endereço público pode não ser o primeiro de `hostname -I` (rede privada,
  # IPv6): passe-o como segundo argumento quando for o caso. Porta 22.
  [ -n "$host" ] || host="$(hostname -I | awk '{print $1}')"
  msg "  DEPLOY_SSH_HOST         $host"
  msg "  DEPLOY_SSH_KNOWN_HOSTS  (a linha abaixo, inteira)"
  msg "$host $(cut -d' ' -f1-2 /etc/ssh/ssh_host_ed25519_key.pub)"
  msg "  DEPLOY_SSH_KEY          a chave PRIVADA que corresponde à pública passada aqui"
  msg "  E a variável DEPLOY_AUTOMATICO=ligado liga a implantação automática."
}

# ─── A frente: o que o sshd chama ────────────────────────────────────────────

# Sem root, a única entrada é a do comando forçado: o sha vem do
# SSH_ORIGINAL_COMMAND, conferido aqui E de novo como root.
entrar_pelo_ssh() {
  local sha
  sha="$(sha_do_comando "${SSH_ORIGINAL_COMMAND:-}")" \
    || { printf 'Recusado: o único comando aceito é "implantar <sha de 40 caracteres>".\n' >&2; exit 2; }
  exec sudo -n "$COMANDO" "$sha"
}

# A implantação roda DESTACADA (sessão própria, saída num arquivo): se a conexão
# do GitHub cair no meio, ela termina — e volta, se for o caso — sozinha. A
# frente só acompanha o registro e devolve o código de saída.
frente() {
  local sha="$1" token="" registro situacao pid
  sha_valido "$sha" || { aviso "sha inválido: '$sha'"; exit 2; }
  # O token chega pela entrada padrão, nunca pela linha de comando (que
  # qualquer usuário da máquina lê em /proc).
  if [ ! -t 0 ]; then IFS= read -r -t 10 token || true; fi
  install -d -m 700 "$CORRIDA"
  mkdir -p "$LOGS"
  registro="$LOGS/implantar-$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:7}.log"
  situacao="$CORRIDA/$sha.$$.saida"
  rm -f "$situacao"
  ZAPSALES_TOKEN_GITHUB="$token" setsid "$COMANDO" --executar "$sha" "$situacao" > "$registro" 2>&1 < /dev/null &
  pid=$!
  token=""
  tail -n +1 -f --pid="$pid" "$registro" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  local codigo
  codigo="$(cat "$situacao" 2>/dev/null || echo 4)"
  rm -f "$situacao"
  msg "registro completo na VPS: $registro"
  exit "$codigo"
}

# ─── O executor ──────────────────────────────────────────────────────────────

SHA=""
ATUAL=""
DOMINIO=""
TOKEN=""
CONF_DOCKER=""
TOCOU=0
SAUDE_ANTES=""

recusar() { printf '\n\033[31m✖ RECUSADO: %s\033[0m\n  Nada foi alterado na instalação.\n' "$*" >&2; exit 2; }

# github CAMINHO — GET na API do repositório. O token vai por arquivo de
# configuração na entrada padrão do curl, não por argumento.
github() {
  local cabecalho=""
  [ -n "$TOKEN" ] && cabecalho="header = \"Authorization: Bearer $TOKEN\""
  # -L: o tarball responde 302 para o codeload; o curl não leva o cabeçalho de
  # autorização para o outro host.
  printf '%s\n' "$cabecalho" | curl -fsSL --max-time 120 -K - \
    -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO_GITHUB/$1"
}

# status_do_compare BASE CABECA — identical | ahead | behind | diverged | vazio.
status_do_compare() {
  github "compare/$1...$2?per_page=1" 2>/dev/null \
    | python3 -I -X utf8 -c 'import json,sys
try: print(json.load(sys.stdin).get("status",""))
except Exception: pass' | tr -d '\r' || true
}

# local_https CAMINHO [args do curl] — pelo proxy DESTA máquina, com o
# certificado conferido, sem depender do DNS de fora.
local_https() {
  local caminho="$1"; shift
  curl -s --max-time 10 --resolve "$DOMINIO:443:127.0.0.1" "$@" "https://$DOMINIO$caminho" 2>/dev/null || true
}

saude() { local_https /api/v1/health; }

id_do_servico() { (cd "$RAIZ" && docker compose ps -q "$1" 2>/dev/null | head -1) || true; }

imagem() { printf '%s/%s:sha-%s' "$REGISTRO_IMAGENS" "$1" "$2"; }

conferir_pedido() {
  passo "Conferindo o pedido: $SHA"
  [ -f "$ENV_ARQ" ] || recusar "não há instalação em $RAIZ (falta o .env)."
  DOMINIO="$(env_ler "$ENV_ARQ" DOMAIN)"
  [ -n "$DOMINIO" ] || recusar "o .env não tem DOMAIN."
  ATUAL="$(tr -d '[:space:]' < "$RAIZ/.zapsales-revisao" 2>/dev/null || true)"
  sha_valido "$ATUAL" || recusar "não sei qual commit está instalado ($RAIZ/.zapsales-revisao vazio ou abreviado): sem isso não há como recusar rebaixamento nem voltar. Grave o sha inteiro do que está no ar nesse arquivo."

  local st
  st="$(status_do_compare "$SHA" main)"
  sha_esta_na_main "$st" || recusar "o commit $SHA não está na main (o GitHub respondeu '${st:-nada}')."
  msg "  está na main (o GitHub respondeu '$st')."

  case "$(movimento "$(status_do_compare "$ATUAL" "$SHA")")" in
    mesma)   msg "  $SHA já é o que está no ar — nada a fazer."; exit 0 ;;
    avanca)  msg "  avança de ${ATUAL:0:7} para ${SHA:0:7}." ;;
    rebaixa) recusar "rebaixamento: $SHA é anterior ao que está no ar ($ATUAL)." ;;
    desvia)  recusar "$SHA não descende do que está no ar ($ATUAL)." ;;
    *)       recusar "não consegui comparar $ATUAL com $SHA no GitHub." ;;
  esac
}

conferir_imagens() {
  passo "Imagens do commit (etiqueta sha-$SHA)"
  CONF_DOCKER="$(mktemp -d "$CORRIDA/docker.XXXXXX")"
  export DOCKER_CONFIG="$CONF_DOCKER"
  if [ -n "$TOKEN" ]; then
    printf '%s' "$TOKEN" | docker login ghcr.io -u x-access-token --password-stdin >/dev/null 2>&1 \
      || aviso "o login no ghcr.io com o token falhou; tentando puxar sem ele."
  fi
  local n img rev
  for n in "${IMAGENS[@]}"; do
    img="$(imagem "$n" "$SHA")"
    docker pull --quiet "$img" >/dev/null 2>&1 || recusar "a imagem $img não existe ou não pôde ser puxada."
    rev="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$img" 2>/dev/null || true)"
    [ "$rev" = "$SHA" ] || recusar "a imagem $img diz ser do commit '${rev:-nenhum}', não de $SHA."
    msg "  $n: revisão confere."
  done
  # O login acaba aqui. O token é o do job do GitHub e é revogado quando o job
  # termina — se a conexão cair, um `pull` mais adiante com a credencial morta
  # seria recusado até para imagem pública, e uma versão boa voltaria à toa. O
  # kit não precisa dele: as três imagens já estão no disco, e etiqueta `sha-`
  # é imutável (kit/instalar.sh não a puxa de novo).
  rm -rf "$CONF_DOCKER"
  CONF_DOCKER=""
  unset DOCKER_CONFIG
}

baixar_codigo() {
  passo "Código do commit"
  mkdir -p "$VERSOES"
  if [ -f "$VERSOES/$SHA/kit/instalar.sh" ]; then msg "  já baixado."; return; fi
  local tmp
  tmp="$(mktemp -d "$VERSOES/.baixando.XXXXXX")"
  github "tarball/$SHA" 2>/dev/null | tar -xz -C "$tmp" --strip-components=1 \
    || { rm -rf "$tmp"; recusar "não consegui baixar o código de $SHA do GitHub."; }
  [ -f "$tmp/kit/instalar.sh" ] || { rm -rf "$tmp"; recusar "o código baixado de $SHA não tem kit/instalar.sh."; }
  rm -rf "${VERSOES:?}/$SHA"
  mv "$tmp" "$VERSOES/$SHA"
  msg "  $VERSOES/$SHA"
}

# guardar_o_que_esta_no_ar — o que a volta vai precisar: o .env de agora e o
# código de agora (a primeira implantação contínua chega numa pasta copiada à
# mão, que nunca passou por $VERSOES).
guardar_o_que_esta_no_ar() {
  passo "Guardando o que está no ar (${ATUAL:0:7}) para uma volta"
  install -d -m 700 "$ESTADO/$SHA"
  cp -p "$ENV_ARQ" "$ESTADO/$SHA/env.antes"
  if [ ! -f "$VERSOES/$ATUAL/kit/instalar.sh" ]; then
    local tmp
    tmp="$(mktemp -d "$VERSOES/.guardando.XXXXXX")"
    copiar_arvore "$RAIZ" "$tmp"
    rm -rf "${VERSOES:?}/$ATUAL"
    mv "$tmp" "$VERSOES/$ATUAL"
  fi
  SAUDE_ANTES="$(saude)"
  msg "  .env e código guardados; saúde de antes: $(deps_ok "$SAUDE_ANTES" | tr '\n' ' ')"
}

# copiar_arvore DE PARA — sobrepõe, sem o .env. Sobrepõe e não espelha: arquivo
# que só existe numa versão fica para trás depois de trocar (inofensivo — o
# compose e o kit só leem os arquivos que a versão em vigor nomeia), e um
# espelho com remoção apagaria o que mora em $RAIZ sem ser do repositório.
copiar_arvore() { tar -C "$1" --exclude=./.env -cf - . | tar -xf - -C "$2"; }

copiar_codigo() { # SHA — o código daquela versão em $RAIZ (o .env fica)
  copiar_arvore "$VERSOES/$1" "$RAIZ"
  printf '%s\n' "$1" > "$RAIZ/.zapsales-revisao"
}

instalar() {
  passo "Instalando ${SHA:0:7} pelo kit"
  TOCOU=1
  copiar_codigo "$SHA"
  # O registro inteiro do kit fica SÓ na VPS: ele traz o e-mail do
  # administrador e os domínios dos sites vizinhos, e o log de um workflow de
  # repositório público é público. Ao GitHub vão só os títulos dos passos do
  # kit e as linhas deste script (commit, domínio, dependências, motivo).
  local reg_kit rc_arq
  reg_kit="$LOGS/implantar-$(date -u +%Y%m%dT%H%M%SZ)-${SHA:0:7}-kit.log"
  rc_arq="$CORRIDA/$SHA.kit"
  rm -f "$rc_arq"
  msg "  registro completo do kit (só na VPS): $reg_kit"
  # O kit não recebe o token nem o login (já apagados). O trap ERR sai do grupo:
  # a falha do kit é tratada abaixo, uma vez.
  { trap - ERR; set +e
    ZAPSALES_IMAGENS=registro ZAPSALES_VERSAO="sha-$SHA" bash "$RAIZ/kit/instalar.sh" < /dev/null 2>&1
    printf '%s\n' "$?" > "$rc_arq"
  } | tee "$reg_kit" | { grep --line-buffered '▶' || true; }
  [ "$(cat "$rc_arq" 2>/dev/null)" = "0" ] || voltar "o kit/instalar.sh falhou — o motivo está no fim de $reg_kit, na VPS."
}

estado_dos_servicos() { # "serviço id reinícios" por linha
  local s id
  for s in app worker scheduler; do
    id="$(id_do_servico "$s")"
    [ -n "$id" ] || { printf '%s ausente 0\n' "$s"; continue; }
    printf '%s %s\n' "$s" "$(docker inspect -f '{{.Id}} {{.RestartCount}}' "$id" 2>/dev/null || echo "ausente 0")"
  done
}

servicos_saudaveis() {
  local s id estado
  for s in app worker scheduler; do
    id="$(id_do_servico "$s")"
    [ -n "$id" ] || return 1
    estado="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
    [ "$estado" = "healthy" ] || [ "$estado" = "running" ] || return 1
  done
}

provar() {
  passo "Provando a versão nova"
  local s="" v=""
  for _ in $(seq 1 30); do
    s="$(saude)"
    v="$(versao_da_saude "$s")"
    versao_bate "$v" "$SHA" && break
    sleep 4
  done
  versao_bate "$v" "$SHA" || voltar "/api/v1/health responde a versão '${v:-nenhuma}', não ${SHA:0:7}."
  msg "  /api/v1/health responde $v."
  local piores
  piores="$(dependencias_que_pioraram "$SAUDE_ANTES" "$s" | tr '\n' ' ')"
  [ -z "${piores// /}" ] || voltar "dependência que estava ok piorou: $piores"
  msg "  nenhuma dependência piorou ($(deps_ok "$s" | tr '\n' ' ')ok)."

  # O worker tem healthcheck com início de 20 s e intervalo de 30 s: logo depois
  # do kit ele ainda pode estar `starting`, o que não é falha.
  local espera=0
  until servicos_saudaveis; do
    [ "$espera" -lt 180 ] || voltar "app, worker ou agendador não ficaram saudáveis em 180s."
    sleep 5
    espera=$((espera + 5))
  done
  local base agora t=0
  base="$(estado_dos_servicos)"
  msg "  observando app, worker e agendador por ${OBSERVAR_S}s (saudáveis e sem reinício)…"
  while [ "$t" -lt "$OBSERVAR_S" ]; do
    sleep 10
    t=$((t + 10))
    agora="$(estado_dos_servicos)"
    [ "$agora" = "$base" ] || voltar "reinício durante a observação: antes [$base] · agora [$agora]"
    servicos_saudaveis || voltar "um serviço deixou de estar saudável aos ${t}s."
  done
  piores="$(dependencias_que_pioraram "$SAUDE_ANTES" "$(saude)" | tr '\n' ' ')"
  [ -z "${piores// /}" ] || voltar "dependência que estava ok piorou durante a observação: $piores"
  msg "  ${OBSERVAR_S}s sem reinício; tudo saudável."
}

# voltar MOTIVO — põe de volta código, .env e imagens da versão anterior. O
# banco fica como está: o baseline é aditivo, e o código anterior roda sobre ele.
voltar() {
  trap - ERR
  printf '\n\033[31m✖ FALHOU: %s\033[0m\n' "$*" >&2
  passo "Voltando para ${ATUAL:0:7}"
  local ok=1
  copiar_codigo "$ATUAL" || ok=0
  cp -p "$ESTADO/$SHA/env.antes" "$ENV_ARQ" || ok=0
  chmod 600 "$ENV_ARQ" || true
  (cd "$RAIZ" && docker compose up -d --remove-orphans) || ok=0
  local cod=""
  for _ in $(seq 1 60); do
    servicos_saudaveis && cod="$(local_https / -o /dev/null -w '%{http_code}')"
    [ "$cod" = "307" ] && break
    sleep 4
  done
  [ "$cod" = "307" ] || ok=0
  # A versão que respondia antes tem de voltar a responder (quando havia uma).
  local v_antes v_agora=""
  v_antes="$(versao_da_saude "$SAUDE_ANTES")"
  if [ -n "$v_antes" ]; then
    v_agora="$(versao_da_saude "$(saude)")"
    [ "$v_agora" = "$v_antes" ] || ok=0
  fi
  if [ "$ok" = "1" ]; then
    msg "  de volta em ${ATUAL:0:7}: serviços saudáveis, https://$DOMINIO/ → 307${v_antes:+, /api/v1/health responde $v_antes}."
    exit 3
  fi
  aviso "A VOLTA TAMBÉM FALHOU (https://$DOMINIO/ → '${cod:-nada}', versão '${v_agora:-?}' em vez de '${v_antes:-?}'). Veja: cd $RAIZ && docker compose ps"
  exit 4
}

# Erro inesperado (comando que falhou sob set -e) depois de tocar também volta.
ao_errar() {
  local linha="$1"
  # Com `set -E` o trap vale também dentro de $(...). Lá ele só sai com erro: a
  # atribuição no shell de cima falha e o trap de lá decide — uma vez.
  if [ "${BASH_SUBSHELL:-0}" -gt 0 ]; then exit 1; fi
  if [ "$TOCOU" = "1" ]; then voltar "erro inesperado na linha $linha de kit/implantar.sh."; fi
  printf '\n\033[31m✖ RECUSADO: erro inesperado na linha %s, antes de alterar a instalação.\033[0m\n' "$linha" >&2
  exit 2
}

# O código de saída fica num arquivo que a frente lê — inclusive o 2 de uma
# recusa e o 3/4 da volta, que saem por `exit` de dentro de funções. E o login
# do registro (DOCKER_CONFIG temporário) não sobrevive à implantação.
SITUACAO=""
ao_sair_executor() {
  local c=$?
  if [ -n "$CONF_DOCKER" ]; then rm -rf "$CONF_DOCKER"; fi
  if [ -n "$SITUACAO" ]; then printf '%s\n' "$c" > "$SITUACAO"; fi
}

podar() {
  passo "Guardando só as $GUARDAR últimas versões"
  printf '%s\n' "$SHA" >> "$ESTADO/historico"
  local manter v n
  manter="$(versoes_a_guardar "$GUARDAR" < "$ESTADO/historico" | awk '!v[$0]++')"
  # O que estava no ar antes da primeira implantação contínua também conta.
  manter="$(printf '%s\n%s\n' "$manter" "$ATUAL")"
  for v in "$VERSOES"/*/; do
    v="$(basename "$v")"
    sha_valido "$v" || continue
    grep -qx "$v" <<< "$manter" && continue
    rm -rf "${VERSOES:?}/$v" "${ESTADO:?}/$v"
    for n in "${IMAGENS[@]}"; do docker image rm "$(imagem "$n" "$v")" >/dev/null 2>&1 || true; done
    msg "  removida: ${v:0:7}"
  done
}

executar() {
  SHA="$1"
  SITUACAO="$2"
  trap ao_sair_executor EXIT
  trap 'ao_errar $LINENO' ERR
  TOKEN="${ZAPSALES_TOKEN_GITHUB:-}"
  unset ZAPSALES_TOKEN_GITHUB
  exigir_root
  command -v python3 >/dev/null || recusar "python3 não está instalado."
  install -d -m 700 "$CORRIDA" "$ESTADO"
  exec 8>/run/zapsales-implantar.lock
  flock -n 8 || recusar "outra implantação está em andamento."
  msg "Implantação de $SHA — $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  conferir_pedido
  conferir_imagens
  baixar_codigo
  guardar_o_que_esta_no_ar
  instalar
  provar
  # Ensaio da volta: a versão nova passou em tudo, e mesmo assim volta. Só
  # alcançável como root na própria VPS — pela chave do GitHub o sudo limpa o
  # ambiente, e esta variável nunca chega aqui.
  if [ "${ZAPSALES_ENSAIAR_VOLTA:-}" = "1" ]; then voltar "ensaio da volta (ZAPSALES_ENSAIAR_VOLTA=1)."; fi
  # Daqui em diante a versão nova está aprovada: nenhum erro da arrumação a
  # derruba.
  trap - ERR
  TOCOU=0
  podar || aviso "a arrumação das versões antigas falhou; a implantação vale."
  TOKEN=""
  passo "Implantado: ${SHA:0:7} está no ar em https://$DOMINIO"
}

case "${1:-}" in
  acesso)            shift; acesso "$@" ;;
  instalar-comando)  instalar_comando ;;
  --executar)        shift; executar "$@" ;;
  "")
    [ "$(id -u)" -eq 0 ] && falha "Uso: sudo zapsales-implantar <sha> · sudo kit/implantar.sh acesso \"<chave pública>\""
    entrar_pelo_ssh ;;
  *)
    [ "$(id -u)" -eq 0 ] || entrar_pelo_ssh
    frente "$1" ;;
esac
