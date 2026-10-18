# Ferramentas externas do agente — guia de quem recebe

> **Para quem é:** quem mantém o sistema que RECEBE a chamada que o agente de IA
> faz durante uma conversa (estoque, planilha, ERP, Make, n8n) — seja uma **consulta** ou uma
> **ação que altera algo** (criar pedido, cadastrar cliente; seção 6).
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
