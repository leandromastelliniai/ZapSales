---
impacto: nada_mudou
secao: corrigido
titulo: Instalar um módulo não deixa mais o sistema lento nem derruba uma tela de quem está usando
---

Ao instalar um módulo (como Honorários) em **Admin › Módulos**, o banco travava por alguns instantes
**todas** as tabelas principais enquanto reaplicava as travas do modo «somente leitura» do suporte em
cada uma delas. Quem estava usando o sistema nessa hora esperava a instalação terminar e, de vez em
quando, uma das telas abertas falhava com um erro de permissões. Agora a instalação aplica essas travas
só nas tabelas que o próprio módulo cria, e o resto do sistema segue respondendo normalmente.

O resultado da instalação é o mesmo de antes: o módulo sai com as mesmas travas. Quem já instalou um
módulo não precisa fazer nada.
