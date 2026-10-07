#!/usr/bin/env bash
# Gate das funções puras da implantação contínua (kit/lib/implantar.sh, issue #24).
#
# A chave SSH guardada no GitHub chega à VPS da produção. Quem a roubar só pode
# pedir UM comando — `implantar <sha>` —, e cada recusa abaixo é o que impede
# esse comando de virar outra coisa:
#
# 1. COMANDO FORA DO FORMATO. Nada além de `implantar` + sha inteiro passa:
#    nem sha abreviado (ambíguo), nem `;`, nem segundo argumento.
# 2. COMMIT FORA DA MAIN e REBAIXAMENTO. A leitura do `status` do compare do
#    GitHub decide; um status desconhecido nunca vira "pode".
# 3. VERSÃO QUE NÃO BATE. A saúde do app tem de responder o commit pedido.
# 4. DEPENDÊNCIA QUE PIOROU. O que estava `ok` antes e deixou de estar reprova;
#    o que já estava ruim antes não é culpa da versão nova.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { # nome esperado obtido
  if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi
}
verdade() { local nome="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$nome"; else nok "$nome"; fi; }
falso()   { local nome="$1"; shift; if "$@" >/dev/null 2>&1; then nok "$nome"; else ok "$nome"; fi; }

command -v python3 >/dev/null || { echo "  ✗ python3 ausente — este teste precisa dele"; exit 1; }

# shellcheck source=/dev/null
. kit/lib/comum.sh
# shellcheck source=/dev/null
. kit/lib/implantar.sh

SHA=0123456789abcdef0123456789abcdef01234567

echo "comando — só 'implantar <sha inteiro>'"
igual "comando certo devolve o sha" "$SHA" "$(sha_do_comando "implantar $SHA")"
falso "sha abreviado é recusado" sha_do_comando "implantar 0123456"
falso "sha em maiúsculas é recusado" sha_do_comando "implantar $(printf '%s' "$SHA" | tr a-f A-F)"
falso "comando encadeado é recusado" sha_do_comando "implantar $SHA; rm -rf /"
falso "segundo argumento é recusado" sha_do_comando "implantar $SHA $SHA"
falso "outro verbo é recusado" sha_do_comando "bash -c id"
falso "comando vazio (sessão interativa) é recusado" sha_do_comando ""
falso "quebra de linha no meio é recusada" sha_do_comando "implantar $SHA
id"
verdade "sha_valido aceita 40 hex" sha_valido "$SHA"
falso "sha_valido recusa 39" sha_valido "${SHA:1}"

echo "chave pública — o arquivo .pub como ele chega"
CHAVE="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPkVSPqZvciP1AzuT10dvPSYf github-implantar"
igual "chave limpa passa igual" "$CHAVE" "$(chave_publica_limpa "$CHAVE")"
igual "quebra de linha do Windows (\\r\\n) sai — foi o que o primeiro uso real trouxe" \
  "$CHAVE" "$(chave_publica_limpa "$CHAVE"$'\r\n')"
igual "espaço nas pontas sai" "$CHAVE" "$(chave_publica_limpa "  $CHAVE  ")"
igual "chave RSA é recusada" "" "$(chave_publica_limpa "ssh-rsa AAAAB3Nza x")"
igual "chave PRIVADA é recusada" "" "$(chave_publica_limpa "-----BEGIN OPENSSH PRIVATE KEY-----")"
igual "duas chaves (duas linhas) são recusadas" "" "$(chave_publica_limpa "$CHAVE"$'\n'"$CHAVE")"
igual "opções de authorized_keys embutidas são recusadas" "" \
  "$(chave_publica_limpa "command=\"/bin/bash\" $CHAVE")"

echo "compare do GitHub — o sha está na main?"
verdade "identical: é o topo da main" sha_esta_na_main identical
verdade "ahead: a main já andou além dele" sha_esta_na_main ahead
falso "behind: o sha está à frente da main (outra branch)" sha_esta_na_main behind
falso "diverged: outra branch" sha_esta_na_main diverged
falso "vazio (a API não respondeu) não vira sim" sha_esta_na_main ""

