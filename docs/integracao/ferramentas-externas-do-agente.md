# Ferramentas externas do agente — guia de quem recebe

> **Para quem é:** quem mantém o sistema que RECEBE a chamada que o agente de IA
> faz durante uma conversa (estoque, planilha, ERP, Make, n8n) — seja uma **consulta** ou uma
> **ação que altera algo** (criar pedido, cadastrar cliente; seção 6) — ou quem opera um
> **servidor MCP** que o agente usa (seção 7).
> **O que responde:** o que chega em cada chamada, como conferir que veio do
> ZapSales, o que devolver e o que o agente faz com a resposta.
> **Fonte da verdade no código:** `lib/ai/ferramentas-externas/chamar.ts`. A
> assinatura é a **mesma** dos webhooks de saída das automações
> ([`webhooks-de-saida.md`](webhooks-de-saida.md), seção 3): o código que confere
> uma confere a outra.

---

## 1. O que chega

Um `POST` com `Content-Type: application/json` para o endereço que você cadastrou:

```json
{
  "event": "agent.tool_call",
  "occurred_at": "2026-10-17T15:00:00.000Z",
  "delivery_id": "0b0f7d8e-5d0e-4f62-9c37-2a5e8b0a6a11",
  "tool": "consultar_estoque",
  "arguments": { "produto": "camiseta azul" }
}
```

| Campo | O que é |
|---|---|
| `event` | Sempre `agent.tool_call`. |
| `delivery_id` | O id desta chamada — o mesmo valor do cabeçalho `X-Webhook-Delivery`. Se a primeira tentativa falhar, a nova tentativa leva o **mesmo** id: use-o para não processar duas vezes. |
| `tool` | O identificador da ferramenta (derivado do nome que você deu; não muda se você renomear). |
| `arguments` | Os dados que o agente preencheu, exatamente nos campos e tipos que você declarou. Nada mais: **não vão** organização, contato, telefone nem conversa. Se precisar de algo assim, peça como campo. |

Cabeçalhos: `X-Webhook-Delivery`, `X-Webhook-Attempt` (`1` ou `2`), `X-Webhook-Timestamp` e `X-Webhook-Signature` (`t=<timestamp>,v1=<hex>`).

## 2. Conferir a assinatura

