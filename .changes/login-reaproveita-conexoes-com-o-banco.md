---
impacto: nada_mudou
secao: corrigido
titulo: O login reaproveita conexões com o banco, e toda tela logada fica mais rápida
---

O serviço de login (GoTrue) fechava a conexão com o banco ao fim de cada requisição e abria
outra na seguinte, o que custa cerca de 90 ms cada vez — e toda tela e chamada de API de quem
está logado pergunta a ele quem é o usuário. Agora ele mantém até 10 conexões abertas (máximo de
20). A atualização normal aplica sozinha e um `.env` antigo continua valendo; quem precisar de
outro valor define `SUPABASE_AUTH_DB_POOL` e `SUPABASE_AUTH_DB_POOL_OCIOSA`.
