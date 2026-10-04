<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/zapsales-logo-dark.svg">
  <img src="docs/brand/zapsales-logo.svg" alt="ZapSales" width="420">
</picture>
</p>

<p align="center"><a href="README.md">Português</a> · <a href="README.es.md">Español</a></p>

# ZapSales — WhatsApp CRM with AI agents and campaigns through the official Meta API

ZapSales puts in a single product what a sales team uses to sell over WhatsApp:

- **Pipeline (Kanban), inbox and team attendance**, with queue, transfer and role-based scope.
- **AI agents** with a per-company knowledge base, human handoff and follow-up.
- **WhatsApp numbers in two ways**: the official Meta Cloud API (recommended for campaigns) and
  WAHA/QR code (for attendance).
- **Bulk campaigns** with filtered audiences, automatic exclusions, legal basis (LGPD) and
  controlled pacing.
- **Multi-company** with RLS isolation down to the database, native LGPD, finance, VoIP, Ads,
  Prospecting and Proposals.

The full specification and phased plan are in issue
[#1](https://github.com/leandromastelliniai/ZapSales/issues/1).

> **Status:** phase 0 — the CRM base is in the repository with the ZapSales identity. The VPS
> install kit (Hostinger) and the complete official channel come in the next phases.

## 🧑‍💻 Development

```bash
git clone https://github.com/leandromastelliniai/ZapSales.git
cd ZapSales
nvm use && npm install -g pnpm && pnpm install
cp .env.example .env.local   # full guide in docs/SETUP.md
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql   # apply the baseline, not the migrations
pnpm dev
```

Stack, structure and tests are described in the [Portuguese README](README.md) and in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## 📜 License

[MIT](LICENSE).
