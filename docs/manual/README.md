# Manual do usuário do ZapSales

Manual em HTML, com índice, busca e prints anotados, que explica cada menu, cada tela e cada botão do ZapSales para quem usa o sistema (donos de negócio e equipes, não programadores).

**Para ler:** abra [`index.html`](index.html) no navegador. Não precisa de servidor nem de internet.

## Como está organizado

| Caminho                    | O que é                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`               | O manual pronto. **Gerado** — não edite à mão.                                                                                    |
| `modelo.html`              | O esqueleto: estilo, busca, navegação e ampliação de imagens.                                                                     |
| `conteudo/grupos.json`     | A ordem e os nomes dos grupos do índice.                                                                                          |
| `conteudo/<grupo>/*.html`  | **Uma página do manual por arquivo.** É aqui que se escreve.                                                                      |
| `img/`                     | Os prints, já com setas e números desenhados.                                                                                     |
| `ferramentas/montar.mjs`   | Junta tudo em `index.html`.                                                                                                       |
| `ferramentas/conferir.mjs` | Confere imagens, links, ids e cobertura do menu.                                                                                  |
| `ferramentas/anotar.js`    | Desenha contorno, seta e número sobre a tela real, antes do print.                                                                |
| `ferramentas/demo/`        | Scripts da organização de demonstração usada nos prints (criar, semear, ligar módulos, apagar). Rodam só na VPS de teste do dono. |
| `ferramentas/catalogo.mjs` | Lê as telas do menu em `lib/navigation/catalogo.ts`: o manual não guarda cópia dessa lista.                                       |

## Comandos

```bash
node docs/manual/ferramentas/montar.mjs          # regera index.html
node docs/manual/ferramentas/conferir.mjs        # regera e confere (falha se houver defeito)
node docs/manual/ferramentas/conferir.mjs --estrito   # falha também se faltar página para alguma tela do menu
```

Só o Node é necessário. `conferir.mjs --estrito` é o critério de "manual completo": toda tela do menu tem página.

As telas do menu que ainda não têm página aparecem no índice como **em breve**, com a descrição que o próprio sistema dá para elas. Quando a página é escrita, ela troca o "em breve" sozinha, desde que declare a rota da tela em `rotas`.

## Como escrever uma página

Crie `conteudo/<grupo>/<nome>.html`. A **primeira linha** é obrigatória e é um JSON numa linha só:

```html
<!--meta {"id":"funis","grupo":"crm","titulo":"Funis","ordem":1,"resumo":"Uma frase.","palavras":["kanban","pipeline"],"onde":"CRM › Funis","quem":"Quem pode usar.","rotas":["/app/kanban"]} -->
```

- `id`: o endereço da página (`index.html#funis`). Único.
- `grupo`: um `id` de `conteudo/grupos.json`.
- `rotas`: os caminhos da tela, como estão em `lib/navigation/catalogo.ts`. É isso que tira a tela da lista de "em breve". Tela interna (de um item, por exemplo) usa o formato `/app/x/[id]`.
- `palavras`: sinônimos que as pessoas digitam na busca (kanban, pipeline, lead…).
- `quem`: o papel mínimo, **conferido no código** (`requireRole` da rota e `ROLE_RANK` da página), nunca de memória.

Depois, o corpo é HTML simples. Os blocos prontos:

| Para quê                        | Como                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Seção (entra no "Nesta página") | `<h2 id="lista">Título</h2>` — o `id` ganha o prefixo da página: o link fica `#funis--lista`            |
| Subseção                        | `<h3 id="criar">…</h3>`                                                                                 |
| Print                           | `<figure class="print"><img src="img/x.png" alt="…" loading="lazy"><figcaption>…</figcaption></figure>` |
| Legenda dos números do print    | `<ol class="legenda"><li>…</li></ol>` — os círculos vermelhos numeram sozinhos, na ordem do print       |
| Passo a passo                   | `<ol class="passos"><li>…</li></ol>`                                                                    |
| Aviso                           | `<aside class="nota dica\|atencao\|perigo\|info"><strong>Título.</strong><p>…</p></aside>`              |
| Tabela                          | `<table class="tabela">`                                                                                |
| Nome de botão, campo ou item    | `<span class="ui">Novo funil</span>`                                                                    |
| Tecla                           | `<kbd>Enter</kbd>`                                                                                      |
| Ir a outra página ou seção      | `<a href="#contatos">` ou `<a href="#contatos--ficha">`                                                 |

`conferir.mjs` reprova imagem que não existe, imagem sem `alt`, link interno quebrado e id repetido.

## Regras de conteúdo

1. **Só o que foi visto.** Cada botão, campo e comportamento descrito foi visto na tela ou confirmado no código. O que não deu para confirmar não entra, ou entra dito de forma geral.
2. **Linguagem de quem não programa.** Sem jargão; quando o termo é inevitável (CSV, tag, lead), ele é explicado na primeira vez, e `Conceitos básicos` tem o glossário.
3. **Cada tela tem a mesma estrutura:** ficha → print com números → legenda → passo a passo → cuidados.
4. **Aviso é aviso.** O que apaga, o que não tem volta e o que envia algo ao cliente aparecem em `nota perigo` ou `nota atencao`.

## Como gerar os prints

Os prints saem de uma **organização de demonstração com dados fictícios**, nunca de dados de clientes reais.

1. Entre na organização de demonstração com o navegador em **1440 × 900**, tema **claro**.
2. Abra a tela e injete `ferramentas/anotar.js` (`page.addScriptTag({ path: … })`).
3. Chame `window.__anota([{ n: 1, sel: 'button', texto: 'Novo funil', at: 't' }, …])`. Cada item acha o elemento por seletor CSS e, se houver, pelo texto exato; `at` diz de que lado fica o número (`t b l r tl tr bl br`). A resposta diz quantos foram desenhados e quais não foram achados.
4. Tire o print, salve em `img/<pagina>-<assunto>.png` e rode `window.__anotaLimpa()`.
5. Confira a imagem a olho: o número deve cair sobre o elemento certo e não cobrir o texto que a legenda explica.

Janelas altas (diálogos longos) pedem uma altura de janela maior; espere a animação do diálogo terminar antes de medir.

## Grupos e identidade

Além dos grupos que seguem o menu, há dois fora dele: **Entrar e começar** (`entrada`: login, cadastro, convite, onboarding, páginas legais e de aviso) e **Painel do dono do servidor** (`admin`: o modo administrador). Essas páginas declaram `"rotas": []`, porque as telas não estão em `lib/navigation/catalogo.ts`.

O cabeçalho, a paleta violeta e o rodapé usam a marca **ZapSales by Futuristas**. Os dois logos são desenhados uma vez, como `<symbol>` SVG no `modelo.html` (`lg-simbolo` e `lg-futuristas`, copiados de `lib/branding/desenho.ts` e `components/branding/AssinaturaFuturistas.tsx`), e reusados com `<use>`. As cores entram por variáveis CSS (`--bl`, `--rz`, `--sq`), porque seletores do documento não alcançam o conteúdo de um `<use>`.
