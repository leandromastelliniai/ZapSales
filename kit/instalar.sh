#!/usr/bin/env bash
# kit/instalar.sh — instala (ou atualiza) o ZapSales numa VPS. Dois modos, que o
# kit escolhe sozinho pelo dono das portas 80/443:
#
#   limpa       (issue #12) ninguém atende as portas: a VPS é só do ZapSales, e
#               o Caddy da stack as ocupa e tira o certificado HTTPS sozinho.
#   convivendo  (issue #3) um Caddy ou Nginx do sistema já serve outros sites:
#               a stack escuta só no 127.0.0.1 e o proxy ganha UM bloco.
#
#   sudo ZAPSALES_DOMINIO=zapsales.suaempresa.com ZAPSALES_EMAIL=voce@suaempresa.com \
#        kit/instalar.sh
#
# Numa VPS que ainda não tem o código, o comando único é o kit/obter.sh (baixa
# a versão publicada para /opt/zapsales e chama este arquivo). Guia de cada
# pergunta: docs/runbooks/instalacao-vps-limpa.md.
#
# Sem as variáveis, o kit pergunta. Rodar de novo é seguro e é como se
# atualiza: segredos nunca são regerados, o bloco do proxy é substituído (não
# duplicado), o baseline.sql é reaplicado, o primeiro administrador não é
# recriado e o modo não muda sozinho.
#
# O que ele faz, em ordem:
#   1. confere a máquina e decide o modo pelo dono das portas 80/443;
#   2. (convivendo) fotografa os sites que já estão no ar e os vigia a cada 5 s;
#   3. gera o .env (segredos só na primeira vez);
#   4. prepara as imagens (puxa do registro ou constrói — ZAPSALES_IMAGENS);
#   5. sobe o Supabase, aplica o schema, sobe o resto da stack;
#   6. cria o primeiro administrador (só na primeira vez);
#   7. (convivendo) acrescenta UM bloco ao proxy do sistema e recarrega;
#   8. agenda os backups;
#   9. prova: o domínio responde por HTTPS com certificado válido, nenhuma porta
#      nossa fora do esperado e, no convivendo, os vizinhos seguiram no ar.
#
# Variáveis aceitas (todas opcionais na segunda rodada — o .env lembra):
#   ZAPSALES_DOMINIO       domínio do ZapSales (o DNS já tem de apontar para cá)
#   ZAPSALES_EMAIL         e-mail do primeiro administrador e do aviso de certificado
#   ZAPSALES_EMPRESA       nome da organização (padrão: "Minha Empresa")
#   ZAPSALES_IDIOMA        pt-BR | es | en — idioma com que a empresa nasce (padrão: pt-BR)
#   ZAPSALES_SENHA         senha do primeiro administrador (padrão: gerada)
#   ZAPSALES_MODO          limpa | convivendo (padrão: o kit decide pelas portas)
#   ZAPSALES_IMAGENS       registro | construir (padrão: registro)
#   ZAPSALES_VERSAO        versão das imagens no registro (padrão: a do commit, `sha-<commit>`,
#                          se a implantação contínua a instalou; senão a do package.json)
#   ZAPSALES_IGNORAR_DNS=1 instala mesmo com o DNS ainda não apontado
set -Eeuo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$KIT")"
# shellcheck source=lib/comum.sh
. "$KIT/lib/comum.sh"
# shellcheck source=lib/segredos.sh
. "$KIT/lib/segredos.sh"
# shellcheck source=lib/proxy.sh
. "$KIT/lib/proxy.sh"
# shellcheck source=lib/stack.sh
. "$KIT/lib/stack.sh"

ENV_ARQ="$RAIZ/.env"
ESTADO=/etc/zapsales
LOGS=/var/log/zapsales
BACKUPS=/var/backups/zapsales
REGISTRO_IMAGENS="ghcr.io/leandromastelliniai"

exigir_root
mkdir -p "$ESTADO" "$LOGS"
chmod 700 "$ESTADO"
exec 9>/run/zapsales-kit.lock
flock -n 9 || falha "Outra execução do kit está em andamento."

# ─── 1. A máquina ────────────────────────────────────────────────────────────

