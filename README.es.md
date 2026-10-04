<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/zapsales-logo-dark.svg">
  <img src="docs/brand/zapsales-logo.svg" alt="ZapSales" width="420">
</picture>
</p>

<p align="center"><a href="README.md">Português</a> · <a href="README.en.md">English</a></p>

# ZapSales — CRM de WhatsApp con agentes de IA y campañas por la API Oficial de Meta

ZapSales reúne, en un solo producto, lo que el equipo comercial usa para vender por WhatsApp:

- **Embudo (Kanban), bandeja de entrada y atención en equipo**, con cola, transferencia y alcance
  por rol.
- **Agentes de IA** con base de conocimiento por empresa, traspaso a humano y seguimiento.
- **Números de WhatsApp de dos formas**: la API Oficial de Meta (recomendada para campañas) y
  WAHA/código QR (para atención).
- **Campañas masivas** con público filtrado, exclusiones automáticas, base legal (LGPD) y ritmo
  controlado.
- **Multiempresa** con aislamiento por RLS desde la base de datos, LGPD nativa, finanzas, VoIP,
  Ads, Prospección y Propuestas.

La especificación completa y el plan por fases están en la issue
[#1](https://github.com/leandromastelliniai/ZapSales/issues/1).

> **Estado:** fase 0 — la base del CRM está en el repositorio con la identidad ZapSales. El kit
> de instalación en la VPS (Hostinger) y el canal oficial completo llegan en las próximas fases.

## 🧑‍💻 Desarrollo

```bash
git clone https://github.com/leandromastelliniai/ZapSales.git
cd ZapSales
nvm use && npm install -g pnpm && pnpm install
cp .env.example .env.local   # guía completa en docs/SETUP.md
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql   # aplique el baseline, no las migrations
pnpm dev
```

La stack, la estructura y las pruebas están en el [README en portugués](README.md) y en
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## 📜 Licencia

[MIT](LICENSE).
