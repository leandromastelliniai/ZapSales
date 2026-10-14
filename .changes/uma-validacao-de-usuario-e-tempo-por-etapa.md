---
impacto: capacidade_nova
secao: adicionado
titulo: Respostas de quem está logado trazem o tempo por etapa e validam o usuário uma só vez
---

Toda resposta de uma requisição logada passa a trazer o cabeçalho padrão `Server-Timing`, com o
tempo no proxy (`proxy`) e o tempo da validação do usuário no serviço de autenticação (`auth`). Dá
para lê-lo na aba Rede do navegador e saber onde um clique demorou, sem instalar ferramenta.

O servidor também deixa de perguntar ao serviço de autenticação quem é o usuário várias vezes na
mesma requisição: o proxy valida uma vez e o restante da requisição reaproveita o resultado. A regra
de segurança continua a mesma — o token é sempre validado no serviço de autenticação, nunca
confiado a partir do cookie local —, e a chamada por token de servidor (`zps_`) não muda.

O tempo de renderização do layout ainda não aparece no cabeçalho (uma tela não consegue acrescentar
cabeçalho à resposta depois que ela começou a ser enviada); fica para uma próxima entrega.
