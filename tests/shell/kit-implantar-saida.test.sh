#!/usr/bin/env bash
# Gate do que a implantação contínua devolve pela sessão SSH (issue #39).
#
# O repositório é PÚBLICO: o que a VPS devolve pelo SSH vai para o log do job
# `implantar` — que qualquer pessoa lê — e as últimas linhas vão para o corpo da
# issue `implantacao-falhou`, sem máscara nenhuma. A máscara automática do
# Actions só cobre os segredos que o GitHub conhece, e nenhum segredo da VPS
# está entre eles. Duas camadas, as duas provadas aqui:
#
# 1. A VPS DECIDE O QUE SAI. Do registro da implantação só saem as linhas que o
#    próprio kit/implantar.sh escreveu (marcadas por `usar_saida_de_etapa`).
#    Saída bruta de docker, psql ou kit/instalar.sh fica no registro, na VPS —
#    mesmo quando ela parece uma etapa.
# 2. REDAÇÃO de tudo o que sai, para pegar o que a camada 1 deixar passar: um
#    segredo interpolado numa etapa (um motivo de recusa que cita uma URL, um
#    estado que cita uma variável) sai como [redigido].
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
contem()     { if grep -qF -- "$3" <<< "$2"; then ok "$1"; else nok "$1 — [$3] não chegou"; fi; }
nao_contem() { if grep -qF -- "$3" <<< "$2"; then nok "$1 — [$3] vazou"; else ok "$1"; fi; }

# shellcheck source=/dev/null
. kit/lib/comum.sh
# shellcheck source=/dev/null
. kit/lib/implantar.sh

# ─── Os segredos, um por formato da lista da issue ──────────────────────────
# Montados por partes: este arquivo é público, e um token com cara de real
# inteiro aqui dispararia o secret scanning do GitHub.
G=ghp_; S=ghs_; P=github_pat_; Z=zps_; K=sk-
SEGREDOS=(
  "${G}A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"
  "${S}Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2"
  "${P}11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOP"
  "${Z}a1b2c3d4_e5f6a7b8c9d0e1f2a3b4c5d6e7f8"
  "${K}ant-api03-QwErTyUiOpAsDfGhJkLzXcVbNm0123456789"
  "${K}proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJhLWZhbHNh"
  "senhaDoBancoNaUrl"
  "valorDoBearerOpaco123"
)
LINHAS_COM_SEGREDO=(
  "token de usuário: ${SEGREDOS[0]}"
  "token do job: ${SEGREDOS[1]}"
  "pat fino: ${SEGREDOS[2]}"
  "Authorization: Bearer ${SEGREDOS[3]}"
  "anthropic: ${SEGREDOS[4]}"
  "openai: ${SEGREDOS[5]}"
  "service role: ${SEGREDOS[6]}"
  "psql: could not connect to postgresql://postgres:${SEGREDOS[7]}@db:5432/postgres"
  "curl -H 'Authorization: Bearer ${SEGREDOS[8]}'"
)

# NOME=valor para os nomes que guardam segredo: os de .env.example que têm
# forma de segredo, mais os que o kit grava no .env da VPS e o exemplo não tem.
NOMES_DO_KIT=(JWT_SECRET POSTGRES_PASSWORD AGENT_WORKER_DB_PASSWORD SRH_TOKEN
  REALTIME_DB_ENC_KEY REALTIME_SECRET_KEY_BASE WAHA_API_KEY_SHA512
  SUPABASE_DB_URL SUPABASE_DB_ADMIN_URL SENTRY_DSN)
mapfile -t NOMES_DO_EXEMPLO < <(grep -oE '^[A-Z0-9_]+=' .env.example | tr -d '=' \
  | grep -E 'KEY|SECRET|TOKEN|PASSWORD|DSN|_DB_URL|_DB_ADMIN_URL' | sort -u)

echo "controle — o universo dos nomes não está vazio"
if [ "${#NOMES_DO_EXEMPLO[@]}" -ge 30 ]; then ok "${#NOMES_DO_EXEMPLO[@]} nomes de segredo lidos de .env.example"
else nok "só ${#NOMES_DO_EXEMPLO[@]} nomes de segredo lidos de .env.example (eram 34 em 07/10/2026) — o grep quebrou?"; fi
for n in SUPABASE_SERVICE_ROLE_KEY WAHA_API_KEY ANTHROPIC_API_KEY SMTP_PASSWORD SENTRY_DSN; do
  if printf '%s\n' "${NOMES_DO_EXEMPLO[@]}" | grep -qx "$n"; then ok "$n está no universo"; else nok "$n fora do universo"; fi
