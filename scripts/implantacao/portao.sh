#!/usr/bin/env bash
# scripts/implantacao/portao.sh — o portão da implantação contínua (issue #24).
#
# Responde UMA pergunta: este commit pode ir para a produção agora? Só pode o
# TOPO da main, e só quando ci, e2e, perf e a publicação das imagens
# terminaram verdes NAQUELE commit, por push na main. Não depende da proteção
# da branch (que este repositório não tem): pergunta à API de execuções.
#
# O workflow implantar.yml dispara a cada um dos quatro que termina. Os três
# primeiros a terminar recebem "esperar"; o último, "implantar". Um commit que
# deixou de ser o topo recebe "nao" — o merge seguinte o carrega junto.
#
#   GH_TOKEN=… REPO=dono/repo [CANDIDATO=<sha>] scripts/implantacao/portao.sh
#       consulta o GitHub e escreve decisao/motivo/sha em $GITHUB_OUTPUT
#       (sem CANDIDATO, o candidato é o topo da main).
#
#   TOPO=<sha> CANDIDATO=<sha> scripts/implantacao/portao.sh --decidir < execucoes.json
#       a parte pura, que tests/shell/portao-de-implantacao.test.sh exercita.
#       Imprime "implantar", "esperar: <motivo>" ou "nao: <motivo>".
set -euo pipefail

# Os workflows que têm de estar verdes, pelo ARQUIVO (o nome exibido muda; o
# caminho é o que a execução registra).
EXIGIDOS="ci e2e perf publish-image"

decidir() {
  TOPO="${TOPO:-}" CANDIDATO="${CANDIDATO:-}" EXIGIDOS="$EXIGIDOS" python3 -I -X utf8 -c '
import json, os, re, sys

topo, cand = os.environ["TOPO"], os.environ["CANDIDATO"]
if not re.fullmatch(r"[0-9a-f]{40}", cand):
    print(f"nao: candidato inválido: {cand!r}"); sys.exit(0)
if topo != cand:
    print(f"nao: {cand} não é mais o topo da main (o topo é {topo})"); sys.exit(0)
try:
    execucoes = json.load(sys.stdin)["workflow_runs"]
except Exception:
    print("nao: não consegui ler as execuções do GitHub"); sys.exit(0)

# Só o que rodou por push na main, neste commit.
validas = [r for r in execucoes
           if r.get("head_sha") == cand and r.get("event") == "push" and r.get("head_branch") == "main"]
for nome in os.environ["EXIGIDOS"].split():
    caminho = f".github/workflows/{nome}.yml"
    deste = [r for r in validas if (r.get("path") or "").split("@")[0] == caminho]
    if not deste:
        print(f"esperar: {nome} ainda não rodou neste commit"); sys.exit(0)
    ultima = max(deste, key=lambda r: r.get("id") or 0)
    estado, conclusao = ultima.get("status"), ultima.get("conclusion")
    if estado != "completed":
        print(f"esperar: {nome} está {estado}"); sys.exit(0)
    if conclusao != "success":
        print(f"nao: {nome} terminou {conclusao}"); sys.exit(0)
print("implantar")
'
}

if [ "${1:-}" = "--decidir" ]; then
  decidir
  exit 0
fi

: "${REPO:?REPO=dono/repo}"
TOPO="$(gh api "repos/$REPO/commits/main" --jq .sha)"
CANDIDATO="${CANDIDATO:-$TOPO}"
resposta="$(gh api "repos/$REPO/actions/runs?head_sha=$CANDIDATO&event=push&branch=main&per_page=100" \
  | TOPO="$TOPO" CANDIDATO="$CANDIDATO" decidir | tr -d '\r')"

decisao="${resposta%%:*}"
motivo="${resposta#*: }"
[ "$decisao" = "implantar" ] && motivo="topo da main com ci, e2e, perf e imagens verdes"
printf 'Candidato %s → %s (%s)\n' "$CANDIDATO" "$decisao" "$motivo"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  { printf 'decisao=%s\n' "$decisao"; printf 'motivo=%s\n' "$motivo"; printf 'sha=%s\n' "$CANDIDATO"; } >> "$GITHUB_OUTPUT"
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '### Portão da implantação\n\n`%s` → **%s** — %s\n' "$CANDIDATO" "$decisao" "$motivo" >> "$GITHUB_STEP_SUMMARY"
fi
