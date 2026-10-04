---
impacto: capacidade_nova
secao: adicionado
titulo: Kit de instalação para VPS que já roda outros apps, com backup e restauração
---

O `kit/instalar.sh` instala o ZapSales numa VPS que já tem um Caddy ou Nginx servindo
outros sites: sobe o Supabase próprio, o app, o worker, o agendador, o WhatsApp (WAHA) e o
Redis em Docker, todos ouvindo só no `127.0.0.1` e com limite de CPU e memória, e acrescenta
um único bloco ao proxy existente. Os sites vizinhos são vigiados durante toda a instalação.
Rodar o kit de novo é como se atualiza: os segredos ficam, nada é duplicado.

O `kit/backup.sh` faz o dump diário do banco (30 dias) e a cópia semanal criptografada de
banco, mídias, sessões do WhatsApp e configuração para o Cloudflare R2; o
`kit/restaurar.sh` restaura num ambiente separado (ensaio mensal) ou numa VPS nova.