done

# ─── O registro como a VPS o escreve ────────────────────────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
REG="$TMP/implantar.log"
(
  usar_saida_de_etapa
  passo "Conferindo o pedido: 0123456789abcdef0123456789abcdef01234567"
  msg "  está na main (o GitHub respondeu 'ahead')."
  # Saída BRUTA — docker, psql, kit/instalar.sh — com cada segredo, inclusive
  # numa linha que imita uma etapa sem a marca.
  for l in "${LINHAS_COM_SEGREDO[@]}"; do printf '%s\n' "$l"; done
  printf '▶ etapa falsa vinda do docker: %s\n' "${SEGREDOS[0]}"
  for n in "${NOMES_DO_EXEMPLO[@]}" "${NOMES_DO_KIT[@]}"; do printf '%s=valor-cru-de-%s\n' "$n" "$n"; done
  # As mesmas coisas DENTRO de linhas de etapa: só a camada 2 as segura.
  for l in "${LINHAS_COM_SEGREDO[@]}"; do aviso "motivo: $l"; done 2>&1
  for n in "${NOMES_DO_EXEMPLO[@]}" "${NOMES_DO_KIT[@]}"; do msg "  estado: $n=valor-etapa-de-$n"; done
  msg "  estado com aspas: JWT_SECRET=\"com espaco e-segredo-aspas\""
  # Linha de etapa com várias linhas (o estado dos serviços): todas marcadas.
  msg "reinício durante a observação: antes [app aaa 0
worker bbb 0] · agora [app aaa 1]"
  # O que o kit/instalar.sh imprime vira título, e só o título sai.
  # Só o que COMEÇA com `▶ ` é título: uma linha bruta com `▶ ` no meio, não.
  # E a última linha sem quebra no fim também é lida.
  printf 'Pulling app ... %s\n\033[32m▶ Subindo o app, o worker, o agendador\033[0m\nSUPABASE_SERVICE_ROLE_KEY=%s\nerro do psql ▶ senha-solta-no-meio\n\033[32m▶ Pronto\033[0m' \
    "${SEGREDOS[1]}" "${SEGREDOS[6]}" | titulos_do_kit
  # Chave privada citada numa etapa de várias linhas: o corpo inteiro sai.
  msg "  chave lida: -----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACorpoDaChavePrivada
-----END OPENSSH PRIVATE KEY-----
  depois da chave a etapa continua"
  # JSON, senha com @, e nomes com _PASS / _PWD.
  msg '  resposta: {"api_key": "valor-json-secreto", "password":"outro-json-secreto"}'
  msg "  url: postgres://postgres:p@ss-com-arroba@db:5432/postgres"
  msg "  estado: SMTP_PASS=valor-pass-secreto DB_PWD=valor-pwd-secreto"
  # Achados da revisão: nome de segredo seguido de Bearer, valor com , e ;,
  # aspa que não fecha, senha com / na URL.
  msg "  cabeçalho: TOKEN: Bearer valorAposOBearer9876"
  msg "  estado: POSTGRES_PASSWORD=abc,valor-depois-da-virgula;valor-depois-do-pv"
  msg "  estado: SMTP_PASSWORD=\"aspa que nunca fecha"
  msg "  url: postgres://postgres:pa/ss-com-barra@db:5432/postgres"
  # Chave com o BEGIN e sem o END (truncada): o corpo sai redigido, e a saída
  # NÃO some daí em diante — a linha seguinte é o diagnóstico.
  msg "  chave truncada: -----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAcorpoDaChaveTruncada0123456789abcdefABCDEF
MIIEpAIBAAKCAQEAfimCurto=="
  msg "  a etapa depois da chave truncada chega: sim"
  voltar_simulado() { _etapa ""; _etapa "✖ FALHOU: dependência que estava ok piorou: redis" >&2; }
  voltar_simulado 2>&1
  passo "Implantado: 0123456 está no ar em https://crm.exemplo.com.br"
) > "$REG" 2>&1

SAIDA="$(saida_para_o_ssh < "$REG")"

