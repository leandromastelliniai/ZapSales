#!/usr/bin/env bash
# Apaga a organização de DEMONSTRAÇÃO e o usuário dela. Roda NA VPS, lido pelo ssh:
#
#   ssh <vps> "bash -s -- <ORG> <USER>" < docs/manual/ferramentas/demo/apagar.sh
#
# Só apaga a organização cujo apelido é `manual-demo`: se o id passado for de outra,
# nada acontece. O cascade do banco leva junto contatos, funis, cartões, conversas e mensagens.
set -euo pipefail

ORG="${1:?uso: apagar.sh <org-uuid> <user-uuid>}"
USER_ID="${2:?uso: apagar.sh <org-uuid> <user-uuid>}"
cd /opt/zapsales

URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env | head -1 | cut -d= -f2-)
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env | head -1 | cut -d= -f2-)

SLUG=$(docker exec zapsales-db-1 psql -U postgres -At -c "select slug from organizations where id = '$ORG'")
if [ "$SLUG" != "manual-demo" ]; then
  echo "RECUSADO: a organização $ORG tem apelido '$SLUG', não 'manual-demo'. Nada foi apagado." >&2
  exit 1
fi

curl -s -o /dev/null -w "usuário: HTTP %{http_code}\n" -X DELETE "$URL/auth/v1/admin/users/$USER_ID" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
docker exec zapsales-db-1 psql -U postgres -At -c "delete from organizations where id = '$ORG' and slug = 'manual-demo'"
echo "organização apagada."
