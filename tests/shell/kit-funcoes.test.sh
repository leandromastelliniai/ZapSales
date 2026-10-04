#!/usr/bin/env bash
# Gate das funções puras do kit de instalação (kit/lib/*.sh).
#
# O kit mexe em três coisas que não são dele: o `.env` que guarda os segredos
# da instalação, o Caddyfile/Nginx de um proxy que já serve OUTROS sites, e a
# pasta de backups. Cada uma tem um modo de falha caro e silencioso:
#
# 1. SEGREDO REGERADO NA SEGUNDA RODADA. Rodar o kit de novo não pode trocar o
#    JWT_SECRET, a senha do banco ou as chaves de cifra — trocar qualquer uma
#    deixa o banco ilegível ou desloga todo mundo. `env_garantir` só escreve
#    chave AUSENTE ou VAZIA; valor existente é intocável.
# 2. BLOCO DUPLICADO NO PROXY DOS OUTROS. Um segundo bloco para o mesmo domínio
#    faz o Caddy recusar a configuração inteira — e o `reload` que falha leva
#    junto os sites que já estavam no ar. O bloco é marcado e SUBSTITUÍDO; um
#    bloco do mesmo domínio escrito à mão (sem marcador) é recusado, nunca
#    sobrescrito.
# 3. RETENÇÃO QUE APAGA O QUE NÃO É DELA. A poda só toca `zapsales-*.dump`
#    mais velhos que o prazo.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { # nome esperado obtido
  if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi
}
verdade() { local nome="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$nome"; else nok "$nome"; fi; }
falso()   { local nome="$1"; shift; if "$@" >/dev/null 2>&1; then nok "$nome"; else ok "$nome"; fi; }

# shellcheck source=/dev/null
. kit/lib/comum.sh
# shellcheck source=/dev/null
. kit/lib/segredos.sh
# shellcheck source=/dev/null
. kit/lib/proxy.sh
# shellcheck source=/dev/null
. kit/lib/backup.sh

echo "env — segredo existente é intocável"
ENV="$TMP/.env"
printf 'A=1\nVAZIA=\n# comentário=fica\nURL=https://x.com/a?b=c&d=e\n' > "$ENV"
env_garantir "$ENV" A 999
igual "valor existente não muda" "1" "$(env_ler "$ENV" A)"
env_garantir "$ENV" VAZIA preenchida
igual "chave vazia é preenchida" "preenchida" "$(env_ler "$ENV" VAZIA)"
env_garantir "$ENV" NOVA 'v/a|l&o$r'
igual "chave ausente entra com caracteres especiais" 'v/a|l&o$r' "$(env_ler "$ENV" NOVA)"
env_definir "$ENV" URL "https://y.com/?q=1&r=2"
igual "env_definir sobrescreve configuração" "https://y.com/?q=1&r=2" "$(env_ler "$ENV" URL)"
igual "comentário preservado" "1" "$(grep -c '^# comentário=fica$' "$ENV")"
igual "nenhuma chave duplicada" "" "$(cut -d= -f1 "$ENV" | grep -v '^#' | sort | uniq -d)"
env_definir "$ENV" A 2
igual "env_definir em chave existente não duplica" "1" "$(grep -c '^A=' "$ENV")"
igual "ler chave ausente devolve vazio" "" "$(env_ler "$ENV" NAO_EXISTE)"

echo "segredos"
s1="$(segredo_hex 32)"; s2="$(segredo_hex 32)"
igual "hex tem o tamanho pedido" "64" "${#s1}"
falso "dois segredos seguidos diferem" test "$s1" = "$s2"
jwt="$(jwt_hs256 'segredo-de-teste' '{"role":"anon","iss":"supabase"}')"
igual "jwt tem três partes" "3" "$(printf '%s' "$jwt" | awk -F. '{print NF}')"
# Assinatura conferida por um verificador independente (node), não pela própria função.
conferido="$(node -e '
const c=require("crypto");const [h,p,s]=process.argv[1].split(".");
const e=c.createHmac("sha256","segredo-de-teste").update(h+"."+p).digest("base64url");
const payload=JSON.parse(Buffer.from(p,"base64url"));
console.log(e===s && JSON.parse(Buffer.from(h,"base64url")).alg==="HS256" ? payload.role : "assinatura-invalida");
' "$jwt")"
igual "jwt assinado em HS256 e verificável" "anon" "$conferido"

echo "proxy — detecção pelo dono das portas 80/443"
ss_caddy='LISTEN 0 4096 *:443 *:* users:(("caddy",pid=1048,fd=4))
LISTEN 0 4096 *:80 *:* users:(("caddy",pid=1048,fd=12))'
igual "caddy no sistema" "caddy-host" "$(printf '%s\n' "$ss_caddy" | detectar_proxy)"
ss_nginx='LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=812,fd=6),("nginx",pid=811,fd=6))'
igual "nginx no sistema" "nginx-host" "$(printf '%s\n' "$ss_nginx" | detectar_proxy)"
ss_docker='LISTEN 0 4096 0.0.0.0:443 0.0.0.0:* users:(("docker-proxy",pid=300,fd=7))'
igual "porta publicada por contêiner" "docker" "$(printf '%s\n' "$ss_docker" | detectar_proxy)"
ss_vazio='LISTEN 0 4096 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1,fd=3))'
igual "ninguém nas portas web" "nenhum" "$(printf '%s\n' "$ss_vazio" | detectar_proxy)"
ss_outro='LISTEN 0 4096 *:80 *:* users:(("apache2",pid=9,fd=4))'
igual "proxy não suportado" "outro:apache2" "$(printf '%s\n' "$ss_outro" | detectar_proxy)"
ss_8080='LISTEN 0 4096 *:8080 *:* users:(("caddy",pid=9,fd=4))'
igual "porta 8080 não é a porta web" "nenhum" "$(printf '%s\n' "$ss_8080" | detectar_proxy)"

