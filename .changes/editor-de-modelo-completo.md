---
impacto: capacidade_nova
secao: adicionado
titulo: Criar modelo de mensagem em página própria, com idiomas, cabeçalho de texto, variáveis com nome e botão de ligar
---

Em **Conexões › API Oficial › Templates da Meta**, o botão **Novo modelo** agora abre a página
**Criar modelo**, desenhada como o cadastro de modelos do ManyChat: a esquerda com o que vale para o
modelo inteiro e a direita com a mensagem.

- **Categoria:** Marketing ou Utilidade, com um aviso do que a Meta espera de uma mensagem de
  Utilidade (a Meta passa para Marketing o texto que parecer promocional, e você é avisado na Central).
- **Idiomas:** "Novo idioma" cria outra versão do mesmo modelo a partir de uma cópia da que está
  aberta, para você traduzir. Cada idioma vai à Meta como um modelo com o mesmo nome. Se um idioma for
  recusado, os outros seguem e a tela mostra qual precisa de ajuste. Agora há 11 idiomas (antes 3).
- **Cabeçalho:** texto (com uma variável, se quiser), imagem, vídeo ou arquivo — escolhidos como no
  ManyChat. Clicar de novo no escolhido tira o cabeçalho.
- **Variáveis dentro do texto:** a mensagem é o esqueleto, e cada variável (`{{nome}}`, `{{produto}}`…)
  aparece destacada no próprio texto. Digite o nome ou toque num atalho (nome, primeiro nome, empresa,
  produto, valor, data); ela entra onde está o cursor. O valor de cada uma entra no momento do envio —
  na campanha você liga cada variável a um dado do contato. As variáveis agora nascem **com nome**; o
  formato numerado (`{{1}}`) continua disponível.
- **Botão Ligar:** o cliente toca e o WhatsApp liga para o número que você informar (com o código do
  país).
- A visualização "Como o cliente vê" mostra o título de texto e o botão de ligar.

Nenhum modelo já cadastrado muda. O corpo enviado à Meta e a leitura do modelo no envio da campanha
já entendiam título de texto e botão de ligar; esta versão passa a criá-los pela tela.