versao_maior_ou_igual() { # A B — A >= B (x.y.z)
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

verificar_maquina() {
  passo "Conferindo a máquina"
  local faltam=()
  for c in curl openssl ss awk flock getent; do command -v "$c" >/dev/null || faltam+=("$c"); done
  if [ "${#faltam[@]}" -gt 0 ]; then
    msg "  instalando: ${faltam[*]}"
    apt-get update -qq && apt-get install -y -qq curl openssl iproute2 util-linux libc-bin >/dev/null
  fi
  garantir_docker
  local v
  v="$(docker compose version --short 2>/dev/null | sed 's/^v//')"
  [ -n "$v" ] || falha "O plugin 'docker compose' não está instalado."
  # `!override` (docker-compose.convivio.yml) existe desde o Compose 2.24.
  versao_maior_ou_igual "$v" "2.24.0" || falha "Docker Compose $v é antigo demais; precisa de 2.24 ou mais novo."
  local mem_mb disco_gb
  mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
  disco_gb="$(df -BG --output=avail "$RAIZ" | tail -1 | tr -dc '0-9')"
  msg "  $(. /etc/os-release && echo "$PRETTY_NAME") · $(uname -m) · ${mem_mb} MB de RAM · ${disco_gb} GB livres · Compose $v"
  [ "$mem_mb" -ge 3500 ] || aviso "Menos de 4 GB de RAM: a stack inteira tem teto somado acima disso."
  [ "$disco_gb" -ge 20 ] || aviso "Menos de 20 GB livres: banco, mídias e 30 dias de dump precisam de espaço."
}

PROXY=""
MODO=""
CADDYFILE_SISTEMA=""

# O docker-proxy nas portas 80/443 é o Caddy da NOSSA stack? É o caso da segunda
# rodada do modo limpa — e só ele: um contêiner de outro projeto segue alheio.
portas_sao_do_nosso_caddy() {
  docker ps --filter "label=com.docker.compose.project=zapsales" \
    --filter "label=com.docker.compose.service=caddy" --format 'caddy {{.Ports}}' 2>/dev/null \
    | portas_publicas | grep -qE ':(80|443)->'
}

detectar_o_proxy() {
  passo "Procurando quem atende as portas 80/443"
  PROXY="$(ss -ltnp | detectar_proxy)"
  if [ "$PROXY" = "docker" ] && portas_sao_do_nosso_caddy; then PROXY="zapsales"; fi
  local decisao
  decisao="$(decidir_modo "$PROXY" "$(env_ler "$ENV_ARQ" ZAPSALES_MODO)" "${ZAPSALES_MODO:-}")"
  case "$decisao" in
    erro:*) falha "${decisao#erro:}" ;;
  esac
  MODO="$decisao"
  if [ "$MODO" = "limpa" ]; then
    msg "  modo VPS limpa: as portas 80/443 ficam com o Caddy do ZapSales, que emite o certificado HTTPS sozinho."
    return
  fi
  case "$PROXY" in
    caddy-host)
      CADDYFILE_SISTEMA="$(systemctl show caddy -p ExecStart --value 2>/dev/null | grep -oE -- '--config [^ ;]+' | awk '{print $2}' | head -1)"
      CADDYFILE_SISTEMA="${CADDYFILE_SISTEMA:-/etc/caddy/Caddyfile}"
      [ -f "$CADDYFILE_SISTEMA" ] || falha "Caddy encontrado, mas não achei o Caddyfile dele ($CADDYFILE_SISTEMA)."
      msg "  Caddy do sistema, configuração em $CADDYFILE_SISTEMA."
      ;;
    nginx-host)
      command -v nginx >/dev/null || falha "Nginx escuta nas portas, mas o comando nginx não está no PATH."
      msg "  Nginx do sistema."
      ;;
  esac
  msg "  modo convivendo: o ZapSales escuta só no 127.0.0.1 e o proxy do sistema ganha um bloco."
}

# ─── 2. A configuração ───────────────────────────────────────────────────────

DOMINIO=""
EMAIL=""
EMPRESA=""
IDIOMA=""
SENHA=""

perguntar() { # "pergunta" — só pergunta com terminal; sem ele devolve vazio
  local valor=""
  if [ -t 0 ]; then read -r -p "$1: " valor; fi
  printf '%s' "$valor"
}

ler_configuracao() {
  passo "Configuração"
  DOMINIO="${ZAPSALES_DOMINIO:-$(env_ler "$ENV_ARQ" DOMAIN)}"
  [ -n "$DOMINIO" ] || DOMINIO="$(perguntar "Domínio do ZapSales (ex.: zapsales.suaempresa.com)")"
  DOMINIO="$(printf '%s' "$DOMINIO" | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##')"
  [[ "$DOMINIO" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] \
    || falha "Domínio inválido: '$DOMINIO'."

  EMAIL="${ZAPSALES_EMAIL:-$(env_ler "$ENV_ARQ" ACME_EMAIL)}"
  [ -n "$EMAIL" ] || EMAIL="$(perguntar "E-mail do primeiro administrador")"
  [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || falha "E-mail inválido: '$EMAIL'."

  # Nome e idioma da empresa só valem na criação do primeiro administrador; o
  # .env os lembra para uma rodada que falhou antes disso não perguntar de novo.
  # Numa ATUALIZAÇÃO (o .env já existe) nada é perguntado: a empresa já nasceu,
  # e o idioma dela muda pela tela, não pelo kit — vale o que o .env lembra, ou
  # o padrão para uma instalação anterior à pergunta.
  local primeira_rodada=0
  [ -f "$ENV_ARQ" ] || primeira_rodada=1
  EMPRESA="${ZAPSALES_EMPRESA:-$(env_ler "$ENV_ARQ" ZAPSALES_EMPRESA)}"
  if [ -z "$EMPRESA" ] && [ "$primeira_rodada" = "1" ]; then
    EMPRESA="$(perguntar "Nome da sua empresa [Minha Empresa]")"
  fi
  EMPRESA="${EMPRESA:-Minha Empresa}"

  if [ -n "${ZAPSALES_IDIOMA:-}" ] && [ -z "$(idioma_valido "$ZAPSALES_IDIOMA")" ]; then
    falha "ZAPSALES_IDIOMA='$ZAPSALES_IDIOMA' — use pt-BR, es ou en."
  fi
  IDIOMA="$(idioma_valido "${ZAPSALES_IDIOMA:-$(env_ler "$ENV_ARQ" APP_LOCALE)}")"
  [ -n "$IDIOMA" ] || [ "$primeira_rodada" = "1" ] || IDIOMA="pt-BR"
  while [ -z "$IDIOMA" ]; do
    local resposta
    resposta="$(perguntar "Idioma do sistema — 1) Português  2) Español  3) English [1]")"
    # Enter sem nada (ou sem terminal, onde `perguntar` devolve vazio) é o padrão.
    [ -n "$resposta" ] || resposta=1
    IDIOMA="$(idioma_valido "$resposta")"
    [ -n "$IDIOMA" ] || aviso "Não entendi '$resposta'. Responda 1, 2 ou 3."
  done

  # A senha só é perguntada na primeira instalação (sem .env ainda) e só com
  # terminal: o produto ainda não tem tela de troca de senha, e o "esqueci a
  # senha" depende de e-mail configurado — então quem instala escolhe agora, ou
  # aceita uma gerada. Ela nunca vai para o .env.
  SENHA="${ZAPSALES_SENHA:-}"
  if [ -z "$SENHA" ] && [ ! -f "$ENV_ARQ" ] && [ -t 0 ]; then
    SENHA="$(perguntar_senha)"
  fi
  msg "  domínio: $DOMINIO · administrador: $EMAIL · empresa: $EMPRESA · idioma: $IDIOMA"
}

