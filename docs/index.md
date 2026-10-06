---
type: index
project: ZapSales
status: draft
last_updated: 2026-10-04
generated_by: limpeza documental do fork (Claude Code)
confidence: alta (inventário de arquivos é CONFIRMADO; agrupamento temático é INFERIDO)
---

# Índice da documentação — ZapSales

Mapa dos **122** arquivos `.md` de `docs/`, em **16** subpastas que têm `.md` (mais
`docs/diagrams/`, que só tem HTML e JSON) — medido em 2026-10-04, depois da limpeza do fork.
Recontar em vez de confiar: `git ls-files 'docs/*.md' | wc -l` e
`git ls-files 'docs/*.md' | awk -F/ 'NF>2{print $2}' | sort -u | wc -l`. Existe porque a documentação
cresceu sem ponto de entrada: sem este índice, humano e agente não acham o que já foi decidido
e reescrevem por cima.

A especificação do produto e o plano por fases estão na **issue #1** do GitHub; as tarefas,
nas issues seguintes.

**Regra de precedência quando dois docs discordam:**
`CLAUDE.md` (doutrina) > `docs/specs/` (contrato técnico) > `docs/prd/` (intenção) > README.
Se achou divergência, corrija a fonte de menor precedência e registre.

---

## 1. Comece por aqui

| Doc | Para quê |
|---|---|
| [`README.md`](../README.md) | O que é, quickstart, stack, roadmap. Também em [EN](../README.en.md) / [ES](../README.es.md) |
| [`VISION.md`](../VISION.md) | Posicionamento: CRM de WhatsApp com campanhas pela API Oficial e agentes de IA |
| [`ARCHITECTURE.md`](../ARCHITECTURE.md) | Arquitetura em 1 página |
| [`AGENTS.md`](../AGENTS.md) | Contrato para agentes de código (qualquer ferramenta) |
| [`CLAUDE.md`](../CLAUDE.md) | **Doutrina não-negociável.** Convenções, anti-patterns, Definition of Done |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Como contribuir |
| [`CHANGELOG.md`](../CHANGELOG.md) | Mudanças por versão (SemVer). **Quem roda VPS lê antes de atualizar** — mudança que exige ação manual aparece sob "⚠️ Requer atenção" |

## 2. Produto e intenção

| Doc | Conteúdo |
|---|---|
| [`prd/00-prd-master.md`](prd/00-prd-master.md) | PRD mestre — visão, escopo MVP, KPIs, restrições |
| [`prd/01-prd-platform-base.md`](prd/01-prd-platform-base.md) | Auth, tenancy, RBAC, framework LGPD |
| [`prd/02-prd-customer-360.md`](prd/02-prd-customer-360.md) | Customer 360 + identity resolution determinística |
| [`prd/03-prd-whatsapp-waha.md`](prd/03-prd-whatsapp-waha.md) | Canal WhatsApp, anti-banimento, janela 24h |
| [`prd/04-prd-pipeline-attendance.md`](prd/04-prd-pipeline-attendance.md) | Kanban, atendimento, tickets, handoff |
| [`prd/05-prd-ai-rag-handoff.md`](prd/05-prd-ai-rag-handoff.md) | IA conversacional, RAG por tenant, sentiment |
| [`business-rules/00-business-rules-catalog.md`](business-rules/00-business-rules-catalog.md) | **Catálogo de regras de negócio** — fonte da verdade fora do código |
| [`features/trackeamento-de-campanha.md`](features/trackeamento-de-campanha.md) | De onde veio o lead: campanha, conjunto, anúncio e posicionamento até a ficha do contato |
| [`features/prospeccao-nativa.md`](features/prospeccao-nativa.md) | Prospecção de empresas pela Apify, dentro do CRM |
| [`features/provedor-personalizado.md`](features/provedor-personalizado.md) | Provedor de IA personalizado, compatível com OpenAI |
| [`features/mensagens-rapidas.md`](features/mensagens-rapidas.md) | Botão de mensagens que acompanha a navegação |
| [`interface-por-vinculo.md`](interface-por-vinculo.md) | Interface por membro e convite (Completa, Simplificada, personalizada) |
| [`support-sessions.md`](support-sessions.md) | Acompanhamento administrativo por sessão — autoridade, somente leitura, saída e contratos OAuth |
| [`white-label.md`](white-label.md) | Instalação com marca própria, também em [en](white-label.en.md) e [es](white-label.es.md) (traduções seladas pelo hash do original; ver `scripts/selar-traducao.ts`) |

## 3. Contrato técnico (specs)

Detalham schema SQL e payloads exatos. **Consulte antes de modelar qualquer coisa.**

