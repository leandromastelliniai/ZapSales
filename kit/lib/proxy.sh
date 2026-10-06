# shellcheck shell=bash
# O proxy que já está na VPS — detectar, e acrescentar SÓ o bloco do ZapSales.
#
# No modo "convivendo com outros apps" quem atende as portas 80/443 é o proxy
# que já serve outros sites. O ZapSales não toca nas portas dele: toda a stack
# escuta no loopback (127.0.0.1) e o proxy ganha UM bloco, entre marcadores,
# que só repassa o domínio do ZapSales para essa porta. O resto do arquivo é
# dos outros e sai byte a byte igual.

MARCA_INICIO='# >>> zapsales:'
MARCA_FIM='# <<< zapsales:'

# detectar_proxy — lê a saída de `ss -ltnp` na entrada padrão e diz quem
# escuta 80/443: caddy-host | nginx-host | docker | outro:<processo> | nenhum.
detectar_proxy() {
  awk '
    $4 ~ /:(80|443)$/ {
      if (match($0, /\("[^"]+"/)) { p = substr($0, RSTART + 2, RLENGTH - 3); achou[p] = 1 }
    }
    END {
      if ("caddy" in achou)        { print "caddy-host"; exit }
      if ("nginx" in achou)        { print "nginx-host"; exit }
      if ("docker-proxy" in achou) { print "docker"; exit }
      for (p in achou)             { print "outro:" p; exit }
      print "nenhum"
    }
  '
}

# decidir_modo PROXY MODO_SALVO MODO_PEDIDO — o modo da instalação.
#
#   PROXY        o que `detectar_proxy` viu, ou `zapsales` quando quem segura
#                as portas 80/443 é o Caddy da PRÓPRIA stack (segunda rodada
#                do modo limpa: ali o dono das portas é o docker-proxy, e sem
#                essa distinção o kit tomaria o próprio Caddy por um alheio).
#   MODO_SALVO   o ZAPSALES_MODO do .env (vazio na primeira rodada).
#   MODO_PEDIDO  o ZAPSALES_MODO do ambiente (vazio = deixar o kit decidir).
#
# Imprime `limpa`, `convivendo` ou `erro:<explicação>`. Pura: nada de `ss`,
# `docker` ou arquivo aqui, para o gate de shell provar cada caminho.
#
# A regra que importa é a da DÚVIDA: o kit nunca troca de modo sozinho. Uma
# instalação `convivendo` cujo proxy do sistema caiu NÃO vira `limpa` — isso
# poria o Caddy da stack nas portas que eram dos outros sites no dia em que o
# proxy deles voltasse.
decidir_modo() {
  local proxy="$1" salvo="$2" pedido="$3" quer
  case "$pedido" in
    ""|limpa|convivendo) ;;
    *) printf 'erro:ZAPSALES_MODO=%s — use "limpa" ou "convivendo" (ou deixe vazio para o kit decidir).\n' "$pedido"; return ;;
  esac
  quer="${pedido:-$salvo}"
  case "$proxy" in
    nenhum)
      if [ "$quer" = "convivendo" ]; then
        printf 'erro:Esta instalação é do modo "convivendo", mas ninguém atende as portas 80/443 agora: o proxy do sistema (Caddy ou Nginx) parou. Ligue-o de novo e rode o kit; para o ZapSales passar a usar o próprio proxy, rode com ZAPSALES_MODO=limpa.\n'
      else
        printf 'limpa\n'
      fi
      ;;
    zapsales)
      if [ "$quer" = "convivendo" ]; then
        printf 'erro:As portas 80/443 são do Caddy do próprio ZapSales (modo "limpa"). Para conviver com outro proxy, pare o ZapSales (docker compose down), suba o proxy do sistema e rode de novo com ZAPSALES_MODO=convivendo.\n'
      else
        printf 'limpa\n'
      fi
      ;;
    caddy-host|nginx-host)
      if [ "$quer" = "limpa" ]; then
        printf 'erro:O modo "limpa" precisa das portas 80/443, mas elas já são do %s do sistema, que serve outros sites. Rode sem ZAPSALES_MODO para o kit conviver com ele.\n' "${proxy%-host}"
      else
        printf 'convivendo\n'
      fi
      ;;
    docker)
      printf 'erro:As portas 80/443 são de um contêiner Docker (Traefik, Caddy em contêiner, painel de hospedagem...). Este kit sabe se acoplar a Caddy ou Nginx instalados no sistema, ou usar a VPS sozinho (modo "limpa", com as portas livres).\n'
      ;;
    *)
      printf 'erro:Proxy não suportado nas portas 80/443: %s. O kit sabe trabalhar com Caddy ou Nginx do sistema, ou com as portas livres (modo "limpa").\n' "${proxy#outro:}"
      ;;
  esac
}

