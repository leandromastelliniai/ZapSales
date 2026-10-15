# Plano de implementação — replicar o desenho da Inbox para todo o ZapSales

Decidido com o dono em 14/10/2026. Base: [inventario-visual-2026-10-14.md](inventario-visual-2026-10-14.md).
Escopo: **tudo** o que foi conversado, sem cortar por onda. A ordem abaixo é de dependência, não de corte.

## Decisões já tomadas

1. Menu lateral **expandido por padrão** (ícone + nome), em todas as telas. Reverte a decisão de 07/10.
2. Todo cabeçalho de tela: título, **uma linha fixa de descrição**, ação principal e botão **"Como funciona"**.
3. Ícones: um por destino, sem repetição; pastilha e peso duotone onde ajuda; **conjunto próprio** de 8 a 10 ícones
   dos conceitos do produto, com prévia antes de adotar.
4. Cores com um só significado (do piloto): violeta = IA e navegação ativa, ciano = atendente humano, âmbar = funil e
   fila, verde = concluído, coral = falha, limão = só o botão Enviar. Selo "Aceito" passa a verde.
5. Português de dono de negócio nas telas de gestão; termo técnico vai para o "Como funciona".

## Correções ao que eu tinha sugerido (piso de qualidade do Impeccable)

- **Sem sparklines nem "número grande + legenda" decorativos.** Em Desempenho e Faturamento os números aparecem em
  tabela comparativa com período anterior, e série só onde há dados de verdade. Estado zerado vira uma frase.
- **Hubs viram lista em painel**, não grade de cartões iguais (ícone + título + texto repetido é o andaime que o piso
  recusa). Cada linha: ícone, nome, descrição, seta. Agrupada por tarefa, como hoje.
- **Sem rótulo pequeno em caixa alta acima de título.** Os títulos de grupo dos hubs passam a ser títulos de verdade.
- Movimento: um momento autoral (a troca de painel), só opacidade e posição, `prefers-reduced-motion` respeitado.

## Regras de execução (valem para todo pacote)

- **Branch nova a partir de `origin/main`**, um PR por pacote (higiene de branches do `CLAUDE.md`).
- **Fora do alcance desta máquina:** Docker, `test:db` e e2e. O gate de e2e e de invariantes é o CI. Por isso tudo o
  que muda comportamento de tela leva teste unitário e prova visual local (abaixo), e o merge espera o CI verde.
- **Prova visual antes do merge:** o app sobe local com 3 variáveis falsas do Supabase e abre as páginas públicas
  (login, vitrines). Toda peça nova nasce na **`/vitrine-sistema`** (rota pública, dados de exemplo), e é medida ali
  com Playwright (`getBoundingClientRect`/`getComputedStyle`), em escuro, claro e 390 px. Depois do merge e do deploy
  automático, a prova nas telas reais é feita na produção, só leitura, com a sessão do dono.
- **Definition of Done do `CLAUDE.md` (itens 1 a 18)** em todo PR: typecheck, lint, `pnpm test:unit` **completo**
  (conferir rodapé, `Errors` e exit code), fragmento em `.changes/` com `impacto: nada_mudou`, destino declarado
  ("núcleo"), Living System Checklist e mapa vivo quando criar peça nova, porta na navegação, i18n.
- **i18n:** todo texto novo passa por `t()` com chave em português e entrada em **espanhol** (o guarda
  `i18n-espanhol-cobre-a-tela` reprova sem ela) e em **inglês** (`lib/i18n/traducoes/en.json`).
- **Marca própria:** nenhum nome ou cor fixos. Cor de destaque do revendedor continua valendo (`cssDaMarca`).
- **Peso:** nada de fonte nova, imagem decorativa ou biblioteca de gráfico. Ícones próprios são SVG inline. Conteúdo
  do "Como funciona" carrega só ao abrir (importação dinâmica). Medir tamanho do build antes e depois de cada fase.
- Cores novas só por token em `app/globals.css`. Cada cor crua removida sai da lista que só encolhe.

## Pacotes

Legenda: **dep** = depende de; **prova** = como se verifica.

### Fase 1, fundação (sequencial, na mesma mão: mexe em arquivos compartilhados)

