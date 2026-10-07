# Runbook — Deploy em produção (VPS)

O caminho normal de deploy **não constrói nada na VPS**: o CI publica a imagem no
GHCR e a VPS só puxa. Construir localmente é exceção de emergência, e tem custo —
está documentado no §4.

---

## 1. O comando

O kit da VPS mora em `kit/`. Instalar e atualizar são o MESMO comando — rodar de novo é
como se atualiza (segredos ficam, o `baseline.sql` é reaplicado, o bloco do proxy é
substituído):

```bash
cd /opt/zapsales && sudo kit/instalar.sh
```

Passo a passo completo, com o que cada etapa faz e como conferir:
[`instalacao-vps-convivio.md`](./instalacao-vps-convivio.md) (VPS com outros sites) ou
[`instalacao-vps-limpa.md`](./instalacao-vps-limpa.md) (VPS só do ZapSales). Backup e restauração:
[`backup-e-restauracao.md`](./backup-e-restauracao.md).

### O roteamento faz parte de todo `up -d`

O kit grava no `.env` o `COMPOSE_FILE` com os três arquivos
(`docker-compose.prod.yml`, `docker-compose.supabase.yml` e, no modo "convivendo com outros
apps", `docker-compose.convivio.yml`). Por isso um `docker compose up -d` digitado à mão na
pasta da instalação sobe o mesmo conjunto. Subir **sem** o override do modo convivendo
(`-f docker-compose.prod.yml` explícito) faria o Caddy da stack disputar as portas 80/443
com o proxy do sistema — o `up -d` falha, ou, pior, o proxy dos outros apps perde a porta.

## 2. Verificação pós-deploy (não pule)

`healthy` no `docker ps` **não prova que o site está acessível** — o healthcheck
é um probe TCP interno e passa mesmo com o roteamento quebrado. Verifique pelo
domínio (o `kit/instalar.sh` faz esta mesma prova no fim):

```bash
# o domínio responde?
curl -s -o /dev/null -w "%{http_code}\n" https://<DOMAIN>/
# esperado: 307 (redireciona pro login)
# 502      = o proxy do sistema não alcança a stack: confira `docker compose ps`
#            e a porta ZAPSALES_PORTA_LOCAL do .env contra o bloco do proxy
```

---

## 3. Fluxo completo (do código à produção)

```
commit → push → PR → merge na main → CI publica imagem → VPS puxa
```

1. **Commit + push** numa branch de feature. Trabalho que fica só no disco da
   VPS não existe: o CI não o vê, some se a VPS for reconstruída, e é invisível
   pra qualquer outra pessoa.
2. **PR e merge na `main`.** `publish-image.yml` dispara em push na `main` (ou
   tag `v*`) e publica **três** imagens — `zapsales`, `zapsales-worker` e
   `zapsales-scheduler` — sempre na mesma versão. O build pesado roda nos
   runners do GitHub, nunca na VPS do usuário.
3. **Deploy na VPS.** É o `kit/instalar.sh` rodado de novo, não um `up -d` na
   mão: ele grava as três imagens no `.env`, puxa (ou constrói) e reaplica o
   `baseline.sql` antes de recriar o app. Na produção do projeto este passo é
   automático — ver §5.

> **`latest` não é a última release.** Ele é publicado a partir da branch default, então
> segue o **topo da `main`** — código ainda não lançado. Quem quer a última release usa
> `stable`; quem opera um cliente usa o número da versão. Ver
> [`../doctrine/packaging.md`](../doctrine/packaging.md).

---

## 4. Exceção: imagem construída na VPS

Só quando é preciso validar algo em produção **antes** de a imagem oficial
existir (ex.: CI ainda rodando e um bug bloqueando o usuário).

```bash
APP_IMAGE=zapsales-app:local docker compose \
  -f docker-compose.prod.yml -f docker-compose.build.yml --env-file .env build app

# acrescente o arquivo de roteamento do proxy da VPS, se houver (ver §1)
APP_IMAGE=zapsales-app:local APP_PULL_POLICY=never docker compose \
  -f docker-compose.prod.yml --env-file .env up -d app
```

O `docker-compose.build.yml` também cobre `worker` e `scheduler` — troque
`app` pelo serviço que você precisa construir. Eles têm `build:` no próprio
compose de produção (é o escape que faz a instalação sobreviver a um registry
fora do ar), mas é o override que traz o `pull_policy: never`; sem ele o
`up -d` volta a buscar a imagem publicada.

**Isto é dívida, não um caminho paralelo.** A imagem existe só no disco daquela
VPS: não está no registry, não está no git, e qualquer `docker compose up -d`
sem `APP_PULL_POLICY=never` a substitui pela do GHCR — silenciosamente, sem erro
nenhum, revertendo o que você acabou de subir.

Requisitos: >= 4 GB de RAM **ou** swap (medido: ~4min num VPS de 3.8 GB com 4 GB
de swap) — e isto é o requisito **deste caminho de exceção**, não da operação
normal. A régua de operação é outra, e não mudou. Ela tem três parcelas, e **duas
são medidas e uma é herdada** — a distinção importa porque a herdada é a que
costuma ser citada como se fosse nossa:

| parcela | estado | como conferir |
|---|---|---|
| 7 contêineres | **medido** | `docker compose -f docker-compose.prod.yml config --services \| wc -l` |
| `mem_limit` somando 2560m (app 768 + worker 512 + waha 1280) | **medido** | `grep -n 'mem_limit' docker-compose.prod.yml` |
| ~150 MB por número de WhatsApp | **herdado do upstream WAHA**, nunca medido neste projeto | `docker stats --no-stream` na sua VPS |

O terceiro número vem de uma síntese de curso sobre o WAHA (2026-05), não de uma
medição nossa — e circula em sete documentos que se
citam entre si. Uma medição pontual na produção do projeto (2026-08-14, **uma**
sessão pareada, VPS compartilhada com outras stacks) deu **304,5 MiB no contêiner
`waha` inteiro**, contra o `mem_limit` de 1280 MiB. Um ponto não decompõe baseline
e sessão: para isso seriam necessários dois números pareados, e não é ensaio que
se faça numa instalação viva.

**Nada disso mexe no tier recomendado.** A régua que sustenta os 4 GB é a soma da
stack em operação, não o WAHA isolado — e a folga existe justamente porque a
parcela por sessão não é conhecida com precisão.

Ao terminar, feche o ciclo — merge na `main` e volte a VPS pra imagem oficial.

---

## 5. Implantação contínua (a produção do projeto)

Na VPS de produção do próprio projeto o passo 3 acima é automático (issue #24): o merge na
`main` chega sozinho à produção, com validação e volta automática. Para um self-hoster nada
muda — o kit só instala o comando, que fica inerte até alguém autorizar uma chave.

### Como funciona

```
merge na main → ci, e2e, perf e publicação das imagens terminam
  → implantar.yml: o portão confere (topo da main, os quatro verdes neste commit)
  → ssh zapsales-deploy@vps "implantar <sha>"   (um comando só, host por chave fixa)
  → a VPS confere de novo, instala, prova — e volta sozinha se algo falhar
```

Quem decide **quando** é o workflow (`.github/workflows/implantar.yml` +
`scripts/implantacao/portao.sh`); quem decide **se** é a VPS (`kit/implantar.sh`). Nenhuma
metade confia na outra.

| etapa (na VPS) | o que prova | se falhar |
|---|---|---|
| o commit está na `main`? (perguntado à API do GitHub) | ninguém implanta uma branch | recusa, código 2 |
| avança em relação ao que está no ar? | nada de rebaixamento nem desvio | recusa, código 2 |
| as três imagens `sha-<commit>` existem e têm `org.opencontainers.image.revision` = commit? | a imagem é a daquele código | recusa, código 2 |
| `kit/instalar.sh` com `ZAPSALES_VERSAO=sha-<commit>` (dump do banco antes do baseline) | o mesmo caminho de uma atualização manual | volta, código 3 |
| `/api/v1/health` responde a versão nova | o app no ar é o novo | volta, código 3 |
| nenhuma dependência que estava `ok` antes piorou | supabase, redis, waha | volta, código 3 |
| app, worker e agendador saudáveis e sem reinício por 2 min | não é um crashloop lento | volta, código 3 |

**A volta** põe de volta o código, o `.env` e as imagens da versão anterior e confere o
307 no domínio e, quando havia uma, a versão que `/api/v1/health` respondia antes. **O banco não
volta**: o baseline é aditivo e o código anterior roda sobre ele. Também ficam como a versão nova
deixou: o bloco do proxy do sistema (igual entre versões), o próprio comando
`zapsales-implantar` e arquivos que só a versão nova tinha (o código é sobreposto, não
espelhado — o compose e o kit só leem o que a versão em vigor nomeia).

A VPS confere que o commit **está na história** da `main`; que ele é o **topo** é o portão do
workflow quem confere. Um merge que entre entre o portão e a VPS não faz a implantação ser
recusada — o merge seguinte é implantado logo depois.
Código 4 é "falhou e a volta também falhou" — alguém precisa olhar agora.

Toda falha (2, 3, 4, ou a conexão que não chegou) abre a issue com o rótulo
`implantacao-falhou`; a implantação seguinte que passa a fecha.

**O registro completo fica só na VPS**, em `/var/log/zapsales/implantar-*` — o da implantação
(`implantar-<data>-<commit>.log`) e o do kit (`…-kit.log`). É lá que se lê o motivo de uma falha.
Pelo SSH saem **só as etapas**, e é isso que o log do job `implantar` e a cauda da issue mostram.
O porquê: o repositório é público, então o log do Actions é público, e a cauda vai para o corpo
de uma issue sem máscara nenhuma. A máscara automática do Actions só cobre os segredos que o
GitHub conhece — nenhum da VPS (`.env`, chaves do Supabase, `WAHA_API_KEY`, chaves de IA, a
string de conexão do Postgres). O kit traz ainda o e-mail do administrador e os domínios dos
sites vizinhos. Um `docker compose` verboso ou um erro do `psql` que ecoe a URL de conexão
bastariam para um segredo da produção virar texto público. São duas camadas
(`kit/lib/implantar.sh`, issue #39):

1. **A VPS decide o que sai.** Só as linhas que o próprio `kit/implantar.sh` escreveu (marcadas
   com `[implantar] ` no registro) passam; saída bruta de `docker`, `psql`, `curl` ou
   `kit/instalar.sh` fica no registro. Do kit, sai só o título de cada passo (`kit: …`).
2. **Redação de tudo o que sai**, para o que a primeira deixar passar: tokens do GitHub
   (`ghp_`, `ghs_`, `github_pat_`…), `zps_`, `Bearer …`, JWT, `sk-…`, credencial em URL
   (`postgres://usuario:senha@`) e `NOME=valor` quando o nome tem forma de segredo viram
   `[redigido]`. O workflow aplica a mesma redação de novo antes do `tee`. A lista acima é um
   resumo; a que vale é o código: `sed -n '/^redigir()/,/^}/p' kit/lib/implantar.sh`.

A prova é `tests/shell/kit-implantar-saida.test.sh` (`pnpm test:shell`). O comando instalado na
VPS só se atualiza pelo próprio kit, no meio de uma implantação: a **primeira** depois de uma
mudança aqui ainda roda a frente antiga — e para essa só vale a redação do workflow.

### Preparar (uma vez)

1. Gere um par de chaves só para isto, fora da VPS: `ssh-keygen -t ed25519 -N "" -C github-implantar -f implantar`.
2. Na VPS, depois de o código desta versão estar em `/opt/zapsales`:

   ```bash
   sudo /opt/zapsales/kit/implantar.sh acesso "$(cat implantar.pub)" [endereço público da VPS]
   ```

   Sem o endereço, vale o primeiro de `hostname -I` — que pode ser de rede privada ou IPv6.
   A porta é a 22.

   Cria o usuário `zapsales-deploy` (sem senha), autoriza a chave com
   `restrict,command="/usr/local/sbin/zapsales-implantar"` — sem terminal, sem túnel, sem
   encaminhamento —, dá `sudo` só para esse comando e imprime a linha de `known_hosts`.
3. No GitHub (Settings › Secrets and variables › Actions): segredos `DEPLOY_SSH_KEY` (o
   conteúdo de `implantar`, a privada), `DEPLOY_SSH_KNOWN_HOSTS` (a linha impressa) e
   `DEPLOY_SSH_HOST`; variável `DEPLOY_AUTOMATICO=ligado`.
4. Apague a chave privada do disco local.

A VPS precisa saber qual commit está no ar: `/opt/zapsales/.zapsales-revisao` com o sha
**inteiro**. Sem ele a implantação recusa (não há como recusar rebaixamento nem voltar).

### Desligar numa emergência (sem PR)

Troque a variável `DEPLOY_AUTOMATICO` para qualquer valor diferente de `ligado`. O workflow
continua rodando a cada merge, mas o portão nem começa. Uma implantação já em andamento termina
(e volta, se for o caso) sozinha — cancelar o job não para a VPS.

### À mão

```bash
sudo zapsales-implantar <sha>                          # o mesmo caminho, de dentro da VPS
sudo ZAPSALES_ENSAIAR_VOLTA=1 zapsales-implantar <sha> # instala, prova e VOLTA de propósito
```

O ensaio da volta só existe como root na própria VPS: pela chave do GitHub o `sudo` limpa o
ambiente e a variável nunca chega. Reimplantar o topo da `main` pelo GitHub: Actions ›
implantar › Run workflow (o mesmo portão vale).

Depois da implantação contínua, rodar `kit/instalar.sh` à mão sobre o mesmo código mantém a
imagem `sha-<commit>` — não cai na versão do `package.json`, que poria a última release sobre um
banco mais novo.
