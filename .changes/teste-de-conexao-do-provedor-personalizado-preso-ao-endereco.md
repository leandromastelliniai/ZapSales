---
impacto: nada_mudou
secao: alterado
titulo: O teste de conexão do provedor de IA personalizado também só se conecta ao endereço verificado
---

Ao cadastrar a chave de um **provedor de IA personalizado**, o CRM faz um teste de conexão antes de salvar. Esse teste já recusava endereços que apontam para dentro da rede do servidor, mas consultava o nome de novo na hora de conectar — a mesma brecha que já havia sido fechada para as respostas do modelo. Como a chave vai junto nesse teste, ela poderia ser levada ao lugar errado.

Agora o teste conecta **somente no endereço que acabou de ser verificado**. Nada precisa ser feito: a atualização não pede configuração, e as credenciais já cadastradas continuam valendo. As mensagens na tela são as mesmas de antes (endereço recusado, redirecionamento, chave recusada, provedor fora do ar).
