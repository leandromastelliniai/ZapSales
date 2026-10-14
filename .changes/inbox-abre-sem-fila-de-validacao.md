---
impacto: nada_mudou
secao: corrigido
titulo: A Inbox abre bem mais rápido: as chamadas simultâneas da tela dividem uma validação de usuário
---

Ao abrir, a Inbox dispara cerca de 15 chamadas de API ao mesmo tempo, e cada uma pedia ao serviço
de login a validação do mesmo usuário. Em produção elas esperavam em fila e levavam de 1,7 a
2,3 s cada. Agora as chamadas simultâneas da mesma sessão dividem uma só ida ao serviço de login.
Nada é guardado depois que a resposta chega, e sessões diferentes nunca se misturam: a regra de
validar o token no servidor de autenticação continua valendo.
