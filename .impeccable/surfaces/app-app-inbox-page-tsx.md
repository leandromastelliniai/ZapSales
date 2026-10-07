---
version: 1
slug: "app-app-inbox-page-tsx"
primary_target: "app/app/inbox/page.tsx"
related_targets: ["components/inbox/InboxLayout.tsx"]
---

## Escopo e modo

Inbox (`/app/inbox`), modo **Operate**. Tela piloto do novo tema "ZapSales by Futuristas": o tema geral (tokens) nasce aqui e só depois se espalha.

## Para quem e para quê

Atendentes respondem conversas o dia inteiro, no computador e no celular; gestores acompanham. O trabalho: ler rápido, responder certo, não perder ninguém da fila e saber **sempre** quem está atendendo cada conversa (IA ou pessoa, qual pessoa, desde quando e quem transferiu). Dores declaradas: visual genérico, tela poluída, "quem responde" pouco claro, celular ruim. Evitar: escuro cansativo.

Restrições: toda função atual permanece (abas, filtros, busca, estados de comando, janela de 24h, notas, passagem, ações do cabeçalho, ficha CRM, atalhos J/K, tempo real). Marca própria: a cor de destaque do revendedor substitui o violeta via `cssDaMarca`; nada de marca fixa no código.

## Direction contract

THESIS: A Inbox é uma estação da Linha do Funil: cada conversa mostra em que estação da jornada o lead está e quem está no comando agora. Recusa o clone do WhatsApp Web e a inbox cinza de três colunas com ficha lateral.

OWN-WORLD: Fundo azul-noite (não preto, não roxo), painéis em azul elevado, linhas finas. Cada cor tem um só significado: violeta = IA (e navegação ativa), ciano = atendente humano, âmbar = linha do funil e fila, verde = concluído, coral = falha, verde-limão = só o botão Enviar. Fotos de perfil redondas com selo do canal e selo de quem atende. Linha do funil com estações em anel: passadas cheias, a atual maior, futuras vazadas.

STORY: Quem abre a Inbox vê de cara a fila, quem atende cada conversa e a etapa de cada lead. Ao abrir uma conversa, entende numa olhada a jornada, o valor, o próximo passo e quem tem o comando, e responde sem procurar nada.

FIRST VIEWPORT: Trilho de navegação só com ícones (64px) à esquerda. Lista (~360px) com abas Fila/Minhas/Todas/Automático, busca, chips; cada linha tem foto com selos, nome, prévia, hora, tag de quem atende e um trecho da linha do funil. À direita, sem coluna de ficha: uma faixa de jornada (~110px) com foto e nome, a Linha do Funil esticada com rótulos e, à direita dela, valor, próximo passo e tags. Abaixo, uma faixa com o chip ciano "Em atendimento: … · desde … · transferida por …" e as ações Transferir / Devolver ao automático / Fechar. Conversa larga e calma; transferência como linha própria de largura total; compositor no rodapé com Enviar em verde-limão.

FORM: Challenger "Linha do Funil" (wayfinding-cartography-signage-midnight-transit-diagram), ajustado pelo usuário: menos roxo e preto, cores de contraste com função, fotos com selos indicativos, quem atende sempre explícito. Posição 3 da lista ordenada de candidatos (seed e9447389, kind challenger).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Comp aprovado

`.impeccable/mocks/inbox-2.png` (rodada de 07/10/2026, opção "A jornada no topo").

O que não se literaliza do comp: o texto e as fotos de exemplo (são dados ilustrativos), os itens do trilho de navegação (o menu real vem de `lib/navigation/catalogo.ts`) e erros do gerador (rosto repetido, iniciais trocadas).

## Decisões tomadas

- **Fonte (07/10/2026, decisão do dono):** o texto usa Atkinson Hyperlegible, a face que o app já tem, desenhada para leitura fácil. A medição aproximou a letra do comp de Voces/Roboto (empate técnico: distâncias 0,683 / 0,688 / 0,710). As leituras de fonte do gate viram aviso, não bloqueio. Rótulos em caixa alta e números seguem em IBM Plex Mono, como hoje.
- **Menu (07/10/2026):** o trilho só de ícones vale para o app inteiro nesta rodada.
- **Prova sem Docker (07/10/2026):** a comparação com o comp roda numa vitrine com dados de exemplo em `/design`; a prova com banco real é o e2e do CI.

## Decisões em aberto

- **Ficha CRM sem coluna própria.** O comp tira a coluna da ficha. O conteúdo do `CRMSidePanel` (demandas, memória, leads, pedidos, atividade, acervo) precisa continuar a um clique, numa gaveta lateral aberta pela faixa de jornada.
- **Trilho só de ícones é do shell, não da Inbox.** Ele vale para todas as telas. Fica decidir se o trilho recolhido entra nesta rodada ou se a Inbox herda o shell atual só com o novo tema.
- **Contato sem funil.** Conversas sem lead não têm linha; a faixa mostra "Sem funil · Criar lead" no lugar.
- **Modo claro.** O escuro é o padrão; a versão clara dos mesmos tokens também precisa existir.
