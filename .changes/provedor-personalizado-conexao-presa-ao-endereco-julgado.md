---
impacto: nada_mudou
secao: alterado
titulo: O provedor de IA personalizado só se conecta ao endereço que foi verificado
---

Quando uma organização usa um **provedor de IA personalizado** (um endereço próprio, compatível com a API da OpenAI), o servidor já conferia, a cada chamada, que esse endereço não aponta para dentro da sua rede. Sobrava uma brecha pequena: entre a conferência e a conexão o nome era consultado de novo, e um nome mal-intencionado podia responder "público" na primeira vez e "interno" na segunda.

Agora a conexão é feita **somente no endereço que acabou de ser verificado**, sem uma segunda consulta. As respostas do modelo continuam chegando palavra por palavra, como antes. O mesmo vale para a voz do agente quando ela usa um serviço compatível com a OpenAI.

Nada precisa ser feito: a atualização não pede nenhuma configuração, e provedores e vozes já cadastrados continuam funcionando. A única diferença perceptível é para um endereço que aponta para dentro da rede do servidor, que já era recusado e segue sendo.