# perguntar_senha — lê sem mostrar na tela, duas vezes. Vazio = gerar uma.
perguntar_senha() {
  local a b
  while :; do
    read -r -s -p "Senha do administrador (mínimo 8 caracteres; Enter = gerar uma forte): " a; printf '\n' >&2
    [ -n "$a" ] || { printf ''; return; }
    if [ "${#a}" -lt 8 ]; then aviso "Curta demais: use pelo menos 8 caracteres, como o login pede."; continue; fi
    read -r -s -p "Repita a senha: " b; printf '\n' >&2
    [ "$a" = "$b" ] && { printf '%s' "$a"; return; }
    aviso "As duas não são iguais. De novo."
  done
}

conferir_dns() {
  local ips_dominio ips_maquina
  ips_dominio="$(getent ahostsv4 "$DOMINIO" | awk '{print $1}' | sort -u | tr '\n' ' ')"
  ips_maquina="$(hostname -I 2>/dev/null)"
  if [ -z "$ips_dominio" ]; then
    [ "${ZAPSALES_IGNORAR_DNS:-}" = "1" ] && { aviso "$DOMINIO não resolve; seguindo porque ZAPSALES_IGNORAR_DNS=1."; return; }
    falha "$DOMINIO não resolve no DNS. Crie o registro A apontando para esta VPS e rode de novo (o certificado HTTPS depende disso)."
  fi
  local ip
  for ip in $ips_dominio; do
    case " $ips_maquina " in *" $ip "*) msg "  DNS ok: $DOMINIO → $ip (esta máquina)."; return ;; esac
  done
  [ "${ZAPSALES_IGNORAR_DNS:-}" = "1" ] && { aviso "$DOMINIO aponta para $ips_dominio, que não é esta máquina."; return; }
  falha "$DOMINIO aponta para $ips_dominio, mas esta máquina é $ips_maquina. Corrija o DNS (ou use ZAPSALES_IGNORAR_DNS=1 se há NAT na frente)."
}

# ─── Vizinhos: os sites que já estavam no ar ─────────────────────────────────

VIZINHOS=()
VIGIA_PID=""
VIGIA_LOG="$LOGS/vizinhos-$(date -u +%Y%m%dT%H%M%SZ).log"

listar_vizinhos() {
  case "$PROXY" in
    caddy-host) mapfile -t VIZINHOS < <(hosts_do_caddyfile "$CADDYFILE_SISTEMA" | grep -vx "$DOMINIO" || true) ;;
    nginx-host)
      mapfile -t VIZINHOS < <(nginx -T 2>/dev/null | awk '$1 == "server_name" { for (i = 2; i <= NF; i++) { gsub(/;/, "", $i); print $i } }' \
        | grep -E '^[a-z0-9.-]+\.[a-z]+$' | grep -vx "$DOMINIO" | sort -u || true) ;;
  esac
}

sondar() { # HOST — código HTTP pelo proxy local, sem depender do DNS de fora
  curl -sk -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$1:443:127.0.0.1" "https://$1/" 2>/dev/null || true
}

fotografar_vizinhos() {
  # No modo limpa não há vizinho a proteger: ninguém atendia as portas web.
  [ "$MODO" = "convivendo" ] || return 0
  passo "Sites que já estão no ar nesta VPS"
  listar_vizinhos
  if [ "${#VIZINHOS[@]}" -eq 0 ]; then msg "  nenhum além do ZapSales."; return; fi
  local h
  for h in "${VIZINHOS[@]}"; do
    printf '%s antes %s %s\n' "$(date -u +%H:%M:%S)" "$h" "$(sondar "$h")" | tee -a "$VIGIA_LOG" | sed 's/^/  /'
  done
  # Vigia de fundo: sonda cada vizinho a cada 5 s enquanto o kit trabalha.
  (
    trap 'exit 0' TERM
    while :; do
      for h in "${VIZINHOS[@]}"; do printf '%s durante %s %s\n' "$(date -u +%H:%M:%S)" "$h" "$(sondar "$h")"; done >> "$VIGIA_LOG"
      sleep 5
    done
  ) &
  VIGIA_PID=$!
}

encerrar_vigia() {
  if [ -n "$VIGIA_PID" ]; then
    { kill "$VIGIA_PID"; wait "$VIGIA_PID"; } 2>/dev/null || true
  fi
  VIGIA_PID=""
}

RELATADO=0
# Na saída, por qualquer caminho: se o kit falhou no meio, o relatório dos
# vizinhos é justamente o que mais importa ler — e o `falha` sai antes de
# chegar ao fim do roteiro.
ao_sair() {
  if [ "$RELATADO" = "0" ] && [ "${#VIZINHOS[@]}" -gt 0 ]; then relatar_vizinhos || true; fi
  encerrar_vigia
}
trap ao_sair EXIT

