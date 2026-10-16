# Mapas de arquitetura

## Regra única deste diretório: o JSON é a FONTE; o HTML é DERIVADO

Cada mapa tem um `*.json` (fonte) e pode ter um `*.html` (render).

> **Se os dois divergirem, o HTML é que está errado.** Nunca edite o HTML à mão: regenere-o a partir do
> JSON.

O motivo está aqui e não num handoff porque é aqui que a decisão errada seria tomada. O HTML é o
formato mais fácil de abrir e editar — e **o formato mais fácil de editar é o que envelhece mentindo**:
uma correção feita nele parece funcionar, some na próxima geração, e nesse intervalo a fonte deixou de
ser fonte sem ninguém decidir isso.

## Mapas

| arquivo | escopo |
|---|---|
| `conversoes-de-anuncios.architecture.json` | venda, entrega, protocolo assíncrono, pendências e reprocessamento |
| `prospeccao-nativa.architecture.json` | busca comercial, fila gradual, configuração conversacional persistente, sandbox e assistente de voz opcional |
| `pre-go-live-whatsapp.architecture.json` | modo de teste por canal (issue #573): configuração administrativa, gate compartilhado, releitura no envio e validação pelo Inbox |
| `app-da-meta-da-instalacao.architecture.json` | App da Meta da instalação (issue #850, migration 0257) — 10 peças, 12 arestas; a tela `/admin/meta` que grava a chave e mostra o token uma vez, o resolvedor que serve o par inteiro de UMA fonte (banco, com o `.env` de reserva) e por que Conexões só mostra o token quando ele veio do `.env` |
| `modelos-da-api-oficial.architecture.json` | modelos da API Oficial (issue #6) — 13 peças, 18 arestas; o editor e a rota usam o MESMO schema, a linha do espelho grava o que a Meta devolveu (não o pedido), e o webhook avisa na Central uma vez por mudança, com a trava no valor lido; o laço de retorno volta da Central para a lista de modelos |
| `agenda-google-sync.architecture.json` | fontes/destino por dono, tupla estável, três vias, claim/CAS e cobertura de calendário; presença e LGPD integradas |
| `encerramento-atendimento.architecture.json` | conversa/demanda independentes, mutex no inbound, origem imutável dos jobs, memória vigente e guardas antes dos efeitos |
| `agent-turn.workflow.json` | Conversador e Operador, entregas determinísticas de Meet e respostas aprovadas; revisão humana ligada ao mesmo core e à cadeia de envio. O JSON é a fonte atual; o HTML é um render anterior |
| `crm-vivo.architecture.json` | subsistema **CRM Vivo** — 24 peças, 44 arestas, 6 faixas |
| `atualizacao-self-service.architecture.json` | botão de atualizar pela UI — `agent.sh`/`update.sh` (host) ↔ rota do agente ↔ tabelas de instância ↔ rodapé/tela |
| `gestao-funis.architecture.json` | gestão de funis pela tela do Kanban — 18 peças, 30 arestas; as três dependências do funil e por que só uma o banco defende |
| `ia-360-organizar.architecture.json` | IA 360 W4 — o agente organiza a operação: 18 peças, 24 arestas; uma regra por operação servindo REST e MCP, a autoria da configuração ao lado do estado, e **quatro não-ligações declaradas** (autoria não aponta para `ai_agents`; o agente não escreve regra automática, nem resposta pronta, nem o vocabulário canônico de marcadores) |
| `ia-360-retencao.architecture.json` | pacote **Não perder o cliente** (IA 360 · wave 2) — 26 peças, 36 arestas; a regra única do retorno para o motor e para a capacidade configurável, e por que cancelado precisou deixar de ser igual a disparado |
| `escalacao-ciclo-humano.architecture.json` | o ciclo agente ↔ pessoa — 30 peças, 38 arestas; as **três** travas da passagem (só uma era solta) e por onde a decisão da pessoa volta ao contexto do turno |
| `central-avisos.architecture.json` | projeção em lote sob RLS, contexto real e resolver/reabrir independentes |
| `followup-dossie.architecture.json` | dossiê do follow-up e intervenção humana — 20 peças, 30 arestas; as **duas metades** da corrida contra o motor (o tick reclamado e o turno em voo) e quatro não-ligações declaradas |
| `followup-duplicar.architecture.json` | duplicar e renomear um fluxo — cópia sempre rascunho, nome único na org, o mesmo PATCH de nome agora com superfície na lista e no construtor |
| `followup-retorno.architecture.json` | gatilho Cliente voltou — inbound depois do silêncio, envio inline, turno do agente cede |
| `indice-de-atrito.architecture.json` | índice de atrito — 24 peças, 31 arestas; a régua do atrito, o rádio que a lê e as demandas que entram nela |
| `marca-propria.architecture.json` | marca própria (white-label) — 37 peças, 54 arestas, 6 faixas; a pilha org → instalação → `.env` → padrão, as saídas SEM DOM (`marcaDaSaida`) e a **não-ligação declarada** do PDF de LGPD, que imprime o CONTROLADOR e nunca a marca de quem revende |
| `retencao-de-historico.architecture.json` | poda do histórico (issue #261) — 16 peças, 18 arestas, 6 faixas; o que sai (`done`/`failed`/`dead` velho), o que tem dono e **não** sai (`pending`/`running`, e `dead` com aviso ainda aberto), e por que o expurgo do audit é uma `security definer` sem seletor de linha em vez de uma porta |
| `extensoes-declarativas.architecture.json` | perfil declarativo: catálogo de ensaio, admissão, recibos, arquivo local, ativação por organização, guia no CRM, as trocas de versão (atualizar e desfazer a última troca), a remoção da instalação e a auditoria da organização; o estado das provas fica no `contracts.status` do próprio mapa |
| `banco-de-dados-externo.architecture.json` | banco externo (migration 0372, recorte do PR #1130 por um contribuidor) — 14 peças, 19 arestas, 4 faixas; o cadastro por admin e a leitura por todos, a view `_safe` como única superfície da tela, a guarda de rede revalidada a CADA abertura de pool, e a **não-ligação declarada**: as tools do agente ficaram no PR de origem e entram num segundo recorte |
| `captacao-por-webhook.architecture.json` | captação por webhook — 17 peças, 26 arestas, 5 faixas; o adaptador por ferramenta (Respondi, RD Station, Elementor, genérico), o cadastro do campo que mora no funil e o laço em que a definição volta como rótulo no painel, no card do lead, nos botões da automação e na entrada da IA; **não-ligação declarada**: o rótulo que o Elementor manda não é guardado |
| `suspensao-de-organizacao.architecture.json` | suspensão que suspende (PR 1 da cobrança do revendedor): 17 peças, 24 arestas; a régua única de "opera", a escrita do estado só por duas funções definer (e o gatilho que fecha o PostgREST), o hub `/account-suspended` e o laço de retorno pela Central até a Fila; as **não-ligações declaradas** (entrada de mensagens, landings, escrita pela RLS) estão no card do próprio mapa |
| `rede-segura.architecture.json` | rede segura única (issue #88) — toda saída do servidor para um endereço informado por usuário: o ponto único (`buscarSeguro`), as primitivas (`resolverEJulgar`, `lookupJulgado`), os consumidores migrados e as **não-ligações declaradas** (SDK de modelos, imagem do PDF, `media_url`) |
| `casca-e-desenho-comum.architecture.json` | menu, cabeçalho de página e ajuda "Como funciona" (plano visual de 14/10/2026) — 24 peças, 28 arestas, 3 faixas; um ícone por destino do menu (e cinco ícones próprios do produto), o selo cuja cor diz uma coisa só, o painel, expandido por padrão com o trilho por escolha, duas larguras de página e o texto de ajuda carregado só ao abrir, em três idiomas; as cercas que prendem cada uma dessas regras |
| `resposta-em-audio.architecture.json` | resposta em áudio do agente (issue #91, migration 0548) — 17 peças, 24 arestas, 5 faixas; o interruptor da organização que falha DESLIGADO, a chave de voz cifrada que só o servidor lê, a opção por agente travada na versão publicada, e a regra que manda: o áudio só nasce DEPOIS de a cadeia aprovar o texto, e qualquer falha de voz cai em texto; o custo volta pelo Uso de IA |
| `teste-e-correcao-do-agente.architecture.json` | testar o agente em várias trocas e corrigir respostas (issue #90) — 18 peças, 28 arestas, 4 faixas; a conversa vive só na tela, o custo do teste cai na régua do orçamento, e a correção só cria uma proposta presa ao agente: o clique de aplicar é o único caminho que muda o comportamento; **não-ligações declaradas**: a conversa de teste não é guardada e a correção não toca versão de agente |

> **Esta tabela já apodreceu uma vez:** ela listava 8 mapas quando o disco tinha 9 — faltava
> `indice-de-atrito`. Nenhum teste lê este README (o gate lê os `.json`), então mapa novo que
> não ganhe linha aqui nasce invisível para quem lê antes de codar. Confira com
> `ls docs/architecture/*.json` antes de confiar na lista.


### Aviso: só o `agent-turn.workflow.json` é renderizável hoje

Medido com archify 2.11.0: os `*.architecture.json` deste diretório **não validam em nenhum
dos dois modos**. Como `workflow` param no `diagram_type`; como `architecture` param na forma —
aquele schema pede `components`, não `lanes`/`nodes`/`edges`. Trocar o `diagram_type` não
resolve: os `node.type` que usamos (`api`, `service`, `table`, `lib`, `route`, `tool`,
`config`) estão fora do enum do archify
(`frontend|backend|database|cloud|security|messagebus|external`), vários `col` passam de 5, e
os `dot` `sky`/`red`/`blue`/`green` não existem no enum de cards.

A prova de que ninguém tentou renderizar está no próprio diretório: existe **um** `.html`, e é
o do único arquivo que valida.

Isto não invalida os outros mapas — eles seguem sendo a fonte da verdade em JSON, lida por
gente e pelo `tests/unit/mapas-de-arquitetura.test.ts`. Mas o README dizia "re-renderize" como
se fosse possível para todos, e não é: quem seguisse a instrução em qualquer um dos outros
receberia um erro de schema e concluiria que estragou algo.

### `crm-vivo.architecture.json` é PLANTA, não fotografia

Ele descreve o desenho **contratado** das oito waves do épico. As waves 6, 7 e 8 **ainda não existem em
código** — quem procurar essas peças no repositório não vai achar, e **o mapa não está errado: está
adiantado**.

Invariantes que a forma não mostra vivem nos `cards` do próprio JSON — inclusive as **não-ligações
deliberadas** (ex.: o score fica **fora** da publicação de realtime, de propósito). *Ausência de aresta
é indistinguível de aresta esquecida; por isso a não-ligação se **declara**, não se desenha.*

## O pedágio do eixo CONTATO × NEGÓCIO

Três peças diferentes pagaram o mesmo custo, e a quarta pagaria igual se isto
não estivesse escrito:

| onde | o que custou |
|---|---|
| **dossiê** (wave 6) | a timeline era indexada por `contact_id`; negócio sem contato ficava mudo — 25% dos leads, 64% das atividades |
| **reativação** (wave 7) | `cron_jobs` é por contato; negócio sem contato não pode receber proposta de retomada — 26 de 68 abertos |
| **funil do agente** (wave 8) | `lead_state.stage` é por contato e o card é por negócio; um contato com dois negócios exige decidir qual se move |

**A aresta:** `contacts` ─(1:N)─ `crm_leads`, e quase todo mecanismo do agente
vive do lado do CONTATO enquanto quase toda superfície do produto vive do lado
do NEGÓCIO.

**A regra que sai daí:** toda peça nova que ligue um mecanismo do agente a uma
superfície do CRM atravessa essa aresta, e precisa responder três perguntas
**antes** de ser escrita:

1. e se o contato tiver **dois** negócios abertos? — reuse
   `resolveActiveLeadForContact`, nunca escreva um segundo resolvedor;
2. e se o negócio **não tiver** contato? — é 25% dos casos, não é canto;
3. o que a peça faz quando não dá para decidir? — não agir e deixar rastro é
   resposta; agir no negócio errado não é.

As três vezes o custo foi o mesmo: descobrir a aresta **durante** a
implementação, com a peça já meio pronta.
