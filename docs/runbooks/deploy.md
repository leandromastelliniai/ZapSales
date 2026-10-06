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
   `baseline.sql` antes de recriar o app.

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