# Um vizinho "caiu" quando respondia (código < 500, ≠ 000) e passou a não responder.
relatar_vizinhos() {
  [ "${#VIZINHOS[@]}" -gt 0 ] || return 0
  RELATADO=1
  encerrar_vigia
  passo "Sites vizinhos: antes, durante e depois"
  local h ruins=0 cod
  for h in "${VIZINHOS[@]}"; do
    printf '%s depois %s %s\n' "$(date -u +%H:%M:%S)" "$h" "$(sondar "$h")" >> "$VIGIA_LOG"
  done
  for h in "${VIZINHOS[@]}"; do
    local antes total falhas
    antes="$(awk -v h="$h" '$2=="antes" && $3==h {print $4}' "$VIGIA_LOG" | tail -1)"
    total="$(awk -v h="$h" '$3==h' "$VIGIA_LOG" | wc -l)"
    falhas="$(awk -v h="$h" -v a="$antes" '$3==h && ($4=="000" || $4>=500) && !(a=="000" || a>=500)' "$VIGIA_LOG" | wc -l)"
    cod="$(awk -v h="$h" '$2=="depois" && $3==h {print $4}' "$VIGIA_LOG" | tail -1)"
    msg "  $h: antes $antes · depois $cod · $total sondagens, $falhas falhas"
    [ "$falhas" -eq 0 ] || ruins=1
  done
  msg "  registro completo: $VIGIA_LOG"
  [ "$ruins" -eq 0 ] || aviso "Algum site vizinho deixou de responder em algum momento — veja o registro acima."
}

# ─── 3. O .env ───────────────────────────────────────────────────────────────

