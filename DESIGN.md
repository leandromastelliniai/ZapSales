# DESIGN.md — ZapSales by Futuristas

> O sistema visual do app, como ele está construído hoje. Fonte dos valores: `app/globals.css` (tokens) e os
> componentes citados. Quando este arquivo e o código discordarem, o código vence — e este arquivo se corrige.
> Plano e inventário que o originaram: [`docs/design/plano-de-implementacao-visual.md`](docs/design/plano-de-implementacao-visual.md)
> e [`docs/design/inventario-visual-2026-10-14.md`](docs/design/inventario-visual-2026-10-14.md).

## Ideia central: "Linha do Funil"

A Inbox é uma estação da jornada do cliente: cada conversa mostra em que etapa do funil o contato está e **quem está
no comando agora** (IA ou pessoa). O resto do app fala a mesma língua. Recusa o clone do WhatsApp Web e a inbox cinza
de três colunas.

Modo: **Operate**. Gente que passa o dia na tela (atendentes, gestores): densidade, leitura rápida e estados claros
valem mais que ornamento. A marca vive nos detalhes precisos.

## Cor: cada cor tem um significado só

| Token | Significado | Onde aparece |
|---|---|---|
| `ia` (violeta) | o automático, o agente de IA; também a navegação ativa e o destaque da marca | selo "IA atendendo", item ativo do menu |
| `humano` (ciano) | uma pessoa atendendo | selo "Em atendimento: …" |
| `funil` (âmbar) | etapa do funil, fila, espera | Linha do Funil, "Na fila", "Pendente" |
| `success` (verde) | deu certo, concluído, aceito, pago | "Aceito", "Ativo" |
| `error` (coral) | falhou, recusado, revogado | "Falhou ao enviar", "Revogado" |
| `acao` (limão) | só o botão **Enviar** da Inbox | nada mais |
| neutros (azul-acinzentado) | tudo o que não é estado | fundo, painéis, texto |

Regra: **cor nova precisa de significado novo, e isso é decisão de produto, não de tela.** O componente `Selo`
(`components/ui/selo.tsx`) escreve essa regra; use-o onde a cor diz estado. Cor de destaque do revendedor
(`cssDaMarca`) substitui o violeta, então nenhum valor de marca pode ficar fixo no código (`tests/unit/branding.test.ts`).

Tema claro é o padrão (decisão de 23/10/2026; quem quiser escolhe o escuro, que fica guardado por pessoa). O escuro é azul-noite ( `#151a2e`, painel `#1b2240`, elevado `#242c4b`, texto `#eef0f7`); o claro redesenha os
mesmos tokens (`#f5f6fa` / `#ffffff` / `#eceef5`), não os inverte. Todo token existe nos dois temas em `app/globals.css`.

## Tipografia

Atkinson Hyperlegible para o texto (feita para leitura fácil) e IBM Plex Mono para números e código — as duas
hospedadas em `app/fonts/` (`next/font/local`), nenhuma carregada de terceiros. Escala usada nas telas:
título de página `text-2xl` semibold, descrição `text-sm` muted com medida de até 65 caracteres, título de seção
`text-base` semibold. **Sem rótulo pequeno em caixa alta acima de título.**

## Forma e espaço

Cantos: `rounded-xl` nos painéis e cartões, `rounded-lg` em tiles de ícone e abas, `rounded-full` em selos e fotos.
Filete de 1 px (`border-border`), sombra mínima (`shadow-xs`). Espaçamento de base 4 px; entre blocos de página `gap-6`.
**Painel não vai dentro de painel**: o que está dentro separa-se por filete ou espaço.

**Lista de coisas do mesmo tipo é uma linha por item, dentro de um `Painel` sem recuo** (`divide-y`), com o nome como único link da linha (esticado por `after:absolute`), o estado em `Selo` e as ações à direita — o molde da lista de Agentes, seguido por Follow-ups, Chaves de acesso, Conhecimento, Roteadores e Execuções. Grade de cartões iguais só quando o item tem imagem própria para comparar. O valor técnico do banco (`pause`, `cancel`) nunca vai à tela: vai em palavras, ou fica no "Como funciona".

Duas larguras de página (`CorpoDaPagina`): `lista` (até 1280 px) e `formulario` (até 880 px); `total` só para o que
precisa de tudo (quadro do funil, agenda). O respiro legado `p-6` do corpo é temporário: sai quando a última tela
migrar (plano, pacote X1).

## Peças

