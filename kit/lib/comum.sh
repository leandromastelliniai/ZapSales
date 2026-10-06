# shellcheck shell=bash
# Funções comuns do kit: mensagens e o `.env` da instalação.
#
# O `.env` é o cofre da instalação: senha do banco, JWT_SECRET, chaves de cifra.
# Por isso há DUAS formas de escrever nele, e a diferença é o contrato do kit:
#
#   env_garantir — só escreve chave AUSENTE ou VAZIA. É como todo segredo entra.
#                  Rodar o kit de novo nunca troca um segredo: trocar a senha do
#                  banco ou o JWT_SECRET deixaria a instalação sem acesso ao que
#                  ela mesma gravou.
#   env_definir  — sobrescreve. Só para CONFIGURAÇÃO derivada (domínio, URLs,
#                  porta, imagens), que o kit recalcula a cada rodada.
#
# As duas escrevem via awk com o valor em ENVIRON: nenhum caractere do valor
# (`/`, `&`, `|`, `$`, aspas) é interpretado — o `sed s///` que costuma estar
# aqui quebra com a primeira URL que tem `&`.

msg()   { printf '%s\n' "$*"; }
passo() { printf '\n\033[32m▶ %s\033[0m\n' "$*"; }
aviso() { printf '\033[33m⚠ %s\033[0m\n' "$*" >&2; }
falha() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# env_ler ARQUIVO CHAVE — imprime o valor (vazio se ausente). Nunca falha.
env_ler() {
  local arq="$1" chave="$2"
  [ -f "$arq" ] || return 0
  CHAVE="$chave" awk '
    index($0, ENVIRON["CHAVE"] "=") == 1 { v = substr($0, length(ENVIRON["CHAVE"]) + 2) }
    END { if (v != "") print v }
  ' "$arq"
}

# env_definir ARQUIVO CHAVE VALOR — grava (substitui a linha ou acrescenta).
env_definir() {
  local arq="$1" chave="$2" valor="$3" tmp
  [ -f "$arq" ] || { (umask 077 && : > "$arq"); }
  tmp="$(mktemp "${arq}.XXXXXX")"
  CHAVE="$chave" VALOR="$valor" awk '
    BEGIN { feito = 0 }
    index($0, ENVIRON["CHAVE"] "=") == 1 {
      if (!feito) { print ENVIRON["CHAVE"] "=" ENVIRON["VALOR"]; feito = 1 }
      next
    }
    { print }
    END { if (!feito) print ENVIRON["CHAVE"] "=" ENVIRON["VALOR"] }
  ' "$arq" > "$tmp"
  # Mantém dono e modo do arquivo original (o .env é 600 e precisa continuar).
  chmod --reference="$arq" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" "$arq"
}

# env_garantir ARQUIVO CHAVE VALOR — grava só se a chave estiver ausente ou vazia.
env_garantir() {
  local arq="$1" chave="$2" valor="$3"
  [ -n "$(env_ler "$arq" "$chave")" ] && return 0
  env_definir "$arq" "$chave" "$valor"
}

# exigir_root — o kit mexe em /etc, no Docker e no proxy do sistema.
exigir_root() {
  [ "$(id -u)" -eq 0 ] || falha "Rode como root (sudo $0)."
}

# idioma_valido BRUTO — o código do idioma servido, ou vazio. Aceita o jeito
# como uma pessoa responde ("en", "EN", "english", "espanhol", "1"…). Os códigos
# são os idiomas visíveis do registro (lib/i18n/registro.ts), e quem garante que
# não divergem é tests/unit/instalador-oferece-os-idiomas-servidos.test.ts. O
# bootstrap-owner fecha para pt-BR diante de qualquer outra coisa, então errar
# aqui nunca grava lixo.
idioma_valido() {
  case "$(printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -d '[:space:]')" in
    1|pt|pt-br|ptbr|portugues|português|portuguese) printf 'pt-BR' ;;
    2|es|espanhol|español|espanol|spanish) printf 'es' ;;
    3|en|ingles|inglês|english) printf 'en' ;;
  esac
}