preparar_env() {
  passo "Gerando o .env da instalação (segredos só na primeira vez)"
  [ -f "$ENV_ARQ" ] || (umask 077 && : > "$ENV_ARQ")
  chmod 600 "$ENV_ARQ"
  local url="https://$DOMINIO"

  # Configuração — recalculada a cada rodada.
  env_definir "$ENV_ARQ" NODE_ENV production
  env_definir "$ENV_ARQ" COMPOSE_PROJECT_NAME zapsales
  env_definir "$ENV_ARQ" DOMAIN "$DOMINIO"
  env_definir "$ENV_ARQ" ACME_EMAIL "$EMAIL"
  env_definir "$ENV_ARQ" ZAPSALES_MODO "$MODO"
  # Semente do primeiro administrador; o app não lê estas duas em runtime
  # (.env.example). Ficam para uma rodada que falhou antes de criá-lo.
  env_definir "$ENV_ARQ" ZAPSALES_EMPRESA "$EMPRESA"
  env_definir "$ENV_ARQ" APP_LOCALE "$IDIOMA"
  env_definir "$ENV_ARQ" NEXT_PUBLIC_APP_URL "$url"
  env_definir "$ENV_ARQ" NEXT_PUBLIC_ADMIN_URL "$url"
  env_definir "$ENV_ARQ" NEXT_PUBLIC_SUPABASE_URL "$url"
  # O servidor fala com o Supabase pela rede interna (Caddyfile, site :8000).
  env_definir "$ENV_ARQ" SUPABASE_SERVER_URL "http://caddy:8000"
  # O WAHA chama o app pela rede interna; a rota global do webhook é barrada
  # na internet pelo Caddyfile.
  env_definir "$ENV_ARQ" WAHA_WEBHOOK_BASE_URL "http://app:3000"
  env_definir "$ENV_ARQ" WAHA_API_BASE_URL "http://waha:3000"
  env_definir "$ENV_ARQ" WAHA_WEBHOOK_REQUIRE_SIGNATURE "true"
  env_definir "$ENV_ARQ" UPSTASH_REDIS_REST_URL "http://srh:80"

  # Os e-mails de acesso do GoTrue (confirmar conta, redefinir senha) pelos
  # moldes do app, no idioma da instalação (docker-compose.supabase.yml). Valor
  # escrito à mão pelo operador fica; o do kit acompanha o idioma.
  local molde chave valor
  for molde in confirmation recovery; do
    chave="GOTRUE_MAILER_TEMPLATES_$(printf '%s' "$molde" | tr 'a-z' 'A-Z')"
    valor="$(env_ler "$ENV_ARQ" "$chave")"
    if eh_valor_do_kit_para_molde "$valor"; then
      env_definir "$ENV_ARQ" "$chave" "http://app:3000/email-templates/$molde?idioma=$IDIOMA"
    fi
    chave="GOTRUE_MAILER_SUBJECTS_$(printf '%s' "$molde" | tr 'a-z' 'A-Z')"
    valor="$(env_ler "$ENV_ARQ" "$chave")"
    if eh_valor_do_kit_para_molde "$valor"; then
      env_definir "$ENV_ARQ" "$chave" "$(assunto_do_molde "$molde" "$IDIOMA")"
    fi
  done

  # A porta do loopback: escolhida uma vez, e mantida (o proxy do sistema aponta
  # para ela). Só existe no modo convivendo; no limpa o Caddy usa 80/443.
  if [ "$MODO" = "convivendo" ]; then
    env_garantir "$ENV_ARQ" ZAPSALES_PORTA_LOCAL "$(ss -ltn | porta_livre 8088)"
  fi

  # Segredos do Supabase.
  env_garantir "$ENV_ARQ" POSTGRES_PASSWORD "$(segredo_hex 24)"
  env_garantir "$ENV_ARQ" JWT_SECRET "$(segredo_hex 32)"
  local jwt
  jwt="$(env_ler "$ENV_ARQ" JWT_SECRET)"
  env_garantir "$ENV_ARQ" NEXT_PUBLIC_SUPABASE_ANON_KEY "$(chave_supabase "$jwt" anon)"
  env_garantir "$ENV_ARQ" SUPABASE_SERVICE_ROLE_KEY "$(chave_supabase "$jwt" service_role)"
  env_garantir "$ENV_ARQ" REALTIME_DB_ENC_KEY "$(segredo_hex 8)"
  env_garantir "$ENV_ARQ" REALTIME_SECRET_KEY_BASE "$(segredo_hex 48)"
  env_garantir "$ENV_ARQ" AGENT_WORKER_DB_PASSWORD "$(segredo_hex 24)"
  env_definir "$ENV_ARQ" SUPABASE_DB_URL "postgres://agent_worker:$(env_ler "$ENV_ARQ" AGENT_WORKER_DB_PASSWORD)@db:5432/postgres"
  # A conexão do dono fica registrada para o kit; o compose a esvazia no app
  # e no worker (tests/unit/env-ddl-fora-do-app.test.ts).
  env_definir "$ENV_ARQ" SUPABASE_DB_ADMIN_URL "postgres://postgres:$(env_ler "$ENV_ARQ" POSTGRES_PASSWORD)@db:5432/postgres"

  # Segredos do app — mesmos formatos do ubuntu-local-installer.sh.
  env_garantir "$ENV_ARQ" INTERNAL_SECRET "$(segredo_hex 32)"
  env_garantir "$ENV_ARQ" INTERNAL_CRON_SECRET "$(env_ler "$ENV_ARQ" INTERNAL_SECRET)"
  env_garantir "$ENV_ARQ" IMPERSONATE_COOKIE_SECRET "$(openssl rand -base64 32)"
  env_garantir "$ENV_ARQ" CPF_ENCRYPTION_KEY "$(openssl rand -base64 32)"
  env_garantir "$ENV_ARQ" WAHA_BYO_ENCRYPTION_KEY "$(openssl rand -base64 32)"
  env_garantir "$ENV_ARQ" AI_CRED_AES_KEY "$(openssl rand -base64 32)"
  env_garantir "$ENV_ARQ" INTEGRATIONS_OAUTH_ENCRYPTION_KEY "$(segredo_hex 32)"
  env_garantir "$ENV_ARQ" LGPD_SIGNING_KEY "$(segredo_hex 32)"
  env_garantir "$ENV_ARQ" WAHA_API_KEY "$(segredo_hex 24)"
  env_definir "$ENV_ARQ" WAHA_API_KEY_SHA512 "$(printf '%s' "$(env_ler "$ENV_ARQ" WAHA_API_KEY)" | openssl dgst -sha512 -r | awk '{print $1}')"
  env_garantir "$ENV_ARQ" WAHA_HMAC_SECRET "$(segredo_hex 32)"
  env_garantir "$ENV_ARQ" SRH_TOKEN "$(segredo_hex 24)"
  env_definir "$ENV_ARQ" UPSTASH_REDIS_REST_TOKEN "$(env_ler "$ENV_ARQ" SRH_TOKEN)"

  # A imagem do WAHA por arquitetura (doutrina: tag fixa, NOWEB). O pin
  # ACOMPANHA o kit: quando a release sobe a versão, a próxima rodada a grava —
  # atualizar não pode pedir edição de .env (packaging.md). Só fica intocado um
  # valor que não é pin do kit (ex.: devlikeapro/waha-plus, escolha do operador).
  local waha_pin waha_atual
  case "$(uname -m)" in
    aarch64|arm64) waha_pin="devlikeapro/waha:noweb-arm-2026.7.2" ;;
    *)             waha_pin="devlikeapro/waha:latest-2026.7.2" ;;
  esac
  waha_atual="$(env_ler "$ENV_ARQ" WAHA_IMAGE)"
  if [ -z "$waha_atual" ] || [[ "$waha_atual" =~ ^devlikeapro/waha:(latest|noweb-arm)-[0-9.]+$ ]]; then
    env_definir "$ENV_ARQ" WAHA_IMAGE "$waha_pin"
  else
    msg "  WAHA_IMAGE=$waha_atual é escolha desta instalação — mantida."
  fi
  chmod 600 "$ENV_ARQ"
  msg "  $ENV_ARQ (modo 600, só o root lê)."
}

# ─── 4. As imagens ───────────────────────────────────────────────────────────


revisao_do_codigo() {
  if git -C "$RAIZ" rev-parse --short HEAD >/dev/null 2>&1; then git -C "$RAIZ" rev-parse --short HEAD
  elif [ -s "$RAIZ/.zapsales-revisao" ]; then tr -d '[:space:]' < "$RAIZ/.zapsales-revisao"
  else printf 'local'
  fi
}

