# Guia — instalar o ZapSales numa VPS limpa

Para quem vai instalar o ZapSales numa VPS (um servidor alugado, como os da Hostinger) que
ainda não tem nada rodando. Não é preciso saber programar: são **um comando** e **cinco
perguntas**. Conte com 30 a 60 minutos do começo ao fim, a maior parte esperando.

> English version: [`installing-on-a-clean-vps.md`](./installing-on-a-clean-vps.md).
> A VPS já serve outros sites (tem Caddy ou Nginx)? O mesmo comando funciona, e o kit se
> adapta sozinho — os detalhes desse caso estão em
> [`instalacao-vps-convivio.md`](./instalacao-vps-convivio.md).

## Antes de começar (uns 15 minutos)

Você vai precisar de três coisas. Faça nesta ordem, porque a terceira demora a "pegar".

### 1. Uma VPS com Ubuntu

Na Hostinger: **VPS › KVM 2** (ou maior), sistema **Ubuntu 24.04**. O ZapSales precisa de
pelo menos **4 GB de memória** e **20 GB livres de disco**; com menos, o kit avisa.

Guarde o **endereço IP** da VPS (algo como `203.0.113.10`) e a senha do usuário `root`, que o
painel mostra.

### 2. As portas 80 e 443 liberadas

São as portas por onde o navegador chega ao site (80 é o HTTP, 443 o HTTPS). Na Hostinger,
em **VPS › Firewall**: se houver alguma regra ativa, acrescente "aceitar TCP 80" e "aceitar
TCP 443". Sem firewall configurado no painel, elas já estão livres.

### 3. Um endereço (domínio) apontando para a VPS

O ZapSales abre num endereço seu, por exemplo `zapsales.suaempresa.com`. No lugar onde o seu
domínio é administrado (o painel de DNS da Hostinger, Registro.br, Cloudflare…), crie um
registro:

| Tipo | Nome | Valor |
|---|---|---|
| `A` | `zapsales` | o IP da sua VPS |

Pode levar de alguns minutos a algumas horas para valer. Para conferir, no seu computador:
`ping zapsales.suaempresa.com` tem de responder com o IP da VPS. (Na Cloudflare, deixe a
nuvem **cinza**, "DNS only": com a nuvem laranja o certificado não é emitido.)

## O comando

Entre na VPS pelo terminal (`ssh root@IP-DA-VPS`; no Windows, o PowerShell já tem o `ssh`) ou
pelo **Terminal do navegador** do painel da Hostinger, e cole:

```bash
curl -fsSL https://raw.githubusercontent.com/leandromastelliniai/ZapSales/main/kit/obter.sh | sudo bash
```

Ele baixa a última versão publicada do ZapSales para `/opt/zapsales` (enquanto não houver
nenhuma, o código mais recente — e avisa), instala o Docker se faltar e
começa a instalação. A partir daí, ele faz as perguntas abaixo.

## As cinco perguntas

**`Domínio do ZapSales (ex.: zapsales.suaempresa.com)`**
O endereço que você criou no passo 3, sem `https://` e sem barra no fim. O kit confere se ele
já aponta para esta VPS; se não apontar, ele para e explica — corrija o DNS e rode o comando de
novo. É esse endereço que vai no certificado HTTPS (o cadeado do navegador).

**`E-mail do primeiro administrador`**
O seu e-mail. Ele vira o login da primeira conta, a dona do sistema, e é para ele que o
Let's Encrypt (quem emite o certificado HTTPS, de graça) manda avisos se algo der errado com o
certificado. Use um e-mail que você lê.

**`Nome da sua empresa [Minha Empresa]`**
Como a sua empresa aparece dentro do sistema. Aperte Enter para ficar com "Minha Empresa" —
dá para trocar depois em **Configurações › Organização**.

**`Idioma do sistema — 1) Português  2) Español  3) English [1]`**
O idioma em que o sistema nasce: telas, e-mails de convite e as mensagens automáticas que os
seus clientes recebem no WhatsApp. Responda `1`, `2` ou `3` (Enter é Português). Quem você
convidar depois entra nesse idioma, e cada pessoa pode trocar o próprio no seletor do topo.

**`Senha do administrador (mínimo 8 caracteres; Enter = gerar uma forte)`**
A senha da sua conta. Ela não aparece enquanto você digita (é de propósito), e o kit pede duas
vezes para conferir. Aperte Enter sem digitar nada e ele gera uma senha forte para você. Escolha
com cuidado: por enquanto o sistema não tem uma tela para trocar a senha, e o "esqueci a senha"
só funciona depois que o envio de e-mail estiver configurado. Esta pergunta só aparece na
primeira instalação.

Pronto: daqui em diante o kit trabalha sozinho e mostra cada etapa com um ▶ verde.

## O que acontece enquanto você espera

1. **Confere a máquina** (sistema, memória, disco) e vê que ninguém usa as portas 80/443 — é o
   que o faz escolher o modo "VPS limpa".
2. **Gera os segredos** da instalação (senhas do banco, chaves de criptografia) em
   `/opt/zapsales/.env`, um arquivo que só o `root` lê. Rodar de novo nunca troca esses segredos.
