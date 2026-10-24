# Assistente de criação de agente — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem cria o primeiro agente responde cinco perguntas guiadas (negócio, modelo, tom, quando chamar uma pessoa, teste) e sai com um agente rascunho montado, com saída sempre aberta para o editor completo.

**Architecture:** Conteúdo puro e versionado em `lib/ai/agents/assistente/` (catálogo de ramos, composição do agente, capacidades por modelo), testado sem tela. Uma tela cliente (`AssistenteDeAgente`) em `/app/ai/agents/new?modo=assistente` monta o payload e o salva pela MESMA `createMcpAgentAction` do `AgentForm`; o editor completo continua em `/app/ai/agents/new`. O modelo "Atendimento" entra em `modelos.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript estrito, Tailwind 4 (tokens em `app/globals.css`), Zod, Vitest + Testing Library, Playwright (só o CI roda).

**Spec:** `docs/superpowers/specs/2026-10-24-assistente-de-agente-design.md` (decisões fechadas ao fim). Mockup: `docs/superpowers/specs/2026-10-24-assistente-de-agente-mockup.html`, opção A.

## Global Constraints

- Português do Brasil na tela; todo texto novo por `t()` com **es** em `lib/i18n/dicionario.ts` e **en** em `lib/i18n/traducoes/en.json` (guarda `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`). Conteúdo de modelo e ramo vive nos **3 idiomas** (`IDIOMAS_DO_AGENTE`: `pt-BR`, `es`, `en`) dentro de `lib/ai/agents/`.
- Nunca o nome da marca no texto ("o sistema"). Brilho e cor via tokens (`--color-ia`, `--color-ia-fundo`), nunca hex fixo (`tests/unit/branding.test.ts`, `tests/unit/tailwind-tokens.test.ts`).
- `DESIGN.md`: sem texto em gradiente, sem vidro/desfoque decorativo, painel não vai dentro de painel, uma cor = um significado. **Animação nunca em laço sem motivo**: pulso único; "digitando…" só enquanto a resposta real vem; `prefers-reduced-motion: reduce` mostra o mesmo estado, parado.
- Só **admin** cria agente (como `new/page.tsx` já exige). Nada de `console.log`. Zod em todo input externo. Sem `getSession()`.
- O modelo **não inventa fato do negócio** (preço, horário, endereço): regra de `modelos.ts`, vale para os ramos. `restrict_topics` nasce `false`.
- Sem mudança de schema: **sem migration**. Fragmento em `.changes/` (`capacidade_nova`).
- Windows: typecheck por `node --max-old-space-size=12288 node_modules\typescript\bin\tsc --noEmit -p tsconfig.typecheck.json`; arquivos do repo têm LF no índice e CRLF na cópia de trabalho (editar com ferramenta de edição, não com script que regrave fim de linha).
- Capacidades por modelo (decisão do dono): `vendas` e `agendamento` → pacote `vender`; `suporte` e `atendimento` → pacote `atender`. `ligarPacote` já exclui capacidade `critico`.

## Review Focus

1. **Instalação sem chave de IA ou sem modelo no catálogo.** O assistente não quebra: a estação 5 explica, linka "Chaves de acesso à IA", e as respostas sobrevivem à ida e volta (sessionStorage). Teste na Task 5.
2. **Ramo da lista sem texto próprio, "Outro" e "Pular".** Compõem exatamente o que o modelo sozinho comporia (vocabulário neutro, sem bloco de ramo). Teste na Task 3.
3. **Idioma es/en.** Todo texto do ramo e do modelo sai no idioma pedido; nenhum cai em português. Teste na Task 2/3.
4. **Texto longo ou estranho no nome do negócio.** O que entra em abertura e instruções respeita `LIMITES_DO_PERFIL` e o limite de 20.000 caracteres; nome de negócio com 500 caracteres é cortado, não derruba a criação. Teste na Task 3.
5. **Duplo clique em "Criar".** Um único agente nasce (botão desabilitado enquanto salva). Teste na Task 5.
6. **Recarregar a página no meio.** Volta à mesma estação com as mesmas respostas; "Começar de novo" limpa. Teste na Task 5.

---

### Task 1: Modelo "Atendimento" e capacidades por modelo

**Files:**
- Modify: `lib/ai/agents/modelos.ts` (adiciona `"atendimento"` a `IDS_DE_MODELO` e a entrada em `MODELOS_DE_AGENTE`, 3 idiomas)
- Create: `lib/ai/agents/capacidades-do-modelo.ts`
- Test: `lib/ai/agents/capacidades-do-modelo.test.ts`; ajusta `lib/ai/agents/modelos.test.ts` se contar 3 modelos
- Modify: `lib/ai/agents/first-publication.ts` (onboarding usa as capacidades do ramo escolhido; sem ramo, continua `capacidadesPadraoDoOnboarding()`)
- Modify: `app/app/ai/agents/[id]/_components/ModelosDoAgente.tsx` (grade passa a 4 cartões: `sm:grid-cols-2 lg:grid-cols-4`)

**Interfaces:**
- Produces:
  - `PACOTE_DO_MODELO: Record<IdDoModelo, "vender" | "atender">`
  - `capacidadesDoModelo(id: IdDoModelo): string[]` — ids em ordem do catálogo, via `ligarPacote([], catalogoComHandler(), PACOTE_DO_MODELO[id])`
  - `modeloMexeNoFunil(id: IdDoModelo): boolean` — `true` sse o conjunto contém `crm_move_lead_stage`
  - `fraseDoQueFaz(id: IdDoModelo, idioma: IdiomaDoAgente): string` — uma frase sem a palavra "capacidade"

- [ ] **Step 1: Write the failing test** em `capacidades-do-modelo.test.ts`: (a) `capacidadesDoModelo("vendas")` e `("agendamento")` `toEqual(capacidadesPadraoDoOnboarding())`; (b) `suporte` e `atendimento` `toEqual(ligarPacote([], catalogoComHandler(), "atender"))`; (c) para `suporte` e `atendimento`, nenhum dos ids `crm_create_lead`, `crm_update_lead`, `crm_move_lead_stage` está no conjunto, e `modeloMexeNoFunil` é `false`; para `vendas` e `agendamento` é `true`; (d) nenhuma capacidade de risco `critico` em nenhum conjunto; (e) `length <= TETO_TOOLS_POR_AGENTE`; (f) `fraseDoQueFaz` existe nos 3 idiomas para os 4 modelos e não contém "capacidade"/"capacidad"/"capabilit".
- [ ] **Step 2: Run** `pnpm vitest run lib/ai/agents/capacidades-do-modelo.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `capacidades-do-modelo.ts` e a entrada `atendimento` em `modelos.ts`. O modelo **Atendimento** é triagem e primeiro contato: entende o assunto, coleta os dados mínimos e passa para uma pessoa; **não** vende nem agenda por conta própria; `tom: "normal"`; `nome: "Atendente de triagem"`. As frases de `fraseDoQueFaz` vêm de `PACOTES[].explicacao` reescritas por modelo (ex.: Vendas: "responder, registrar a oportunidade e mover o cliente no funil"). O texto do Atendimento vai ao dono para revisão antes do merge (ver Task 10).
- [ ] **Step 4: Edit `first-publication.ts`** para `tool_ids: selection ? [] : (perfil?.ramo ? capacidadesDoModelo(...) : capacidadesPadraoDoOnboarding())`. Se `ColunasDoModelo` não carrega o id do ramo, passe-o como parâmetro novo opcional `ramo?: IdDoModelo` e ajuste os dois chamadores (`grep -rn "publishFirstVersion"`). Teste: `lib/ai/agents/first-publication.test.ts` (ou o existente que cobre a publicação) ganha o caso "ramo suporte grava `atender`, sem ramo grava `vender`".
- [ ] **Step 5: Run** `pnpm vitest run lib/ai/agents` → PASS. **Commit** `feat(agentes): modelo Atendimento e capacidades por modelo`.

