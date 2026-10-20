# Marca

## Símbolo e logotipo

| Arquivo | O que é |
|---|---|
| `zapsales-icon.svg` | O símbolo: balão de conversa com um raio dentro, em violeta `#773df9`. Quadrado de 216. |
| `zapsales-logo.svg` | Logotipo para fundo claro — símbolo em violeta `#773df9`, nome em `#151a2e`, "by" em `#4b5373`, seguido do logo da Futuristas. |
| `zapsales-logo-dark.svg` | Logotipo para fundo escuro — violeta `#9e8aff`, nome em `#eef0f7`, "by" em `#a3abc6`, seguido do logo da Futuristas. |

O texto do logotipo já está convertido em caminhos — "ZapSales" em Liberation Sans e "by" em
Atkinson Hyperlegible, as duas SIL OFL; o logo da Futuristas já vem em traços: nenhum arquivo
depende de fonte. A arte é a que o produto desenha desde 07/10/2026 (`lib/branding/desenho.ts` e
`components/branding/AssinaturaFuturistas.tsx`) e a que a tela de entrada serve em produção.

**Estes SVGs são a fonte; o app NÃO os lê.** A geometria está copiada em
`lib/branding/desenho.ts` e é desenhada inline por `components/branding/MarcaDoProduto.tsx`
(barra lateral, fachada de entrada) e por `app/icon.tsx` (ícone da aba) — e só aparece
quando ninguém configurou marca própria (`marcaEhADoProduto`, em `lib/branding.ts`).
Um `.svg` em `public/` seria servido na instalação de todo revendedor, que é o vazamento
que `tests/unit/branding.test.ts` existe para impedir. Ao revisar a arte, atualize os
três arquivos aqui **e** o `desenho.ts`; `tests/unit/marca-do-produto.test.tsx` cobra
que as cores dos dois lados coincidam.

Os READMEs (pt, en, es) usam os arquivos diretamente, num `<picture>` que troca para a
versão escura conforme o tema do GitHub.

## Prévia social (Open Graph)

`og-social-preview.png` — 1280×640, é a imagem que aparece quando um link do
repositório é compartilhado no X, LinkedIn, WhatsApp, Slack ou Discord.

**Como aplicar:** GitHub → Settings → General → *Social preview* → Upload.
Não existe endpoint público na API para isso; é upload pela interface.

**Como regerar:** a fonte é `og-card.svg` (o logotipo inline mais a frase do produto).
Depois de editá-la:

```bash
node -e "require('sharp')(require('fs').readFileSync('docs/brand/og-card.svg')).png().toFile('docs/brand/og-social-preview.png')"
```

A fonte fica versionada de propósito: card cuja origem se perde vira arte que ninguém
consegue atualizar quando o posicionamento muda.

## Regras da arte

- Paleta da Futuristas (fundo branco, violeta `#773df9`, texto `#151a2e`) — a mesma do logotipo.
- Card de compartilhamento **sempre** carrega o logotipo. Sem ele, quem vê a imagem não
  sabe de quem ela é.
