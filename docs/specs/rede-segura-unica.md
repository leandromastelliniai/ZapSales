# Rede segura única para endereços informados pelo usuário

> Issue #88 (filha da #86). Contrato técnico de **todo acesso de saída do servidor a um
> endereço que um usuário escolheu**. Código: `lib/net/rede-segura/`. Mapa vivo:
> `docs/architecture/rede-segura.architecture.json`.

**Destino (DoD 18): infraestrutura.** Não é recurso que uma organização liga ou desliga — é a
régua que todo recurso de saída atravessa. Com zero extensões e zero funções novas, a operação
comum continua inteira e mais segura.

## Por que existe

Havia três implementações separadas, cada uma errando num canto diferente:

| Antes | Falha medida |
|---|---|
| Webhook de saída (`outbound-url.ts` + `outbound-ip.ts` + `fetch`) | Julgava o IP e depois deixava o `fetch` resolver o nome **de novo** — a janela de DNS rebinding estava declarada no cabeçalho do arquivo. Decidia IPv6 por prefixo de texto: `::ffff:7f00:1` (loopback em hexadecimal) passava. Qualquer 2xx com corpo enorme era lido. |
| Download de extensões (`extensions/download.ts`) | Correto, mas próprio: a única das três que prendia o IP à conexão. |
| Banco externo (`external-db/guardas.ts`) | Tabela de faixas própria e a janela de rebinding **declarada como dívida** entre a checagem e o `connect` do `pg`. |

## A política

Um ponto de acesso (`buscarSeguro`) e duas primitivas (`resolverEJulgar`, `lookupJulgado`):

1. **Texto da URL** (`validarUrl`): só `https` — `http` é interruptor explícito de quem chama
   (`permitirHttp`); sem `localhost`; sem IPv4 de rede local por extenso; sem literal IPv6, a menos
   que quem chama peça para julgá-lo (`julgarLiteralIpv6`). O `new URL` normaliza `2130706433` e
   `0x7f.1` para `127.0.0.1` antes do julgamento.
2. **DNS resolvido uma vez e julgado inteiro**: se **qualquer** endereço do nome é especial, o
   nome inteiro é recusado (um público e um privado na mesma resposta é a assinatura do rebinding).
3. **O socket recebe só o que foi julgado** (`lookup` fixado). Não existe segunda resolução, então
   não existe janela. O `Host` e o SNI continuam sendo o nome — o que quebrava TLS na tentativa
   antiga era trocar a URL pelo IP; fixar o `lookup` não troca nada.
4. **Redirecionamento recomeça do zero**: cada salto passa por 1–3, com teto de saltos
   (`maxRedirecionamentos`, padrão **0** = devolve o 3xx, como o `fetch` com `redirect: "manual"`).
   Credencial (`Authorization`, `Cookie` e qualquer cabeçalho com `key|token|secret|signature|auth`)
   não atravessa para outra origem; 303 (e 301/302 de POST) vira GET sem corpo.
5. **Limites**: prazo **total** (`timeoutMs`, padrão 10 s — DNS, conexão, cabeçalhos e corpo, todos
   os saltos; gotejar um byte por vez não o renova) e teto de bytes **contado no que chega**
   (`maxBytes`, padrão 1 MiB; `Content-Length` acima do teto recusa antes de ler). Estourar derruba
   o socket. `lerResposta: false` devolve só status e cabeçalhos, sem ler o corpo.

**Régua de IP** (`ip.ts`): o endereço é normalizado (`ipaddr.process` desembrulha IPv4-mapped) e só
`unicast` passa; os dois buracos conhecidos do `ipaddr.js` — `::a.b.c.d` (IPv4-compatível) e
`100::/64` — são fechados à mão. O que não parseia é especial.

**Códigos** (o `message` do erro **é** o código, e os `unsafe_url:*` são os de sempre): recusa →
`unsafe_url:{invalid,scheme,https_required,private_host,ipv6_literal,private_ip,dns_failed,dns_empty}`;
transporte → `net:{timeout,aborted,response_too_large,too_many_redirects,connection_failed}`.

