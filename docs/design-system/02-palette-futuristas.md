# 02 — Paleta Futuristas (noite + violeta)

> **Vigente desde 07/10/2026**, por decisão do dono do produto ("ZapSales by Futuristas").
> Substitui a [Paleta Sage](./02-palette-sage.md), que fica como histórico.
> Direção da tela piloto: "Linha do Funil" (`.impeccable/surfaces/app-app-inbox-page-tsx.md`).

A fonte da verdade é `app/globals.css`. Este documento explica as escolhas; os valores exatos
estão no CSS e na régua gerada a partir dele (`lib/branding/regua-do-produto.ts`). Para ver os
valores em vigor sem confiar nesta página:

```bash
grep -nE "^\s+--color-(bg|surface|accent|ia|humano|funil|acao)[a-z-]*:" app/globals.css
```

## O escuro é o padrão

Quem nunca escolheu tema vê o **escuro** (`TEMA_PADRAO` em `lib/theme.tsx` e o
`THEME_INIT_SCRIPT` de `app/layout.tsx`). O claro é a mesma família, redesenhada, não invertida.
"Seguir o sistema" continua sendo uma escolha possível.

O escuro é azul-noite, não preto e não roxo: a marca Futuristas é escura, mas a Inbox fica aberta
o dia inteiro, e preto com neon cansa a vista. O contraste é moderado e sem brilho.

## Violeta da marca (troca com o revendedor)

A rampa de 11 paradas é `rampaDeSemente("#773df9")`, a mesma função que deriva a cor de um
revendedor. Por isso a cor de marca própria (`APP_ACCENT_HEX` / `platform_branding`) troca o violeta
inteiro sem mudar mais nada. No claro, o destaque é a parada 600 (`#773df9`); no escuro, a 400.

## Papéis da Inbox (cada matiz, um significado)

Cada cor de papel quer dizer uma coisa só, em toda tela. Essas cores **não** trocam com a cor do
revendedor: elas significam estado, não marca.

| Token | Significado | Onde aparece |
|---|---|---|
| `--color-ia` | O agente de IA | Selo de robô na foto, mensagens e etiqueta "IA atendendo" |
| `--color-humano` | Atendente humano no comando | Selo de pessoa, faixa "Em atendimento: …" |
| `--color-funil` | Linha do funil e fila | Linha do Funil, estações, "Na fila · 12 min" |
| `--color-acao` (+ `-fg`) | A ação principal da tela | Só o botão principal (ex.: Enviar), sempre com texto `--color-acao-fg` |
| `--color-success` | Concluído / confirmado | Estação final, entregue |
| `--color-error` | Falha / bloqueado | Mensagem que falhou, contato bloqueado |

Os fundos tingidos de cada papel são `--color-ia-fundo`, `--color-humano-fundo` e
`--color-funil-fundo`. O nome termina em `-fundo`, e não em `-soft`, de propósito: `-soft` é lido
pela régua de contraste como superfície derivada da marca, e estes não derivam.

## Superfícies

| | Claro | Escuro |
|---|---|---|
| `--color-bg` | `#f5f6fa` | `#151a2e` |
| `--color-surface` | `#ffffff` | `#1b2240` |
| `--color-surface-elevated` | `#eceef5` | `#242c4b` |

## Contraste

O piso continua o da régua: 4,5:1 para texto e 3:1 para componente, medido em todo par que a
régua enumera, nos dois temas (`tests/unit/branding-contraste.test.ts`). O verde-limão da ação
principal nunca leva texto claro: o par é sempre `--color-acao` com `--color-acao-fg`.