| Spec | Domínio |
|---|---|
| [`specs/01`](specs/01-spec-platform-base.md) | Plataforma base — tenancy, RLS, RBAC, API, audit |
| [`specs/02`](specs/02-spec-customer-360.md) | Customer 360 |
| [`specs/03`](specs/03-spec-whatsapp-waha.md) | WAHA — fila outbound, warm-up, spinning, crons |
| [`specs/04`](specs/04-spec-pipeline-attendance.md) | Pipeline e atendimento |
| [`specs/05`](specs/05-spec-ai-rag-handoff.md) | IA, RAG, gatilhos de handoff |
| [`specs/07`](specs/07-spec-events-workers.md) | **`event_log`, workers, claim atômico, backoff/DLQ** |
| [`specs/08`](specs/08-spec-deploy-observability.md) | Deploy e observabilidade |
| [`specs/09`](specs/09-spec-frontend-backend-integration.md) | Integração front/back |
| [`specs/10`](specs/10-spec-ai-agents-runtime.md) | Runtime dos AI Agents |
| [`specs/11`](specs/11-spec-mcp-server-internal.md) | MCP server interno + catálogo de tools |
| [`specs/12`](specs/12-spec-ai-agents-ui.md) | UI dos AI Agents |
| [`specs/13`](specs/13-spec-governanca-atendimento.md) | Governança de atendimento (épico G1–G6) |
| [`specs/14`](specs/14-contrato-governanca-agentes-externos.md) | Contrato para agentes de IA externos |
| [`specs/15`](specs/15-spec-casos-humanos.md) | Casos humanos (IA delega a humano) |
| [`specs/16`](specs/16-spec-tres-papeis-do-agente.md) | **Três papéis do agente** — Conversador / Operador / Segurança |
| [`specs/17`](specs/17-spec-conversa-vira-lead.md) | **A conversa vira lead** — o elo entre atendimento e CRM |
| [`specs/17`](specs/17-spec-indice-de-atrito.md) | **Índice de Atrito** — medir o propósito (menor atrito p/ os dois lados), não a atividade |
| [`specs/18`](specs/18-spec-voice-calls-wacalls.md) | Chamada de voz WhatsApp (WaCalls) — rascunho, sem sub-PRD dedicado |
| [`specs/19`](specs/19-spec-console-de-agencia.md) | **Console de Agência** — operar N organizações clientes; unidade de cobrança decidida (retainer por cliente operado). Lei em [`doctrine/operacao-de-agentes.md`](doctrine/operacao-de-agentes.md) |
| [`specs/20`](specs/20-spec-banco-de-dados-externo.md) | Banco de dados externo — núcleo, API, tela e tools do agente |
| [`specs/extensoes-declarativas-v1.md`](specs/extensoes-declarativas-v1.md) | **Extensões declarativas v1** — pacote JSON estrito, catálogo admitido pelo dono da instalação, ativação por organização, guia no hub CRM |
| [`specs/modulo-instalado-onda-2.md`](specs/modulo-instalado-onda-2.md) | Módulo instalado — onda 2 da ADR-0002 |
| [`specs/pre-go-live-whatsapp.md`](specs/pre-go-live-whatsapp.md) | Modo de teste do WhatsApp por canal: lista de telefones, abertura ao público e compatibilidade com autorização por origem |
| [`specs/promessas-com-evidencias-consultadas.md`](specs/promessas-com-evidencias-consultadas.md) | Promessas e evidências comerciais consultadas no turno do agente |
| [`integracao/webhooks-de-saida.md`](integracao/webhooks-de-saida.md) | Webhook de saída do lado de quem recebe: cabeçalhos, assinatura com carimbo de tempo, id de entrega, exemplos em Node e Python |
| [`specs/RECONCILIATION-LOG.md`](specs/RECONCILIATION-LOG.md) | Log de reconciliação entre specs |

## 4. Doutrina e arquitetura