**Única válvula**: `ipPermitido(ip)`. É por **endereço**, nunca por nome, e é o gancho da lista de
destinos internos que o dono da **instalação** autoriza
(`lib/automation/destinos-internos-autorizados.ts`, decisão 22-d). Uma organização nunca a recebe.

## Quem usa o quê

| Acesso | Como usa | Perfil |
|---|---|---|
| Webhook de saída (`call_webhook`) | `buscarSeguro` | `permitirHttp` só fora de produção; **sem lista de destinos internos** (o endereço é de uma organização; antes desta issue o webhook também nunca a consultou); 3xx não seguido; corpo da resposta derrubado sem ler. Mantém assinatura HMAC, cabeçalhos e retentativas. |
| Download de extensões | `buscarSeguro` | Origem de catálogo: `julgarLiteralIpv6`; exceção HTTP só no loopback de ensaio. |
| Ferramentas externas do agente — webhook (#94) e servidor MCP (#96) | `buscarSeguro` | Endereço de **organização**: sem a lista de destinos internos, `permitirHttp` só fora de produção, 3xx não seguido (a credencial/assinatura não vai atrás de um endereço que ninguém cadastrou), prazo total por tentativa e teto de bytes. O cliente MCP é próprio (`lib/ai/ferramentas-externas/mcp/cliente.ts`) **de propósito**: o cliente do SDK usa o `fetch` global, que resolve o nome de novo, segue redirecionamento e lê sem teto. |
| Banco externo | `lookupJulgado` no socket do `pg` + `validarHostDeBanco` | `politicaDoBanco`: a mesma régua **mais a LAN RFC 1918** (Postgres na rede do dono é caso real). |
| `media_url` | `buscarSeguro` (`lib/messaging/media/baixar-midia-externa.ts`) | O servidor baixa, sobe ao Storage e o gateway recebe a URL assinada nossa; ver "A `media_url` foi migrada (#110)". `permitirHttp` só fora de produção, **sem** lista de destinos internos, até 3 saltos (cada um julgado), teto de bytes por tipo. |
| SDK de modelos — provedor de IA personalizado (#108) | `fetchParaDestinoDaOrganizacao` → `fetchSeguro` → `buscarSeguroEmFluxo` | Endereço de **organização**: sem a lista de destinos internos, `permitirHttp` só fora de produção, 3xx vira recusa. Cada chamada resolve, julga e conecta no endereço julgado, e o corpo (SSE) chega em **fluxo**. A allowlist do motor de borda (`contain`) fica na frente, e o transporte seguro vai por baixo dela. Ver "O corpo em fluxo". |

## O corpo em fluxo (SDK de modelos)

Issue #108. A resposta de um modelo é SSE e dura o tempo da geração, então `buscarSeguro` (corpo
inteiro, prazo total de 10 s) não serve. `buscarSeguroEmFluxo` abre a conexão pelo **mesmo
caminho** (`abrirConexao`: URL, DNS uma vez, julgamento do conjunto, `lookup` fixado, redirecionamento
recomeçando do zero), devolve o `ReadableStream` assim que os cabeçalhos chegam e lê o socket só
quando o consumidor pede. Os limites trocam de natureza, e os três derrubam o socket:

| Limite | Padrão | O que mede |
|---|---|---|
| `timeoutMs` | 10 s (`fetchSeguro`: 300 s) | só os **cabeçalhos** (DNS, conexão, todos os saltos) |
| `timeoutEntreTrechosMs` | 60 s (`fetchSeguro`: 300 s) | silêncio do servidor entre dois trechos; sem leitor (contrapressão) ele não corre |
| `maxBytes` | 64 MiB | o corpo **inteiro**, contado trecho a trecho sobre o que sai **decodificado** |

`gzip`/`deflate`/`br` são decodificados aqui (o `fetch` fazia, o `http` cru não) e os cabeçalhos
`content-encoding`/`content-length` saem da resposta; o teto vale depois da descompressão, o que
cobre a bomba de descompressão. 204/205/304 e `HEAD` voltam com `corpo: null`.

`fetchSeguro(politica)` é o adaptador para quem só aceita um `fetch`: entra string, `URL` ou
`Request` (corpo em string, bytes ou `FormData` — `new Request(...)` normaliza, inclusive a fronteira
do multipart) e sai um `Response` padrão. Não segue redirecionamento, e o cancelamento do SDK sai
como o motivo do próprio `AbortSignal`. Os prazos padrão de 300 s são os do `fetch` global (undici):
uma completação **sem** streaming só devolve cabeçalhos quando termina, e a duração máxima de uma
chamada é o `AbortSignal` de quem chama.

`fetchParaDestinoDaOrganizacao(envolver?)` monta o transporte com a política da organização e o
entrega a `envolver`, que devolve o `fetch` final — é por onde o motor de borda põe a allowlist de
egress antes dele. Julgar a cada chamada continua pegando o nome que passou a resolver para dentro
depois do cadastro, e agora não há segunda resolução entre o julgamento e a conexão.

## O acesso a banco externo foi avaliado — e migrado

Cabia sem risco: `pg` aceita `stream` como função, e o socket que ele devolve conecta com
`lookup` próprio. O nome segue sendo o do SNI e o da verificação do certificado (o `pg` o usa
quando o host não é IP — lido em `pg/lib/connection.js`, `upgradeToSSL`, e não provado por teste de
conexão TLS real), então **TLS não deve mudar**; o pool continua memoizado por
`id + versão + host…` e **cada socket novo julga na hora de conectar** — o que também cobre a
conexão reaberta horas depois, que a checagem antiga nunca viu. A diferença que resta é **de
perfil, não de mecanismo**: o banco enxerga a LAN privada e o webhook não. Prova:
`lib/external-db/conexao-rede.test.ts` (nome que passa a resolver para metadata/loopback/CGNAT/
IPv4-mapped é recusado sem abrir conexão) e `lib/net/rede-segura/cliente.test.ts`
("lookupJulgado").

## A `media_url` foi migrada (#110) — decisão: baixar aqui

Quem baixava o arquivo era o gateway de mensageria, fora deste processo: o servidor só conseguia
julgar o endereço (texto + DNS) antes de entregá-lo, e o gateway resolvia o nome de novo — a janela
de rebinding. A WAHA não oferece como prender o IP do lado dela, então **julgar e registrar o risco
(opção 2) deixaria a janela aberta para sempre**. Decisão do dono do produto, 18/10/2026: **opção 1**.

O caminho do envio com `media_url` (`guardarMidiaDaUrl`, em `app/api/v1/messages/_handler.ts`):

1. A única `media_url` que **não** é baixada é a URL assinada do **próprio Storage** desta instalação
   (o PDF da proposta): assinar exige a service role, e o gateway já baixa exatamente esse endereço
   no caminho de `media_storage_path`. Qualquer outra passa pelos passos abaixo.
2. `baixarMidiaExterna` busca com `buscarSeguro`: HTTPS (o `http` só fora de produção), DNS resolvido
   uma vez e preso ao socket, **até 3 redirecionamentos**, cada um refeito pela política inteira
   (link encurtado e URL pré-assinada de CDN funcionam; redirect para endereço interno é recusado),
   prazo total de 30 s e **teto de bytes por tipo**, contado no que chega.
3. O mime que o servidor **declara** manda; o `media_mime` informado só desempata quando o servidor
   não diz nada útil (vazio ou `application/octet-stream`) — senão uma página de login declarada
   `text/html` seria enviada como PNG só porque o chamador escreveu `image/png`. Ele tem de ser da
   **classe** do `type` pedido: vídeo enviado como imagem, página HTML no lugar do arquivo, SVG
   (carrega script; a Meta só aceita JPEG/PNG) e corpo vazio são recusados. `sticker` é imagem
   **webp**. Um `type` que não carrega arquivo (`text`, `location`, `contact`, `template`) com
   `media_url` é recusado sem abrir conexão.
4. Os bytes sobem para `whatsapp-media` em `{org}/{conversa}/out-{uuid}.{ext}` e o `input` passa a
   apontar para esse caminho: o envio segue pelo ramo de `media_storage_path` (URL assinada de 10
   minutos ao gateway). A linha da mensagem guarda `media_storage_path`, o mime e o tamanho **do que
   foi guardado**; a `media_url` original fica como procedência. Tudo isso acontece **antes** de a
   mensagem existir: qualquer recusa é um `ApiError` e nada é gravado nem enviado.

| Situação | Resposta |
|---|---|
| Endereço recusado pela política (`unsafe_url:*`) | 422 `unsafe_media_url` (como antes) |
| Origem não responde, 3xx em excesso, prazo, não é 2xx | 422 `media_url_unreachable` (`details.motivo`) |
| Acima do teto do tipo | 413 `payload_too_large` |
| Tipo não suportado, ou diferente do `type` | 415 `unsupported_media_type` |
| Falha ao guardar no bucket | 500 `storage_upload_failed` |

**Tetos** (`TETO_DE_MIDIA_EXTERNA`) — os da Meta por tipo, válidos para qualquer canal: imagem 5 MB,
figurinha 500 KB (a animada; a estática é 100 KB), vídeo 16 MB, áudio 16 MB, documento 50 MB (a Meta aceita 100 MB; o bucket
`whatsapp-media` limita em 50). Um arquivo que o canal oficial recusaria depois de aceitar não deve
sair só porque o canal da vez é o QR.

**Custo, dito às claras:** o envio por `media_url` externa agora gasta banda do servidor e fica mais
lento (o download entra na requisição, com prazo de 30 s), e o arquivo ocupa a cota do Storage — a
mesma de `whatsapp-media` — até a poda de órfãos/retenção levá-lo, como qualquer upload de saída.

Prova: `lib/messaging/media/baixar-midia-externa.test.ts` (servidores reais em 127.0.0.1: IP interno,
nome com endereço público e privado, resolução única, redirect para metadata, laço de redirects,
resposta lenta, teto por tipo, mime errado) e os casos `4d` de
`tests/unit/messages-handler-desfechos.test.ts` (o gateway recebe a URL assinada nossa e nunca o
endereço do usuário).

## O que continua de fora (diferença registrada, não esquecida)

1. **Teste de conectividade do provedor personalizado** (`validateCustomKey`, a chamada
   `GET {base}/models` ao cadastrar a chave): julga com `motivoDaRecusaDeDestino` e depois chama o
   `fetch` global — a mesma janela de rebinding que a #108 fechou para o SDK, aberta aqui por
   esquecimento de escopo. Fechar é trocar a chamada por `fetchParaDestinoDaOrganizacao()`.
2. **Imagem de produto e logo no PDF da proposta**: quem busca é o `@react-pdf` (biblioteca), com
   só o guarda textual na frente. Fechar exige buscar os bytes com `buscarSeguro` e entregar o
   `Buffer` ao renderizador.
3. ~~**`media_url`**~~ — migrada na #110, ver "A `media_url` foi migrada" acima.

As funções novas da #86 (treino por site, webhook como ferramenta do agente, MCP externo) **devem**
sair por `buscarSeguro` — é a razão deste ticket vir antes.

## Como verificar

```bash
pnpm vitest run lib/net lib/external-db lib/extensions/download-rebinding.test.ts lib/automation lib/ai/ferramentas-externas lib/ai/resposta-em-audio tests/unit/provedor-personalizado.test.ts
```

Os casos hostis (IP privado, IPv6 especial, rebinding entre resolução e conexão, redirecionamento
para endereço interno, resposta gigante, resposta lenta) rodam contra **servidores HTTP reais** em
127.0.0.1 — o loopback é liberado nos testes pelo mesmo gancho `ipPermitido` da instalação, e tudo
o mais segue valendo.
