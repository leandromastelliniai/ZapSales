---
impacto: capacidade_nova
secao: alterado
titulo: Canal oficial na Graph API v26, com motivo legível para cada recusa da Meta e contatos sem telefone
---

O canal oficial do WhatsApp passa a falar a versão 26.0 da Graph API da Meta. Na tela de
conexão há um campo novo e opcional, **ID da conta de mensagens**: ele só é necessário quando
o seu token alcança mais de uma conta de mensagens no mesmo número. Quando preenchido, ele
acompanha toda mensagem enviada, para a Meta saber qual conta cobrar.

Quando a Meta recusa uma mensagem, a conversa mostra agora um motivo em português no lugar
do texto técnico em inglês. Exemplos: "o contato pediu para não receber mensagens de
marketing", "a conta da Meta está com problema de pagamento" ou "a Meta segurou esta mensagem
de marketing, tente de novo depois de 24 horas". O código da Meta continua gravado junto, para
diagnóstico.

Quem ativou nome de usuário no WhatsApp e escondeu o número também é atendido. A mensagem
dessa pessoa chega identificada só pelo identificador de usuário da Meta (BSUID), cria o
contato normalmente e pode ser respondida. Quando ela aparece depois com o telefone, os dois
ficam no mesmo contato. Se o telefone já estiver em outro contato, nada é fundido sozinho: o
par aparece na tela de duplicados para você decidir.

A versão 26.0 é o padrão do código. Uma instalação que fixou `META_GRAPH_VERSION` no `.env`
continua na versão fixada até esse valor ser trocado ou apagado. A integração de anúncios
segue na versão anterior até os campos dela serem conferidos na nova.
