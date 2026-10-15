---
impacto: capacidade_nova
secao: adicionado
titulo: Disparo em massa no menu lateral, com upload de lista em CSV dentro da campanha
---

A tela de campanhas agora se chama **Disparo em massa** e ganhou um lugar no **menu lateral** (para
gestores e administradores), em vez de ficar escondida atrás de "Ver tudo em CRM". O endereço
continua o mesmo. Para o menu continuar cabendo em telas de 900 px de altura, **Atividades** saiu do
menu lateral e segue em "Ver tudo em Análise" e na busca (⌘K).

Em **Nova campanha**, o bloco **Público** tem agora **Subir uma lista de contatos (CSV)**:

- Baixe a **planilha modelo**, preencha **nome** e **telefone** (email, cpf, nascimento e etiquetas
  são opcionais) e envie. A tela mostra os formatos de telefone aceitos, com exemplo:
  `+5511999998888` (recomendado), `(11) 99999-8888` (sem o código do país, o sistema assume Brasil),
  `5511999998888` e, para outro país, sempre com `+` e o código do país.
- Quem está na planilha entra em **Contatos** (quem já existia é reaproveitado, sem duplicar) e passa a
  ser o público da campanha — sem precisar criar etiqueta. Linhas com problema aparecem com o número da
  linha e o motivo, e ficam de fora; as demais seguem. Até 500 linhas por arquivo.
- Os vetos de sempre continuam valendo para a lista subida: quem pediu para sair, quem não tem
  telefone e quem já está em outra campanha ficam de fora, com o motivo em **Ver quantas pessoas**.
- Se a lista for o único critério, a campanha fala **só** com as pessoas dela. (Antes de este ajuste, um
  público montado só por uma lista de contatos escolhidos puxaria os primeiros contatos da organização
  inteira; a consulta agora não roda sem recorte.)

Ao editar um rascunho, o que a tela de edição não mostra (funil e etapa do público) deixou de ser
apagado ao salvar.