| # | Pacote | O que entrega | Arquivos principais | Prova |
|---|---|---|---|---|
| P1 | **Menu expandido + "Ver tudo" com nome** | Padrão passa a expandido (cookie `sidebar_collapsed === "1"` recolhe). Grupo mostra título. "Ver tudo em X" usa o ícone do grupo. Logotipo do topo só quando recolhido. Recolher continua escolha da pessoa. | `app/app/layout.tsx`, `components/shell/Sidebar.tsx`, `TopBar.tsx`, `tests/e2e/helpers/menu-expandido.ts`, `navegacao.spec.ts`, `tests/unit/sidebar-*.test.tsx` | unit; vitrine; e2e no CI (cabe em 1280×900 sem rolar) |
| P2 | **Ícones únicos por destino** | Tabela de ícones sem repetição (hoje FileText ×5, ChartBar ×4, ListChecks ×4, setas ×3). Cerca: teste reprova dois destinos com o mesmo ícone. | `lib/navigation/catalogo.ts`, `registry.ts`, `lib/ui/icons.ts`, teste novo | unit; folha de ícones na vitrine |
| P3 | **Corpo de página e larguras** | `CorpoDaPagina` com duas larguras (lista e formulário) e o espaçamento único. Resolve o `p-6` duplicado (`main` + página) e a margem de 42/53 px. | `app/app/_components/AppShell.tsx`, componente novo, adoção em Funis, Tarefas, Produtos, Faturamento | medição de bounding box em 1280/1440/2294 |
| P4 | **Cabeçalho de página padrão** (dep P3) | `CabecalhoDePagina`: título, descrição, ação principal, abas opcionais. Substitui os `<h1>` soltos. | `components/shell/CabecalhoDePagina.tsx` | vitrine; unit de acessibilidade (um `h1`, ordem de foco) |
| P5 | **"Como funciona"** (dep P4) | Botão no cabeçalho abre painel lateral com o que a tela mostra, o passo a passo e o termo técnico explicado. Conteúdo em registro por rota, carregado só ao abrir. Cerca: toda rota principal tem entrada. | `lib/ajuda/paginas.ts`, `components/shell/ComoFunciona.tsx`, 3 idiomas | vitrine; medir que o bundle inicial não cresce |
| P6 | **Peças base no estilo do piloto** | Painel (raio, filete, elevação), tabela, abas, campo, botão, `EmptyState` com desenho e uma ação, `Avatar` com selo de canal (reaproveita `components/inbox/visual`), `LinhaDoFunil` mini. Selo semântico por significado de cor. | `components/ui/*`, `components/empty/*`, `components/inbox/visual/*` | vitrine nos 2 temas; `tests/unit/tailwind-tokens.test.ts` |
| P7 | **Ícones: pastilha, duotone, conjunto próprio** (dep P2) | Pastilha de cor suave nas linhas dos hubs e nos vazios; peso duotone no item ativo; **8 a 10 ícones próprios** (Linha do Funil, agente de IA, passagem para humano, campanha, caso, etc.) no mesmo traço do Phosphor, registrados no mapa único. Prévia aprovada antes de entrar nas telas. | `components/icons/produto/*`, `lib/ui/icons.ts` | folha de prévia na vitrine; aprovação do dono |
| P8 | **Linguagem** | Glossário aplicado: Equipe (sem "roles/tenant"), Audit Log → histórico de ações, Billing → plano e cobrança, Trunk SIP → linha telefônica, "template" → "resposta rápida". Termo técnico migra para o "Como funciona". | `lib/navigation/catalogo.ts`, `lib/i18n/*`, telas | `i18n-*` e `navegacao-*` verdes; e2e que procuram rótulo antigo atualizados |
| P9 | **Vitrine do sistema** | Rota pública `/vitrine-sistema` com menu, cabeçalho, painéis, selos, vazios e ícones em dados de exemplo. É a bancada de prova das fases 1 e 2. | `app/vitrine-sistema/*` | abre em 3 viewports sem Supabase |

P9 é feito primeiro na prática (as demais peças nascem nela), mas o PR sai junto com P4.

### Fase 2, telas (um PR por tela ou molde; dependem de P1 a P8; podem andar em paralelo, cada uma em worktree próprio)

