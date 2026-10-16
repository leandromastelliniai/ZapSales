---
impacto: nada_mudou
secao: corrigido
titulo: LGPD sem erro 500 na prévia, e textos em português na Equipe, na busca e na Atualização
---

A **Prévia de dados do titular** (e a exportação de dados do titular) dava erro 500 numa instalação sem o módulo de
Honorários: o sistema não reconhecia a resposta "esta tabela não existe" do banco. Agora a seção de honorários sai
vazia, como deveria. O mesmo reconhecimento vale para as telas e ferramentas do próprio módulo, que passam a avisar
"o módulo não está instalado" em vez de falhar.

Também corrigido: o selo de prazo **Vencido** não aparece mais em pedido de LGPD já concluído; os papéis da
**Equipe** aparecem em português (Administrador, Gerente, Atendente, Visualizador); a busca **⌘K** acha "Disparo em
massa" ao digitar "campanha"; a tela Organização não diz mais "Admin only"; o Inbox do painel não promete mais
"Impersonate em breve"; e a tela de Atualização não mostra a versão instalada em branco quando o servidor ainda não a
informou.