3. **Prepara os programas** (as "imagens" Docker). Com uma versão publicada, ele as baixa em
   poucos minutos. Se o ZapSales ainda não tiver versão publicada, o kit avisa e as monta na
   própria VPS — leva de 10 a 40 minutos, conforme a máquina.
4. **Sobe o sistema**: banco de dados, login, o ZapSales, o WhatsApp e os serviços de apoio.
5. **Cria a sua conta** de administrador, com a senha que você escolheu (ou a gerada).
6. **Pede o certificado HTTPS** ao Let's Encrypt — por isso o DNS e as portas precisam estar
   prontos antes.
7. **Agenda o backup** diário do banco.
8. **Prova que deu certo**: abre o endereço por HTTPS com o certificado conferido e confirma que
   só as portas 80 e 443 aceitam conexão de fora.

No fim aparece **▶ Pronto**, com o endereço.

## O primeiro acesso

O endereço, o e-mail e a senha ficam num arquivo que só o `root` lê:

```bash
sudo cat /etc/zapsales/primeiro-acesso
```

Abra o endereço no navegador e entre com o e-mail e a senha. Guarde a senha num cofre de
senhas (Bitwarden, 1Password, o do navegador) e apague o arquivo:
`sudo rm /etc/zapsales/primeiro-acesso`.

O que fazer em seguida, dentro do sistema: conectar um número de WhatsApp em **Conexões**,
convidar a equipe e, se quiser e-mails de convite saindo sozinhos, configurar o envio de e-mail
em **Admin › E-mail** (sem isso, o convite mostra o link para você mandar à pessoa).

## Backup fora do servidor (recomendado)

O backup diário fica na própria VPS — protege contra erro, não contra perder a máquina. Para
uma cópia semanal criptografada fora dela (no Cloudflare R2), rode uma vez:

```bash
sudo /opt/zapsales/kit/backup.sh configurar-r2
```

O passo a passo do R2 e da restauração está em [`backup-e-restauracao.md`](./backup-e-restauracao.md).

## Atualizar

Rode o mesmo comando do começo. Ele traz a versão nova e reinstala por cima, sem perguntar de
novo (o `.env` lembra as respostas) e sem perder nada: antes de mexer no banco ele faz um backup.

## Se algo der errado

O kit para com um ✖ vermelho e uma frase dizendo o que fazer. Os casos mais comuns:

| Mensagem | O que fazer |
|---|---|
| `… não resolve no DNS` ou `aponta para …, mas esta máquina é …` | O registro `A` do passo 3 ainda não vale ou aponta para outro IP. Corrija, espere e rode de novo. |
| `respondeu '000' em vez de 307` com a dica do certificado | O Let's Encrypt não alcançou a VPS: confira o firewall do painel (passo 2) e a nuvem cinza da Cloudflare. `cd /opt/zapsales && sudo docker compose logs caddy` mostra o motivo. |
| `Menos de 4 GB de RAM` | É aviso, não erro: a instalação segue, mas o sistema pode ficar lento. Considere um plano maior. |
| `As portas 80/443 são de um contêiner Docker` | Há outro programa (um painel de hospedagem, Traefik…) usando as portas. Use uma VPS limpa, ou desligue esse programa. |

Rodar o comando de novo é sempre seguro. Para pedir ajuda, guarde a saída do terminal — ela diz
em que etapa parou.

## Desfazer

```bash
cd /opt/zapsales && sudo docker compose down   # para o sistema; os dados ficam
sudo rm /etc/cron.d/zapsales                   # tira o backup agendado
```

`docker compose down -v` apaga também os dados (banco, mídias e sessões do WhatsApp). Só faça
isso depois de conferir um backup.

## Para quem quer os detalhes técnicos

- O comando é o [`kit/obter.sh`](../../kit/obter.sh), que clona a última release (tag
  `vX.Y.Z`) e chama o [`kit/instalar.sh`](../../kit/instalar.sh). Todas as perguntas também
  podem vir por variável, para instalar sem terminal interativo:
  `curl … | sudo ZAPSALES_DOMINIO=… ZAPSALES_EMAIL=… ZAPSALES_EMPRESA=… ZAPSALES_IDIOMA=en bash`
  (sem terminal, a senha é gerada; `ZAPSALES_SENHA` a fixa).
- O modo é escolhido pelo dono das portas 80/443 e gravado em `ZAPSALES_MODO` no `.env`; o kit
  nunca troca de modo sozinho. Forçar: `ZAPSALES_MODO=limpa` ou `convivendo`.
- No modo limpa o `COMPOSE_FILE` é `docker-compose.prod.yml:docker-compose.supabase.yml`: o
  Caddy da stack publica 80/443 e tira o certificado sozinho (`CADDY_SITE` = o domínio);
  nenhum outro serviço publica porta. Os perfis opcionais de voz (`COMPOSE_PROFILES=voz` ou
  `telefonia`) publicam portas UDP de mídia, e com eles ligados a conferência final do kit
  acusa essas portas — nos dois modos.
- Os e-mails de confirmar conta e redefinir senha saem pelos moldes do app: o kit grava
  `GOTRUE_MAILER_TEMPLATES_*` e `GOTRUE_MAILER_SUBJECTS_*` no `.env`, no idioma escolhido.
  Um valor que você escrever ali à mão fica.
