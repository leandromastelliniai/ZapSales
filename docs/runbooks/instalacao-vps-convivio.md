# Runbook — instalar o ZapSales numa VPS que já roda outros apps

Modo **"convivendo com outros apps"** do kit (issue #3). A VPS já tem um proxy — Caddy ou
Nginx instalado no sistema — servindo outros sites nas portas 80/443. O ZapSales entra sem
tocar neles: toda a stack escuta só no `127.0.0.1`, e o proxy ganha **um bloco** que
repassa o domínio do ZapSales para lá.

O modo "VPS limpa" (o ZapSales com o próprio proxy, para quem não tem nada na máquina) é a
issue #12 e ainda não está no kit: numa VPS sem proxy nas portas 80/443 o kit para e diz isso.

## O que precisa existir antes

| Item | Como conferir |
|---|---|
| Ubuntu ou Debian, acesso root | `cat /etc/os-release` |
| Caddy **ou** Nginx do sistema atendendo 80/443 | `ss -ltnp \| grep -E ':(80\|443) '` |
| Docker com Compose ≥ 2.24 (o kit instala o Docker se faltar) | `docker compose version` |
| Registro DNS `A` do domínio apontando para a VPS | `getent hosts zapsales.suaempresa.com` |
| ≥ 4 GB de RAM e ≥ 20 GB livres | `free -m; df -h /` |

## O comando

O código vai para `/opt/zapsales` (clone do repositório, ou cópia do `git archive`), e o
kit roda de dentro dele:

```bash
cd /opt/zapsales
sudo ZAPSALES_DOMINIO=zapsales.suaempresa.com \
     ZAPSALES_EMAIL=voce@suaempresa.com \
     kit/instalar.sh
```

Sem as variáveis, ele pergunta. Outras opcionais:

| Variável | Para quê |
|---|---|
| `ZAPSALES_EMPRESA` | nome da organização criada com o primeiro administrador |
| `ZAPSALES_SENHA` | senha do primeiro administrador (padrão: gerada) |
| `ZAPSALES_IMAGENS=construir` | constrói as imagens na VPS em vez de puxar do registro (ver abaixo) |
| `ZAPSALES_VERSAO` | versão das imagens do registro (padrão: a do `package.json`) |

Ao fim, as credenciais do primeiro acesso ficam em `/etc/zapsales/primeiro-acesso` (só o
root lê): `sudo cat /etc/zapsales/primeiro-acesso`. Troque a senha no primeiro login.

### Imagens: registro ou construção local

O padrão é **puxar** as imagens publicadas pelo CI, na tag da versão
(`ghcr.io/leandromastelliniai/zapsales:<versão>`) — doutrina de packaging. Enquanto o
repositório e as imagens forem privados, a VPS não as alcança sem `docker login ghcr.io`
com um token `read:packages`; nesse caso use `ZAPSALES_IMAGENS=construir`, que constrói as
três imagens na própria VPS (~10 min numa máquina de 8 núcleos). **É exceção e é dívida**
([`deploy.md` §4](./deploy.md)): a imagem só existe naquele disco. O `.env` lembra a escolha;
para voltar ao registro, rode o kit com `ZAPSALES_IMAGENS=registro`.

## O que o kit faz, e como conferir cada passo

1. **Descobre o proxy** pelo dono das portas 80/443 (`ss -ltnp`). Caddy do sistema e Nginx
   do sistema são suportados; contêiner (Traefik, Caddy em Docker, painel de hospedagem) ou
   outro servidor fazem o kit parar com a explicação.
2. **Fotografa os sites vizinhos** (os domínios do Caddyfile, ou os `server_name` do Nginx),
   e um vigia os sonda a cada 5 s durante toda a instalação. O relatório "antes · depois ·
   falhas" sai no fim, e o registro completo fica em `/var/log/zapsales/vizinhos-*.log`.
3. **Gera o `.env`** em `/opt/zapsales/.env` (modo 600). Segredos — senha do banco,
   `JWT_SECRET`, chaves de cifra — **só na primeira vez**: rodar de novo nunca os troca.
   As chaves `anon` e `service_role` do Supabase são assinadas com o `JWT_SECRET` desta
   instalação, nunca as de demonstração da documentação do Supabase.
4. **Sobe a stack** com `COMPOSE_FILE=docker-compose.prod.yml:docker-compose.supabase.yml:docker-compose.convivio.yml`
   gravado no `.env` — então um `docker compose up -d` digitado à mão sobe o mesmo conjunto.
   Ordem: banco → Auth/Storage (criam os schemas `auth` e `storage`) → `baseline.sql` →
   Realtime reiniciado (ele só enxerga a publicação depois do baseline) → resto.
5. **Cria o primeiro administrador** com `scripts/bootstrap-owner.ts`, só se ainda não há
   nenhum — reexecutar o kit não troca a senha de ninguém.
6. **Acrescenta o bloco ao proxy do sistema**:
   - Caddy: bloco entre `# >>> zapsales:<domínio>` e `# <<< zapsales:<domínio>` no
     Caddyfile, validado com `caddy validate` **antes** de entrar; cópia da versão anterior
     em `/etc/zapsales/proxy/`; `systemctl reload caddy` (sem derrubar conexão), e volta
     sozinho à versão anterior se o reload falhar. Se o bloco já está igual, o Caddy nem é
     tocado. Um bloco do mesmo domínio escrito à mão faz o kit parar — ele não sobrescreve
     configuração alheia.
   - Nginx: `zapsales-<domínio>.conf` em `sites-available` (ou `conf.d`), `nginx -t`,
     reload e `certbot --nginx` para o HTTPS.
7. **Agenda os backups** em `/etc/cron.d/zapsales` (ver
   [`backup-e-restauracao.md`](./backup-e-restauracao.md)).
8. **Prova**: `https://<domínio>/` responde **307** (redireciona para o login), e nenhum
   contêiner do projeto publica porta fora do `127.0.0.1`.

## Conferências manuais

```bash
# 1. O domínio abre (307 = redireciona para o login)
curl -s -o /dev/null -w "%{http_code}\n" https://zapsales.suaempresa.com/

# 2. Nada do ZapSales aceita conexão de fora — só o 127.0.0.1:<porta> do proxy
docker ps --filter label=com.docker.compose.project=zapsales --format '{{.Names}}\t{{.Ports}}'

# 3. Limites de CPU e memória aplicados
docker stats --no-stream $(docker ps -q --filter label=com.docker.compose.project=zapsales)

# 4. Volta sozinho depois de reiniciar a VPS
sudo reboot   # depois: o passo 1 de novo
```

`restart: unless-stopped` em todo serviço e `docker` habilitado no systemd trazem tudo de
volta após um reboot. Quem garante o primeiro é `tests/unit/limites-de-recurso-do-compose.test.ts`,
que também reprova serviço sem `mem_limit`/`cpus`.

## Atualizar

Traga o código novo para `/opt/zapsales` e rode o kit de novo, com o mesmo comando (as
variáveis podem ser omitidas — o `.env` lembra). Ele reaplica o `baseline.sql` (idempotente),
reconstrói ou puxa as imagens e recria só o que mudou.

## Desfazer

```bash
cd /opt/zapsales && sudo docker compose down          # para a stack (volumes ficam)
# Caddy: apague o bloco entre os marcadores do ZapSales e `systemctl reload caddy`
# Nginx: apague /etc/nginx/sites-*/zapsales-<domínio>.conf e `systemctl reload nginx`
sudo rm /etc/cron.d/zapsales
```

`docker compose down -v` apaga também os volumes — o banco, as mídias e as sessões do
WhatsApp. Só depois de conferir um backup.
