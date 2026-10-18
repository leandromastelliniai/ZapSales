#!/usr/bin/env bash
# Cria, na VPS, a organização de DEMONSTRAÇÃO usada nos prints do manual, e um usuário
# administrador dela. Roda NA VPS, lido pelo ssh (nada aqui guarda senha nem endereço):
#
#   ssh <vps> "ZS_PW='<senha-que-voce-escolhe>' bash -s" < docs/manual/ferramentas/demo/criar.sh
#
# Imprime ORG=<uuid> e USER=<uuid>. Guarde os dois: são o que `apagar.sh` precisa.
# Depois, para ter dados nas telas:
#   ssh <vps> "docker exec -i zapsales-db-1 psql -U postgres -v ON_ERROR_STOP=1 -q \
#     -v org=\"'<ORG>'\" -v usr=\"'<USER>'\"" < docs/manual/ferramentas/demo/semear.sql
set -euo pipefail

: "${ZS_PW:?defina ZS_PW (a senha do usuário de demonstração)}"
cd /opt/zapsales

# Não use `source .env`: há valores com espaço. Extrai só as duas variáveis.
URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env | head -1 | cut -d= -f2-)
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env | head -1 | cut -d= -f2-)

ORG=$(docker exec zapsales-db-1 psql -U postgres -At -c \
  "insert into organizations (slug, display_name, legal_name, timezone, locale, onboarded_at)
   values ('manual-demo','Loja Aurora (demonstração)','Loja Aurora Demonstração Ltda','America/Sao_Paulo','pt-BR', now())
   returning id" | head -1)
echo "ORG=$ORG"

RESP=$(curl -s -X POST "$URL/auth/v1/admin/users" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"manual-demo@example.com\",\"password\":\"$ZS_PW\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Marina Souza\"}}")
USER_ID=$(echo "$RESP" | grep -oE '"id":"[0-9a-f-]{36}"' | head -1 | cut -d'"' -f4)
echo "USER=$USER_ID"

docker exec zapsales-db-1 psql -U postgres -At -c \
  "insert into user_organizations (user_id, organization_id, role, accepted_at) values ('$USER_ID','$ORG','admin', now())" >/dev/null
