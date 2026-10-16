---
impacto: nada_mudou
secao: alterado
titulo: Teto de CPU do login, do REST e do armazenamento revisto para máquinas reais
---

Os serviços de login, REST e armazenamento rodavam limitados a meio núcleo, um número escrito
para uma VPS de 3,8 GB. O login passa a 2 núcleos (com o mesmo número de threads) e REST e
armazenamento a 1. A atualização normal aplica os novos tetos sozinha e um `.env` antigo continua
valendo; quem quiser outro valor define `SUPABASE_AUTH_CPUS`, `SUPABASE_AUTH_THREADS`,
`SUPABASE_REST_CPUS` ou `SUPABASE_STORAGE_CPUS`. Também foi corrigido o comentário do arquivo de
produção que afirmava que a máquina tem 3,8 GB de memória.