| Doc | Conteúdo |
|---|---|
| [`doctrine/sistema-vivo.md`](doctrine/sistema-vivo.md) | **Doutrina do Sistema Vivo — a LEI.** 7 invariantes + regra do tempo + Living System Checklist (item 13 do DoD) |
| [`doctrine/sistema-vivo/`](doctrine/sistema-vivo/README.md) | **Manual do Sistema Vivo** — 8 capítulos plugáveis (princípio universal + aplicação de referência). O *porquê* de cada invariante, e como adotar a doutrina em outro sistema |
| [`doctrine/restricao-de-canal.md`](doctrine/restricao-de-canal.md) | Auto-restrição × hetero-restrição de canais externos; contrato de parâmetros derivado |
| [`doctrine/separacao-fala-e-operacao.md`](doctrine/separacao-fala-e-operacao.md) | Vocabulário interno nunca vaza para o cliente |
| [`doctrine/packaging.md`](doctrine/packaging.md) | **Doutrina de Packaging — a LEI.** 8 invariantes + política de canais + checklist de release (item 15 do DoD) |
| [`doctrine/versionamento.md`](doctrine/versionamento.md) | **Doutrina de Versionamento** — quem decide o número, com que régua, e o que ele promete a quem já instalou |
| [`doctrine/prova-em-par.md`](doctrine/prova-em-par.md) | **Prova em Par — emenda ao item 12 do DoD.** Caso de aceite que atravessa agente de IA mede tela + ferramenta com o mesmo texto cru, e só conta quando os dois concordam |
| [`doctrine/destrutivo-pede-confirmacao.md`](doctrine/destrutivo-pede-confirmacao.md) | Ação destrutiva pede confirmação que **nomeia o alvo** — dois botões gêmeos, o mesmo contrato |
| [`doctrine/extensoes.md`](doctrine/extensoes.md) | **Doutrina de Extensões — a LEI.** Núcleo × extensão pela pergunta "com zero ativações a operação comum continua inteira?" + 13 não-negociáveis (item 18 do DoD) |
| [`doctrine/operacao-de-agentes.md`](doctrine/operacao-de-agentes.md) | **Doutrina de Operação de Agentes** — o que se opera, o que se vende e o que permanece livre |
| [`adr/0001-packaging-e-distribuicao.md`](adr/0001-packaging-e-distribuicao.md) | ADR do packaging: namespace, os 3 packages, e o que foi recusado |
| [`adr/0002-tabelas-de-modulo-num-banco-so.md`](adr/0002-tabelas-de-modulo-num-banco-so.md) | **Aceita em 17/09/2026.** Tabelas de módulo opcional: um banco só, `public`, criadas por função provisionadora fixa quando o módulo é instalado |
| [`adr/0003-perfil-declarativo-v2-portas-nomeadas-e-vitrine.md`](adr/0003-perfil-declarativo-v2-portas-nomeadas-e-vitrine.md) | **Aceita em 17/09/2026.** Perfil declarativo v2 das extensões: portas nomeadas e o metadado de loja no catálogo |
| [`adr/0004-cobranca-do-revendedor.md`](adr/0004-cobranca-do-revendedor.md) | **Aceita em 29/09/2026.** Cobrança do revendedor: o terceiro eixo de dinheiro — o dono da instalação cobra as empresas que atende; capacidade do núcleo com chave, desligada por padrão; revisa a condição 2 da ADR-0002 só para este caso |
| [`architecture/README.md`](architecture/README.md) | **Catálogo dos mapas vivos** (`*.architecture.json`) e seus renders |
| [`architecture/agent-turn.html`](architecture/agent-turn.html) | Diagrama do turno do agente (inbound → guardrails → outbound) |
| [`architecture/ponte-agendamento-followup.md`](architecture/ponte-agendamento-followup.md) | A ponte entre agendamento, follow-up e Radar |
| [`architecture/pre-go-live-whatsapp.architecture.json`](architecture/pre-go-live-whatsapp.architecture.json) | Mapa do pré-go-live, configuração administrativa e gate compartilhado |
| [`architecture/extensoes-declarativas.architecture.json`](architecture/extensoes-declarativas.architecture.json) | Mapa vivo das extensões declarativas — admissão, download, recibos, ativação por organização e guia no CRM |
| [`architecture/teto-de-orcamento.architecture.json`](architecture/teto-de-orcamento.architecture.json) | **Mapa vivo do teto de gasto com IA** — quem alimenta o gate, o que a parada NÃO desfaz sozinha, e o laço de retorno (invariante 7) |
| [`design/teto-de-orcamento.md`](design/teto-de-orcamento.md) · [`design/onda-7-alarme-de-orcamento.md`](design/onda-7-alarme-de-orcamento.md) | Planos de implementação e medições do teto e do alarme de orçamento de IA |
| [`release/teto-de-orcamento.md`](release/teto-de-orcamento.md) | **Nota de release para quem opera uma VPS** — o que muda, o que fazer (nada), a troca de rótulo de R$ para US$ e como ligar a proteção |
| [`threat-model.md`](threat-model.md) | **Superfície de ataque real do self-host** |
| [`alertas-de-seguranca-triados.md`](alertas-de-seguranca-triados.md) | Razão de cada alerta **descartado** no painel do GitHub, e o que a varredura por classe achou que o scanner não vê |