| Peça | Arquivo | Para quê |
|---|---|---|
| `CorpoDaPagina` | `components/shell/CorpoDaPagina.tsx` | largura e espaçamento únicos |
| `CabecalhoDePagina` | `components/shell/CabecalhoDePagina.tsx` | título (único `h1`), descrição, ação principal no canto |
| `ComoFunciona` | `components/shell/ComoFunciona.tsx` | painel de ajuda; texto por tela em `lib/ajuda/conteudo/`, carregado só ao abrir, em pt-BR/es/en |
| `Painel` | `components/ui/painel.tsx` | contêiner de tabela, lista e bloco de formulário |
| `Selo` | `components/ui/selo.tsx` | etiqueta de estado, com a cor do significado |
| `AssistenteDeAgente` | `app/app/ai/agents/new/_assistente/` | criação guiada do agente em cinco estações (a Linha do Funil aplicada a um passo a passo), com prévia fixa que usa `.aura-ia` |
| `ForcaDoAgenteFaixa` | `app/app/ai/agents/[id]/_components/guia/` | no topo do editor completo: porcentagem de prontidão (régua em `lib/ai/agents/guia-do-editor.ts`), o próximo passo que mais ajuda e o botão que leva à parte certa |
| `SeloDaSecao` / `MarcaDaSecao` | `components/guia/SeloDaSecao.tsx` | estado de cada parte do editor (Pronto, Revisar, Opcional) em palavra e ícone, nunca só em cor |
| `FaixaRecomendada` / `SeloRecomendado` | `components/guia/FaixaRecomendada.tsx` | a recomendação da casa com o motivo escrito, em violeta (a cor da IA) |
| `PreviaDaResposta` | `app/app/ai/agents/[id]/_components/guia/` | conversa de exemplo ao lado de "Jeito de responder" que muda com o formato e o tom; simulação, não chama a IA |
| `QuemRecebeAgora` | `app/app/settings/atendimento/_quem-recebe-agora.tsx` | faixa no topo da Distribuição de atendimento: quantos podem receber agora, o próximo da vez e a fila, com as regras do próprio roteamento (`lib/routing/situacao-da-distribuicao.ts`); avisa quando ninguém pode |
| `AvatarDoContato` | `components/inbox/visual/AvatarDoContato.tsx` | foto ou iniciais, com selo de canal e de quem atende |
| `LinhaDoFunil` | `components/inbox/visual/LinhaDoFunil.tsx` | etapas passadas cheias, a atual maior, as futuras vazadas |
| `NavHub` | `components/shell/NavHub.tsx` | páginas de área (CRM, IA, Análise, Configurações) como lista em painel |
| Ícones próprios | `components/icons/produto/` | os conceitos do produto que o Phosphor não desenha |

**Duas famílias de tela, e só uma usa o cabeçalho padrão.** Tela de *assunto* (lista, painel, configuração: "Contatos",
"Meta Ads", "Atualização") abre com `CabecalhoDePagina`: o que ela é, em uma linha, e a ajuda. Tela de *ficha* (um contato,
uma empresa, uma campanha, uma solicitação de LGPD) mostra a própria coisa — nome, estado e ações — e mantém o seu
cabeçalho, com o link de volta à lista. Descrever "o que é esta tela" numa ficha seria ruído: o assunto é o nome da pessoa.
Estados de erro e de carregamento (`SegmentError`) também ficam como estão. Telas que só redirecionam não têm cabeçalho.

**Nunca `<main>` dentro das telas.** O `AppShell` já é o `<main>`; um segundo é um erro de leitor de tela.

Vitrine para ver tudo com dados de exemplo: `/vitrine-sistema` (pública só em desenvolvimento).

### O "vivo" da IA, sem agitação

Onde a IA aparece (a prévia do assistente, o ponto da estação atual) ela ganha um **brilho estático** (`.aura-ia`, na cor `--color-ia`) e, quando uma estação passa a ser a atual, **um** pulso que não repete (`.pulso-de-estacao`). Nada anima em laço: a regra é a do pulso do Kanban, "vivo é o que responde, não o que se agita". `prefers-reduced-motion: reduce` mostra o mesmo estado, parado. A cor é a do papel (IA), não a de destaque do revendedor. Medido na vitrine: nenhum elemento com animação infinita.

No editor completo do agente, o violeta marca o que o sistema **recomenda**, sempre com o motivo em uma frase (`FaixaRecomendada`, o selo "Recomendado" nos pacotes). A prévia de "Jeito de responder" faz a bolha que mudou brilhar **uma vez** (`.realce-da-previa`, remontada por `key`); sem movimento, nada brilha. O estado de cada parte (Pronto, Revisar, Opcional) usa verde, âmbar e neutro com **palavra e forma** (check, alerta, traço): cor sozinha não informa.

## Ícones

Phosphor para o genérico, em `lib/ui/icons.ts` (um ponto único). **Um ícone por destino do menu**: nenhum serve a
dois destinos de rótulos diferentes (`tests/unit/navegacao-icones-unicos.test.ts`). Os cinco próprios (`FunilEmEtapas`,
`AgenteEmConversa`, `PassagemParaHumano`, `FilaDeEspera`, `JanelaDe24h`) usam a mesma grade (256), traço (16) e pesos do
Phosphor; o item ativo do menu usa o peso `fill`, os hubs usam `duotone`.

## Menu

Expandido por padrão (ícone + nome, com título de grupo); o trilho de 64 px é escolha da pessoa e fica no cookie
`sidebar_collapsed`. O menu inteiro precisa caber em 1280×900 sem rolar (`navegacao.spec.ts`): grupo com mais de quatro
telas ganha hub ("Ver tudo em …", cada um com ícone próprio), não densidade raspada.

## Linguagem

Português do Brasil, direto, para quem opera um negócio. Termo técnico não vai no título: vai no "Como funciona".
Nunca o nome da marca no texto (é white-label: diga "o sistema"). Todo texto novo passa por `t()` e tem espanhol
(guarda `i18n-espanhol-cobre-a-tela`) e inglês.

## Peso (performance)

- Nenhuma fonte, imagem decorativa ou biblioteca de gráfico a mais; ícones próprios são SVG inline de ~1 KB.
- O texto do "Como funciona" não está no pacote da tela.
- **O dicionário de tradução só vai para quem usa espanhol ou inglês** (`lib/i18n/catalogos.ts` + alias de navegador em
  `next.config.ts`): em português, 0 KB. Cercado por `tests/unit/dicionario-fora-do-cliente.test.ts`.

## O que não fazer

- Cartões iguais de ícone + título + texto como estrutura de página (hub é lista).
- Número grande + legenda decorativa, sparkline e anel de progresso no lugar de conteúdo.
- Texto em gradiente; vidro/desfoque como decoração; borda lateral colorida em cartão; sombra dura.
- Emoji ou glifo Unicode no lugar de ícone.
- Cor crua da paleta Tailwind (`amber-500`, `red-600`): use os tokens. (Dívida atual: 403 usos em 69 arquivos; plano X3.)
- Modal para o que não precisa interromper.