echo "proxy — porta livre no loopback"
ocupadas='LISTEN 0 511 127.0.0.1:8088 0.0.0.0:*
LISTEN 0 511 127.0.0.1:8089 0.0.0.0:*
LISTEN 0 511 [::]:8091 [::]:*'
igual "pula as ocupadas" "8090" "$(printf '%s\n' "$ocupadas" | porta_livre 8088)"
igual "devolve a inicial quando livre" "9000" "$(printf '%s\n' "$ocupadas" | porta_livre 9000)"

echo "proxy — bloco do Caddy no Caddyfile dos outros"
CF="$TMP/Caddyfile"
cat > "$CF" <<'EOF'
futuristas.app, www.futuristas.app {
	root * /var/www/futuristas
	file_server
}

whatsapp.futuristas.app {
	reverse_proxy 127.0.0.1:3000
}
EOF
original="$(cat "$CF")"
bloco="$(bloco_caddy zapsales.futuristas.app 8088)"
verdade "bloco aponta para a porta do loopback" grep -q 'reverse_proxy 127.0.0.1:8088' <<<"$bloco"
aplicar_bloco "$CF" zapsales.futuristas.app "$bloco"; rc=$?
igual "primeira aplicação dá certo" "0" "$rc"
igual "um bloco do domínio" "1" "$(grep -c '^zapsales.futuristas.app {' "$CF")"
aplicar_bloco "$CF" zapsales.futuristas.app "$(bloco_caddy zapsales.futuristas.app 8090)"
igual "reaplicar substitui, não duplica" "1" "$(grep -c '^zapsales.futuristas.app {' "$CF")"
verdade "a porta nova venceu" grep -q 'reverse_proxy 127.0.0.1:8090' "$CF"
falso "a porta velha sumiu" grep -q 'reverse_proxy 127.0.0.1:8088' "$CF"
igual "os sites dos outros seguem byte a byte" "$original" "$(remover_bloco "$CF" zapsales.futuristas.app >/dev/null; cat "$CF")"
igual "hosts do Caddyfile listados" "futuristas.app www.futuristas.app whatsapp.futuristas.app" \
  "$(hosts_do_caddyfile "$CF" | tr '\n' ' ' | sed 's/ $//')"

# Bloco do domínio escrito à mão por alguém: recusar, nunca atropelar.
printf '\nzapsales.futuristas.app {\n\trespond "manual"\n}\n' >> "$CF"
antes="$(cat "$CF")"
aplicar_bloco "$CF" zapsales.futuristas.app "$bloco"; rc=$?
igual "bloco manual do mesmo domínio é recusado (código 3)" "3" "$rc"
igual "e o arquivo fica intacto" "$antes" "$(cat "$CF")"
# Domínio que só COMEÇA igual não é o mesmo domínio.
CF2="$TMP/Caddyfile2"; printf 'zapsales.futuristas.app.br {\n\trespond "outro"\n}\n' > "$CF2"
aplicar_bloco "$CF2" zapsales.futuristas.app "$bloco"; rc=$?
igual "domínio parecido não é conflito" "0" "$rc"

echo "proxy — bloco do Nginx"
ng="$(bloco_nginx zapsales.futuristas.app 8088)"
verdade "server_name do domínio" grep -q 'server_name zapsales.futuristas.app;' <<<"$ng"
verdade "repassa para o loopback" grep -q 'proxy_pass http://127.0.0.1:8088;' <<<"$ng"
verdade "WebSocket do tempo real" grep -q 'proxy_set_header Upgrade \$http_upgrade;' <<<"$ng"
verdade "timeout longo para o agente de IA" grep -q 'proxy_read_timeout 330s;' <<<"$ng"

echo "backup — retenção"
D="$TMP/dumps"; mkdir -p "$D"
touch -d '31 days ago' "$D/zapsales-20260101T030000Z.dump"
touch -d '31 days ago' "$D/zapsales-20260101T030000Z.contagem.tsv"
touch -d '29 days ago' "$D/zapsales-20260103T030000Z.contagem.tsv"
touch -d '29 days ago' "$D/zapsales-20260103T030000Z.dump"
touch -d '40 days ago' "$D/outro-arquivo.dump"
touch "$D/zapsales-hoje.dump"
podar_dumps "$D" 30 >/dev/null
falso "dump de 31 dias sai" test -e "$D/zapsales-20260101T030000Z.dump"
falso "a contagem dele sai junto" test -e "$D/zapsales-20260101T030000Z.contagem.tsv"
verdade "a contagem do dump que fica, fica" test -e "$D/zapsales-20260103T030000Z.contagem.tsv"
verdade "dump de 29 dias fica" test -e "$D/zapsales-20260103T030000Z.dump"
verdade "dump de hoje fica" test -e "$D/zapsales-hoje.dump"
verdade "arquivo que não é do kit fica" test -e "$D/outro-arquivo.dump"
falso "prazo inválido é recusado" podar_dumps "$D" 0

echo "backup — repositório no R2"
igual "endereço S3 do R2" "s3:https://abc123.r2.cloudflarestorage.com/meu-bucket/zapsales" \
  "$(repositorio_r2 abc123 meu-bucket)"

echo "roteiros do kit — sintaxe"
for f in kit/*.sh kit/lib/*.sh; do
  verdade "bash -n $f" bash -n "$f"
done

if [ "$fail" -ne 0 ]; then echo "FALHOU"; exit 1; fi
echo "ok"
