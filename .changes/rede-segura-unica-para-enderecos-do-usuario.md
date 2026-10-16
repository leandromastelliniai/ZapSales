---
impacto: nada_mudou
secao: corrigido
titulo: Toda saída para um endereço informado por usuário passa pela mesma proteção de rede
---

Webhook de saída, download de extensões e banco externo agora seguem uma única regra de rede:
só HTTPS, o nome é resolvido uma vez e a conexão usa exatamente o endereço verificado (fecha a
brecha em que um domínio trocava de endereço entre a checagem e a conexão), endereços internos,
locais e IPv6 especiais são recusados, e há limite de tempo e de tamanho de resposta.

Para o webhook de saída nada muda no que o receptor vê (mesmos cabeçalhos, mesma assinatura, mesmas
tentativas de reenvio). Dois ajustes: um destino recusado pela proteção falha na hora, sem gastar as
tentativas de reenvio; e um receptor que responde sucesso com um corpo enorme não derruba mais a entrega.
