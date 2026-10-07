#!/usr/bin/env bash
# Gate do portão da implantação contínua (scripts/implantacao/portao.sh, issue #24).
#
# O portão é o que substitui a proteção da branch (que este repositório não
# tem): só o TOPO da main, com ci, e2e, perf e a publicação das imagens verdes
# NAQUELE commit, segue para a produção. Os modos de falha que este arquivo
# fecha:
#
# 1. COMMIT SUPERADO. Um workflow antigo que termina depois do merge seguinte
#    não pode implantar o commit velho.
# 2. VERDE QUE NÃO É DESTE COMMIT, OU NÃO É DA MAIN. Execução de PR (evento
#    pull_request) ou de outro sha não conta.
# 3. "FALTA ALGUÉM" LIDO COMO "PASSOU". Workflow que ainda não começou, ou que
#    está rodando, é espera — nunca implantação.
# 4. RE-EXECUÇÃO. Vale a execução mais recente de cada workflow.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

fail=0
ok()  { printf '  ✓ %s\n' "$1"; }
nok() { printf '  ✗ %s\n' "$1"; fail=1; }
igual() { if [ "$2" = "$3" ]; then ok "$1"; else nok "$1 — esperado [$2], veio [$3]"; fi; }

SHA=0123456789abcdef0123456789abcdef01234567
OUTRO=fedcba9876543210fedcba9876543210fedcba98

run() { # id caminho status conclusao [evento] [sha] [branch]
  printf '{"id":%s,"path":".github/workflows/%s","status":"%s","conclusion":%s,"event":"%s","head_sha":"%s","head_branch":"%s"}' \
    "$1" "$2" "$3" "$( [ "$4" = null ] && echo null || printf '"%s"' "$4")" "${5:-push}" "${6:-$SHA}" "${7:-main}"
}
runs() { local IFS=,; printf '{"workflow_runs":[%s]}' "$*"; }
decidir() { # topo candidato json
  printf '%s' "$3" | TOPO="$1" CANDIDATO="$2" bash scripts/implantacao/portao.sh --decidir | tr -d '\r'
}

VERDES="$(runs "$(run 1 ci.yml completed success)" "$(run 2 e2e.yml completed success)" \
  "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)" \
  "$(run 5 release.yml completed skipped)")"

echo "o caminho feliz"
igual "topo da main com os quatro verdes implanta" "implantar" "$(decidir "$SHA" "$SHA" "$VERDES")"

echo "commit superado"
igual "candidato que não é mais o topo não implanta" \
  "nao: $SHA não é mais o topo da main (o topo é $OUTRO)" "$(decidir "$OUTRO" "$SHA" "$VERDES")"
igual "candidato malformado não implanta" "nao: candidato inválido: 'abc'" "$(decidir "abc" "abc" "$VERDES")"

echo "falta alguém"
SEM_E2E="$(runs "$(run 1 ci.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "workflow que não começou é espera" "esperar: e2e ainda não rodou neste commit" "$(decidir "$SHA" "$SHA" "$SEM_E2E")"
RODANDO="$(runs "$(run 1 ci.yml completed success)" "$(run 2 e2e.yml in_progress null)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "workflow rodando é espera" "esperar: e2e está in_progress" "$(decidir "$SHA" "$SHA" "$RODANDO")"
igual "nenhuma execução é espera" "esperar: ci ainda não rodou neste commit" "$(decidir "$SHA" "$SHA" '{"workflow_runs":[]}')"
igual "JSON quebrado não implanta" "nao: não consegui ler as execuções do GitHub" "$(decidir "$SHA" "$SHA" '<html>')"

echo "vermelho"
FALHOU="$(runs "$(run 1 ci.yml completed failure)" "$(run 2 e2e.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "ci vermelho não implanta" "nao: ci terminou failure" "$(decidir "$SHA" "$SHA" "$FALHOU")"
CANCELADO="$(runs "$(run 1 ci.yml completed success)" "$(run 2 e2e.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed cancelled)")"
igual "publicação cancelada não implanta" "nao: publish-image terminou cancelled" "$(decidir "$SHA" "$SHA" "$CANCELADO")"
PULADO="$(runs "$(run 1 ci.yml completed success)" "$(run 2 e2e.yml completed skipped)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "workflow pulado não é verde" "nao: e2e terminou skipped" "$(decidir "$SHA" "$SHA" "$PULADO")"

echo "verde que não vale"
DE_PR="$(runs "$(run 1 ci.yml completed success pull_request)" "$(run 2 e2e.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "ci verde de pull_request não conta" "esperar: ci ainda não rodou neste commit" "$(decidir "$SHA" "$SHA" "$DE_PR")"
DE_OUTRO="$(runs "$(run 1 ci.yml completed success push "$OUTRO")" "$(run 2 e2e.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "ci verde de outro commit não conta" "esperar: ci ainda não rodou neste commit" "$(decidir "$SHA" "$SHA" "$DE_OUTRO")"
DE_BRANCH="$(runs "$(run 1 ci.yml completed success push "$SHA" feat/x)" "$(run 2 e2e.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "ci verde de outra branch não conta" "esperar: ci ainda não rodou neste commit" "$(decidir "$SHA" "$SHA" "$DE_BRANCH")"

echo "resposta grande da API (a real: 100 execuções)"
# O primeiro uso real morreu com 141 (SIGPIPE): candidato superado → o python
# decidia sem ler a entrada, e o `gh api` morria escrevendo num cano fechado. O
# controle pequeno não pega isto — cabe no buffer do cano.
GRANDE="$(runs $(for i in $(seq 1 600); do printf '%s ' "$(run $((100 + i)) ci.yml completed success)"; done))"
[ "${#GRANDE}" -gt 65536 ] && ok "a resposta de controle passa do buffer do cano (${#GRANDE} bytes)" || nok "a resposta de controle é pequena demais para medir"
printf '%s' "$GRANDE" | TOPO="$OUTRO" CANDIDATO="$SHA" bash scripts/implantacao/portao.sh --decidir > /dev/null
igual "candidato superado com resposta grande: quem escreve não morre (SIGPIPE) e o portão sai 0" "0 0" "${PIPESTATUS[*]}"
printf '%s' "$GRANDE" | CANDIDATO="abc" TOPO="abc" bash scripts/implantacao/portao.sh --decidir > /dev/null
igual "candidato inválido com resposta grande: idem" "0 0" "${PIPESTATUS[*]}"

echo "re-execução: vale a mais recente"
REEXEC_VERDE="$(runs "$(run 1 ci.yml completed failure)" "$(run 9 ci.yml completed success)" "$(run 2 e2e.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "falha antiga, re-execução verde implanta" "implantar" "$(decidir "$SHA" "$SHA" "$REEXEC_VERDE")"
REEXEC_VERM="$(runs "$(run 9 ci.yml completed failure)" "$(run 1 ci.yml completed success)" "$(run 2 e2e.yml completed success)" "$(run 3 perf.yml completed success)" "$(run 4 publish-image.yml completed success)")"
igual "verde antigo, re-execução vermelha não implanta" "nao: ci terminou failure" "$(decidir "$SHA" "$SHA" "$REEXEC_VERM")"

if [ "$fail" -ne 0 ]; then echo "FALHOU"; exit 1; fi
echo "ok"