preparar_imagens() {
  local modo versao compose
  compose="$(arquivos_compose "$MODO")"
  modo="${ZAPSALES_IMAGENS:-$(env_ler "$ENV_ARQ" ZAPSALES_IMAGENS)}"
  modo="${modo:-registro}"
  env_definir "$ENV_ARQ" ZAPSALES_IMAGENS "$modo"
  case "$modo" in
    registro)
      passo "Imagens: puxando do registro"
      versao="${ZAPSALES_VERSAO:-}"
      # A implantação contínua (kit/implantar.sh) instala a imagem do commit,
      # `sha-<commit>`, e grava o commit em .zapsales-revisao. Rodar o kit à mão
      # depois disso, sobre o MESMO código, mantém a mesma imagem — cair na
      # versão do package.json poria a última release sobre um banco mais novo.
      if [ -z "$versao" ]; then
        case "$(env_ler "$ENV_ARQ" APP_IMAGE)" in
          *":sha-$(revisao_do_codigo)") versao="sha-$(revisao_do_codigo)" ;;
        esac
      fi
      versao="${versao:-$(sed -nE 's/^ *"version": *"([^"]+)".*/\1/p' "$RAIZ/package.json" | head -1)}"
      env_definir "$ENV_ARQ" COMPOSE_FILE "$compose"
      # APP_VERSION só serve ao build na VPS. Deixado no .env, o `env_file` do
      # compose o passa por cima da versão gravada na imagem, e /api/v1/health
      # responderia o commit da última imagem construída aqui.
      env_remover "$ENV_ARQ" APP_VERSION
      # Tag de VERSÃO, imutável — nunca latest/stable (doutrina de packaging, invariante 3).
      env_definir "$ENV_ARQ" APP_IMAGE "$REGISTRO_IMAGENS/zapsales:$versao"
      env_definir "$ENV_ARQ" WORKER_IMAGE "$REGISTRO_IMAGENS/zapsales-worker:$versao"
      env_definir "$ENV_ARQ" SCHEDULER_IMAGE "$REGISTRO_IMAGENS/zapsales-scheduler:$versao"
      for s in APP WORKER SCHEDULER; do env_definir "$ENV_ARQ" "${s}_PULL_POLICY" missing; done
      dc pull --quiet app worker scheduler || falha "Não consegui puxar as imagens da versão $versao. Se o registro é privado, faça 'docker login ghcr.io' antes; se a versão não foi publicada, use ZAPSALES_IMAGENS=construir."
      ;;
    construir)
      passo "Imagens: construindo nesta VPS (ZAPSALES_IMAGENS=construir)"
      aviso "Imagem construída na VPS é exceção (docs/runbooks/deploy.md §4): ela existe só neste disco. Volte para 'registro' quando houver versão publicada acessível."
      local rev
      rev="$(revisao_do_codigo)"
      env_definir "$ENV_ARQ" COMPOSE_FILE "$compose:docker-compose.build.yml"
      env_definir "$ENV_ARQ" APP_VERSION "$rev"
      env_definir "$ENV_ARQ" APP_IMAGE "zapsales-app:$rev"
      env_definir "$ENV_ARQ" WORKER_IMAGE "zapsales-worker:$rev"
      env_definir "$ENV_ARQ" SCHEDULER_IMAGE "zapsales-scheduler:$rev"
      dc build app worker scheduler
      ;;
    *) falha "ZAPSALES_IMAGENS='$modo' — use 'registro' ou 'construir'." ;;
  esac
  dc pull --quiet --ignore-buildable db auth rest realtime storage waha redis srh caddy >/dev/null 2>&1 \
    || dc pull --quiet db auth rest realtime storage waha redis srh caddy
}

# ─── 5. A stack ──────────────────────────────────────────────────────────────

subir_stack() {
  passo "Subindo o Supabase (banco, login, API, tempo real, arquivos)"
  dc up -d db
  esperar "Banco" 180 banco_aceita_conexao || falha "O banco não subiu: docker compose logs db"
  dc up -d auth rest storage realtime
  esperar "Schemas do Auth e do Storage" 240 schemas_do_supabase_prontos \
    || falha "O Auth/Storage não criaram os schemas: docker compose logs auth storage"

  passo "Aplicando o schema do ZapSales (supabase/baseline.sql)"
  local primeira=0
  [ "$(sql_valor "select (to_regclass('public.organizations') is null)::int")" = "1" ] && primeira=1
  if [ "$primeira" = "1" ]; then
    msg "  banco novo: instalação."
  else
    msg "  banco existente: atualização (o baseline é idempotente). Antes, um dump de segurança:"
    "$KIT/backup.sh" diario | sed 's/^/  /' || falha "O dump antes da atualização falhou; nada foi alterado no banco."
  fi
  # O baseline não roda numa transação única, então uma falha no meio deixa o
  # schema parcialmente atualizado. O app e o worker antigos seguem de pé (o
  # `up -d` ainda não rodou), e o dump acima é o caminho de volta.
  aplicar_schema || falha "O baseline.sql falhou no meio. O app antigo segue no ar; o dump de antes da atualização está em $BACKUPS/db (kit/backup.sh status)."
  reiniciar_realtime || falha "O Realtime não voltou depois do baseline: docker compose logs realtime"

  passo "Subindo o app, o worker, o agendador, o WhatsApp (WAHA) e o Redis"
  dc up -d --remove-orphans
  esperar "App" 240 servico_saudavel app || falha "O app não ficou saudável: docker compose logs app"
  esperar "Proxy da stack" 60 servico_saudavel caddy || falha "O Caddy da stack não subiu: docker compose logs caddy"
}

# ─── 6. O primeiro administrador ─────────────────────────────────────────────

