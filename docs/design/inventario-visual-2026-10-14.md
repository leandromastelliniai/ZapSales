# Inventário visual — 14/10/2026

Base da replicação do desenho da Inbox para o resto do ZapSales.

**Como foi feito:** leitura do código (`Sidebar.tsx`, `globals.css`, `catalogo.ts`, `lib/ui/icons.ts`) e capturas da
produção (zapsales.futuristas.app, sessão já logada, só leitura; login e vitrines por um navegador sem sessão).
Tema escuro em janela larga (2294 px). Modo claro simulado trocando só o atributo `data-theme` na página aberta
(não grava nada na conta).

**Visto:** Inbox, Funis, Contatos, Campanhas, Agenda, Desempenho, Conexões, Equipe, Tarefas, Produtos,
Respostas rápidas, Webhooks, Auditoria, Faturamento, hubs de CRM/IA/Análise/Configurações, login, criar conta,
vitrine da Inbox em 390 px, e Contatos/Conexões/Inbox em modo claro.

**NÃO visto (e por quê):**
- **Onboarding.** O assistente manda quem já se cadastrou direto para a Inbox, então só aparece numa conta nova, e
  criar conta na produção não é feito por mim. Só li o código: tela de 6 passos num contêiner estreito (`max-w-3xl`)
  com indicador de passo, sobre o fundo genérico `bg-muted/40`, sem os painéis do piloto.
- **Celular nas telas logadas.** A janela do Chrome ligado à sessão não encolhe pelas minhas ferramentas (a largura
  fica em 2294 px), e o app proíbe ser aberto dentro de outra página (proteção correta, mantida). Só vi a vitrine.
- **Telas internas de Configurações (24) e IA (23)**, listas cheias e estados de erro. A produção tem 2 contatos,
  0 campanhas e 1 funil.

## O que já está igual ao piloto

- Tokens de cor, raio, sombra e fonte são globais (`app/globals.css`) e valem em todas as telas, nos dois modos.
- Fonte única de texto (Atkinson Hyperlegible) e uma mono (IBM Plex Mono). Fontes pesam 57 KB, CSS 22 KB.
- Os hubs (CRM, IA, Análise, Configurações) são cartões com título + descrição, agrupados por tarefa
  ("Montar o agente", "Ensinar o agente", "Acompanhar o agente"). É o melhor padrão do produto e o modelo.
- A maioria das telas já tem título e uma linha de descrição.
- Login e criar conta estão limpos, centrados, e funcionam em 390 px.
- O modo claro funciona e é legível em todas as telas vistas.

## O que ainda não é

| Tela | Distância do piloto | Achado |
|---|---|---|
| Menu lateral | Alta | 18 itens só com ícone. Os três "Ver tudo em CRM / IA / Análise" usam a **mesma seta**. Ícones repetidos (ver abaixo). |
| Funis | Alta | Único título sem descrição. Tela quase vazia, orientação em texto miúdo. |
| Agenda | Alta | Aviso técnico do Google (com URL de retorno) fica **acima** do título. Duas faixas vazias empilhadas. |
| Equipe | Alta | Texto com jargão ("roles", "tenant"). Chip "Aceito" em violeta, que no piloto significa IA. Sem foto/iniciais do membro. |
| Auditoria | Alta | Tabela crua: JSON truncado em "Metadata", "mutações append-only", "Manager+". Feita para engenheiro. |
| Tarefas / Produtos | Média | Conteúdo estreito e centralizado (~900 px) enquanto Contatos ocupa a largura toda. Em Tarefas, título e descrição ficam espremidos ao lado dos filtros. |
| Respostas rápidas | Média | Botão "Novo template" solto à direita; vazio é só o texto "Nenhum template ainda." (sem estado vazio). Nome do menu e da página diferem do termo "template". |
| Faturamento | Média | Quatro "R$ 0,00" lado a lado; margem esquerda diferente das demais telas (42 px contra 53 px); sem contêiner de painel. |
| Conexões | Média | Caixa "Para integrar" e aviso laranja ocupam o topo; o número conectado vem depois. |
| Desempenho | Média | Cartões com parágrafos longos; falta resumo no topo. |
| Contatos | Média | Sem foto/selo de canal e sem etapa do funil (a Inbox tem). Filtros viraram chips sem rótulo. |
| Webhooks | Baixa | Bom estado vazio ("Conecte sua landing page em 2 minutos"). Ícone grande é o único do tipo no produto. |
| Campanhas | Baixa | Estado vazio bom. Filtro aparece antes de existir campanha. |
| Login | Baixa | "Entrar" e logo abaixo "ZapSales" (repete a marca). Botão desabilitado com texto escuro sobre lilás. Sem frase de valor. |
| Hubs | Baixa | Modelo. |

## Celular (só a vitrine da Inbox, 390 px)

- Nome da organização quebra em 3 linhas no topo.
- Rótulos da Linha do Funil colidem ("CampanhaConversaQualificado…").
- Botões de ação cortados na borda inferior. Barra de ação em duas linhas desencontradas.
- Atenção: é a vitrine, não a tela real. Confirmar na tela real antes de tratar como defeito do produto.

## Ícones (`lib/ui/icons.ts`)

Biblioteca Phosphor, 118 ícones exportados num ponto único. Phosphor tem 6 pesos (thin, light, regular, bold, fill, duotone).
O problema não é a biblioteca: é a repetição. Contagem em `lib/navigation/catalogo.ts`:

| Ícone | Usos | Destinos |
|---|---|---|
| FileText | 5 | Respostas rápidas, Importações, Propostas (×2), Modelos de proposta |
| ChartBar | 4 | Financeiro, Faturamento, Honorários, Desempenho |
| ListChecks | 4 | Tarefas, Fluxos de atendimento, Execuções, Recursos opcionais |
| seta (→) | 3 | "Ver tudo em" CRM, IA, Análise |
| Megaphone | 2 | Campanhas, Meta Ads |
| Funnel | 2 | Prospecção, Etapas do funil |
| outros pares | 2 cada | UsersThree, CalendarBlank, Buildings, Phone, ClockCounterClockwise, ChartLineUp, PlugsConnected, UserCircle, Receipt |

## Transversais

- **Largura:** `main` sem largura máxima (2230 px num monitor de 2294) e telas com larguras diferentes entre si.
- **Peso:** o hub CRM, que só mostra cartões, carregou ~1,17 MB de JavaScript (transferido) e 104 requisições, numa
  medição só. O gargalo de "rápido" está aí, não em fonte, CSS ou imagem. Medir outras telas e abrir o pacote antes
  de mexer. O LCP lido (6,2 s) é de amostra única e não é confiável.
- **Dívida de cor:** 69 arquivos usam paleta Tailwind crua (403 usos) e 48 hex fora dos tokens.
- **Linguagem:** jargão técnico em telas de gestor (roles, tenant, append-only, mutações, Trunk SIP, Billing).

## Decisões do dono (14/10/2026)

1. Menu expandido por padrão em todas as telas (ícone + nome). Reverte a decisão de 07/10.
2. Cada tela leva uma linha fixa de descrição no cabeçalho **e** um botão "Como funciona" com ajuda mais longa.
3. Inventário completo antes de implementar (este arquivo).

## Pendências

Onboarding (precisa de conta nova), celular nas telas reais, Configurações e IA por dentro, listas com dados.