# arquivos_compose MODO — o COMPOSE_FILE de cada modo (sem o de build). O limpa
# é o conjunto base, em que o Caddy publica 80/443 com HTTPS automático; o
# convivendo acrescenta o override que o põe só no loopback.
arquivos_compose() {
  case "$1" in
    convivendo) printf 'docker-compose.prod.yml:docker-compose.supabase.yml:docker-compose.convivio.yml\n' ;;
    *)          printf 'docker-compose.prod.yml:docker-compose.supabase.yml\n' ;;
  esac
}

# compose_com_loopback COMPOSE_FILE — o mesmo conjunto, com o override do
# loopback garantido logo depois do supabase (ou no fim). Para o ensaio de
# restauração, que nunca pode publicar 80/443.
compose_com_loopback() {
  local lista="$1"
  case ":$lista:" in
    *:docker-compose.convivio.yml:*) printf '%s\n' "$lista"; return ;;
  esac
  case ":$lista:" in
    *:docker-compose.supabase.yml:*)
      printf '%s\n' "${lista/docker-compose.supabase.yml/docker-compose.supabase.yml:docker-compose.convivio.yml}" ;;
    *) printf '%s\n' "${lista:+$lista:}docker-compose.convivio.yml" ;;
  esac
}

# portas_publicas — lê linhas "SERVIÇO PORTAS" (o `docker ps --format` com o
# rótulo do serviço) e imprime "SERVIÇO PORTA" para cada porta publicada fora
# do loopback. Nada impresso = nada exposto.
portas_publicas() {
  awk '{
    servico = $1; $1 = ""
    n = split($0, p, ",")
    for (i = 1; i <= n; i++) { gsub(/^ +| +$/, "", p[i]); if (p[i] != "") print servico, p[i] }
  }' | grep -E ' (0\.0\.0\.0|\[::\]|::):[0-9]+->' || true
}

# tirar_as_portas_web_do_caddy — filtra a saída de `portas_publicas` deixando
# só o que NÃO é a 80/443 do Caddy: no modo limpa essas duas são o esperado.
tirar_as_portas_web_do_caddy() {
  grep -vE '^caddy (0\.0\.0\.0|\[::\]|::):(80|443)->(80|443)/tcp$' | grep -v '^$' || true
}

# porta_livre INICIAL — lê `ss -ltn` na entrada e devolve a primeira porta
# livre a partir de INICIAL.
porta_livre() {
  local porta="$1" ocupadas
  ocupadas="$(awk '{ n = split($4, a, ":"); print a[n] }')"
  while grep -qx "$porta" <<<"$ocupadas"; do porta=$((porta + 1)); done
  printf '%s\n' "$porta"
}

# bloco_caddy DOMINIO PORTA — o bloco que entra no Caddyfile do sistema.
bloco_caddy() {
  local dominio="$1" porta="$2"
  cat <<EOF
${MARCA_INICIO}${dominio} — gerenciado pelo kit do ZapSales (kit/instalar.sh). Não edite entre os marcadores.
${dominio} {
	encode zstd gzip
	# Sem timeout de leitura no reverse_proxy do Caddy: a rota do agente de IA
	# pode levar minutos e o tempo real usa WebSocket de longa duração.
	reverse_proxy 127.0.0.1:${porta}
}
${MARCA_FIM}${dominio}
EOF
}

