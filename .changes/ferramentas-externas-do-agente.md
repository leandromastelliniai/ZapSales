---
impacto: capacidade_nova
secao: adicionado
titulo: O agente pode consultar outro sistema durante a conversa (estoque, planilha, ERP, Make, n8n)
---

Agora o agente pode **chamar um webhook no meio da conversa para consultar algo em outro sistema** — por exemplo, ver se um produto está em estoque antes de responder. Nada muda para quem não cadastrar nenhuma ferramenta: os agentes existentes seguem exatamente como estavam.

Para usar, abra **Agente de IA › Ferramentas externas** (pelo menu "Ver tudo em IA" ou pela busca ⌘K), cadastre o **nome**, **quando o agente deve usar**, o **endereço https** do webhook e os **dados que o agente preenche** (nome do campo, tipo e descrição). A chave de assinatura aparece **uma única vez** — guarde-a para o sistema que recebe conferir que o pedido veio do ZapSales. O botão **Testar de verdade** faz uma chamada real com dados de exemplo e mostra o que o outro sistema respondeu. Depois, na tela de cada agente, o grupo **Ferramentas externas** do seletor escolhe quais agentes podem usá-la; elas contam no limite de 27 capacidades por agente e fazem parte da versão publicada (rascunho, comparação e histórico).

Cada chamada leva assinatura, tem prazo de 8 segundos e tamanho de resposta limitado, e passa pela proteção de rede (endereços da rede interna ou privada são recusados). O que o outro sistema responde chega ao agente **como informação, nunca como ordem**, e a resposta ao cliente ainda passa por todas as conferências antes do envio. Se a consulta falhar, o agente é instruído a **não afirmar** nada que dependia dela e o dono recebe um aviso na Central. No teste do agente a chamada aparece como **"seria feita"** e não é executada.

Nesta etapa só entram ferramentas de **consulta**; as que **alteram dados** no outro sistema ficam bloqueadas, com o motivo escrito na tela, até a etapa de aprovação. A tela de ferramentas e as mudanças de cada uma ficam registradas na auditoria, sem a chave.
