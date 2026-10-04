# Runbook — backup e restauração

Duas camadas, as duas agendadas pelo kit em `/etc/cron.d/zapsales`:

| Camada | Quando | O quê | Onde | Retenção |
|---|---|---|---|---|
| Dump diário | 03:15 (hora da VPS) | banco inteiro (`pg_dump -Fc`), mais a contagem de linhas que ele contém | `/var/backups/zapsales/db/` | 30 dias |
| Cópia semanal | domingo 04:30 | dump novo + mídias (Supabase Storage) + sessões do WhatsApp + mídia do WAHA + `.env` | Cloudflare R2, criptografada (restic) | 8 semanais + 6 mensais |

Comandos (todos com `sudo`, de `/opt/zapsales`):

```bash
kit/backup.sh status          # últimos dumps, última cópia semanal, R2 configurado?
kit/backup.sh diario          # roda o dump agora
kit/backup.sh semanal         # roda a cópia para o R2 agora
kit/backup.sh listar          # snapshots no R2
kit/backup.sh configurar-r2   # grava as credenciais do R2 (uma vez)
```

O log de cada rodada vai para `/var/log/zapsales/backup.log`.

## Por que o `.env` entra na cópia

Ele guarda as chaves que cifram dados **dentro** do banco: CPF, credenciais de IA,
credenciais de integrações. Um banco restaurado sem o `.env` que o acompanhava volta com
essas colunas ilegíveis. Por isso a cópia semanal é criptografada inteira pelo restic.

## Configurar o R2 (uma vez)

1. No painel da Cloudflare: **R2 → Create bucket** (ex.: `zapsales-backup`).
2. **R2 → Manage API tokens → Create API token**, permissão *Object Read & Write*, restrita
   ao bucket. Anote o *Access Key ID* e o *Secret Access Key*, e o *Account ID* (aparece na
   URL e na página do R2).
3. Na VPS:

   ```bash
   sudo /opt/zapsales/kit/backup.sh configurar-r2
   ```

   Ele pergunta os quatro valores (ou lê `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` e
   `R2_SECRET_ACCESS_KEY` do ambiente), gera a senha do restic, grava tudo em
   `/etc/zapsales/backup.env` (modo 600, fora do repositório) e inicializa o repositório.

4. **Guarde a senha do restic fora da VPS** (gerenciador de senhas do dono):
   `sudo grep RESTIC_PASSWORD /etc/zapsales/backup.env`. Sem ela, perdida a VPS, o backup
   não abre — e ela não está em lugar nenhum além desse arquivo.

## Restaurar

### Teste mensal (ensaio) — sem tocar no que está no ar

```bash
sudo /opt/zapsales/kit/restaurar.sh ensaio
```

O ensaio baixa o snapshot mais recente do R2 e monta um **ambiente separado** na mesma VPS:
outro projeto do Compose (`zapsales-ensaio`), outros volumes, outra porta no loopback
(padrão 18088), sem bloco no proxy. Ele:

1. sobe um banco novo, aplica o `baseline.sql` e restaura os **dados** de `public`,
   `private`, `auth` e `storage` do dump (os schemas internos do Supabase nascem certos no
   banco novo e não são sobrescritos);
2. devolve as mídias ao volume do Storage;
3. sobe **só** o app e o proxy — nunca worker, agendador ou WhatsApp: com o banco
   restaurado, eles executariam campanhas e follow-ups de novo para clientes reais, e o
   WAHA disputaria o número com o de produção;
4. confere a contagem de linhas de cada tabela-chave (usuários, organizações, contatos,
   conversas, mensagens, negócios, arquivos) contra a contagem gravada **dentro do dump**;
5. prova que o app abre (`307`) e que o login (Auth) responde. Com
   `ZAPSALES_TESTE_EMAIL`/`ZAPSALES_TESTE_SENHA` no ambiente, entra de verdade com uma
   conta de produção.

Para ver o ensaio no navegador: `ssh -L 18088:127.0.0.1:18088 root@<vps>` e abra
`http://localhost:18088`. Ao terminar:

```bash
sudo /opt/zapsales/kit/restaurar.sh ensaio --remover
```

Registre a data e o resultado do ensaio no fim deste arquivo.

### Desastre — a VPS foi perdida

Numa VPS nova, com o código em `/opt/zapsales` e o DNS já apontando para ela. O kit instala
o Docker se faltar; o que ele **ainda não** faz é subir o próprio proxy — o modo "VPS limpa" é
a issue #12. Até lá, a VPS nova precisa de um Caddy ou Nginx do sistema nas portas 80/443
(`apt install caddy` basta) antes do passo 2, senão a restauração dos dados termina e o
`kit/instalar.sh` final para dizendo que não há proxy.

**Este caminho ainda não foi executado de ponta a ponta** — o ensaio (acima) exercita a mesma
restauração de banco e mídias, mas não a troca de máquina.

```bash
# 1. As credenciais do R2 e a MESMA senha do restic
sudo RESTIC_PASSWORD='<a senha guardada>' /opt/zapsales/kit/backup.sh configurar-r2
# 2. Restaura tudo e termina com o kit de instalação
sudo /opt/zapsales/kit/restaurar.sh desastre
```

O modo desastre restaura na própria pasta do kit (o `.env` original, com o mesmo domínio),
devolve banco, mídias **e** sessões do WhatsApp, confere as contagens e chama o
`kit/instalar.sh`, que configura o proxy e os backups. Ele se recusa a rodar onde já existe
um `.env` — numa instalação viva, use o ensaio.

### Só o banco, a partir de um dump diário

Os dumps diários não saem da VPS; servem para voltar o banco no tempo (um erro de operação,
não a perda da máquina). O caminho é o mesmo do ensaio: um banco novo, o baseline e os
dados do dump. Faça primeiro um ensaio com o snapshot do R2 para conferir o procedimento.

## Registro dos ensaios

| Data | Snapshot | Resultado | Quem |
|---|---|---|---|
| 2026-10-04 | `a6de0ca7` (repositório restic **local**, no lugar do R2 ainda sem credenciais) | ✓ 8 contagens iguais às do dump; mídia de prova devolvida byte a byte; app `307`; administrador entrou no ensaio com a senha de produção, pela tela | Claude (issue #3) |