### Task 2: Catálogo de ramos

**Files:**
- Create: `lib/ai/agents/assistente/ramos.ts`
- Test: `lib/ai/agents/assistente/ramos.test.ts`

**Interfaces:**
- Consumes: `IdDoModelo`, `IdiomaDoAgente`.
- Produces:
  - `type TextoDoRamo = { pessoa: string; compromisso: string; abertura: string; nuncaPrometer: string[]; chamarPessoaQuando: string; perguntasDeTeste: string[]; motivoDoModelo: string }`
  - `type Ramo = { id: string; grupo: IdDoGrupo; nome: Record<IdiomaDoAgente, string>; modeloRecomendado: IdDoModelo; regulado: boolean; texto?: Record<IdiomaDoAgente, TextoDoRamo> }`
  - `GRUPOS_DE_RAMO: readonly { id: IdDoGrupo; nome: Record<IdiomaDoAgente, string> }[]` (9 grupos do spec)
  - `RAMOS: readonly Ramo[]` — os ~40 do spec; `ramoPorId(id: string): Ramo | undefined`
  - `RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE` = `clinica-medica, clinica-odontologica, estetica, psicologia, loja-fisica, ecommerce, imobiliaria, infoprodutor, advocacia, salao, restaurante, contabilidade` (só esses carregam `texto`)
  - `buscarRamos(consulta: string, idioma: IdiomaDoAgente): Ramo[]` — ignora acento e caixa; consulta vazia devolve todos na ordem do catálogo

