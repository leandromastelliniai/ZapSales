<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/zapsales-logo-dark.svg">
  <img src="docs/brand/zapsales-logo.svg" alt="ZapSales" width="420">
</picture>
</p>

<p align="center"><a href="README.en.md">English</a> · <a href="README.es.md">Español</a></p>

# ZapSales — CRM de WhatsApp com agentes de IA e campanhas pela API Oficial da Meta

O ZapSales junta, num produto só, o que a equipe comercial usa para vender pelo WhatsApp:

- **Funil (Kanban), inbox e atendimento em equipe**, com fila, transferência e escopo por papel.
- **Agentes de IA** com base de conhecimento por empresa, passagem para humano e follow-up.
- **Números de WhatsApp de dois jeitos**: API Oficial da Meta (recomendada para campanhas) e
  WAHA/QR code (para atendimento).
- **Campanhas em massa** com público filtrado, exclusões automáticas, base legal (LGPD) e ritmo
  controlado.
- **Multi-empresa** com isolamento por RLS desde o banco, LGPD nativa, financeiro, VoIP, Ads,
  Prospecção e Propostas.

A especificação completa e o plano por fases estão na issue
[#1](https://github.com/leandromastelliniai/ZapSales/issues/1).

> **Estado:** fase 0 — a base do CRM está no repositório com a identidade ZapSales. O kit de
> instalação na VPS (Hostinger) e o canal oficial completo chegam nas fases seguintes.

---

## 🧱 Stack

| Camada | Escolha |
|---|---|
| **Frontend** | Next.js 16 App Router (Turbopack) + React 19 + TypeScript 6 estrito |
| **Estilo** | Tailwind + shadcn/ui (`new-york`, neutral) |
| **Banco** | Supabase (Postgres + RLS + `vector`) |
| **Auth** | Supabase Auth via `@supabase/ssr` (cookie SameSite=Strict, HttpOnly) |
| **Tempo real** | Supabase Realtime (postgres_changes + broadcast) |
| **Storage** | Supabase Storage (bucket privado `whatsapp-media`, URLs assinadas) |
| **WhatsApp** | Meta Cloud API (oficial) + WAHA Plus (engine NOWEB) |
| **Filas** | tabela `event_log` + workers (cron) — trigger de banco nunca faz HTTP |
| **Rate limit** | Upstash Redis (sliding window) |
| **IA** | Vercel AI SDK — OpenRouter, Requesty, Anthropic, OpenAI e Google |
| **Validação** | Zod |
| **Observabilidade** | Sentry (com limpeza de dados sensíveis) |

Detalhes: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 🧑‍💻 Desenvolvimento

```bash
git clone https://github.com/leandromastelliniai/ZapSales.git
cd ZapSales

nvm use                     # Node 22
npm install -g pnpm && pnpm install

cp .env.example .env.local  # guia completo em docs/SETUP.md

docker compose up -d        # WAHA local (opcional em dev sem WhatsApp)

# Schema: aplique o baseline, NÃO as migrations — a cadeia de migrations não sobe do zero.
# Num projeto Supabase NOVO, habilite antes as extensões que o schema usa.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c \
  'create extension if not exists vector with schema public;
   create extension if not exists citext with schema public;
   create extension if not exists pg_trgm with schema public;'

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql

pnpm dev
```

App: <http://localhost:3000> · Health check: <http://localhost:3000/api/v1/health>

---

## 📁 Estrutura

```
ZapSales/
├── app/                    # Next.js App Router (telas e API REST em app/api/v1/)
├── components/             # React (ui/, inbox/, kanban/, shell/, ...)
├── lib/                    # supabase/, waha/, channels/, ai/, agent-engine/, api/, ...
├── workers/                # consumidores de event_log (IA, RAG, LGPD, mídia, rotinas)
├── supabase/               # baseline.sql (o que a instalação aplica) + migrations/
├── tests/{e2e,unit,invariants,shell}/
├── scripts/                # seeds, manutenção, apoio aos testes
└── docs/                   # especificações, runbooks, decisões (adr/), marca
```

---

## 🧪 Testes

```bash
pnpm typecheck     # tsc --noEmit -p tsconfig.typecheck.json (inclui tests/)
pnpm lint          # eslint
pnpm test:unit     # Vitest (NÃO inclui tests/invariants/**)
pnpm test:db       # Postgres efêmero + baseline install/update + invariantes (precisa de Docker)
pnpm test:e2e      # Playwright
```

O CI roda tudo isso em máquinas do GitHub: `verify` (typecheck, lint, testes unitários e de
shell), `build-and-size`, `invariants` (o `baseline.sql` em modo install e update, mais os
invariantes, incluindo o isolamento RLS entre duas empresas) e `e2e`.

---

## 📚 Documentação

- [`CLAUDE.md`](CLAUDE.md) — as convenções do código (leitura obrigatória antes de mexer).
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — arquitetura.
- [`docs/SETUP.md`](docs/SETUP.md) — configurar as integrações para desenvolver.
- [`docs/index.md`](docs/index.md) — índice da documentação.

## 📜 Licença

[MIT](LICENSE).
