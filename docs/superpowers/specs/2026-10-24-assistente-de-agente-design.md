# Assistente de criação de agente — design

Data: 24/10/2026. Estado: **rascunho para aprovação do dono do produto**. Nada foi construído.
Mockup de referência (estrutura, não visual final): [`2026-10-24-assistente-de-agente-mockup.html`](2026-10-24-assistente-de-agente-mockup.html), opção **A**.

## Intenção e o porquê

Quem acabou de instalar o ZapSales e vai criar o primeiro agente de IA cai hoje numa página única de ~7.300 px
(`/app/ai/agents/new`, `AgentForm` em modo `create`): perfil, jeito de responder, 27 capacidades, canais, passagem
para humano, propostas e limites de segurança, tudo junto, com números soltos e sem dizer o que escolher.
Pelo `PRODUCT.md`, a primeira impressão é o produto; criar o primeiro agente é um dos momentos que decide se a
pessoa fica.

O dono pediu uma experiência "fantástica": guiar quem nunca configurou, com exemplos e boas práticas, e algum
efeito visual que marque o momento — sem atrapalhar quem só quer mudar uma coisa.

Decisão do dono, com as palavras dele quando importam:

1. **Caminho A**: assistente passo a passo, uma pergunta por tela, com exemplo e recomendação em cada escolha.
2. **Saída para o editor completo**: "uma opção de acesso ao editor completo para quem quer mudar uma só coisa".
3. **Estação 1 pergunta o tipo de negócio** ("clínica, loja, imobiliária, infoprodutor, e-commerce, advocacia, esse
   tipo de coisa") e **a lista deve ser bem mais extensa** do que esses seis. Existe a opção "Outro".
4. **Estação 2 parte para os modelos** Vendas, Suporte, Agendamento **e Atendimento**.
5. **O texto sugerido é ponto de partida, nunca travado**: a pessoa edita como quiser.
6. **Base por modelo + vocabulário por ramo** (palpite do assistente que o dono aprovou): os quatro modelos carregam
   o conteúdo; cada ramo só troca vocabulário e exemplos. A lista grande não vira 35 projetos de redação.
7. **Piloto só na tela de agentes.** Ordem de importância dada pelo dono para o que vem depois: atendimento,
   disparo em massa, follow-up (cada um reaproveita o molde; ficam fora deste documento).

## Objetivos

- Uma pessoa que nunca configurou nada termina com um agente **criado, testado e publicável** sem abrir o
  `AgentForm` inteiro.
- Cada escolha mostra **o que significa, um exemplo e a recomendação com o motivo**.
- A pessoa **sempre** pode sair para o editor completo, levando o que já respondeu.
- Os exemplos e recomendações vivem **num único lugar de conteúdo**, que o editor completo passa a reaproveitar
  depois (mostrar "Recomendado" ao lado das opções dele). O assistente é o primeiro consumidor, não o único.

## Não-objetivos

- Não redesenha o editor completo (opção B do mockup). Fica como evolução, usando o mesmo conteúdo.
- Não cria agentes por conversa livre com IA ("descreva seu negócio e eu monto"). Fora do escopo.
- Não toca Atendimento, Disparo em massa nem Follow-up neste documento.
- Não inventa fato do negócio: preço, horário, endereço e convênios vêm do material do cliente, nunca do texto do
  ramo. É a regra que `lib/ai/agents/modelos.ts` já declara; vale igual para os ramos.
- A sugestão "baseada nas conversas, no dia 7" da opção C do mockup **não entra**: era ideia a validar, depende de
  dados de "Evolução da IA".

## Anti-objetivos (falha mesmo que funcione)

- Texto sugerido que a pessoa **não percebe** ter aceitado e que diz algo falso ou arriscado no ramo dela.
- O assistente e o editor produzirem agentes **diferentes** para as mesmas respostas.
- Efeito visual que atrapalha leitura, ignora "reduzir movimento" ou fixa um violeta que a marca de um revendedor
  não consegue trocar.
- Tornar o assistente obrigatório: quem não quer, não passa por ele.

## O fluxo

Cinco estações na "Linha do Funil" (passadas cheias, a atual maior e com brilho, futuras vazadas). Cada estação é
uma tela; "Voltar", "Continuar" e "Pular, usar o padrão" em todas. **"Prefiro o editor completo"** fica sempre
visível, e leva o que já foi respondido ao `AgentForm`.

1. **Seu negócio.** Escolher o ramo (catálogo abaixo), com busca por digitação. "Outro" (e "Pular"): a pessoa
   escreve o que é, o assistente usa **vocabulário neutro** ("cliente", "atendimento") e recomenda o modelo
   **Atendimento**, o mais seguro: não vende nem agenda sozinho. Sem IA e sem adivinhar por palavra-chave.
2. **O que o agente vai fazer.** Os quatro modelos: Vendas, Suporte, Agendamento, Atendimento. O mais provável
   para o ramo já vem marcado "Recomendado", com o motivo; dá para trocar. **Um modelo por agente** (chamada do
   assistente: juntar dois modelos nunca foi pedido, e dois pacotes de capacidades não cabem no teto por agente).
   Aplicar usa `aplicarModelo` e o vocabulário do ramo.
3. **Como fala.** Tom (formal, normal, descontraído) com exemplo de frase em cada um e o recomendado do ramo
   marcado com o motivo; frase de abertura editável com atalhos ("citar o nome do cliente", "avisar que é uma IA").
4. **Quando chamar uma pessoa.** Regras sugeridas do ramo (o cliente pede; assunto sensível), editáveis.
5. **Teste.** Perguntas de exemplo do ramo e a opção de escrever outra; a resposta é a do motor real (ver
   "Prévia e teste"). Termina em "Publicar" ou "Ajustar no editor".

Estações 3 e 4 usam o que o ramo e o modelo já sugerem como ponto de partida, nunca como obrigação.
**Todo texto sugerido nasce como rascunho no campo editável, com um botão "Voltar à sugestão".**

### Quem já tem agente

Editar um agente existente abre **direto o editor completo**, no ponto que a pessoa pediu. O assistente só aparece
em **"Revisar com o assistente"** (palpite do assistente, não decidido pelo dono: ver pontos abertos).

## O catálogo de ramos

Agrupado, com busca. Os nomes e os textos dos ramos existem em **pt-BR, es e en**.

| Grupo | Ramos |
|---|---|
| Saúde e bem-estar | clínica médica, clínica odontológica, estética, psicologia, fisioterapia, nutrição, veterinária, academia e estúdio |
| Comércio | loja física, e-commerce, moda, restaurante e delivery, farmácia, pet shop |
| Imóveis e construção | imobiliária, corretor, construtora, arquitetura |
| Educação e digital | infoprodutor, escola e cursos, idiomas, mentoria |
| Serviços profissionais | advocacia, contabilidade, consultoria, agência de marketing, seguros |
| Beleza | salão, barbearia |
| Automotivo | concessionária, oficina |
| Turismo e eventos | agência de viagens, hotel e pousada, eventos |
| Financeiro | consórcio, crédito |
| — | Outro |

Cerca de 40 ramos. "Loja física" e "e-commerce" ficam separados porque o jeito de vender difere (visita contra
carrinho e entrega); se a redação ficar igual, pode-se juntar — chamada do construtor.

### O que um ramo carrega (e o que não)

Um ramo **não reescreve o modelo**. Carrega só:

- **vocabulário**: como o agente chama a pessoa (paciente, cliente, aluno, comprador) e o compromisso (consulta,
  visita, aula experimental, orçamento);
- **1 ou 2 exemplos** de frase de abertura e de pergunta típica do ramo;
- **o modelo recomendado** e o motivo, em uma frase;
- **a regra sugerida de "chamar uma pessoa"**;
- **o que o agente nunca deve prometer**, quando o ramo é sensível;
- **um aviso curto e não bloqueante** nos ramos regulados (saúde, advocacia, contabilidade, crédito, seguros):
  "confira as regras de publicidade do seu conselho profissional". É texto de aviso; nenhum juízo legal.

Modelo recomendado por ramo (**palpite do assistente**, o dono ainda pode corrigir):

| Ramo | Recomendado |
|---|---|
| clínicas, estética, psicologia, fisioterapia, nutrição, veterinária, salão, barbearia, oficina | Agendamento |
| loja física, e-commerce, moda, farmácia, pet shop, concessionária, infoprodutor, cursos, idiomas, consórcio, crédito, seguros | Vendas |
| imobiliária, corretor, construtora, hotel e pousada, agência de viagens, eventos | Vendas (com visita ou reserva) |
| advocacia, contabilidade, consultoria, arquitetura | Atendimento (triagem) |
| restaurante e delivery, academia e estúdio | Suporte, ou Agendamento (aula experimental) |

## O modelo "Atendimento" (novo)

Hoje `IDS_DE_MODELO` tem `vendas`, `suporte` e `agendamento`. Entra `atendimento`: **triagem e primeiro
contato**, sem vender nem agendar por conta própria — entende o assunto, coleta os dados mínimos e passa para uma
pessoa. É o modelo natural de advocacia, contabilidade e consultoria. Precisa dos três idiomas e passa pelo mesmo
`modelos.test.ts`. **O conteúdo exato é escrito e mostrado ao dono antes de ir ao ar.**

## Duas portas, um agente

O assistente **monta o mesmo estado do formulário** (`FormState`, chaves de `CamposDoModelo`) e o salva pelo mesmo
caminho do `AgentForm` em modo `create`. Não existe segundo contrato de criação. Consequências:

- "Prefiro o editor completo" entrega o estado parcial ao `AgentForm`; voltar ao assistente é possível enquanto o
  agente não foi publicado.
- Restrição de assuntos nasce **desligada** (decisão do dono, já registrada em `modelos.ts`); o assistente não a liga.
- O assistente não escolhe canal nem chave de IA por conta própria. O que depender disso (canal, credencial) é
  um aviso com link, como hoje.
- Capacidades: **ponto aberto para o dono** (último item de "Pontos abertos"). Hoje o formulário de criação começa
  com `tool_ids = []`; o único agente que nasce com capacidades é o do onboarding, que liga o pacote `vender`
  (`lib/ai/agents/capacidades-padrao.ts`). Os "pacotes de capacidades" do mockup B ficam fora.

## Prévia e teste (restrição do que existe)

O teste de hoje (`TestPanel`, POST `:test`) roda o **motor real em modo prévia sobre uma versão salva** e usa a
chave de IA da organização: cada pergunta gasta token. Numa instalação fresca **ainda não há chave** quando a
pessoa chega aqui.

Decisão do assistente (**minha chamada, o dono pode mudar**):

- **Estações 1 a 4: prévia estática.** Mostra a frase de abertura e o exemplo de tom, **sem chamar a IA**. Zero
  custo e funciona sem chave. O mockup mostrava resposta ao vivo nessas telas; isso **não vale** com esta chamada.
- **Estação 5: teste real**, sobre o agente salvo como **rascunho** no fim da estação 4. Se não há chave, a
  estação explica, com link para "Chaves de acesso à IA", e permite terminar sem testar (o agente fica como
  rascunho, nunca publicado sem confirmação).
- Teste automático de 5 casos do mockup: cada caso é uma pergunta do ramo/modelo e uma expectativa simples
  (por exemplo, "chama uma pessoa"). **Fica fora do primeiro corte** se encarecer; o teste manual de perguntas
  de exemplo basta.

## Efeitos visuais ("futurista com função")

Só onde a IA está "viva": a prévia/teste e o ponto atual da Linha do Funil. Brilho estático e suave ao redor da
prévia, **um pulso único** (sem repetir) no ponto que se torna o atual, "digitando…" **só enquanto a resposta real
do teste está de fato a caminho**, transições curtas entre estações. **Nada repete sem motivo**: a regra da casa
(`app/globals.css`, "Pulso de chegada") é "vivo é o que responde, não o que se agita; ficar animando é rejeição de
review". O mockup mostrava brilho e pulsação em laço contínuo; isso **não vale**.

- **Obedece o `DESIGN.md`**: nada de texto em gradiente, vidro/desfoque decorativo, borda lateral colorida ou
  sombra dura; painel não vai dentro de painel; cada cor com um significado (violeta = IA).
- **Cor**: o brilho usa o token `--color-ia` (o papel "automático", fixo de propósito: a cor de destaque do revendedor
  não o troca), nunca hex. `tests/unit/branding.test.ts` e `tests/unit/tailwind-tokens.test.ts` precisam continuar verdes.
- **`prefers-reduced-motion: reduce`** desliga animação (o `globals.css` já tem o padrão) e o efeito não pode
  carregar informação que só ele diz.
- **Peso**: sem biblioteca nova, sem fonte nova; só CSS. No celular, versão mais leve.
- **Celular de primeira**: o assistente é **uma coluna** no celular; a prévia desce para baixo da pergunta.

## Restrições do projeto que valem aqui

- Só **admin** cria agente (`page.tsx` redireciona `< admin` para `/403`); o assistente herda isso.
- Todo texto novo passa por `t()` e tem **es e en** (guarda `i18n-espanhol-cobre-a-tela`); o conteúdo de modelo e
  ramo vive em `lib/ai/agents/` com os três idiomas, como `modelos.ts`.
- Tela nova precisa de **porta** (`lib/navigation/catalogo.ts`) ou o assistente vive na rota existente
  `/app/ai/agents/new`, que já tem porta — **decidido**: `/app/ai/agents/new?modo=assistente` abre o assistente e
  `/app/ai/agents/new` continua abrindo o editor completo, para que as 6 specs e2e e os 2 testes unitários que
  abrem o formulário nessa rota não mudem. Os botões "Novo agente" da lista passam a apontar para o assistente, e o
  editor de criação ganha um convite "Prefere ser guiado?". Virar o assistente o padrão da rota é um PR futuro.
- DoD 12: **provado pela tela**, em ambiente fresco estilo VPS, com **a chave de IA ausente** e depois presente.
- DoD 13/18: declarar laço de retorno e destino (**núcleo**: criar o primeiro agente é a operação comum).
- DoD 17: fragmento em `.changes/` (`capacidade_nova`).
- Existentes que não podem quebrar: e2e de Agentes que dependem do `AgentForm`, `data-testid` da galeria de modelos
  (`galeria-de-modelos`, `modelo-*`), e o teste `modelos.test.ts`.

## Como saber que deu certo (**minha chamada**; o dono não respondeu)

- Numa instalação fresca, uma pessoa leiga cria o primeiro agente **só pelo assistente**, sem abrir o editor
  completo, e chega ao teste (prova pela tela com evidência visual).
- O agente que o assistente salva é **idêntico** ao que o editor salvaria com as mesmas respostas (teste de
  equivalência).
- Nenhuma regressão no e2e existente; typecheck, lint, `test:unit` e `test:e2e` verdes no CI.
- Qualitativo, para o dono olhar: tempo até o primeiro agente criado e quantos abandonam no meio.

## Deixado ao construtor

Componentes e estrutura de arquivos, o desenho exato das telas dentro do `DESIGN.md`, o mecanismo de levar o estado
parcial ao editor, o formato do conteúdo dos ramos (desde que seja dado versionado, traduzido e testado), a
redação final dos textos (revisada pelo dono), e a escolha entre juntar ou separar ramos de redação idêntica.

## Como o conteúdo vira agente (chamadas do assistente, a partir da revisão do construtor)

- **Modelo de conteúdo.** O modelo continua dono do texto (`modelos.ts`, três idiomas) e **não muda**. O ramo
  **acrescenta um bloco** às instruções ("Neste negócio…": como chamar a pessoa e o compromisso, o que nunca
  prometer, a regra de "chamar uma pessoa" para assunto sensível) e fornece a frase de abertura. O nome do negócio
  (campo opcional da estação 1) entra na abertura e nas instruções, como `instrucoesComNegocio` já faz no
  onboarding. O ramo **não cria campos novos** no `FormState`.
- **"Voltar à sugestão"** recalcula o texto a partir de (modelo, ramo, idioma): a composição é uma função pura,
  então restaurar é recompor, sem guardar cópia.
- **Atalhos** ("citar o nome do cliente", "avisar que é uma IA") acrescentam uma frase à abertura ou às instruções.
- **Estação 4.** "O cliente pede uma pessoa" usa o que já existe (`handoff_keywords`, `handoff_tool_enabled`).
  "Assunto sensível" **não é palavra-chave**: vira uma linha nas instruções. O construtor confere se isso basta.
- **Rascunho e abandono.** O estado do assistente vive no cliente até a estação 5. Ao **entrar na estação 5** o
  agente é salvo como rascunho (para o teste real). Quem abandona depois disso deixa um agente rascunho, visível na
  lista como qualquer outro, sem limpeza automática. Voltar ao assistente depois de salvo **não** entra no primeiro
  corte; "Prefiro o editor completo" depois de salvo leva à tela de edição.
- **Publicar sem ter testado.** Valem as conferências que já existem (`bloqueio-de-publicacao`); o assistente não
  cria regra nova nem relaxa nenhuma.
- **Equivalência.** O teste de "mesmo agente" cobre os campos que o assistente responde. Capacidades dependem do
  ponto aberto abaixo.

## Decisões fechadas (24/10/2026, dono do produto)

O dono pediu a opção mais simples para quem usa e aprovou o documento ("pode fechar e seguir até o final").

1. **Capacidades:** um conjunto por modelo, ligado pelo assistente, **sem a pessoa escolher**. A tela mostra uma
   frase em português do que o agente vai fazer, nunca a palavra "capacidade". Suporte e Atendimento **não** ligam
   nada que mexa no funil; Vendas e Agendamento ligam o que o modelo precisa. Qual capacidade entra em qual
   conjunto é conferência do construtor contra `TOOL_CATALOG` (capacidade de risco crítico nunca entra, como em
   `ligarPacote`). O editor completo segue mostrando todas.
2. **Primeiro corte do conteúdo:** os ramos mais comuns com texto cuidado nos 3 idiomas, mais "Outro". Ramo que
   aparece na lista sem texto próprio se comporta como "Outro" e nunca fica quebrado. Os demais ramos do catálogo
   entram depois, sem mudar o assistente.
3. **Prévia:** fixa nas estações 1 a 4; teste real só na 5.
4. **"Revisar com o assistente"** em agente existente: fora do primeiro corte.
