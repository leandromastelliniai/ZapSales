---
impacto: capacidade_nova
secao: adicionado
titulo: Campanhas que se protegem sozinhas, aviso de risco no QR code e o modo "dois números"
---

As campanhas passam a respeitar sozinhas os limites da Meta e a parar quando algo dá errado, e
você ganha dois jeitos novos de decidir por onde a conversa acontece.

- **Limite diário do portfólio.** A Meta limita quantos contatos o seu portfólio de negócio pode
  alcançar com modelos em 24 horas, somando todos os números dele. O envio passa a respeitar esse
  limite: duas campanhas em números do mesmo portfólio, somadas, nunca passam dele — rodar números
  não multiplica o limite. Quando ele é atingido, a campanha espera e volta a enviar sozinha. A
  página da campanha mostra quanto já foi usado ("1.234 de 2.000 contatos nas últimas 24 h"). O
  portfólio de cada número é lido da Meta na conexão; números conectados antes desta versão contam
  junto com os outros números oficiais da organização até serem conectados de novo.
- **Pausa automática, com o motivo na tela.** A campanha pausa sozinha quando a qualidade do
  número fica vermelha ou quando o modelo é rejeitado, pausado, desativado ou muda de categoria
  na Meta. A página da campanha diz o que aconteceu e o que fazer. Retomar com o número ainda
  vermelho ou com o modelo ainda fora do ar é recusado; a recategorização você pode retomar depois
  de conferir o novo custo.
- **Aviso de risco no número de QR code.** Campanha por um número conectado por QR code só inicia ou
  agenda depois que alguém lê e aceita o aviso de risco de banimento. O aceite fica registrado na
  campanha (quem e quando) e na auditoria. Campanhas de QR code que estavam pausadas pedem o aceite
  ao retomar.
- **Modo "dois números".** Numa campanha pela API Oficial, escolha em "Quem responde fala com qual
  número?" um número de QR code: o modelo sai pelo número oficial com um botão que abre conversa com
  o número escolhido, e a conversa segue nele. O modelo precisa de um botão de link para `wa.me` —
  com o endereço fixo para esse número, ou `https://wa.me/{{1}}`, que o sistema preenche. Quem clica
  e escreve continua no mesmo contato da campanha, e a resposta conta para ela.
