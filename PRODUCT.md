# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Duas pessoas usam o ZapSales todo dia, com peso igual:

- **Atendentes e vendedores**, que passam o dia na inbox respondendo conversas de
  WhatsApp, junto com os agentes de IA, e movendo leads no funil. O trabalho deles é
  repetitivo e corrido: ler rápido, responder certo e não perder ninguém.
- **Donos e gestores**, que acompanham o funil, as campanhas, os agentes de IA e as
  métricas por atendente, e decidem onde a operação precisa de gente.

Os negócios são brasileiros e vendem pelo WhatsApp: e-commerce, clínicas,
imobiliárias, infoprodutores, agências e serviços. O mesmo núcleo serve todos, com
vocabulário configurável por funil (lead = Cliente, Paciente ou Comprador).

## Product Purpose

É um CRM de WhatsApp com funil (Kanban), inbox em tempo real, agentes de IA e
campanhas em massa pela API Oficial da Meta. Quem responde a uma campanha cai no
funil e no agente com o contexto do que recebeu. Dá certo quando a venda pelo
WhatsApp acontece num lugar só, do primeiro disparo ao fechamento, tocada por
pessoas e agentes juntos.

Fonte do posicionamento: `VISION.md`.

## Positioning

- O agente de IA **opera** o CRM em vez de enfeitar a conversa: lê o contexto real
  (histórico, perfil, campanha recebida), consulta a base de conhecimento da
  organização, qualifica e move o funil. É responsável de primeira classe, com as
  mesmas regras de um atendente humano.
- Campanha e atendimento vivem na mesma operação: a resposta da campanha chega ao
  funil e ao agente com o contexto do disparo.
- Roda na VPS de quem usa. Depois da validação interna vira open source (MIT), sem
  versão paga. É a alternativa a Kommo, Octadesk, Intercom e Zendesk.

## Operating Context

- Usado no **computador e no celular**: o desktop para operar, o celular para
  responder fora do escritório. O celular não é versão de segunda.
- A inbox fica aberta o dia inteiro e atualiza em tempo real. Densidade, velocidade
  de leitura e estados de conversa (quem responde, IA ou humano, fila) importam mais
  que ornamento.
- Dois canais de WhatsApp convivem: API Oficial da Meta (campanha) e WAHA/QR code
  (atendimento).
- Instalação self-host numa VPS. A primeira impressão de quem acabou de instalar é
  produto: onboarding, primeiro canal, primeiro lead, primeiro convite.

## Capabilities and Constraints

- Stack existente: Next.js 16, React 19, Tailwind 4 configurado em CSS
  (`app/globals.css`, sem `tailwind.config.ts`) e shadcn/ui. Já existem temas por
  `[data-theme]` e uma vitrine do sistema visual em `app/design/`.
- **Marca própria (white-label):** uma imagem Docker serve todas as marcas. Nome,
  logo e cor de destaque vêm do banco (`platform_branding` e
  `organizations.settings.branding`); `APP_NAME`, `APP_LOGO_URL` e `APP_ACCENT_HEX`
  são só semente. Nada de marca fixa no código: `tests/unit/branding.test.ts`
  reprova. Todo tema precisa aceitar a cor de destaque de um revendedor.
- Saída sem tela (e-mail, MFA) usa `marcaDaSaida()`, sempre em tema claro. O PDF da
  LGPD nunca leva marca.
- Toda tela nova precisa de porta na navegação (`lib/navigation/catalogo.ts`).
- Mudança de UI é provada pela tela, em ambiente fresco estilo VPS, com evidência
  visual (doutrina de QA Visual do `CLAUDE.md`).
- **Escopo desta rodada (decidido em 07/10/2026):** tema geral (cores, fontes,
  tokens) mais uma tela piloto, a **Inbox**, aprovada antes de espalhar para o resto.

## Brand Commitments

- O nome do produto é **ZapSales**: Zap (WhatsApp) + Sales (vendas).
- **ZapSales by Futuristas.** Na instalação padrão, o ZapSales pertence à família
  visual da Futuristas e assina "by Futuristas". O ZapSales terá nome e logo próprios
  no mesmo estilo; não usa o logo da Futuristas como se fosse dele.
- Referência obrigatória da família visual: o logo
  `docs/design/referencias/logo futuristas.svg` e a apresentação da marca
  Futuristas (PDF guardado só localmente, fora do git; o que se aproveita dele está
  registrado em `docs/design/referencias/README.md`).
- Sob marca própria de revendedor, a assinatura Futuristas **fica discreta**, como
  uma menção pequena do tipo "feito com ZapSales by Futuristas", e o resto é do
  revendedor. A forma exata ainda está aberta e precisa passar pelo resolvedor de
  marca, sem texto fixo no código.
- Voz: português do Brasil, direta e sem jargão para quem opera. Termos técnicos
  vêm explicados.

## Evidence on Hand

- Logo da Futuristas em SVG: `docs/design/referencias/logo futuristas.svg`.
- Apresentação da marca Futuristas, com 26 páginas (local, fora do git).
- **Ausências que ninguém pode inventar:** não existe ainda logo do ZapSales,
  depoimento, número de clientes, case ou métrica de uso do ZapSales. Os números da
  apresentação (alunos, turmas) são da Futuristas e não valem como prova do
  ZapSales.

## Product Principles

1. **A operação vem antes do enfeite.** A inbox e o funil são ferramentas de trabalho
   diário; a marca aparece nos detalhes precisos, não no caminho de quem atende.
2. **Pessoa e agente lado a lado.** A interface sempre deixa claro quem está
   respondendo (IA ou humano) e quem tem o controle.
3. **A primeira impressão é o produto.** Quem acabou de instalar decide ali se fica.
4. **Uma base, muitas marcas.** Todo visual precisa sobreviver à troca de logo e de
   cor de destaque por um revendedor.
5. **Celular de primeira.** Responder pelo celular não pode ser pior que pelo
   computador.

## Accessibility & Inclusion

Nenhum padrão formal foi fixado nesta entrevista. O sistema atual usa a fonte Atkinson
Hyperlegible, feita para leitura fácil. Isso é evidência do código, não compromisso
confirmado; se for mantido ou trocado, decide-se na definição do visual.
