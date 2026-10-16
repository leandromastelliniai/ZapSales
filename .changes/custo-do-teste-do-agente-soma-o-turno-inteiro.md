---
impacto: nada_mudou
secao: corrigido
titulo: O custo mostrado no teste do agente soma o turno inteiro
---

Na aba **Teste** do agente, os tokens e o custo de cada resposta mostravam só a chamada principal ao modelo,
cerca de 38% do que o teste de fato gastou (medido numa instalação real: o resto era o checkpoint, o
classificador de etapa e as conferências por modelo). Agora a tela soma todas as chamadas do turno — o mesmo
valor que entra no orçamento de IA.
