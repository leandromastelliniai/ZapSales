# Runbook — Deploy em produção (VPS)

O caminho normal de deploy **não constrói nada na VPS**: o CI publica a imagem no
GHCR e a VPS só puxa. Construir localmente é exceção de emergência, e tem custo —
está documentado no fim.

---

## 1. O comando

O kit da VPS mora em `kit/`. Instalar e atualizar são o MESMO comando — rodar de novo é
como se atualiza (segredos ficam, o `baseline.sql` é reaplicado, o bloco do proxy é
substituído):

```bash
cd /opt/zapsales && sudo kit/instalar.sh
```

Passo a passo completo, com o que cada etapa faz e como conferir:
[`instalacao-vps-convivio.md`](./instalacao-vps-convivio.md). Backup e restauração:
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
3. **Deploy na VPS — automático.** Quando `ci`, `e2e`, `perf` e a publicação
   das imagens do commit estão verdes, o `.github/workflows/deploy.yml` leva o
   topo da `main` para a produção (seção 3.1). Por baixo, é o `kit/instalar.sh`
   rodado de novo, não um `up -d` na mão: ele grava as três imagens no `.env`,
   puxa e reaplica o `baseline.sql` antes de recriar o app.

---

## 3.1 Deploy automático

```
merge na main ─┬─ ci ─────────────┐   cada conclusão acorda o deploy.yml;
               ├─ e2e ────────────┤   ele segue quando as QUATRO do topo
               ├─ perf ───────────┤   da main estão verdes
               └─ imagens (GHCR) ─┘   (scripts/deploy/pode-implantar.mjs)
                                  │
       ssh zapsales-deploy@VPS "implantar <sha>"   ← a chave só faz isto
                                  │
   kit/deploy/implantar.sh (root, numa unidade do systemd):
     1. procedência   o commit está na main e é mais novo que o do ar
     2. imagens       puxa zapsales*:sha-<commit> e confere a revisão gravada nelas
     3. troca         código do commit + kit/instalar.sh (dump, schema, up -d, 307)
     4. prova         /api/v1/health responde a versão NOVA, nenhuma dependência
                      que estava ok piorou, app/worker/agendador saudáveis e sem
                      reiniciar por 2 min
     5. volta         falhou em 3 ou 4? código e imagens anteriores de volta
```

**O que NÃO volta: o banco.** O schema só cresce (doutrina de migrations), então o
app anterior roda sobre ele. O kit faz um dump antes de aplicar o schema
(`kit/backup.sh status`), que é o caminho manual se um dia isso não bastar.

**Resultados** (código do SSH, aparece no job e numa issue):

| código | significado | o que fazer |
|---|---|---|
| 0 | no ar e provado (ou já estava nesta versão) | nada — a issue de falha, se houver, fecha sozinha |
| 1 | recusado **antes** de tocar em algo (commit fora da main, rebaixamento, imagem ausente) | ler o log do job |
| 2 | instalou, **falhou na prova e voltou** sozinho | consertar na main; o próximo merge implanta |
| 3 | falhou e **a volta também falhou** | olhar a VPS agora: `cd /opt/zapsales && docker compose ps` |
| 75 | outro deploy estava rodando na VPS | rodar de novo (Actions › deploy › Run workflow) |

Log completo de cada deploy na VPS: `/var/log/zapsales/deploy-<data>-<sha>.log`;
histórico em uma linha por deploy: `/var/lib/zapsales-deploy/historico`.

**Desligar em emergência:** Settings › Variables › `DEPLOY_AUTOMATICO` ≠ `sim`
(ou `gh variable set DEPLOY_AUTOMATICO --body nao`). Não passa por PR, vale no
próximo gatilho. **Reimplantar o topo da main:** Actions › deploy › Run workflow.

### Configuração (uma vez)

Na VPS, como root, a partir de uma cópia do repositório:

```bash
sudo kit/deploy/instalar-acesso.sh /caminho/deploy.pub
```

Cria o usuário `zapsales-deploy` (senha travada, fora do grupo `docker`), instala
`porta.sh`/`implantar.sh` em `/usr/local/lib/zapsales-deploy/` (root:root), um sudoers
de **um** comando e o `authorized_keys` com `restrict,command=` — a chave não abre
terminal, não faz túnel e só consegue pedir `implantar <sha de 40>`. A VPS não guarda
segredo nenhum: repositório e imagens são públicos. **Rodar de novo é como se atualiza
o roteiro** depois de mexer em `kit/deploy/` — o que está instalado é uma cópia, e um
deploy nunca troca o roteiro que o comanda.

No GitHub: ambiente `producao` com o segredo `DEPLOY_SSH_KEY` (chave privada) e as
variáveis `DEPLOY_SSH_HOST`, `DEPLOY_SSH_KNOWN_HOSTS` (saída de `ssh-keyscan -t ed25519
<host>`, conferida com `StrictHostKeyChecking=yes`), `DEPLOY_URL` e, por último,
`DEPLOY_AUTOMATICO=sim`. Num fork ou clone nada disso existe e o job é pulado.

### Ensaio da volta

Como root na VPS, com um commit da main mais novo que o do ar:

```bash
sudo ZAPSALES_DEPLOY_SIMULAR_FALHA=1 /usr/local/lib/zapsales-deploy/implantar.sh implantar <sha>
# esperado: instala, prova, simula a falha, volta — código 2 e a versão anterior no /api/v1/health
```

O gancho não é alcançável pela chave de deploy: a porta não repassa ambiente e o
sudo o zera.

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