- [ ] **Step 1: Write the failing tests**: todo ramo tem `nome` nos 3 idiomas não vazio; ids únicos e em kebab-case; `modeloRecomendado` é um `IdDoModelo` válido (conforme a tabela do spec); `regulado` é `true` em saúde, advocacia, contabilidade, crédito e seguros; só os ids de `RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE` têm `texto`, e esses têm os 3 idiomas com `nuncaPrometer.length >= 1` e `perguntasDeTeste.length >= 2`; `buscarRamos("odonto", "pt-BR")` acha `clinica-odontologica`; `buscarRamos("clinica", "pt-BR")` acha as duas clínicas (acento e caixa ignorados); `buscarRamos("zzzz", "en")` é `[]`; texto de ramo regulado não promete resultado ("garant", "cura", "100%" ausentes no `nuncaPrometer` dos três idiomas é o oposto: eles aparecem como proibição — teste só confere que o bloco de ramo regulado menciona uma restrição).
- [ ] **Step 2: Run** `pnpm vitest run lib/ai/agents/assistente/ramos.test.ts` → FAIL.
- [ ] **Step 3: Implement** o catálogo. Os textos dos 12 ramos são redação cuidadosa: a pessoa e o compromisso mudam (paciente/consulta, cliente/visita, aluno/aula experimental); o `nuncaPrometer` de saúde diz "resultado de tratamento, diagnóstico e preço sem avaliação"; o de advocacia, "resultado de causa, prazo de processo e honorários sem análise"; o de contabilidade, "valores de imposto sem análise". Sem fato do negócio (sem preço, endereço, horário).
- [ ] **Step 4: Run** → PASS. **Commit** `feat(agentes): catálogo de ramos do assistente`.

### Task 3: Composição do agente

**Files:**
- Create: `lib/ai/agents/assistente/compor.ts`
- Test: `lib/ai/agents/assistente/compor.test.ts`

**Interfaces:**
- Consumes: `aplicarModelo`, `instrucoesComNegocio`, `ramoPorId`, `capacidadesDoModelo`, `modeloMexeNoFunil`, `LIMITES_DO_PERFIL`.
- Produces:
  - `type RespostasDoAssistente = { idioma: IdiomaDoAgente; ramoId: string | null; modeloId: IdDoModelo; negocio: string; tom: TomDoAgente; atalhos: AtalhoDeAbertura[]; chamarPessoaQuando: string | null }` (`null` = usar a sugestão do ramo)
  - `type AtalhoDeAbertura = "nome-do-cliente" | "avisar-que-e-ia" | "horario"`
  - `type AgenteComposto = CamposDoModelo & { tool_ids: string[]; usa_funil: boolean }`
  - `comporAgente(r: RespostasDoAssistente): AgenteComposto`
  - `sugestaoDe(r: RespostasDoAssistente, campo: "abertura" | "chamarPessoaQuando"): string` — o texto que "Voltar à sugestão" restaura