## 5. Design system

[`design-system/README.md`](design-system/README.md) é o ponto de entrada (v1.0, 5 escolhas
visuais lockadas: paleta Sage, Atkinson Hyperlegible, densidade aerada, Phosphor duotone,
IBM Plex Mono). Numerados `00`–`09`: overview, tokens, paleta, tipografia, densidade,
iconografia, componentes, motion, voice & tone, **anti-patterns**.
Fluxo de tela em `design-system/screen-flow/` (jornadas, clickflows, máquinas de estado,
acessibilidade). Marca (símbolo, logotipo, card social) em [`brand/README.md`](brand/README.md).

## 6. Operar e instalar

O kit de instalação e atualização para a VPS Hostinger está sendo refeito (issues #3 e #12)
e vai morar em `kit/`; o kit herdado da origem e os guias dele foram removidos.

| Doc | Conteúdo |
|---|---|
| [`SETUP.md`](SETUP.md) | Guia completo de env vars e setup local |
| [`runbooks/banco-e-papel-do-worker.md`](runbooks/banco-e-papel-do-worker.md) | **Aplicar o schema e criar o papel do worker** — receita que todo kit de instalação cumpre |
| [`runbooks/instalacao-vps-limpa.md`](runbooks/instalacao-vps-limpa.md) | **Instalar o ZapSales numa VPS limpa** — o comando único (`kit/obter.sh`) e cada pergunta do instalador, em linguagem simples |
| [`runbooks/installing-on-a-clean-vps.md`](runbooks/installing-on-a-clean-vps.md) | O mesmo guia, em inglês |
| [`runbooks/instalacao-vps-convivio.md`](runbooks/instalacao-vps-convivio.md) | **Instalar o ZapSales numa VPS que já roda outros apps** — o `kit/instalar.sh`, passo a passo e conferências |
| [`runbooks/backup-e-restauracao.md`](runbooks/backup-e-restauracao.md) | **Backup e restauração** — dump diário, cópia semanal criptografada no R2, ensaio mensal e desastre |
| [`runbooks/deploy.md`](runbooks/deploy.md) | **Deploy em produção — o roteamento em todo `up -d`, verificação pós-deploy, build de emergência** |
| [`runbooks/custo-e-cota-do-supabase.md`](runbooks/custo-e-cota-do-supabase.md) | **“Meu Supabase estourou a cota”** — como medir a origem do consumo, os dois intervalos da fila e as duas tabelas que só crescem |
| [`runbooks/postgrest-replay-do-gateway.md`](runbooks/postgrest-replay-do-gateway.md) | PostgREST em 503 `PGRST002` com o banco saudável — replay do gateway do Supabase |
| [`runbooks/relogio-http.md`](runbooks/relogio-http.md) | Relógio HTTP para instalação sem agendador de minuto |
| [`runbooks/conversoes-de-anuncios.md`](runbooks/conversoes-de-anuncios.md) | Conversões de anúncios pelo CRM |
| [`runbooks/logo-por-tema.md`](runbooks/logo-por-tema.md) | Logo por tema: compatibilidade e reversão |
| [`runbooks/ai-credentials-rotation.md`](runbooks/ai-credentials-rotation.md) | Rotação de credenciais de IA |
| [`../SECURITY.md`](../SECURITY.md) | Política de reporte de vulnerabilidade |

## 7. Testes e QA

| Doc | Conteúdo |
|---|---|
| [`testing/user-journey-map.md`](testing/user-journey-map.md) | **Mapa de jornadas vivo** — casos, prioridade `[P0]`, achados. Atualizar sempre |
| [`../tests/e2e/README.md`](../tests/e2e/README.md) | Como rodar os E2E |

## 8. Execução — épicos e convenções de trabalho

Documentação de *processo*. Trate como estado, não como contrato. O backlog vivo são as
issues do GitHub.

- [`stories/`](stories/) — épicos e stories (`epics/MASTER.md` = plano por epic/wave)
- [`agents/`](agents/issue-tracker.md) — convenções para agentes de código: issue tracker, etiquetas de triagem e docs de domínio

---

## Lacunas conhecidas deste índice

- `docs/diagrams/` não tem `.md` e não foi inventariado.
- `docs/architecture/` reúne mapas JSON e seus renders disponíveis. Consulte o
  [catálogo de mapas](architecture/README.md) e os arquivos do diretório; a contagem
  muda com as entregas. A doutrina exige representar peças novas e suas relações,
  e `tests/unit/mapas-de-arquitetura.test.ts` verifica a forma e os kinds do runtime.
  Esse gate não comprova, sozinho, que toda funcionalidade tem um mapa.