criar_primeiro_admin() {
  passo "Primeiro administrador"
  if [ "$(sql_valor "select count(*) from public.platform_admins")" != "0" ]; then
    msg "  já existe — nada a fazer (rodar o kit de novo nunca troca a senha de ninguém)."
    return
  fi
  local senha="${SENHA:-$(segredo_b64 18)}"
  dc run --rm --no-deps \
    -e NEXT_PUBLIC_SUPABASE_URL="http://caddy:8000" \
    -e OWNER_EMAIL="$EMAIL" -e OWNER_PASSWORD="$senha" \
    -e OWNER_ORG_NAME="$EMPRESA" -e APP_LOCALE="$IDIOMA" \
    worker pnpm exec tsx scripts/bootstrap-owner.ts
  (umask 077 && printf 'endereco=https://%s\nemail=%s\nsenha=%s\n' "$DOMINIO" "$EMAIL" "$senha" > "$ESTADO/primeiro-acesso")
  msg "  criado. Credenciais em $ESTADO/primeiro-acesso (só o root lê)."
}

# ─── 7. O proxy do sistema ───────────────────────────────────────────────────

configurar_caddy_do_sistema() {
  local porta="$1" novo copia rc=0
  # Na MESMA pasta do Caddyfile: um `import` relativo dentro dele resolve a
  # partir da pasta do arquivo, e validar uma cópia em /tmp mediria outra coisa.
  novo="$(mktemp "$(dirname "$CADDYFILE_SISTEMA")/.Caddyfile.zapsales.XXXXXX")"
  cp -p "$CADDYFILE_SISTEMA" "$novo"
  aplicar_bloco "$novo" "$DOMINIO" "$(bloco_caddy "$DOMINIO" "$porta")" || rc=$?
  if [ "$rc" = "3" ]; then
    rm -f "$novo"
    falha "$CADDYFILE_SISTEMA já tem um bloco para $DOMINIO escrito à mão. Remova-o (o kit não sobrescreve configuração alheia) e rode de novo."
  fi
  if cmp -s "$novo" "$CADDYFILE_SISTEMA"; then
    rm -f "$novo"
    msg "  o bloco de $DOMINIO já está lá, igual — o Caddy não é tocado."
    return
  fi
  caddy validate --adapter caddyfile --config "$novo" >/dev/null 2>"$LOGS/caddy-validate.log" \
    || { rm -f "$novo"; falha "A configuração nova do Caddy não valida (nada foi alterado): $LOGS/caddy-validate.log"; }
  mkdir -p "$ESTADO/proxy"
  copia="$ESTADO/proxy/Caddyfile.$(date -u +%Y%m%dT%H%M%SZ)"
  cp -p "$CADDYFILE_SISTEMA" "$copia"
  cat "$novo" > "$CADDYFILE_SISTEMA"
  rm -f "$novo"
  if ! systemctl reload caddy; then
    cat "$copia" > "$CADDYFILE_SISTEMA"
    systemctl reload caddy || true
    falha "O Caddy recusou a configuração nova; voltei a anterior ($copia)."
  fi
  msg "  bloco de $DOMINIO acrescentado; cópia da configuração anterior em $copia."
}

configurar_nginx_do_sistema() {
  local porta="$1" conf link=""
  if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
    conf="/etc/nginx/sites-available/zapsales-$DOMINIO.conf"; link="/etc/nginx/sites-enabled/zapsales-$DOMINIO.conf"
  else
    conf="/etc/nginx/conf.d/zapsales-$DOMINIO.conf"
  fi
  # `nginx -T` nomeia o arquivo pelo caminho por onde o incluiu — em
  # Debian/Ubuntu, o de sites-ENABLED. Comparar só com o de sites-available
  # faria a segunda rodada do kit tomar o próprio arquivo por alheio.
  if nginx -T 2>/dev/null | awk -v d="$DOMINIO" -v c="$conf" -v l="$link" '
      /^# configuration file / { arq = $4; sub(/:$/, "", arq) }
      $1 == "server_name" && arq != c && arq != l { for (i = 2; i <= NF; i++) { s = $i; gsub(/;/, "", s); if (s == d) achou = 1 } }
      END { exit achou ? 0 : 1 }'; then
    falha "O Nginx já tem um server_name $DOMINIO fora do arquivo do kit. Remova-o e rode de novo."
  fi
  # Arquivo do kit já apontando para a mesma porta: não reescrever — o certbot
  # acrescentou o HTTPS nele, e reescrever apagaria isso.
  if [ -f "$conf" ] && grep -q "proxy_pass http://127.0.0.1:$porta;" "$conf"; then
    msg "  $conf já aponta para a porta $porta."
  else
    mkdir -p "$ESTADO/proxy"
    local copia=""
    if [ -f "$conf" ]; then
      copia="$ESTADO/proxy/$(basename "$conf").$(date -u +%Y%m%dT%H%M%SZ)"
      cp -p "$conf" "$copia"
    fi
    bloco_nginx "$DOMINIO" "$porta" > "$conf"
    [ -n "$link" ] && ln -sf "$conf" "$link"
    if ! nginx -t >/dev/null 2>&1; then
      # Volta exatamente ao que havia: a versão anterior (com o HTTPS que o
      # certbot pôs nela) ou nada, se o arquivo é novo.
      if [ -n "$copia" ]; then cp -p "$copia" "$conf"; else rm -f "$conf" ${link:+"$link"}; fi
      falha "O Nginx recusou a configuração nova; voltei a anterior. Rode 'nginx -t' para ver."
    fi
    systemctl reload nginx
  fi
  if ! command -v certbot >/dev/null; then
    apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  fi
  certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m "$EMAIL" --redirect --keep-until-expiring \
    || falha "O certbot não emitiu o certificado de $DOMINIO."
}

