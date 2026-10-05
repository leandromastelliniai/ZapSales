---
impacto: capacidade_nova
secao: adicionado
titulo: Assistente de conexão do número oficial, saúde do número e Conectar com Facebook
---

Conectar um número da API Oficial do WhatsApp agora é guiado. Em **Conexões › API Oficial**,
você cola o token do usuário do sistema e a chave secreta do seu app na Meta, e o assistente
testa os dois na hora. Se algo estiver errado, ele diz o quê: token expirado, permissão
faltando, app ainda em modo de desenvolvimento ou chave secreta de outro app. Com a
credencial certa, ele mostra os números da sua conta para você escolher, sem digitar
nenhum ID. Ao lado aparece o que falta na Meta: app em Live, forma de pagamento e empresa
verificada.

No último passo você informa o PIN de duas etapas e diz para que serve o número
(atendimento, campanha ou ambos). O assistente registra o número na Meta e configura o
webhook sozinho. O token e a chave secreta ficam guardados cifrados e não voltam a
aparecer na tela. O uso do número pode ser trocado depois, na mesma tela.

O número oficial ganhou um painel de saúde, com a qualidade (verde, amarela ou vermelha)
e o limite diário de mensagens do portfólio. Os dois se atualizam sozinhos quando a Meta
avisa. Quando a qualidade cai ou o limite diminui, um aviso aparece na Central.

Quem administra a instalação pode ligar o **Conectar com Facebook** (Embedded Signup) em
Admin › API Oficial (Meta), informando o ID do app e o ID da configuração de login. Ele
vem desligado e só deve ser ligado depois que o app for aprovado como Tech Provider pela
Meta. O formulário antigo, com os IDs digitados à mão, continua disponível em "Prefiro
informar os IDs manualmente".