echo "camada 1 — só as linhas do kit/implantar.sh saem"
contem "título de etapa chega" "$SAIDA" "▶ Conferindo o pedido: 0123456789abcdef0123456789abcdef01234567"
contem "linha de etapa chega" "$SAIDA" "  está na main (o GitHub respondeu 'ahead')."
contem "título do kit chega como etapa" "$SAIDA" "kit: Subindo o app, o worker, o agendador"
contem "a falha chega" "$SAIDA" "✖ FALHOU: dependência que estava ok piorou: redis"
contem "a conclusão chega" "$SAIDA" "▶ Implantado: 0123456 está no ar em https://crm.exemplo.com.br"
contem "a 2ª linha de uma etapa de várias linhas chega" "$SAIDA" "worker bbb 0] · agora [app aaa 1]"
contem "a última linha do kit, sem quebra no fim, chega" "$SAIDA" "kit: Pronto"
nao_contem "linha bruta do kit com ▶ no meio não vira título" "$SAIDA" "senha-solta-no-meio"
nao_contem "saída bruta não sai, nem a que imita etapa" "$SAIDA" "etapa falsa vinda do docker"
nao_contem "saída bruta do docker não sai" "$SAIDA" "Pulling app"
nao_contem "a marca não chega à saída" "$SAIDA" "$MARCA_DE_ETAPA"
if grep -q $'\033' <<< "$SAIDA"; then nok "cor ANSI chegou à saída"; else ok "sem código de cor na saída"; fi
for n in "${NOMES_DO_EXEMPLO[@]}" "${NOMES_DO_KIT[@]}"; do
  nao_contem "valor cru de $n não sai" "$SAIDA" "valor-cru-de-$n"
done

echo "camada 2 — segredo dentro de uma etapa sai redigido"
for s in "${SEGREDOS[@]}"; do nao_contem "não vaza: ${s:0:6}…" "$SAIDA" "$s"; done
for n in "${NOMES_DO_EXEMPLO[@]}" "${NOMES_DO_KIT[@]}"; do
  nao_contem "$n=… numa etapa sai redigido" "$SAIDA" "valor-etapa-de-$n"
  contem "o NOME de $n continua legível" "$SAIDA" "estado: $n=[redigido]"
done
nao_contem "valor entre aspas sai inteiro" "$SAIDA" "e-segredo-aspas"
contem "a forma da URL fica, sem a credencial" "$SAIDA" "postgresql://[redigido]@db:5432/postgres"
contem "Bearer fica, sem o valor" "$SAIDA" "Bearer [redigido]"
nao_contem "o corpo da chave privada não sai" "$SAIDA" "CorpoDaChavePrivada"
contem "a etapa segue depois do fim da chave" "$SAIDA" "depois da chave a etapa continua"
nao_contem "chave de JSON com aspas sai redigida" "$SAIDA" "valor-json-secreto"
nao_contem "chave de JSON colada (\"password\":\"…\") sai redigida" "$SAIDA" "outro-json-secreto"
nao_contem "senha com @ sai inteira" "$SAIDA" "ss-com-arroba"
contem "e o host da URL fica" "$SAIDA" "postgres://[redigido]@db:5432/postgres"
nao_contem "NOME_PASS=… sai redigido" "$SAIDA" "valor-pass-secreto"
nao_contem "NOME_PWD=… sai redigido" "$SAIDA" "valor-pwd-secreto"
nao_contem "NOME: Bearer x — o token depois do Bearer não sai" "$SAIDA" "valorAposOBearer9876"
nao_contem "valor com vírgula sai inteiro" "$SAIDA" "valor-depois-da-virgula"
nao_contem "valor com ponto e vírgula sai inteiro" "$SAIDA" "valor-depois-do-pv"
nao_contem "aspa que não fecha: o valor sai inteiro" "$SAIDA" "aspa que nunca fecha"
nao_contem "senha com / na URL sai inteira" "$SAIDA" "ss-com-barra"
contem "e o host da URL com / na senha fica" "$SAIDA" "postgres://[redigido]@db:5432/postgres"
nao_contem "o corpo da chave sem END não sai" "$SAIDA" "corpoDaChaveTruncada"
nao_contem "nem a última linha curta do corpo" "$SAIDA" "fimCurto"
contem "chave sem END não engole a saída seguinte" "$SAIDA" "a etapa depois da chave truncada chega: sim"

echo "redação não estraga etapa comum"
for l in \
  "▶ Imagens do commit (etiqueta sha-0123456789abcdef0123456789abcdef01234567)" \
  "  o login no ghcr.io com o token falhou; tentando puxar sem ele." \
  "  /api/v1/health responde 0123456." \
  "  nenhuma dependência piorou (redis supabase waha ok)." \
  "  de volta em 0123456: serviços saudáveis, https://crm.exemplo.com.br/ → 307." \
  "registro completo na VPS: /var/log/zapsales/implantar-20261007T120000Z-0123456.log" \
  "  task-runner e risk-score não são segredo" \
  "  o passo: basic setup do proxy, e o bearer sem valor nenhum" \
  "  passo: conferindo"; do
  r="$(printf '%s\n' "$l" | redigir)"
  if [ "$r" = "$l" ]; then ok "intacta: ${l:0:48}…"; else nok "alterada: [$l] → [$r]"; fi