- [ ] **Step 1: Write the failing tests** (nomes literais): `ramo nulo compõe exatamente aplicarModelo + capacidades do modelo` (para os 4 modelos × 3 idiomas: `comporAgente({ramoId:null,negocio:"",tom: <tom do modelo>,atalhos:[],chamarPessoaQuando:null,...})` deep-equals `{...aplicarModelo(id,idioma), tool_ids: capacidadesDoModelo(id), usa_funil: modeloMexeNoFunil(id)}`); `ramo sem texto próprio compõe como ramo nulo` (ex.: `fisioterapia`); `ramo com texto acrescenta o bloco "Neste negócio" às instruções e usa a abertura do ramo`; `o nome do negócio entra na abertura e nas instruções`; `atalho avisar-que-e-ia acrescenta a frase no idioma certo`; `restrict_topics é sempre false`; `sugestaoDe devolve o mesmo texto que comporAgente usaria sem edição`; para todo (ramo com texto × modelo × idioma) com `negocio` de 500 caracteres: `profile_welcome.length <= LIMITES_DO_PERFIL.boasVindas`, `system_prompt.trim().length <= 20000`, e `versionCreateSchema.safeParse` de um payload mínimo montado com o composto passa nos campos de perfil.
- [ ] **Step 2: Run** `pnpm vitest run lib/ai/agents/assistente/compor.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Cortar o nome do negócio em 80 caracteres (`trim`) antes de usar. O bloco de ramo é anexado depois de `instrucoesComNegocio`. Abertura com nome do negócio: modelos de frase por idioma dentro do ramo (`abertura` com marcador literal `{negocio}` substituído; sem negócio, o ramo cai numa abertura sem o marcador). Nenhum import de React nem de Supabase neste módulo.
- [ ] **Step 4: Run** → PASS. **Commit** `feat(agentes): composição do agente do assistente`.

### Task 4: Padrões de IA no servidor e payload de criação

**Files:**
- Create: `lib/ai/agents/padroes-de-ia.ts`, `lib/ai/agents/assistente/payload.ts`
- Test: `lib/ai/agents/padroes-de-ia.test.ts`, `lib/ai/agents/assistente/payload.test.ts`

**Interfaces:**
- Consumes: `escolherModeloNoCatalogo`, `chaveDePlataforma`, `CHAVE_DA_INSTALACAO`-equivalente (`credential_id: null` = chave da instalação), `agentMcpCreateSchema`, `AgenteComposto`.
- Produces:
  - `type PadroesDeIa = { ok: true; provider: string; model: string; credentialId: string | null } | { ok: false; motivo: "sem_chave" | "sem_modelo"; provider: string; chaveEmVerificacao?: boolean }`
  - `resolverPadroesDeIa(admin: SupabaseClient, orgId: string): Promise<PadroesDeIa>` — provedor de `organizations.settings.llm.provider` (padrão `anthropic`, como `provedorDaInstalacao`), credencial validada ativa da organização, senão chave da instalação (`chaveDePlataforma(provider)`), modelo por `escolherModeloNoCatalogo`. **Nunca lança.** Mesma régua do `publishFirstVersion` (não o altera).
  - `payloadDeCriacao(a: AgenteComposto, padroes: Extract<PadroesDeIa,{ok:true}>, opcoes: { nome: string; funilPadraoId: string | null }): z.input<typeof agentMcpCreateSchema>` — `name`, `priority: 0`, `version` com `system_prompt`, perfil, `provider`, `model`, `credential_id`, `tool_ids`, `pipeline_ids: a.usa_funil && funilPadraoId ? [funilPadraoId] : []`, e os mesmos valores padrão do `AgentForm` (`max_steps` 10, `token_budget` 50_000, `cost_budget_cents` 50, `history_message_window` 20, `history_token_window` 8_000, `handoff_keywords` as três frases padrão, `handoff_tool_enabled` true, `channel_session_id` omitido).

- [ ] **Step 1: Write the failing tests.** `padroes-de-ia.test.ts` com um `admin` falso: credencial validada → `credentialId` dela; sem credencial e com `chaveDePlataforma` → `credentialId: null`; sem nenhuma → `{ok:false,motivo:"sem_chave"}`; credencial colada e ainda não validada → `chaveEmVerificacao: true`; catálogo vazio → `sem_modelo`; erro de banco → `ok:false`, sem lançar. `payload.test.ts`: o payload de cada um dos 4 modelos passa em `agentMcpCreateSchema.safeParse`; `usa_funil` liga `pipeline_ids` só quando há funil padrão; Suporte e Atendimento saem com `pipeline_ids: []`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Os valores padrão do `AgentForm` ficam numa constante exportada `PADROES_DE_CRIACAO` em `payload.ts`, e um teste de cerca lê `AgentForm.tsx` e falha se `max_steps ?? 10` ou os outros números divergirem dela (para a constante não envelhecer sozinha). **Step 4: Run** → PASS. **Commit** `feat(agentes): padrões de IA e payload de criação do assistente`.

### Task 5: A tela do assistente

**Files:**
- Create: `app/app/ai/agents/new/_assistente/AssistenteDeAgente.tsx` (máquina de estações + persistência), `LinhaDasEstacoes.tsx`, `EstacaoNegocio.tsx`, `EstacaoModelo.tsx`, `EstacaoTom.tsx`, `EstacaoPessoa.tsx`, `EstacaoTeste.tsx`, `PreviaFixa.tsx`
- Modify: `app/app/ai/agents/new/page.tsx` (lê `searchParams.modo`; `assistente` renderiza o assistente com `padroes` e `funilPadraoId` resolvidos no servidor; qualquer outro valor, o `AgentForm` de hoje)
- Modify: `app/globals.css` (`.aura-ia`, `.pulso-de-estacao`, com o mesmo cuidado de `.card-pulse`)
- Test: `tests/unit/assistente-de-agente.test.tsx`

**Interfaces:**
- Consumes: `comporAgente`, `sugestaoDe`, `RAMOS`, `buscarRamos`, `GRUPOS_DE_RAMO`, `payloadDeCriacao`, `fraseDoQueFaz`, `createMcpAgentAction`, `PadroesDeIa`.
- Produces: `AssistenteDeAgente(props: { padroes: PadroesDeIa; funilPadraoId: string | null; idioma: IdiomaDoAgente })`; chave de persistência `zapsales.assistente-de-agente.v1` em `sessionStorage` com `{ estacao: 1|2|3|4|5; respostas: RespostasDoAssistente; abertura: string | null; chamarPessoa: string | null }`.

- [ ] **Step 1: Write the failing tests** (`tests/unit/assistente-de-agente.test.tsx`, mocks de `createMcpAgentAction` e `next/navigation`): `a estação 1 lista os grupos e filtra por digitação`; `escolher um ramo e continuar leva à estação 2 com o modelo recomendado marcado e o motivo`; `"Outro" e "Pular" recomendam Atendimento com vocabulário neutro`; `na estação 3 editar a frase de abertura e clicar "Voltar à sugestão" restaura o texto de sugestaoDe`; `"Prefiro o editor completo" grava o estado e navega para /app/ai/agents/new`; `com padroes.ok=false a estação 5 mostra o link para as chaves e não chama createMcpAgentAction, e as respostas sobrevivem a desmontar e montar de novo`; `com padroes.ok=true, Criar chama createMcpAgentAction uma vez mesmo com dois cliques e navega para /app/ai/agents/<id>`; `recarregar volta à estação salva; "Começar de novo" limpa`; a prévia das estações 1–4 **não** chama nenhuma rota de IA (`apiClient` mock não é chamado).
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/assistente-de-agente.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Layout em `CorpoDaPagina` largura `formulario` com `CabecalhoDePagina` ("Novo agente") e `ComoFunciona`; a Linha das Estações reusa o vocabulário visual de `LinhaDoFunil` (passadas cheias, atual maior, futuras vazadas); a prévia usa `.aura-ia` (brilho estático) e `.pulso-de-estacao` (uma vez); uma coluna abaixo de 1024 px, prévia sob a pergunta; alvos de toque ≥ 44 px. Estação 5: ao entrar, se `padroes.ok`, salva o rascunho (`createMcpAgentAction`) e abre o `TestPanel` existente apontado para o agente criado — **reuso do `TestPanel`**, sem motor de teste novo; se não, mostra o aviso com link e botão "Voltar". Sempre visível: "Prefiro o editor completo". **Step 4: Run** → PASS. **Commit** `feat(agentes): assistente de criação passo a passo`.

> Verificar na execução: se `TestPanel` exige `AgentRow`/`AgentVersionRow` completos, o assistente navega ao agente criado em `/app/ai/agents/<id>` e abre o painel de teste por âncora, em vez de montar o painel dentro da estação 5. A estação 5 então termina em "Criar e testar" → redireciona. Esta é a chamada do construtor.

### Task 6: Editor completo recebe o estado do assistente e o convite

**Files:**
- Modify: `app/app/ai/agents/[id]/_components/AgentForm.tsx` (prop opcional `inicial?: Partial<CamposDoModelo> & { tool_ids?: string[]; pipeline_ids?: string[] }` só em `mode: "create"`, aplicada no estado inicial; a galeria `ModelosDoAgente` passa a aplicar também `tool_ids` via `capacidadesDoModelo`; convite "Prefere ser guiado? Abrir o assistente" no cabeçalho de criação)
- Create: `app/app/ai/agents/new/_assistente/EditorComEstadoDoAssistente.tsx` (lê e consome a chave de `sessionStorage`, monta `AgentForm` com `inicial`)
- Modify: `app/app/ai/agents/new/page.tsx` (usa o wrapper no modo editor)
- Test: `tests/unit/agent-form-estado-do-assistente.test.tsx`

**Interfaces:** Consumes `comporAgente`, `capacidadesDoModelo`. Produces: `AgentForm` `CreateProps.inicial`.

- [ ] **Step 1: Write the failing tests:** `AgentForm create com inicial mostra o nome, o prompt e as capacidades recebidos`; `escolher um modelo na galeria liga as capacidades do modelo (suporte não inclui crm_move_lead_stage)`; `o convite "Abrir o assistente" aponta para /app/ai/agents/new?modo=assistente`; `o wrapper consome a chave do sessionStorage uma vez`. Os testes existentes `tests/unit/agent-form-*.test.tsx` continuam verdes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** com mudança mínima em `AgentForm.tsx` (o arquivo tem 1.975 linhas: não reestruturar). **Step 4: Run** `pnpm vitest run tests/unit/agent-form-estado-do-assistente.test.tsx tests/unit/agent-form-callback-default.test.tsx tests/unit/agent-form-prompt-nao-trunca.test.tsx` → PASS. **Commit** `feat(agentes): editor completo recebe o estado do assistente`.

### Task 7: Portas de entrada

**Files:**
- Modify: `app/app/ai/agents/page.tsx:80` e `app/app/ai/agents/_components/AgentsList.tsx:61` (`href="/app/ai/agents/new?modo=assistente"`)
- Modify: `tests/unit/navegacao-completude.test.ts` se a allowlist de `/app/ai/agents/new` precisar de nota do modo
- Test: `app/app/ai/agents/_components/AgentsList.test.tsx` (ou o arquivo vizinho existente): o botão "Novo agente" aponta para o assistente.

- [ ] **Step 1: Write the failing test.** **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm vitest run app/app/ai/agents tests/unit/navegacao-completude.test.ts` → PASS. **Commit** `feat(agentes): Novo agente abre o assistente`.