echo "compare do GitHub — avanço, mesma versão ou rebaixamento"
igual "identical é a mesma versão" "mesma" "$(movimento identical)"
igual "ahead avança" "avanca" "$(movimento ahead)"
igual "behind rebaixa" "rebaixa" "$(movimento behind)"
igual "diverged sai da linha" "desvia" "$(movimento diverged)"
igual "status desconhecido não é avanço" "desconhecido" "$(movimento "")"

echo "saúde — a versão responde o commit pedido"
verdade "sha curto (o que a imagem do CI grava) bate" versao_bate "${SHA:0:7}" "$SHA"
verdade "sha inteiro bate" versao_bate "$SHA" "$SHA"
falso "outro commit não bate" versao_bate "fedcba9" "$SHA"
falso "prefixo curto demais não bate" versao_bate "012" "$SHA"
falso "'desconhecido' não bate" versao_bate "desconhecido" "$SHA"
falso "vazio não bate" versao_bate "" "$SHA"
SAUDE='{"data":{"status":"degraded","version":"0123456","checks":{"supabase":{"status":"ok"},"redis":{"status":"ok"},"waha":{"status":"degraded"}}}}'
igual "versão lida do JSON da saúde" "0123456" "$(versao_da_saude "$SAUDE")"
igual "JSON inválido dá versão vazia" "" "$(versao_da_saude "<html>502</html>")"

echo "saúde — nenhuma dependência que estava ok piora"
ANTES='{"data":{"checks":{"supabase":{"status":"ok"},"redis":{"status":"ok"},"waha":{"status":"down"}}}}'
DEPOIS_IGUAL='{"data":{"checks":{"supabase":{"status":"ok"},"redis":{"status":"ok"},"waha":{"status":"down"}}}}'
DEPOIS_PIOR='{"data":{"checks":{"supabase":{"status":"ok"},"redis":{"status":"degraded"},"waha":{"status":"ok"}}}}'
DEPOIS_SUMIU='{"data":{"checks":{"supabase":{"status":"ok"}}}}'
igual "nada piorou" "" "$(dependencias_que_pioraram "$ANTES" "$DEPOIS_IGUAL")"
igual "redis ok → degraded piora (waha que melhorou não conta)" "redis" "$(dependencias_que_pioraram "$ANTES" "$DEPOIS_PIOR")"
igual "dependência que sumiu do relatório piora" "redis" "$(dependencias_que_pioraram "$ANTES" "$DEPOIS_SUMIU")"
igual "app fora do ar depois: todas as ok pioram" "redis supabase" "$(dependencias_que_pioraram "$ANTES" "" | tr '\n' ' ' | sed 's/ $//')"
igual "app fora do ar antes: nada a comparar" "" "$(dependencias_que_pioraram "" "$DEPOIS_PIOR")"

echo "histórico — quais versões guardar"
HIST="$(printf 'a\nb\nc\nd\ne\n')"
igual "guarda as 3 últimas" "c d e" "$(printf '%s\n' "$HIST" | versoes_a_guardar 3 | tr '\n' ' ' | sed 's/ $//')"
igual "histórico curto guarda tudo" "a" "$(printf 'a\n' | versoes_a_guardar 3)"

echo "env — remover uma chave"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf 'A=1\nAPP_VERSION=antigo\nB=2\n' > "$TMP/.env"
chmod 600 "$TMP/.env"
MODO_ANTES="$(stat -c '%a' "$TMP/.env")"   # 600 no Linux; o NTFS ignora o chmod
env_remover "$TMP/.env" APP_VERSION
igual "a chave sai" "" "$(env_ler "$TMP/.env" APP_VERSION)"
igual "as outras ficam, na ordem" "A=1 B=2" "$(tr '\n' ' ' < "$TMP/.env" | sed 's/ $//')"
igual "o modo do arquivo fica" "$MODO_ANTES" "$(stat -c '%a' "$TMP/.env")"
env_remover "$TMP/.env" NAO_EXISTE
igual "remover chave ausente não mexe no resto" "A=1 B=2" "$(tr '\n' ' ' < "$TMP/.env" | sed 's/ $//')"

if [ "$fail" -ne 0 ]; then echo "FALHOU"; exit 1; fi
echo "ok"
