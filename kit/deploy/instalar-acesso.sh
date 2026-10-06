#!/usr/bin/env bash
# kit/deploy/instalar-acesso.sh — prepara a VPS para receber o deploy automático.
#
#   sudo kit/deploy/instalar-acesso.sh /caminho/da/chave-publica.pub
#
# Rodar de novo é seguro e é como se atualiza o roteiro de deploy depois de
# mexer em kit/deploy/: os arquivos são reinstalados e a chave é substituída.
#
# O que fica na máquina:
#   usuário zapsales-deploy      sem senha (travada), sem grupo docker, sem sudo
#                                além de UM comando
#   /usr/local/lib/zapsales-deploy/{porta.sh,implantar.sh,comum.sh}
#                                root:root, ninguém mais escreve
#   /etc/sudoers.d/zapsales-deploy
#                                zapsales-deploy → root, só implantar.sh implantar <arg>
#   ~zapsales-deploy/.ssh/authorized_keys
#                                root:root (o próprio usuário não consegue
#                                trocar a chave), com `restrict,command=` —
#                                a chave só executa a porta, sem terminal nem túnel
#
# A VPS não guarda segredo nenhum para isso: o repositório e as imagens no GHCR
# são públicos, e o implantar.sh busca os dois sem credencial.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/comum.sh
. "$DIR/../lib/comum.sh"

USUARIO=zapsales-deploy
DESTINO=/usr/local/lib/zapsales-deploy
SUDOERS=/etc/sudoers.d/zapsales-deploy

exigir_root
CHAVE_ARQ="${1:-}"
[ -s "$CHAVE_ARQ" ] || falha "Uso: sudo $0 /caminho/da/chave-publica.pub"
CHAVE="$(tr -d '\r' < "$CHAVE_ARQ" | head -1)"
[[ "$CHAVE" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ [^\"]*)?$ ]] || falha "A chave precisa ser uma única chave pública ssh-ed25519."

passo "Usuário $USUARIO"
if id "$USUARIO" >/dev/null 2>&1; then
  msg "  já existe."
else
  # Shell de verdade (/bin/sh): o sshd executa o `command=` por meio dele.
  # Quem entra não ganha shell interativo: o `command=` substitui tudo.
  useradd --system --create-home --home-dir "/home/$USUARIO" --shell /bin/sh "$USUARIO"
  msg "  criado."
fi
passwd -l "$USUARIO" >/dev/null 2>&1 || true
if id -nG "$USUARIO" | tr ' ' '\n' | grep -qx docker; then
  falha "$USUARIO está no grupo docker — isso equivale a root sem passar pelo sudo. Remova: gpasswd -d $USUARIO docker"
fi

passo "Roteiro em $DESTINO"
install -d -o root -g root -m 755 "$DESTINO"
install -o root -g root -m 755 "$DIR/porta.sh" "$DESTINO/porta.sh"
install -o root -g root -m 755 "$DIR/implantar.sh" "$DESTINO/implantar.sh"
install -o root -g root -m 644 "$DIR/../lib/comum.sh" "$DESTINO/comum.sh"
install -d -o root -g root -m 700 /var/lib/zapsales-deploy
msg "  porta.sh, implantar.sh e comum.sh instalados (root:root)."

passo "Sudo de um comando só"
tmp="$(mktemp)"
cat > "$tmp" <<EOF
# Gerenciado por kit/deploy/instalar-acesso.sh. Não edite: rodar o script regrava.
# A chave de deploy chega aqui pela porta (porta.sh), que já validou o SHA; o
# implantar.sh valida de novo, como root, antes de qualquer efeito.
$USUARIO ALL=(root) NOPASSWD: $DESTINO/implantar.sh implantar *
EOF
visudo -cf "$tmp" >/dev/null || { rm -f "$tmp"; falha "O sudoers gerado não valida; ele não foi gravado."; }
install -o root -g root -m 440 "$tmp" "$SUDOERS"
rm -f "$tmp"
msg "  $SUDOERS"

passo "Chave SSH travada na porta"
home="$(getent passwd "$USUARIO" | cut -d: -f6)"
install -d -o root -g root -m 755 "$home/.ssh"
printf 'restrict,command="%s/porta.sh" %s\n' "$DESTINO" "$CHAVE" > "$home/.ssh/authorized_keys"
chown root:root "$home/.ssh/authorized_keys"
chmod 644 "$home/.ssh/authorized_keys"
msg "  $home/.ssh/authorized_keys (root:root — o usuário não troca a própria chave)"

if sshd -T 2>/dev/null | grep -qiE '^(allowusers|allowgroups) '; then
  aviso "O sshd tem AllowUsers/AllowGroups: confira que $USUARIO está liberado (sshd -T | grep -i allow)."
fi

passo "Pronto"
msg "  Teste daqui de fora:  ssh $USUARIO@<esta VPS> implantar <sha da main>"
