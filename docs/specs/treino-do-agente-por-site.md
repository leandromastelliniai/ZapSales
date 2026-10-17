# Treino do agente por site

> Issue #93 (filha da #86). Contrato do tipo de material **`site`** da base de conhecimento.
> Código: `lib/ai/rag/ingest/site*.ts`, `workers/rag-indexer.ts`, `app/api/v1/ai/knowledge/sources/**`.
> Mapa vivo: `docs/architecture/acervo-de-conhecimento.architecture.json`.

**Destino (DoD 18): núcleo.** "Se nenhuma organização cadastrar um site, a operação comum continua
inteira?" — sim: é só mais um tipo de material, sem dependência paga nem interruptor. Quem não usa não
tem tabela a mais lida, rota a mais chamada nem variável obrigatória.

## O que é

A pessoa informa **uma lista de páginas** (https, até 20 por fonte). O sistema lê o texto principal de cada
uma e o indexa **como qualquer material**: mesmo chunking, mesmos embeddings, mesmo `content_hash` e mesma
versão de índice. O agente só consulta a fonte se ela estiver marcada para ele (`knowledge_source_ids` da
versão publicada), como nas demais. **Não há rastreamento do domínio e não há agendamento**: o re-treino
é um botão por fonte.

## Contrato

| Peça | Comportamento |
|---|---|
| `POST /api/v1/ai/knowledge/sources` | `source_type: "site"` + `urls: string[]`. A forma da lista é validada por `enderecosDoSiteSchema` (https, sem usuário/senha, sem repetida nem `#fragmento`, 1 a N, endereço interno **óbvio** recusado). `urls` em outro tipo é 422 — não é descartado em silêncio. Audita `ai.knowledge_site_created` (host e contagem, nunca a URL inteira: ela pode levar `?token=`). |
| `PATCH …/sources/:id` | `urls` troca a lista inteira (cria as novas, remove as que saíram, mantém o estado das que ficam) e dispara a leitura. **Renomear não lê rede.** Audita `ai.knowledge_site_pages_changed`. |
| `GET …/sources/:id/paginas` | O estado de cada página. 404 para outra organização ou para fonte que não é site. |
| `POST …/sources/:id/reindex` | O re-treino manual. Audita `ai.knowledge_site_retrained`. |

A organização vem sempre da sessão. Papel mínimo: `manager` (o do resto do acervo). Toda mutação declara
`requireSupportWrite` antes do efeito.

## Estado por página (`ai_knowledge_source_pages`)

`status` ∈ `pendente | lida | falhou` (CHECK + `ESTADOS_DA_PAGINA`, vigiado pelo invariante de vocabulário),
`error_code` (estável) e `error_message` (frase de gente), `title`, `content_hash` (SHA-256 do texto lido),
`chunks_count`, `last_read_at`, `last_changed_at`. O **texto não é guardado aqui**: vive em `ai_chunks`.

Códigos de falha: `endereco_invalido`, `endereco_recusado`, `tempo_esgotado`, `pagina_grande_demais`,
`redirecionamentos_demais`, `sem_conexao`, `resposta_http`, `tipo_nao_suportado`, `sem_texto`.

## Como a leitura funciona

1. O indexador (`processRagIndexer`) recebe `knowledge_source.updated` para uma fonte `site`.
2. `montarPedacosDoSite` lê as páginas (4 por vez) com `lerPagina`, que sai **só** por `buscarSeguro`
   (rede segura única, #88): https, DNS preso ao socket, IP interno/privado/local recusado a cada salto de
   redirecionamento (até 3), 15 s no total e 2 MB contados no que chega.
3. `extrairTextoPrincipal` devolve o que uma pessoa leria: sem `script`, `style`, `nav`, `header`,
   `footer`, `aside`, `form`, `svg`, `iframe`, comentário, `template`, `noscript` — e sem o que a própria
   página esconde (`hidden`, `aria-hidden`, `display:none`, `visibility:hidden`). Prefere `<main>`/`<article>`
   quando há texto suficiente. É um tokenizador linear: HTML hostil custa O(n).
4. Cada trecho recebe `metadata = { source_type: "site", pagina, endereco }`. `pagina` é o título (ou
   `host/caminho`) e é o **nome citado**, no mesmo lugar em que o documento leva `arquivo`.
5. **Página inalterada não é reprocessada**: o vetor de um trecho com o mesmo `content_hash` é reaproveitado
   da versão ativa — só se ela foi calculada com o **mesmo modelo** de embedding. Nada mudou em nenhuma
   página ⇒ `sem_mudanca`, sem versão nova e sem chamada ao provedor.
6. Página que **falha depois de já ter sido lida** mantém os trechos da versão ativa (um site fora do ar por
   uma hora não apaga o que o agente sabia). Se **nenhuma** página pôde ser lida e nada pode ser mantido, a
   fonte fica `failed` com o motivo, sem versão vazia.
7. Se alguma página falhou, a fonte fica `partial` ("Entrou pela metade"), com o aviso do que não foi lido.

## Segurança

- **Conteúdo é dado, nunca instrução.** A leitura devolve texto e hash; nada do que a página diz é
  interpretado, nenhum link é seguido. O texto entra como trecho e atravessa as defesas que já valem para
  qualquer material. O texto **visível** com instrução ("ignore as regras…") entra como texto do trecho,
  exatamente como veio; o **escondido** não entra.
- Toda saída de rede passa pela política única; não há `fetch` direto.
- A auditoria guarda host e contagem, nunca a URL inteira.

## Configuração (todas opcionais; `.env` antigo continua funcionando)

| Variável | Padrão | |
|---|---|---|
| `KB_SITE_MAX_PAGES` | 20 | páginas por fonte |
| `KB_SITE_MAX_BYTES` | 2097152 | bytes por página |
| `KB_SITE_TIMEOUT_MS` | 15000 | prazo total por página |

Valor ausente, zero, negativo ou ilegível volta ao padrão (`limitesDoSite`) e nunca derruba o app.

## Banco (migration 0549)

- `ai_knowledge_source_pages`: `organization_id`, RLS (leitura só para membros), sem privilégio de escrita
  para `anon`/`authenticated` — a escrita é do servidor.
- `ai_knowledge_sources_source_type_check` **volta**, com o vocabulário fechado
  `faq | documento | conversas | catalogo | site`. Nomes legados são traduzidos antes (a 0181 já fez) e a
  validação é auto-curativa: valor desconhecido num clone deixa a constraint `NOT VALID`, sem derrubar a
  atualização.

## Como verificar

```bash
pnpm vitest run lib/ai/rag tests/unit/rag-indexer-site.test.ts tests/unit/ai-knowledge-site-rotas.test.ts
pnpm test:db tests/invariants/treino-por-site-banco.test.ts tests/invariants/vocabulario-banco-x-typescript.test.ts
```

Os casos hostis de rede (IP privado, IPv6 especial, rebinding, redirecionamento interno, resposta gigante,
resposta lenta, instrução embutida) rodam contra **servidores HTTP reais** em `lib/ai/rag/ingest/site.test.ts`.
