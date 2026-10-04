# 🧭 Visão — ZapSales

> **CRM de WhatsApp com funil, inbox, agentes de IA e campanhas em massa pela API Oficial da Meta.**
> Este documento é a fonte da verdade do posicionamento do projeto. Tudo que for público (README, site, docs, descrições) deriva daqui. A especificação do produto e o plano por fases estão na issue #1 do GitHub.

---

## O nome

**ZapSales** = **Zap** (como o Brasil chama o WhatsApp) + **Sales** (vendas): vender pelo WhatsApp, do primeiro disparo ao fechamento.

O "CRM" é a categoria de entrada, não o teto. O ZapSales é o lugar onde a venda pelo WhatsApp acontece — campanha, conversa, funil e pós-venda numa operação só, tocada por pessoas e por agentes de IA trabalhando juntos.

## O que o produto faz

- **Funil (Kanban) e inbox em tempo real** — cada conversa vira lead, o lead anda no funil, e o histórico fica junto.
- **Campanhas em massa pela API Oficial da Meta** — quem responde a uma campanha cai no funil e no agente **com o contexto do que foi enviado**.
- **Dois jeitos de conectar um número:**
  - **API Oficial (Meta Cloud API)** — a recomendada para campanha;
  - **WAHA / QR code** — para atendimento.
- **Agentes de IA** que atendem, qualificam e movem o funil junto com os humanos.

## O que acreditamos sobre agentes de IA

1. **Agente que opera, não chatbot que enfeita.** Nosso agente lê contexto real (histórico, perfil, pedido, a campanha que o cliente recebeu), consulta a base de conhecimento do tenant (RAG por organização), responde, qualifica, move o lead no funil — e é **assignee de primeira classe** no sistema, com as mesmas regras de governança de um atendente humano.

2. **Agentes que se auto-aprimoram.** O sistema é desenhado como um flywheel: conversas resolvidas viram conhecimento novo na base RAG; handoffs pro humano marcam onde o agente ainda não alcança; métricas e budget por tenant fecham o loop — com **gate humano** nas decisões que importam.

3. **MCP como sistema nervoso.** O CRM inteiro é exposto como tools MCP — primeiro para os agentes internos, depois como contrato público. Um negócio deve poder plugar o agente que quiser e ele **opera** o ZapSales: cria lead, responde cliente, agenda, consulta pedido.

4. **Humano no comando.** Handoff auditado, escopo por papel (RBAC), fila com posição, budget de IA por organização. Autonomia do agente cresce na medida em que a governança prova que ele acerta.

## Os pilares do produto

| Pilar | O que significa na prática |
|---|---|
| **Campanhas pela API Oficial** | Disparo em massa pela Meta Cloud API; a resposta entra no funil e no agente com o contexto da campanha |
| **Agentes de IA nativos** | RAG por tenant, análise de sentimento, handoff IA→humano auditado, IA como assignee, budget por org |
| **CRM automatizado pela IA** | O agente move leads, aplica tags, dispara automações QUANDO/SE/ENTÃO — o funil anda sozinho |
| **Ferramentas de apoio ao comercial** | Inbox em tempo real, kanban com fractional indexing, customer 360, métricas por atendente, roteamento automático |
| **WhatsApp nos dois canais** | API Oficial da Meta para campanha; WAHA multi-número (QR code) para atendimento; anti-banimento, mídia, STOP detection |
| **Multi-nicho por design** | `vocabulary` configurável por pipeline (lead = Cliente/Paciente/Comprador; won = Pago/Agendado/Fechado) — o mesmo core serve e-commerce, clínica, imobiliária, infoproduto |
| **Na sua VPS** | Seus dados na sua VPS, `baseline.sql` auto-curativo. O kit de instalação para a VPS Hostinger está sendo refeito (issues #3 e #12) |
| **Compliance nativo** | Multi-tenant com RLS testada em CI, LGPD by-design (redact, data_request, anonimização), audit append-only |

## Posicionamento

**Categoria:** CRM de vendas pelo WhatsApp com campanhas pela API Oficial e agentes de IA — a alternativa às plataformas fechadas de atendimento e vendas por WhatsApp (Kommo, Octadesk, Intercom, Zendesk), rodando na infraestrutura de quem usa.

**Uma frase (pt-br):**
> ZapSales é o CRM de WhatsApp com funil, inbox, agentes de IA e campanhas em massa pela API Oficial da Meta — quem responde à campanha cai no funil e no agente com o contexto do que recebeu.

**One-liner (en):**
> ZapSales is a WhatsApp CRM with a Kanban pipeline, a shared inbox, AI agents and bulk campaigns over Meta's official API — replies land in the pipeline and in the agent with the campaign's context.

**Público:** negócios brasileiros que vendem pelo WhatsApp — e-commerce, clínicas, imobiliárias, infoprodutores, agências, serviços.

## Modelo do projeto (sem letra miúda)

- **Hoje:** o ZapSales roda na VPS própria do dono (Hostinger), para a operação dele.
- **Depois da validação interna:** o código vira open source (MIT, ver [`LICENSE`](LICENSE)), completo, sem versão paga e sem feature travada.
- **Quem instala pode cobrar os próprios clientes** ([ADR-0004](docs/adr/0004-cobranca-do-revendedor.md)) — capacidade do núcleo, desligada por padrão.
- **O caminho genérico nunca é sabotado:** `docker compose` funciona em qualquer VPS; o kit da Hostinger é o caminho recomendado, nunca o único.

## Princípios de comunicação

1. **Keyword primeiro, jargão depois.** Em todo título público: "WhatsApp", "CRM", "API Oficial", "agentes de IA", "campanhas" antes de qualquer nome interno de subsistema.
2. **Mostrar, não descrever.** Screenshot/GIF do produto no primeiro scroll de qualquer página.
3. **Âncora explícita.** "Alternativa a X" aparece no About do GitHub, no README e no site — é assim que a demanda dos incumbentes nos encontra (busca e LLMs).
4. **E-commerce é exemplo, não definição.** Ao citar casos de uso, sempre em lista multi-nicho ("e-commerce, clínicas, imobiliárias...").
5. **Transparência de modelo.** Como o projeto se sustenta e o que ele coleta, declarados em linguagem humana no README, nunca escondidos.

---

*Última revisão: 2026-10-04 — reposicionamento para ZapSales: CRM de WhatsApp com campanhas pela API Oficial da Meta, VPS Hostinger, open source depois da validação interna.*
