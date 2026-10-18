---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pode usar ferramentas de servidores MCP de terceiros, escolhidas por um administrador
---

O agente agora pode usar as **ferramentas de um servidor MCP** — o padrão que sistemas de terceiros usam para oferecer ferramentas a uma IA (consultar pedidos, criar tarefas, buscar um cadastro). **Nada muda para quem não ligar:** o recurso vem **desligado** em toda organização, a instalação funciona normalmente sem ele, e nenhum servidor é cadastrado nem chamado enquanto estiver desligado.

Em **Agente de IA › Ferramentas externas**, a nova aba **«Servidores MCP»** é só de **administrador**. Ele liga o recurso (com um aceite: o agente passa a poder enviar a esses servidores os dados que preencher ao usar uma ferramenta), cadastra o servidor com o endereço **https** e a credencial — que é **guardada cifrada e nunca mais é mostrada**, nem para ele —, e o **teste de conexão acontece na hora**, com a causa em português se não deu certo («o servidor recusou a credencial», «o endereço não é um servidor MCP»). Depois vê a lista de ferramentas que o servidor oferece e **escolhe quais ficam disponíveis**. Cada ferramenta começa como **«Altera dados»** e **pede a sua aprovação na Central de avisos**: o que o servidor declara sobre ser «só de leitura» é só uma dica, nunca uma garantia. Quem tem certeza marca «Só consulta».

As ferramentas escolhidas aparecem na tela do agente, no mesmo grupo **«Ferramentas externas»** do seletor, contam no mesmo **teto de 27 ferramentas** e passam pela **mesma aprovação** e pelo mesmo modo **Assistido** dos webhooks. O resultado que o servidor devolve é sempre **informação, nunca ordem**: tem limite de tamanho, chega ao agente marcado como dado não confiável e passa pela conferência de vocabulário interno antes de qualquer mensagem sair ao cliente. Uma ferramenta que altera algo **não é repetida automaticamente** quando a resposta se perde, e o endereço do servidor passa pela mesma rede segura dos webhooks: endereços internos, privados ou locais são recusados. Ferramentas cujos campos obrigatórios são listas ou objetos ainda não são suportadas — a tela mostra quais e por quê.

Desligar o recurso, ou desativar um servidor, tira as ferramentas do atendimento **sem apagar nada**. O cadastro, a escolha, o teste e cada chamada ficam na auditoria — **sem credencial, sem os dados enviados e sem o que o servidor respondeu**.