configurar_proxy() {
  if [ "$MODO" = "limpa" ]; then
    passo "Proxy e HTTPS"
    msg "  o Caddy do ZapSales atende 80/443 e pede o certificado ao Let's Encrypt sozinho (e o renova)."
    return
  fi
  passo "Acrescentando o ZapSales ao proxy do sistema"
  local porta
  porta="$(env_ler "$ENV_ARQ" ZAPSALES_PORTA_LOCAL)"
  case "$PROXY" in
    caddy-host) configurar_caddy_do_sistema "$porta" ;;
    nginx-host) configurar_nginx_do_sistema "$porta" ;;
  esac
}

# ─── 8. Backups ──────────────────────────────────────────────────────────────

agendar_backups() {
  passo "Agendando os backups"
  mkdir -p "$BACKUPS/db"
  chmod 700 "$BACKUPS"
  cat > /etc/cron.d/zapsales <<EOF
# Gerenciado pelo kit do ZapSales ($KIT/instalar.sh). Não edite: rodar o kit regrava.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Dump diário do banco, 03:15 (hora da VPS), retenção de 30 dias.
15 3 * * * root $KIT/backup.sh diario >> $LOGS/backup.log 2>&1
# Cópia semanal criptografada (restic) para o Cloudflare R2, domingo 04:30.
30 4 * * 0 root $KIT/backup.sh semanal >> $LOGS/backup.log 2>&1
EOF
  chmod 644 /etc/cron.d/zapsales
  cat > /etc/logrotate.d/zapsales <<EOF
$LOGS/*.log {
	weekly
	rotate 8
	compress
	missingok
	notifempty
}
EOF
  msg "  diário 03:15 → $BACKUPS/db (30 dias) · semanal domingo 04:30 → R2"
  if [ ! -s "$ESTADO/backup.env" ]; then
    aviso "A cópia semanal para o R2 ainda não tem credenciais. Rode: sudo $KIT/backup.sh configurar-r2"
  fi
}

# ─── 9. Provas ───────────────────────────────────────────────────────────────

provar() {
  passo "Provando"
  # No modo limpa o primeiro certificado é pedido ao Let's Encrypt agora, e o
  # desafio HTTP precisa chegar de fora na porta 80: dá mais tempo.
  local cod i tentativas=30
  [ "$MODO" = "limpa" ] && tentativas=60
  for i in $(seq 1 "$tentativas"); do
    # Pelo proxy DESTA máquina (--resolve), com o certificado conferido: prova
    # o bloco, o TLS e a stack sem depender do caminho de fora (NAT, DNS em
    # propagação).
    cod="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --resolve "$DOMINIO:443:127.0.0.1" "https://$DOMINIO/" || true)"
    [ "$cod" = "307" ] && break
    sleep 4
  done
  if [ "$cod" != "307" ]; then
    if [ "$MODO" = "limpa" ]; then
      falha "https://$DOMINIO/ respondeu '$cod' em vez de 307. Se é o certificado: confira que o DNS aponta para esta VPS e que o firewall do painel da hospedagem libera as portas 80 e 443 (docker compose logs caddy mostra o pedido ao Let's Encrypt). Rodar o kit de novo é seguro."
    fi
    falha "https://$DOMINIO/ respondeu '$cod' em vez de 307."
  fi
  msg "  https://$DOMINIO/ → 307 (redireciona para o login), com certificado válido."

  # Nenhuma porta de contêiner nosso fora do esperado: no convivendo, nenhuma
  # fora do loopback; no limpa, só as 80/443 do Caddy.
  local expostas
  expostas="$(docker ps --filter "label=com.docker.compose.project=zapsales" \
    --format '{{.Label "com.docker.compose.service"}} {{.Ports}}' | portas_publicas)"
  [ "$MODO" = "limpa" ] && expostas="$(printf '%s\n' "$expostas" | tirar_as_portas_web_do_caddy)"
  if [ -n "$expostas" ]; then
    falha "Porta do ZapSales exposta fora do esperado: $expostas"
  fi
  if [ "$MODO" = "limpa" ]; then
    msg "  só o Caddy aceita conexão de fora, nas portas 80 e 443; banco, WhatsApp e o resto ficam na rede interna."
  else
    msg "  nenhuma porta do ZapSales aceita conexão de fora (só 127.0.0.1:$(env_ler "$ENV_ARQ" ZAPSALES_PORTA_LOCAL))."
  fi
}

resumo() {
  passo "Pronto"
  msg "  ZapSales: https://$DOMINIO"
  if [ -s "$ESTADO/primeiro-acesso" ]; then
    msg "  Primeiro acesso: sudo cat $ESTADO/primeiro-acesso"
    msg "  (guarde a senha num cofre de senhas e apague o arquivo: sudo rm $ESTADO/primeiro-acesso)"
  fi
  msg "  Logs:       cd $RAIZ && docker compose logs -f app"
  msg "  Atualizar:  curl -fsSL https://raw.githubusercontent.com/leandromastelliniai/ZapSales/main/kit/obter.sh | sudo bash"
  msg "              (ou traga o código novo para $RAIZ e rode este kit de novo)"
  msg "  Backup:     sudo $KIT/backup.sh status"
}

verificar_maquina
detectar_o_proxy
ler_configuracao
conferir_dns
fotografar_vizinhos
preparar_env
preparar_imagens
subir_stack
criar_primeiro_admin
configurar_proxy
agendar_backups
provar
# O comando da implantação contínua (kit/implantar.sh) acompanha o código: cada
# rodada bem-sucedida o reinstala. Ele só aceita conexão do GitHub depois de
# `kit/implantar.sh acesso`, que é decisão do operador.
"$KIT/implantar.sh" instalar-comando
relatar_vizinhos
resumo
