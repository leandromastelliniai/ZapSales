---
impacto: capacidade_nova
secao: adicionado
titulo: Quem responde a uma campanha cai no funil certo e é atendido por quem a campanha mandou
---

Em **Campanhas › Nova campanha**, o cartão **Quem responder** passa a decidir o que acontece com
quem responde, sem trabalho manual na Inbox:

- **O card vai para a etapa da campanha.** A resposta cria o negócio no funil e na etapa escolhidos.
  Quem já é cliente com negócio aberto é **movido** para lá, não duplicado (se o negócio estava em
  outro funil, ele é levado para o funil da campanha). A linha do tempo do negócio registra
  "Respondeu à campanha", e o cabeçalho do negócio mostra a campanha de origem.
- **Quem assume a resposta.** *O agente de IA* (como antes), *a fila de atendentes* (a IA fica
  calada nessa conversa e ela entra no rodízio) ou *a IA, e depois um atendente* (o agente atende e,
  quando a regra de passagem dispara, a conversa entra no rodízio). O agente da campanha atende
  mesmo num número que não tem agente publicado.
- **O que cada botão faz.** Num modelo com botões de resposta rápida, cada botão pode mover o card
  para uma etapa, entregar a conversa ao agente ou a um atendente, marcar o negócio como perdido ou
  parar de mandar mensagens (opt-out). O toque age na hora, sem passar pela IA.
- **O agente sabe a que a pessoa está respondendo.** Ele recebe o nome da campanha, o modelo, o
  texto que a pessoa leu, as variáveis e um campo novo, **O que a campanha oferece**, escrito por
  você.
- **A conversa mostra a campanha.** Na Inbox, o cabeçalho diz "Respondendo à campanha …" e o modelo
  de origem. O toque num botão chega como mensagem com o rótulo do botão.
- **Respondeu conta.** A resposta por botão também entra na métrica de quem respondeu.

**O que muda para quem já usa:** a IA não envia mais modelo aprovado **por conta própria** fora da
janela de 24 horas do WhatsApp. Fora da janela, só sai o modelo que uma pessoa configurou no passo do
follow-up ("se a IA não conseguir escrever, mandar este modelo"); o passo sem modelo configurado é
pulado, com o motivo no histórico, em vez de pagar a IA para não mandar nada. Campanhas já criadas
continuam com "o agente de IA" assumindo, como antes.
