# Guide — installing ZapSales on a clean VPS

For whoever is installing ZapSales on a VPS (a rented server, such as Hostinger's) that has
nothing running on it yet. You don't need to know how to code: it's **one command** and **five
questions**. Plan for 30 to 60 minutes from start to finish, mostly waiting.

> Versão em português: [`instalacao-vps-limpa.md`](./instalacao-vps-limpa.md).
> Does the VPS already serve other websites (with Caddy or Nginx)? The same command works and
> the kit adapts on its own; the details of that case are in
> [`instalacao-vps-convivio.md`](./instalacao-vps-convivio.md) (Portuguese).

## Before you start (about 15 minutes)

You need three things. Do them in this order, because the third one takes a while to kick in.

### 1. A VPS running Ubuntu

On Hostinger: **VPS › KVM 2** (or bigger), operating system **Ubuntu 24.04**. ZapSales needs at
least **4 GB of memory** and **20 GB of free disk**; with less, the kit warns you.

Write down the VPS **IP address** (something like `203.0.113.10`) and the `root` password shown
in the panel.

### 2. Ports 80 and 443 open

These are the ports the browser uses to reach the site (80 is HTTP, 443 is HTTPS). On Hostinger,
under **VPS › Firewall**: if there is an active rule set, add "accept TCP 80" and "accept TCP
443". If no firewall is configured in the panel, they are already open.

### 3. An address (domain) pointing to the VPS

ZapSales opens at an address of yours, for example `zapsales.yourcompany.com`. Wherever your
domain is managed (Hostinger's DNS panel, Cloudflare, your registrar…), create a record:

| Type | Name | Value |
|---|---|---|
| `A` | `zapsales` | your VPS IP |

It can take from a few minutes to a few hours to take effect. To check, on your computer:
`ping zapsales.yourcompany.com` must answer with the VPS IP. (On Cloudflare, keep the cloud
**grey**, "DNS only": with the orange cloud the certificate is not issued.)

## The command

Log in to the VPS from a terminal (`ssh root@VPS-IP`; on Windows, PowerShell already has `ssh`)
or through the **browser terminal** in the Hostinger panel, and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/leandromastelliniai/ZapSales/main/kit/obter.sh | sudo bash
```

It downloads the published version of ZapSales to `/opt/zapsales`, installs Docker if it is
missing and starts the installation. From then on it asks the questions below. The installer
itself speaks Portuguese; this guide translates each question.

## The five questions

**`Domínio do ZapSales (ex.: zapsales.suaempresa.com)`** — *ZapSales domain*
The address you created in step 3, without `https://` and without a trailing slash. The kit
checks that it already points to this VPS; if it doesn't, it stops and explains — fix the DNS
and run the command again. This is the address that goes on the HTTPS certificate (the padlock
in the browser).

**`E-mail do primeiro administrador`** — *e-mail of the first administrator*
Your e-mail. It becomes the login of the first account, the one that owns the system, and it is
where Let's Encrypt (who issues the HTTPS certificate, for free) sends warnings if anything goes
wrong with the certificate. Use an address you read.

**`Nome da sua empresa [Minha Empresa]`** — *your company name*
How your company shows up inside the system. Press Enter to keep "Minha Empresa" — you can
change it later under **Settings › Organization**.

**`Idioma do sistema — 1) Português  2) Español  3) English [1]`** — *system language*
The language the system starts in: screens, invitation e-mails and the automatic messages your
customers get on WhatsApp. Answer `3` for English (Enter means Portuguese). People you invite
later start in this language, and each person can switch their own in the selector at the top.

**`Senha do administrador (mínimo 8 caracteres; Enter = gerar uma forte)`** — *administrator password*
Your account's password. It isn't shown while you type (on purpose), and the kit asks twice to
make sure. Press Enter without typing anything and it generates a strong password for you.
Choose carefully: for now the system has no screen to change the password, and "forgot password"
only works once e-mail sending is set up. This question only appears on the first installation.

That's it: from here on the kit works by itself and shows each step with a green ▶.

## What happens while you wait

1. **Checks the machine** (system, memory, disk) and sees that nothing uses ports 80/443 — that
   is what makes it pick the "clean VPS" mode.
2. **Generates the installation secrets** (database passwords, encryption keys) in
   `/opt/zapsales/.env`, a file only `root` can read. Running it again never changes them.
3. **Gets the programs ready** (the Docker "images"). With a published version it downloads them
   in a few minutes. If ZapSales has no published version yet, the kit says so and builds them on
   the VPS itself — 10 to 40 minutes, depending on the machine.
4. **Starts the system**: database, login, ZapSales, WhatsApp and the supporting services.
5. **Creates your administrator account** with the password you chose (or the generated one).
6. **Requests the HTTPS certificate** from Let's Encrypt — this is why DNS and ports must be
   ready first.
7. **Schedules the daily database backup.**
8. **Proves it worked**: opens the address over HTTPS with the certificate verified and confirms
   that only ports 80 and 443 accept connections from outside.

At the end you see **▶ Pronto** ("done"), with the address.

## First login

The address, e-mail and password are in a file only `root` can read:

```bash
sudo cat /etc/zapsales/primeiro-acesso
```

Open the address in the browser and sign in with that e-mail and password. Keep the password in
a password manager (Bitwarden, 1Password, the browser's) and delete the file:
`sudo rm /etc/zapsales/primeiro-acesso`.

What to do next, inside the system: connect a WhatsApp number under **Connections**, invite your
team and, if you want invitation e-mails to go out by themselves, set up e-mail sending under
**Admin › Email** (without it, the invitation shows you the link to send to the person).

## Off-server backup (recommended)

The daily backup stays on the VPS itself — it protects against mistakes, not against losing the
machine. For a weekly encrypted copy elsewhere (Cloudflare R2), run once:

```bash
sudo /opt/zapsales/kit/backup.sh configurar-r2
```

The R2 and restore walkthrough is in [`backup-e-restauracao.md`](./backup-e-restauracao.md)
(Portuguese).

## Updating

Run the same command from the beginning. It brings the new version and reinstalls on top,
without asking again (the `.env` remembers the answers) and without losing anything: it takes a
backup before touching the database.

## If something goes wrong

The kit stops with a red ✖ and a sentence saying what to do. The most common cases:

| Message | What to do |
|---|---|
| `… não resolve no DNS` or `aponta para …, mas esta máquina é …` (the domain doesn't resolve, or points elsewhere) | The `A` record from step 3 isn't live yet or points to another IP. Fix it, wait, and run again. |
| `respondeu '000' em vez de 307` with the certificate hint | Let's Encrypt couldn't reach the VPS: check the panel firewall (step 2) and Cloudflare's grey cloud. `cd /opt/zapsales && sudo docker compose logs caddy` shows why. |
| `Menos de 4 GB de RAM` (less than 4 GB of RAM) | A warning, not an error: installation continues, but the system may be slow. Consider a bigger plan. |
| `As portas 80/443 são de um contêiner Docker` (ports belong to a Docker container) | Another program (a hosting panel, Traefik…) is using the ports. Use a clean VPS, or turn that program off. |

Running the command again is always safe. If you ask for help, keep the terminal output — it
shows which step it stopped at.

## Undoing

```bash
cd /opt/zapsales && sudo docker compose down   # stops the system; data stays
sudo rm /etc/cron.d/zapsales                   # removes the scheduled backup
```

`docker compose down -v` also deletes the data (database, media and WhatsApp sessions). Only do
it after checking a backup.

## Technical details

- The command is [`kit/obter.sh`](../../kit/obter.sh), which clones the latest release (tag
  `vX.Y.Z`) and calls [`kit/instalar.sh`](../../kit/instalar.sh). Every question can also come
  from a variable, to install without an interactive terminal:
  `curl … | sudo ZAPSALES_DOMINIO=… ZAPSALES_EMAIL=… ZAPSALES_EMPRESA=… ZAPSALES_IDIOMA=en bash`
  (without a terminal the password is generated; `ZAPSALES_SENHA` sets it).
- The mode is chosen by whoever owns ports 80/443 and saved as `ZAPSALES_MODO` in `.env`; the kit
  never switches modes by itself. To force one: `ZAPSALES_MODO=limpa` or `convivendo`.
- In clean mode `COMPOSE_FILE` is `docker-compose.prod.yml:docker-compose.supabase.yml`: the
  stack's Caddy publishes 80/443 and gets the certificate by itself (`CADDY_SITE` = the domain);
  no other service publishes a port.
- GoTrue's account-confirmation and password-reset e-mail templates
  (`/email-templates/confirmation` and `/email-templates/recovery`) accept `?idioma=pt-BR|es|en`.