### Task 8: Traduções

**Files:** Modify `lib/i18n/dicionario.ts` (es), `lib/i18n/traducoes/en.json` (en) para toda string nova de `t()` das Tasks 5–7.

- [ ] **Step 1:** `pnpm vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts` → FAIL listando as chaves novas. **Step 2:** adicionar cada chave em es e en. **Step 3:** rodar de novo → PASS. **Commit** `feat(agentes): traduções do assistente`.

### Task 9: Prova pela tela

**Files:**
- Create: `tests/e2e/agente-assistente-pela-tela.spec.ts`; modify `.github/workflows/e2e.yml` (a spec entra numa `SPECS_PARTE_*`; guarda `tests/unit/e2e-cobertura-completa.test.ts`)
- Create: `docs/testing/evidencias/assistente-de-agente/` (prints 1440 e 390, claro e escuro, "reduzir movimento")
- Modify: `docs/testing/user-journey-map.md` (jornada P0 "criar o primeiro agente pelo assistente")

- [ ] **Step 1: Write the spec** (CI-only): login como admin; `/app/ai/agents` → "Novo agente"; escolher "Clínica odontológica"; ver "Agendamento" recomendado com o motivo; editar a abertura; "Voltar à sugestão"; sair para o editor completo e ver o estado levado; voltar; criar; chegar ao agente rascunho. Cenário sem chave: aviso e link.
- [ ] **Step 2: Prova local** pela vitrine sem banco (receita em `reference_vitrine_local_sem_banco.md`): subir página de vitrine temporária com os componentes reais e `fetch` interceptado; medir `getBoundingClientRect` dos alvos de toque a 390 px e conferir o estilo do brilho com `getComputedStyle`; capturar prints; **remover a vitrine antes do commit** e reverter o `AGENTS.md` que o `next dev` reescreve.
- [ ] **Step 3: Commit** `test(agentes): e2e e evidências do assistente`.