| # | Tela | Mudança | Prova |
|---|---|---|---|
| T1 | **Funis** | Cabeçalho + descrição; estado vazio com ação; orientação sai do texto miúdo; Linha do Funil mini em cada funil. | tela real |
| T2 | **Contatos, Empresas, Pessoas** | Avatar com selo de canal; coluna Etapa (Linha do Funil mini); filtros com rótulo; colunas vazias somem; painel. | tela real |
| T3 | **Campanhas** | Filtro só depois da primeira campanha; "Configuração" explicada. | tela real |
| T4 | **Agenda** | Aviso do Google sai de cima do título (vira linha discreta com a ação "Conectar"), sem URL de retorno na tela; um só estado vazio. | tela real |
| T5 | **Tarefas, Produtos, Respostas rápidas** | Largura padrão; cabeçalho; vazio com ação; botão ao lado do título. | tela real |
| T6 | **Equipe** | Sem jargão; avatar/iniciais; selo de papel por cor com significado; "Aceito" verde; convites em painel. | tela real |
| T7 | **Conexões** | O número conectado e a saúde primeiro; avisos de integração abaixo e recolhíveis. | tela real |
| T8 | **Desempenho, Faturamento, Honorários, Análise** | Resumo no topo; números em tabela comparativa; zero vira frase; parágrafos longos vão para o "Como funciona". | tela real |
| T9 | **Auditoria e Atividades** | Linha legível ("Ana mudou o funil de X"), detalhe técnico em gaveta; exportar CSV mantido. | tela real |
| T10 | **Webhooks, Importações, Propostas, Comandas, Chamadas, Radar, Prospecção** | Mesmo molde de T5; Webhooks é o modelo de vazio. | tela real |
| T11 | **Hubs (CRM, IA, Análise, Configurações)** | Lista em painel com ícone, nome, descrição e seta; títulos de grupo reais. | tela real |
| T12 | **Configurações internas (24 telas)** | Molde `PaginaDeConfiguracao`; adoção por tela. | amostra + unit |
| T13 | **IA internas (23 telas)** | Molde equivalente; abas e detalhe do agente em 390 px. | amostra + unit |
| T14 | **Admin da plataforma** (`components/admin`, 30 arquivos) | Mesmo cabeçalho e painel. | tela real |
| T15 | **Login, criar conta, get-started, onboarding, páginas legais** | Um título só; frase de valor; botão com contraste; onboarding nos painéis do piloto. | local (login/cadastro públicos) + CI (e2e fresco) |
| T16 | **Inbox: acabamento** | Aba "Fechadas" cortada; bolinha de feedback sobre "Enviar"; barra de ações em 390 px; rótulos da Linha do Funil sem colisão; nome da organização sem quebrar em 3 linhas. | vitrine + tela real |

### Fase 3, transversais

| # | Pacote | O que entrega | Prova |
|---|---|---|---|
| X1 | **Celular** | `MobileSidebar` com nome; tabelas viram lista em 390 px; alvos de toque ≥ 44 px; sem estouro horizontal. | Playwright em 390 na vitrine; tela real com janela estreitada pelo dono |
| X2 | **Modo claro** | Profundidade (filete + sombra suave), selos e vazios nos dois temas, contraste ≥ 4,5:1 medido. | medição por ferramenta |
| X3 | **Cores cruas → tokens** | 403 usos de paleta Tailwind crua em 69 arquivos e 48 hex trocados por token; cerca "só encolhe". | `tests/unit/branding.test.ts` e cerca nova |
| X4 | **Peso** | Abrir o pacote do hub CRM (1,17 MB de JS, 104 requisições): o que pode ser carregado só sob demanda. Orçamento de tamanho no `perf.yml` (hoje só relata). | `next build` antes/depois, mesma máquina |
| X5 | **Documentação e prova** | `DESIGN.md` do Impeccable; mapa vivo em `docs/architecture/`; `docs/testing/user-journey-map.md`; fragmentos `.changes/`; evidência visual anexada a cada PR. | `pnpm release:conferir` |

## Ordem de execução

1. **P9 + P1 + P2** (menu e ícones únicos) — o que o dono mais quer ver, e destrava o resto.
2. **P3 + P4 + P5** (corpo, cabeçalho, "Como funciona") com T1 e T5 como primeiros adotantes.
3. **P6 + P7 + P8** (peças base, ícones próprios, linguagem). A prévia dos ícones próprios para aprovação sai aqui.
4. **T2 a T16 em paralelo** (agentes em worktrees próprios, cada um com o seu PR; revisão e prova minhas).
5. **X1 a X5** fecham, com X4 (peso) medido já na primeira fase para ter linha de base.

## Riscos conhecidos

- **e2e que dependem do menu recolhido** (`navegacao.spec.ts`, helper `menu-expandido.ts`): invertem de sentido. Só o CI roda.
- **Guarda de dobra do menu** (cabe em 1280×900 sem rolar): menu expandido era o padrão antigo e passava; reconferir com os grupos de hoje.
- **Rótulos renomeados** podem estar citados em e2e, nos docs e no `lib/onboarding/o-que-mais-existe.ts`.
- **Merge na `main`** dispara deploy automático em produção; o classificador do modo automático pede confirmação do dono
  para `gh pr merge`. Cada PR só pede merge com CI verde.
- **Marca própria:** pastilhas e selos precisam sobreviver à troca da cor de destaque.
