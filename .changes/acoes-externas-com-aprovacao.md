---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pode executar ações em outro sistema (criar pedido, cadastrar cliente), com a sua aprovação
---

Além de **consultar** outro sistema, o agente agora pode **executar uma ação** nele — criar um pedido, cadastrar um cliente — **sempre com a proteção de que nada altera o mundo sem a sua aprovação por padrão**. Nada muda para quem não cadastrar uma ferramenta que altera dados: os agentes e as consultas existentes seguem exatamente como estavam.

Em **Agente de IA › Ferramentas externas**, a ferramenta agora pode ser **«Altera dados»**. Ela nasce com **«Pedir aprovação»** ligado: quando o agente decide usá-la, **nada é enviado** e aparece um aviso na **Central de avisos** com o que ele quer executar e os dados que preencheu. **Aprovar executa a ação uma única vez** (mesmo com clique duplo ou repetição); **recusar a cancela**; se ninguém decidir, o pedido **expira em 24 horas** (a validade é configurável, de 1 a 168 horas). Quem cadastra pode desligar a chave numa ferramenta que só consulta — e, de propósito, também numa que altera, e a tela avisa o risco. Com o agente em modo **Assistido**, **toda** ferramenta externa espera aprovação, qualquer que seja a chave. Aprovar e recusar é de **gerente para cima**.

O agente é informado se o pedido está **pendente, foi executado, foi recusado ou expirou**, e **nunca afirma ao cliente que algo foi feito antes da execução**. Uma ação que altera algo **não é repetida automaticamente** quando a resposta do outro sistema se perde (prazo estourado, queda, erro 5xx): o pedido fica como «falha incerta», o dono recebe um aviso dizendo que a ação pode ter sido feita lá e que **não foi repetida**, e o agente é orientado a não afirmar nem negar. O sistema que recebe pode conferir o `delivery_id` — é o identificador do pedido — para nunca processar duas vezes.

No teste do agente a ação **não executa** e aparece como **«seria feita»**, dizendo se pediria aprovação. O botão **Testar de verdade** de uma ferramenta que altera avisa que a alteração é real. Criação, decisão, expiração e execução ficam na auditoria com quem decidiu, qual ferramenta e um resumo dos dados — **sem a chave de assinatura e sem segredos**.