done

echo "kit/implantar.sh usa as duas camadas"
# Sem as linhas de comentário: só código conta.
FRENTE="$(sed -n '/^frente()/,/^}/p' kit/implantar.sh | grep -vE '^[[:space:]]*#')"
EXECUTAR="$(sed -n '/^executar()/,/^}/p' kit/implantar.sh | grep -vE '^[[:space:]]*#')"
if grep -q 'tail ' <<< "$FRENTE"; then ok "a frente segue o registro"; else nok "a frente não segue mais o registro com tail (o teste precisa acompanhar)"; fi
if grep 'tail ' <<< "$FRENTE" | grep -qv '| saida_para_o_ssh'; then
  nok "a frente tem um tail que não passa por saida_para_o_ssh"
else ok "todo tail da frente passa por saida_para_o_ssh"; fi
if grep -q 'usar_saida_de_etapa' <<< "$EXECUTAR"; then ok "o executor marca as próprias linhas"; else nok "executar() não chama usar_saida_de_etapa"; fi
if grep -q 'titulos_do_kit' kit/implantar.sh; then ok "a saída do kit/instalar.sh passa por titulos_do_kit"; else nok "instalar() não usa titulos_do_kit"; fi
if grep -nE "printf .*\\\\033" kit/implantar.sh | grep -v '^[0-9]*:\s*#'; then
  nok "kit/implantar.sh ainda escreve linha colorida sem a marca (acima)"
else ok "nenhuma linha do executor sai sem a marca"; fi

echo "o workflow monta a cauda da saída já redigida"
WF=.github/workflows/implantar.yml
if grep -qE '^[[:space:]]*\. kit/lib/implantar\.sh$' "$WF"; then ok "o job carrega o filtro de kit/lib/implantar.sh"
else nok "implantar.yml não carrega kit/lib/implantar.sh"; fi
if grep -qE '2>&1 \| redigir \| tee "\$RUNNER_TEMP/implantar\.log"' "$WF"; then
  ok "ssh → redigir → tee (o log do job e a cauda saem do texto redigido)"
else nok "implantar.yml não passa a saída do ssh por redigir antes do tee"; fi
if grep -E '\| *tee ' "$WF" | grep -qv '| redigir | tee'; then nok "implantar.yml tem um tee sem redigir antes"
else ok "nenhum tee no workflow sem redigir antes"; fi
if grep -qE 'tail -n [0-9]+ "\$RUNNER_TEMP/implantar\.log"' "$WF"; then ok "a cauda da issue sai do arquivo redigido"
else nok "a cauda (CAUDA) não sai mais de \$RUNNER_TEMP/implantar.log"; fi

echo "o passo do workflow grava a cauda também quando a implantação falha"
# O `run:` sem `shell:` roda como `bash -e`: com pipefail, um ssh que sai 2/3/4
# matava o passo NO pipeline, antes de gravar codigo= e a cauda — a issue de
# falha saía vazia justo quando é lida. Aqui o corpo do passo roda de verdade,
# sob `bash -e`, com um ssh falso que devolve uma etapa e sai 3.
SIM="$TMP/passo.sh"
{
  echo 'ssh() { cat > /dev/null; printf "✖ FALHOU: simulado\n"; return 3; }'
  sed -n '/name: Implantar na VPS/,/exit "\$codigo"/p' "$WF" \
    | sed -n '/^        run: |$/,$p' | sed '1d; s/^          //'
} > "$SIM"
OUT="$TMP/github_output"; : > "$OUT"
( export GITHUB_OUTPUT="$OUT" RUNNER_TEMP="$TMP" HOME="$TMP" TOKEN=x HOST=h SHA=s; bash -e "$SIM" ) > /dev/null 2>&1
rc=$?
if grep -q 'redigir | tee' "$SIM"; then ok "o corpo do passo foi extraído do workflow"; else nok "não achei o corpo do passo 'Implantar na VPS'"; fi
if [ "$rc" = "3" ]; then ok "o passo sai com o código do ssh (3)"; else nok "o passo saiu $rc, esperado 3"; fi
contem "a falha grava codigo=3" "$(cat "$OUT")" "codigo=3"
contem "a falha grava a cauda" "$(cat "$OUT")" "✖ FALHOU: simulado"

if [ "$fail" -ne 0 ]; then echo "FALHOU"; exit 1; fi
echo "ok"
