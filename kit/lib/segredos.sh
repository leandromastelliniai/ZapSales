# shellcheck shell=bash
# Geração de segredos e das chaves de API do Supabase.
#
# As chaves `anon` e `service_role` do Supabase são JWTs HS256 assinados com o
# JWT_SECRET da instalação. O kit as assina aqui, com openssl, em vez de usar
# as chaves de demonstração que circulam na documentação do Supabase — essas
# são PÚBLICAS, e com elas qualquer um assina um token de service_role para a
# sua instalação.

segredo_hex() { openssl rand -hex "$1"; }

# segredo_b64 N — N bytes aleatórios em base64 sem `/`, `+` nem `=` (cabem em
# URL de conexão e em .env sem escape).
segredo_b64() { openssl rand -base64 "$(( $1 * 2 ))" | tr -d '\n/+=' | cut -c1-"$(( $1 * 4 / 3 ))"; }

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

# jwt_hs256 SEGREDO PAYLOAD_JSON — imprime o token.
jwt_hs256() {
  local segredo="$1" payload="$2" h p s
  h="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)"
  p="$(printf '%s' "$payload" | b64url)"
  s="$(printf '%s' "$h.$p" | openssl dgst -sha256 -hmac "$segredo" -binary | b64url)"
  printf '%s.%s.%s\n' "$h" "$p" "$s"
}

# chave_supabase JWT_SECRET PAPEL — a chave anon ou service_role, válida por 10 anos.
chave_supabase() {
  local agora fim
  agora="$(date +%s)"
  fim=$(( agora + 10 * 365 * 24 * 3600 ))
  jwt_hs256 "$1" "{\"role\":\"$2\",\"iss\":\"supabase\",\"iat\":$agora,\"exp\":$fim}"
}