### Task 10: Documentação, fragmento e conferência

**Files:** Create `.changes/assistente-de-criacao-de-agente.md` (`impacto: capacidade_nova`, `secao: adicionado`; menciona que Suporte e Atendimento nascem sem poder de mexer no funil e que o onboarding por ramo acompanha); modify `DESIGN.md` (peça "Assistente", regra do brilho e do pulso único); modify `lib/ajuda/conteudo/agentes.ts` (parágrafo de "Como funciona" do assistente, 3 idiomas); `docs/superpowers/specs/...-design.md` fica como está.

- [ ] **Step 1: Escrever os arquivos.** **Step 2: Conferir** `pnpm typecheck` (comando do Windows acima), `pnpm lint`, `pnpm vitest run lib/ai/agents tests/unit/assistente-de-agente.test.tsx tests/unit/agent-form-estado-do-assistente.test.tsx tests/unit/branding.test.ts tests/unit/tailwind-tokens.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/navegacao-completude.test.ts`, todos verdes; `pnpm test:unit` completo e comparar o rodapé com o `grep FAIL` como o CLAUDE.md manda (os 26 vermelhos do Windows já existem na `main`; o CI Linux é o juiz). **Step 3: Commit** `docs(agentes): fragmento, DESIGN.md e ajuda do assistente`.
- [ ] **Step 4: Revisão do dono.** Mostrar ao dono o texto do modelo Atendimento e dos 12 ramos (pt-BR) antes do merge.