Igual aos webhooks de saída: `v1 = HMAC-SHA256(chave, "<t>.<delivery>.<corpo cru>")`, em hex. A **chave** é a que apareceu uma única vez quando você cadastrou a ferramenta (ou gerou uma nova). Recuse a chamada se o `v1` não conferir ou se o `t` for velho demais para a sua janela.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function confere(chave, cabecalhos, corpoCru) {
  const [t, v1] = String(cabecalhos["x-webhook-signature"]).split(",").map((p) => p.split("=")[1]);
  const esperado = createHmac("sha256", chave)
    .update(`${t}.${cabecalhos["x-webhook-delivery"]}.${corpoCru}`)
    .digest("hex");
  return v1?.length === esperado.length && timingSafeEqual(Buffer.from(v1), Buffer.from(esperado));
}
```

## 3. O que devolver

Responda **2xx em até 8 segundos**, com o corpo que o agente deve usar — JSON ou texto. O que passar de **64 KiB** faz a chamada falhar, e o agente só recebe os primeiros **4.000 caracteres** da resposta. Seja objetivo: devolva só o necessário para responder ao cliente.

| Sua resposta | O que acontece |
|---|---|
| 2xx | O corpo chega ao agente como informação. |
| 5xx, 408, 429, ou sem resposta | O ZapSales tenta **mais uma vez** (só consultas são repetidas) e, persistindo, avisa o agente e o dono. |
| 4xx (outros) | Não repete: o mesmo pedido daria a mesma resposta. O dono vê o aviso. |
| 3xx (redirecionamento) | **Não é seguido.** Cadastre o endereço final. |

## 4. O que o agente faz com a resposta

A resposta chega ao agente como **dado, nunca como instrução**: ele a lê como informação para responder ao cliente, e qualquer ordem que apareça nela é ignorada. Mesmo assim, **não coloque nela** nomes internos, instruções ou segredos — o texto que o agente escreve ao cliente ainda passa pelas conferências antes do envio, mas o melhor é a resposta nem conter o que não deve ser dito.

Se a consulta falhar, o agente é instruído a **não afirmar** nada que dependia dela, e o dono recebe um aviso na Central.

## 5. Endereço

Precisa ser `https`, sem usuário e senha. Endereços da **rede interna, privada ou local** (`localhost`, `10.x`, `192.168.x`, `169.254.x`, IPv6 especial) são **recusados por segurança**, no cadastro e a cada chamada — o nome é resolvido uma vez e a conexão usa só o endereço julgado, então um nome que passou a apontar para dentro também é barrado.

---

## 6. Ação que ALTERA algo: aprovação, id do pedido e o que nunca se repete

A ferramenta cadastrada como **«Altera dados»** chega ao seu sistema com o **mesmo** `POST` e a **mesma**
assinatura das seções 1 e 2 — o que muda é **quando** e **quantas vezes**:

| | Consulta | Ação que altera |
|---|---|---|
| Quando sai | assim que o agente decide usar | por padrão, **só depois que uma pessoa aprova** na Central de avisos (a chave «Pedir aprovação» nasce ligada; quem cadastra pode desligá-la). Com o agente em modo **Assistido**, toda ferramenta espera, qualquer que seja a chave |
| Tentativas | até 2 (5xx, 408, 429, rede, prazo) | **sempre 1.** Se a resposta se perder, o ZapSales **não tenta de novo** |
| `delivery_id` | um por chamada (o mesmo nas 2 tentativas) | **o id do pedido** — o mesmo em qualquer reenvio manual. Use-o para **deduplicar**: se já processou esse id, responda 2xx sem fazer de novo |

### O que fazer do seu lado

- **Deduplique por `delivery_id`.** É a garantia final contra efeito em dobro: o ZapSales executa cada pedido uma
  única vez, mas só você sabe se a primeira chamada chegou a ser processada.
- **Responda 2xx só quando a alteração foi feita.** 4xx = «recusei, nada foi alterado» (o pedido fecha como falha
  **certa**); qualquer outra coisa — prazo estourado, 5xx, queda — deixa o desfecho **incerto**.
- **Seja rápido:** o prazo é de 8 segundos. Se a alteração demora, aceite o pedido, responda 2xx e processe depois.

### O que acontece em cada desfecho

| Sua resposta | Pedido | O que o agente lê | O que o dono vê |
|---|---|---|---|
| 2xx | **Executada** | «a ação foi executada» — pode confirmar ao cliente | o cartão na Central fica «Executada» |
| 4xx | **Falhou (certo)** | «a ação NÃO foi feita» | aviso de falha na Central |
| 5xx, sem resposta, prazo, rede | **Falhou (incerto)** | «não foi possível confirmar; não afirme que foi feita nem que não foi; não tente de novo» | aviso: «a ação pode ter sido feita lá e a resposta se perdeu; **não foi repetida** — confira antes de refazer» |

Uma repetição do agente com **os mesmos dados na mesma conversa** não abre outro pedido nem chama de novo: ele
recebe o estado do pedido que já existe (por 24 h para um pedido executado ou de falha incerta).

### Aprovação, recusa e prazo

O pedido aparece na Central com **o que o agente quer executar e os dados que preencheu** (um resumo: campos com
cara de segredo — `senha`, `token`, `chave`… — aparecem como «•••»). **Aprovar** executa uma vez; **recusar** cancela
sem enviar nada; sem decisão em **24 horas** (configurável por ferramenta, de 1 a 168) o pedido **expira** e o
agente passa a saber que a ação não foi feita. Aprovar e recusar é de **gerente para cima**.


---

## 7. Servidores MCP de terceiros (issue #96)

> **Para quem é:** quem opera um **servidor MCP** que o agente vai usar (ou quem decide conectar um). Aqui o
> sentido é o contrário das seções 1–6: **o ZapSales é o cliente** e o seu servidor é quem recebe. Nada disto
> existe numa instalação que não ligou o recurso — ele vem **desligado** e a instalação funciona sem ele.

### O que o ZapSales fala

MCP por HTTP, no formato **«Streamable HTTP»** (versões `2025-06-18`, `2025-03-26` e `2024-11-05`). Para listar ou
chamar uma ferramenta ele faz, na ordem: `initialize` → `notifications/initialized` → `tools/list` **ou**
`tools/call`, e fecha a sessão se o servidor abriu uma (`Mcp-Session-Id`). A resposta de cada `POST` pode vir como
JSON ou como fluxo SSE com a resposta dentro; o fluxo separado de notificações do servidor **não** é aberto. O
transporte antigo «HTTP + SSE» (um endpoint `/sse` separado) **não** é suportado.

### Credencial

Vai a cada pedido, no cabeçalho que o administrador escolheu: **`Authorization: Bearer <credencial>`** (o padrão)
ou **outro cabeçalho** com o valor cru (`X-API-Key: <credencial>`). Ela é guardada cifrada, **nunca é mostrada
de novo** e não vai a log, a auditoria nem a resposta de rota. Cabeçalhos que o próprio protocolo usa
(`Host`, `Content-Type`, `Mcp-Session-Id`…) não podem levar a credencial.

### O que vai na chamada

Só o nome da ferramenta e os **campos que o agente preencheu**. Nenhum dado da organização, do contato ou da
conversa viaja. Uma ação aprovada leva ainda `_meta: { "agent/delivery_id": "<id do pedido>" }`: é o identificador
estável do pedido — **deduplique por ele**, e uma ação nunca é feita em dobro nem se alguém tentar de novo.

### O que o ZapSales faz com a resposta

- Só **texto** chega ao agente. Imagem, áudio e recurso binário são substituídos por «[conteúdo do tipo … omitido]».
  Sem texto, `structuredContent` é usado como JSON.
- **Limite:** 64 KB lidos por resposta (acima disso a chamada falha) e 4.000 caracteres entregues ao agente (o
  resto é cortado, com aviso).
- É sempre **informação, nunca ordem**: chega ao agente dentro de um campo `dado`, com o aviso à frente, e a
  mensagem que o agente escrever passa pela conferência de vocabulário interno antes de sair ao cliente.
- `isError: true` numa chamada é falha **incerta** (o que a ferramenta já fez antes de falhar, ninguém sabe): o
  texto do erro **não** vai ao agente — só o administrador o vê, ao testar na tela.

### Tentativas e desfecho incerto

Uma **consulta** repete **uma vez** em falha de rede ou 5xx. Uma ação que **altera** algo tem **uma tentativa só**: se
a resposta se perde (prazo de 15 s, queda, 5xx), o pedido fecha como «falha incerta» e **não é repetido**. Falhas
**antes** de a chamada sair (credencial recusada, endereço que não é MCP) são sempre «certas» — nada foi executado.

### O que a tela de quem cadastra mostra

O administrador vê as ferramentas que o servidor oferece e **escolhe** quais ficam disponíveis. O padrão de cada
uma é **«Altera dados»**, que pede aprovação; `annotations.readOnlyHint` é só uma **dica** exibida ao lado. A
descrição e o esquema que o administrador viu são os que valem: se o servidor mudar a ferramenta depois, a tela
avisa («Mudou no servidor») e o agente segue com a definição de antes até alguém salvar de novo.

**Campos suportados:** texto, número, inteiro e sim/não (até 10 por ferramenta); um `enum` de textos vira texto
com as opções na descrição. Campo **opcional** que seja lista ou objeto é ignorado (a tela diz quais); campo
**obrigatório** que seja lista ou objeto torna a ferramenta **não suportada** — ela aparece desabilitada, com o motivo.

### Endereço

Mesma regra da seção 5: `https`, sem usuário e senha, **nunca** da rede interna, privada ou local — no cadastro e
a cada chamada, com o nome resolvido uma vez e a conexão presa ao endereço julgado. Redirecionamento **não** é
seguido (a credencial não vai atrás de um endereço que ninguém cadastrou).