# bloco_nginx DOMINIO PORTA — server block HTTP; o certbot acrescenta o TLS.
bloco_nginx() {
  local dominio="$1" porta="$2" var
  # A variável do `map` é global no Nginx: com nome fixo, um segundo domínio do
  # ZapSales na mesma máquina daria "duplicate variable".
  var="zapsales_upgrade_$(printf '%s' "$dominio" | tr -c 'a-z0-9' '_')"
  cat <<EOF
# Gerenciado pelo kit do ZapSales (kit/instalar.sh). O certbot acrescenta o HTTPS.
map \$http_upgrade \$${var} {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${dominio};

    client_max_body_size 60m;

    location / {
        proxy_pass http://127.0.0.1:${porta};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$${var};
        # O agente de IA pode levar até ~5 min por requisição.
        proxy_read_timeout 330s;
        proxy_send_timeout 330s;
        proxy_buffering off;
    }
}
EOF
}

# remover_bloco ARQUIVO DOMINIO — tira o bloco marcado do domínio (se houver).
remover_bloco() {
  local arq="$1" dominio="$2" tmp
  tmp="$(mktemp "${arq}.XXXXXX")"
  INI="${MARCA_INICIO}${dominio} " FIM="${MARCA_FIM}${dominio}" awk '
    index($0, ENVIRON["INI"]) == 1 { dentro = 1; next }
    dentro && $0 == ENVIRON["FIM"]  { dentro = 0; pular_vazia = 1; next }
    dentro { next }
    pular_vazia && $0 == "" { pular_vazia = 0; next }
    { pular_vazia = 0; print }
  ' "$arq" > "$tmp"
  # Tira linhas em branco que sobraram no fim do arquivo.
  sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$tmp" > "${tmp}.2" && mv "${tmp}.2" "$tmp"
  chmod --reference="$arq" "$tmp" 2>/dev/null || true
  mv "$tmp" "$arq"
}

# enderecos_fora_do_kit ARQUIVO — todo endereço de site do Caddyfile que NÃO
# está entre os marcadores do kit, um por linha, sem esquema nem porta.
# Um parser só para as duas perguntas que o kit faz ao Caddyfile dos outros:
# "o domínio já tem bloco à mão?" e "quais sites vigiar?".
enderecos_fora_do_kit() {
  INI="$MARCA_INICIO" FIM="$MARCA_FIM" awk '
    index($0, ENVIRON["INI"]) == 1 { dentro = 1; next }
    index($0, ENVIRON["FIM"]) == 1 { dentro = 0; next }
    dentro { next }
    /^[^ \t#{}(][^{]*\{[ \t]*$/ {
      linha = $0; sub(/\{[ \t]*$/, "", linha); gsub(/,/, " ", linha)
      n = split(linha, ends, /[ \t]+/)
      for (i = 1; i <= n; i++) {
        e = ends[i]; sub(/^https?:\/\//, "", e); sub(/:[0-9]+$/, "", e)
        if (e != "") print e
      }
    }
  ' "$1"
}

# dominio_sem_marcador ARQUIVO DOMINIO — sucesso se o domínio aparece como
# endereço de site FORA dos marcadores do kit (bloco escrito à mão).
dominio_sem_marcador() {
  grep -qxF "$2" <<<"$(enderecos_fora_do_kit "$1")"
}

# aplicar_bloco ARQUIVO DOMINIO BLOCO — idempotente. Devolve 3 (sem mexer no
# arquivo) quando o domínio já tem bloco escrito à mão.
aplicar_bloco() {
  local arq="$1" dominio="$2" bloco="$3"
  if dominio_sem_marcador "$arq" "$dominio"; then
    return 3
  fi
  remover_bloco "$arq" "$dominio"
  printf '\n%s\n' "$bloco" >> "$arq"
}

# hosts_do_caddyfile ARQUIVO — os domínios dos sites que NÃO são do kit, um
# por linha. É a lista que o kit consulta antes e depois de recarregar o proxy
# para provar que os outros sites continuam respondendo.
hosts_do_caddyfile() {
  enderecos_fora_do_kit "$1" | grep -E '^[a-z0-9.-]+\.[a-z]+$' || true
}
