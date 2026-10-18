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
| `media_url` (o gateway é quem baixa) | `assertUrlDeMidiaSegura` → `validarUrl` + `resolverEJulgar` | Só **julga**; ver "O que continua de fora". |
| Provedor de IA personalizado | `motivoDaRecusaDeDestino` (+ lista da instalação) | Só **julga**; ver abaixo. |

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

## O que continua de fora (diferença registrada, não esquecida)

1. **SDK de modelos com endereço da organização** (`fetchParaDestinoDaOrganizacao`, provedor
   personalizado): o **julgamento** é o desta política, a cada chamada e sem seguir redirect, mas a
   **conexão** é o `fetch` do SDK, que resolve o nome de novo. Fechar exige trocar o transporte por
   `buscarSeguro` com corpo **em fluxo** (a resposta de um modelo é SSE; `buscarSeguro` entrega o
   corpo inteiro) e aceitar `Request`/`FormData` como entrada. É a próxima peça natural deste
   módulo, não uma decisão de deixar aberto.
2. **Imagem de produto e logo no PDF da proposta**: quem busca é o `@react-pdf` (biblioteca), com
   só o guarda textual na frente. Fechar exige buscar os bytes com `buscarSeguro` e entregar o
   `Buffer` ao renderizador.
3. **`media_url`**: quem baixa é o gateway de mensageria, fora deste processo. Aqui só dá para
   julgar antes de entregar o endereço.

As funções novas da #86 (treino por site, webhook como ferramenta do agente, MCP externo) **devem**
sair por `buscarSeguro` — é a razão deste ticket vir antes.

## Como verificar

```bash
pnpm vitest run lib/net lib/external-db lib/extensions/download-rebinding.test.ts lib/automation lib/ai/ferramentas-externas
```

Os casos hostis (IP privado, IPv6 especial, rebinding entre resolução e conexão, redirecionamento
para endereço interno, resposta gigante, resposta lenta) rodam contra **servidores HTTP reais** em
127.0.0.1 — o loopback é liberado nos testes pelo mesmo gancho `ipPermitido` da instalação, e tudo
o mais segue valendo.