### Task 11: PR, CI e produção

- [ ] **Step 1:** `git fetch origin && git merge origin/main` na branch; empurrar; abrir o PR com `mattpocock-skills:pr` (árvore de arquivos, evidência antes/depois, "merge danger", fragmento).
- [ ] **Step 2:** aguardar o CI; se um e2e falhar nas listas, `gh run rerun <id> --failed` antes de suspeitar (memória do projeto).
- [ ] **Step 3:** mesclar quando verde; o deploy é automático pela `main` (implantar.yml); confirmar o domínio respondendo 307 e a prova pela tela em produção com org temporária (o dono digita a senha; ssh/scp só com o prefixo exato da memória), apagando a org e o usuário temporários depois.

---

## Desvios da execução (o que o código fez diferente do plano, e por quê)

- **Task 1, passo 4 (onboarding):** não foi feito. A tela do onboarding promete o pacote `vender` para o agente que ele cria, então o Atendimento ficou **fora** do onboarding (`IDS_DE_MODELO_DO_ONBOARDING`) em vez de mudar o onboarding.
- **Capacidades no servidor:** `capacidadesDoModelo` lê os handlers das ferramentas e não pode ir ao navegador. A página calcula `capacidadesPorModelo()` e entrega pronto à tela e ao editor; a frase e o mapa de pacotes moram em `o-que-o-modelo-faz.ts`. Cerca: `tests/unit/assistente-de-agente-sem-servidor-no-cliente.test.ts`. `comporAgente` e `payloadDeCriacao` mudaram de assinatura por isso.
- **Task 3:** `RespostasDoAssistente` ganhou `abertura`, `chamarPessoaQuando` e `usarNomeDoCliente`; o atalho "horário" saiu (não dá para inventar horário), ficaram "avisar que é uma IA" e "citar o nome do cliente". O bloco do ramo é **anexado** às instruções (não há espaços de substituição no modelo). `Ramo` ganhou `tomRecomendado`.
- **Task 4:** sem `PADROES_DE_CRIACAO`: o contrato (`agentMcpCreateSchema`) já aplica os mesmos defaults que o editor.
- **Task 5:** o teste real acontece na tela do agente (`?aba=test`), não dentro da estação 5; `AgentTabs` ganhou `abaInicial`. A chave do `sessionStorage` é `assistente-de-agente.v1` (a catraca de marca reprova "zapsales" no código).
- **Task 6:** a ponte para o editor usa `?de=assistente` (sem o parâmetro, o editor abre vazio, mesmo que haja estado guardado) e só leva o estado se a pessoa respondeu alguma coisa.
- **Brilho:** usa `--color-ia` (a cor do papel IA, fixa), não a de destaque do revendedor.

