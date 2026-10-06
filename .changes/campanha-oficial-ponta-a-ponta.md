---
impacto: capacidade_nova
secao: adicionado
titulo: Campanhas pela API Oficial com modelo aprovado, variáveis por contato e acompanhamento ao vivo
---

Ao criar uma campanha em **Campanhas › Nova campanha** e escolher um **número da API Oficial**, a
mensagem passa a ser um **modelo aprovado pela Meta** — pela tela e pela API, que recusa campanha
de número oficial sem modelo. Você escolhe o modelo e diz de onde vem
cada variável dele: primeiro nome, nome completo, telefone ou e-mail do contato, um campo
personalizado ou um texto fixo. O texto aparece como vai chegar, e quem não tiver o dado fica de
fora, com o motivo na lista.

- **Envio em lotes, sem o ritmo anti-banimento.** A campanha oficial sai em lotes paralelos, poucos
  segundos depois de iniciada. Agendamento, janela de horário e tetos por dia e por hora continuam
  valendo; sem janela própria, vale a do número (7h às 22h por padrão). O modo por QR code (WAHA)
  não muda. Se o servidor reiniciar no meio de um lote, ninguém fica preso nem recebe em dobro.
- **As mesmas proteções de antes.** Descadastrados, bloqueados, quem recusou marketing e quem está
  na lista de exclusão ficam de fora, e a base legal continua obrigatória. Pausar, retomar,
  cancelar, clonar e o envio de teste funcionam no modo oficial.
- **Entregue e lido ao vivo.** O status que a Meta manda pelo webhook atualiza cada destinatário e o
  painel da campanha, que segue se atualizando sozinho por duas horas depois que a campanha termina.
  A campanha só aparece como concluída 15 minutos depois do último envio, o tempo de a Meta avisar
  uma falha que ainda dá para tentar de novo.
- **Erros da Meta tratados.** Erro temporário volta para a fila com espera. Limite de marketing por
  usuário (131049) só é tentado de novo depois de 24 horas, inclusive por outra campanha. Quem
  recusou marketing no WhatsApp (131050) fica marcado no contato, com registro na auditoria, e sai
  das próximas campanhas. Erro
  definitivo aparece na lista com o motivo em português.

Ainda não chegam nesta versão: o limite diário do portfólio, a pausa automática por qualidade ou
por modelo pausado, o custo da campanha e o envio de oferta por tempo limitado. Modelo com
cabeçalho de mídia recebe o link público do arquivo como texto fixo.
