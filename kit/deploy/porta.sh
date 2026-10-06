#!/bin/sh
# kit/deploy/porta.sh — a ÚNICA coisa que a chave de deploy consegue executar.
#
# Instalado por kit/deploy/instalar-acesso.sh em /usr/local/lib/zapsales-deploy/
# e amarrado à chave no authorized_keys do usuário `zapsales-deploy`:
#
#   restrict,command="/usr/local/lib/zapsales-deploy/porta.sh" ssh-ed25519 AAAA...
#
# O sshd roda este arquivo no lugar de qualquer comando que o cliente peça, e o
# pedido chega em SSH_ORIGINAL_COMMAND. `restrict` desliga terminal, túnel de
# porta, X11 e agente. Então quem tiver a chave privada (o GitHub Actions — ou
# quem a roubar dele) só consegue pedir "implante o commit X", e o X ainda
# precisa estar na `main` e ser mais novo que o que está no ar: quem decide
# isso é o implantar.sh, como root, sem confiar em nada que veio daqui.
set -eu

pedido="${SSH_ORIGINAL_COMMAND:-}"
case "$pedido" in
  "implantar "*) sha="${pedido#implantar }" ;;
  *)
    echo "Comando não permitido. Esta chave só aceita: implantar <sha de 40 caracteres>" >&2
    exit 64
    ;;
esac

# Sem grep: `grep -x` testa LINHA a linha, e um sha com quebra de linha
# embutida passaria se qualquer linha casasse.
case "$sha" in
  *[!0-9a-f]*) echo "SHA inválido." >&2; exit 64 ;;
esac
[ "${#sha}" -eq 40 ] || { echo "SHA inválido: precisa de 40 caracteres hexadecimais." >&2; exit 64; }

exec sudo -n /usr/local/lib/zapsales-deploy/implantar.sh implantar "$sha"
