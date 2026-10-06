/**
 * Um `SupabaseClient` de MENTIRA, feito de `pg` de VERDADE.
 *
 * ═══ POR QUE ISTO EXISTE ═══
 *
 * `pnpm test:db` sobe Postgres puro, **sem PostgREST** — de propósito
 * (`vitest.db.config.ts` aponta `NEXT_PUBLIC_SUPABASE_URL` para uma porta
 * inalcançável). Então código que fala `supabase.from(...)` não tinha como ser
 * exercitado ali: só dava para reescrever a consulta em SQL ao lado e conferir
 * que o banco se defende — o que prova o BANCO, nunca o CÓDIGO.
 *
 * Aqui a decisão do código roda de verdade: quais filtros ele aplica, em que
 * ordem, o que faz com o que volta. O que muda é só o transporte.
 *
 * ═══ O QUE ELE NÃO REPRODUZ (declarado, não estimado) ═══
 *
 * 1. **RLS.** `pg` conecta como `postgres` e passa por cima. Isolamento entre
 *    organizações é medido pelos invariantes que usam papel restrito — não aqui.
 * 2. **Rede.** Timeout, retry e erro de transporte não existem neste caminho.
 * 3. **A superfície inteira do PostgREST.** Só o que está implementado abaixo:
 *    `select/insert/update/upsert/delete` com `eq`, `order`, `limit`, `maybeSingle`,
 *    `single`, contagem `count: "exact"` e embed to-one (`alias:coluna_fk(colunas)`,
 *    com `!inner` e filtro `alias.coluna`, traduzido para subquery). Um
 *    método não implementado **estoura** em vez de ser ignorado em silêncio —
 *    ver `naoImplementado`. Silêncio aqui viraria teste verde medindo nada.
 *
 * ═══ E SE ELE MENTIR? ═══
 *
 * Um adaptador que ignorasse um `.eq()` deixaria o teste passar pelo motivo
 * errado. Por isso `tests/invariants/pg-como-supabase.test.ts` sabota o próprio
 * adaptador: filtro que não filtra, ordem que não ordena e `maybeSingle` com
 * duas linhas têm caso próprio. O instrumento é medido antes de medir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type pg from "pg";

interface ErroPg {
  message: string;
  code?: string;
}

export interface RespostaFalsa<T> {
  data: T | null;
  error: ErroPg | null;
}

function naoImplementado(metodo: string): never {
  throw new Error(
    `[pg-como-supabase] '${metodo}' não está implementado. ` +
      "Implemente-o (com caso no teste do adaptador) em vez de contornar — " +
      "método ausente que devolvesse vazio faria o teste passar medindo nada.",
  );
}

/**
 * O valor como parâmetro do `pg`. Objeto vira JSON (o driver não converte), e
 * LISTA DE OBJETOS também: o driver serializa `Array` como array do Postgres
 * (`{...}`), o que numa coluna `jsonb` é JSON inválido — e `meta_templates.components`
 * é exatamente uma lista de objetos. Lista de primitivos segue como array do
 * Postgres (`text[]`, `uuid[]`), que é o que ela é nas colunas que a usam.
 */
function parametro(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (!Array.isArray(v)) return JSON.stringify(v);
  return v.some((item) => item !== null && typeof item === "object") ? JSON.stringify(v) : v;
}

function erroDe(e: unknown): ErroPg {
  const bruto = e as { message?: string; code?: string };
  return { message: bruto?.message ?? String(e), code: bruto?.code };
}

/**
 * `is null|true|false` — o `is` não aceita placeholder: a gramática do SQL exige
 * a palavra depois do operador, e `x is $1` é erro de sintaxe.
 */
function literalDeIs(valor: unknown): string {
  if (valor === null || valor === undefined) return "null";
  if (valor === true) return "true";
  if (valor === false) return "false";
  return naoImplementado(`is(${JSON.stringify(valor)})`);
}

/**
 * `(read,delivered)` — a lista que o PostgREST manda em `.not(col, "in", ...)`.
 *
 * As aspas duplas protegem vírgula DENTRO do valor, então o corte passa pelo
 * `fatiarNoTopo` em vez de um `split(",")` cru.
 */
function listaDoPostgrest(bruto: unknown): string[] {
  if (Array.isArray(bruto)) return bruto.map((x) => String(x));
  const texto = String(bruto ?? "").trim();
  const dentro = texto.startsWith("(") && texto.endsWith(")") ? texto.slice(1, -1) : texto;
  if (dentro.trim() === "") return [];
  return fatiarNoTopo(dentro).map((v) => v.trim().replace(/^"(.*)"$/, "$1"));
}

/** Aspas em cada coluna: `slug`, `position` e afins são palavras vivas no SQL. */
function colunasSql(colunas: string): string {
  if (colunas.trim() === "*") return "*";
  return fatiarNoTopo(colunas)
    .map((c) => `"${c.trim()}"`)
    .join(", ");
}

/**
 * Fatia por vírgula **de topo** — a que está fora de parênteses.
 *
 * `"id, contacts:contact_id(a, b)"` tem três vírgulas e só DUAS colunas. Um
 * `split(",")` cru quebraria o embed no meio e pediria ao Postgres uma coluna
 * chamada `contacts:contact_id(a`.
 */
function fatiarNoTopo(lista: string): string[] {
  const partes: string[] = [];
  let profundidade = 0;
  let atual = "";
  for (const ch of lista) {
    if (ch === "(") profundidade += 1;
    if (ch === ")") profundidade -= 1;
    if (ch === "," && profundidade === 0) {
      partes.push(atual);
      atual = "";
      continue;
    }
    atual += ch;
  }
  if (atual.trim() !== "") partes.push(atual);
  return partes;
}

/**
 * EMBED do PostgREST — `alias:coluna_fk(colunas)`.
 *
 * Nasceu porque `sendMessageHandler` (a ÚNICA porta de saída de mensagem do
 * produto) lê a conversa com dois embeds — `contacts:contact_id(...)` e
 * `channel_sessions:channel_session_id(...)`. Sem tradução, esse select
 * ESTOURAVA no adaptador, e qualquer invariante sobre o caminho de envio
 * morria num 500 genérico em vez de medir a decisão do handler.
 *
 * A tabela do embed é o ALIAS. É a convenção que o repo inteiro usa (o alias
 * nomeia a tabela referenciada), e o custo de errar é barulhento — `relation
 * "x" does not exist` — nunca silencioso.
 *
 * Zero linhas vira `null`, como o PostgREST devolve para um embed to-one sem
 * correspondente. É o caso real de conversa sem canal.
 */
interface Embed {
  alias: string;
  colunaFk: string;
  colunas: string;
  /**
   * `alias:coluna_fk!inner(colunas)` — só volta a linha que TEM o embed, e o
   * filtro `.eq("alias.coluna", v)` corta pela coluna do embutido. Nasceu pelo
   * motor de campanhas, que filtra `organizations.status` dentro da consulta
   * (`lib/campanhas/rodada.ts`) para o corte acontecer antes do `limit`.
   */
  inner: boolean;
}

function lerEmbed(pedaco: string): Embed | null {
  const m = /^\s*([A-Za-z0-9_]+)\s*:\s*([A-Za-z0-9_]+)(!inner)?\s*\(([^]*)\)\s*$/.exec(pedaco);
  if (m) return { alias: m[1]!, colunaFk: m[2]!, colunas: m[4]!, inner: m[3] === "!inner" };
  // Forma curta `contacts(colunas)`: o PostgREST acha a FK sozinho. Aqui ela é
  // a convenção do schema — a tabela no singular + `_id` (`contact_id`). Se a
  // coluna não existir, o Postgres ESTOURA com o nome dela, nunca em silêncio.
  // Nasceu pela lista de destinatários da campanha.
  const curta = /^\s*([A-Za-z0-9_]+)s(!inner)?\s*\(([^]*)\)\s*$/.exec(pedaco);
  if (!curta) return null;
  return { alias: `${curta[1]!}s`, colunaFk: `${curta[1]!}_id`, colunas: curta[3]!, inner: curta[2] === "!inner" };
}

/** Os embeds de uma projeção — o filtro `alias.coluna` e o `!inner` precisam deles. */
function embedsDe(colunas: string): Embed[] {
  if (colunas.trim() === "*") return [];
  return fatiarNoTopo(colunas)
    .map((p) => lerEmbed(p))
    .filter((e): e is Embed => e !== null);
}

/**
 * A coluna de um filtro como expressão SQL. `alias.coluna` vira a subquery do
 * embutido (to-one); o resto, a coluna da linha, entre aspas.
 */
function colunaDoFiltro(coluna: string, embeds: Embed[]): string {
  const ponto = coluna.indexOf(".");
  if (ponto < 0) return `"${coluna}"`;
  const alias = coluna.slice(0, ponto);
  const e = embeds.find((x) => x.alias === alias);
  if (!e) return naoImplementado(`filtro em '${coluna}' sem o embed '${alias}' no select`);
  return `(select "${coluna.slice(ponto + 1)}" from public."${e.alias}" where "id" = linha."${e.colunaFk}")`;
}

/** Um filtro `[op, coluna, valor]` como SQL, empurrando o valor em `valores`. */
function filtroSql(op: string, coluna: string, v: unknown, valores: unknown[]): string {
  // `is` não gasta placeholder: a palavra entra inline.
  if (op === "is") return `${coluna} is ${literalDeIs(v)}`;
  if (op === "is not") return `${coluna} is not ${literalDeIs(v)}`;
  valores.push(v);
  // `= any` recebe o array inteiro num placeholder só; os demais operadores
  // são infixos comuns.
  if (op === "= any") return `${coluna} = any($${valores.length})`;
  if (op === "not = any") return `not (${coluna} = any($${valores.length}))`;
  return `${coluna} ${op} $${valores.length}`;
}

function embedSql(e: Embed, aliasExterno: string): string {
  const cols = fatiarNoTopo(e.colunas)
    .map((c) => `"${c.trim()}"`)
    .join(", ");
  return (
    `(select to_jsonb(emb) from (select ${cols} from public."${e.alias}" ` +
    `where "id" = ${aliasExterno}."${e.colunaFk}") emb) as "${e.alias}"`
  );
}

/**
 * Projeção do `select`, já com os embeds traduzidos. Devolve também se houve
 * embed: quando há, o FROM precisa de alias para a subquery poder apontar para
 * a coluna de FK da linha externa.
 */
function projecaoSql(colunas: string, aliasExterno: string): { sql: string; temEmbed: boolean } {
  if (colunas.trim() === "*") return { sql: "*", temEmbed: false };
  let temEmbed = false;
  const sql = fatiarNoTopo(colunas)
    .map((pedaco) => {
      const embed = lerEmbed(pedaco);
      if (!embed) return `"${pedaco.trim()}"`;
      temEmbed = true;
      return embedSql(embed, aliasExterno);
    })
    .join(", ");
  return { sql, temEmbed };
}

class ConsultaPg<T> implements PromiseLike<RespostaFalsa<T[]>> {
  /** [operador, coluna, valor] — o operador entra porque `.lt`/`.gt` existem. */
  private filtros: Array<[string, string, unknown]> = [];
  private ordens: Array<{ coluna: string; asc: boolean }> = [];
  private teto: number | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly tabela: string,
    private readonly colunas: string,
    /**
     * `select(cols, { count: "exact", head: true })` — a contagem que o PostgREST
     * devolve em `count`. Com `head`, `data` é `null`. Nasceu pelo motor de
     * campanhas, que decide "concluir" e "já enviou" por contagem.
     */
    private readonly contagem: { count?: string; head?: boolean } = {},
  ) {
    if (contagem.count !== undefined && contagem.count !== "exact") {
      naoImplementado(`select com count '${contagem.count}'`);
    }
  }

  eq(coluna: string, valor: unknown): this {
    this.filtros.push(["=", coluna, valor]);
    return this;
  }

  /**
   * `is` — a coluna contra `null`/`true`/`false`.
   *
   * Nasceu sob pressão de um ingest de canal, que escrevia o telefone do contato
   * só quando ele está vazio (`contacts.phone_number is null`)
   * e resolve número interno de aviso por `.is("phone_number", null)`.
   * Um `is` que não filtrasse deixaria o teste afirmar coisa que não mediu.
   */
  is(coluna: string, valor: unknown): this {
    this.filtros.push(["is", coluna, valor]);
    return this;
  }

  /**
   * `.not(coluna, operador, valor)` — a negação do PostgREST é textual, no
   * terceiro argumento (`(read,delivered)`), não um método próprio por operador.
   */
  not(coluna: string, operador: string, valor: unknown): this {
    if (operador === "in") {
      this.filtros.push(["not = any", coluna, listaDoPostgrest(valor)]);
      return this;
    }
    if (operador === "eq") {
      this.filtros.push(["<>", coluna, valor]);
      return this;
    }
    // `.not(col, "is", null)` — nasceu pela cascata de LGPD (0497), que só
    // apaga a transcrição de mensagem que AINDA a tem. Um `is not` que não
    // filtrasse faria a varredura parecer idempotente sem ser.
    if (operador === "is") {
      this.filtros.push(["is not", coluna, valor]);
      return this;
    }
    return naoImplementado(`not(${operador})`);
  }

  /**
   * `<` e `>` — nasceram porque `vencePropostasDeDado` os usa e o adaptador
   * ESTOUROU ao ser chamado. Terceira vez que o `naoImplementado` paga o
   * próprio custo: devolver vazio teria deixado 7 casos verdes medindo nada.
   */
  lt(coluna: string, valor: unknown): this {
    this.filtros.push(["<", coluna, valor]);
    return this;
  }

  gt(coluna: string, valor: unknown): this {
    this.filtros.push([">", coluna, valor]);
    return this;
  }

  /**
   * `>=` e `<=` — QUARTA vez que o `naoImplementado` se paga. Nasceram porque
   * `horariosLivresDaOrg` (consulta.ts:209) filtra as exceções de jornada por
   * intervalo de datas, e o adaptador ESTOUROU no primeiro invariante que
   * exercitou o handler de marcar.
   *
   * E o estouro veio no CONTROLE POSITIVO do teste, não no caso principal: o
   * caso "não marca para o contato de outra org" teria passado por o handler
   * não marcar NADA. Adaptador que devolve vazio em vez de estourar teria
   * transformado um gate de isolamento em decoração.
   */
  gte(coluna: string, valor: unknown): this {
    this.filtros.push([">=", coluna, valor]);
    return this;
  }

  lte(coluna: string, valor: unknown): this {
    this.filtros.push(["<=", coluna, valor]);
    return this;
  }

  /** Mais de um `order` encadeado vira `order by a, b` — a ordem estável da audiência usa dois. */
  order(coluna: string, opts?: { ascending?: boolean }): this {
    this.ordens.push({ coluna, asc: opts?.ascending !== false });
    return this;
  }

  /**
   * `overlaps` (`&&`) e `contains` (`@>`) — arrays. Nasceram pela audiência da
   * campanha, que recorta por etiqueta (`tags && {outubro}`). Um filtro de
   * etiqueta ignorado mandaria a campanha para a organização inteira.
   */
  overlaps(coluna: string, valores: readonly unknown[]): this {
    this.filtros.push(["&&", coluna, [...valores]]);
    return this;
  }

  contains(coluna: string, valores: readonly unknown[]): this {
    this.filtros.push(["@>", coluna, [...valores]]);
    return this;
  }

  limit(n: number): this {
    this.teto = n;
    return this;
  }

  /**
   * `in` — QUINTA vez que o `naoImplementado` se paga, e desta vez o estouro
   * veio de um PR de contribuidor: a cascata de LGPD passou a cancelar a régua
   * do contato anonimizado com `.in("status", STATUS_DA_REGUA_VIVA)`
   * (`lib/lgpd/cascata.ts:221`), e o invariante que exercita a anonimização
   * estourou aqui em vez de ficar verde.
   *
   * O que teria acontecido com um `in` que devolvesse vazio: "nenhuma régua
   * viva" é o desfecho natural de uma lista vazia, então o teste passaria
   * afirmando que a cascata cancelou a régua — sem ela ter cancelado nada.
   *
   * `= any($n)` e não `in ($1,$2,…)` porque a lista é um parâmetro só: número
   * variável de placeholders reabriria a porta de montar SQL por concatenação.
   */
  in(coluna: string, valores: readonly unknown[]): this {
    this.filtros.push(["= any", coluna, [...valores]]);
    return this;
  }

  /** `<>` — a regra das 24 h do 131049 exclui o próprio destinatário da busca. */
  neq(coluna: string, valor: unknown): this {
    this.filtros.push(["<>", coluna, valor]);
    return this;
  }

  /** O `where` (filtros + `!inner`), sem projeção, ordem nem teto. */
  private onde(valores: unknown[]): string[] {
    const embeds = embedsDe(this.colunas);
    const onde = this.filtros.map(([op, c, v]) => filtroSql(op, colunaDoFiltro(c, embeds), v, valores));
    for (const e of embeds.filter((x) => x.inner)) {
      onde.push(`exists (select 1 from public."${e.alias}" where "id" = linha."${e.colunaFk}")`);
    }
    return onde;
  }

  private montar(): { texto: string; valores: unknown[] } {
    const valores: unknown[] = [];
    const onde = this.onde(valores);
    const projecao = projecaoSql(this.colunas, "linha");
    // Alias sempre: a subquery do embed (e o filtro por coluna do embutido)
    // aponta para a coluna de FK DA LINHA EXTERNA.
    let texto = `select ${projecao.sql} from public."${this.tabela}" linha`;
    if (onde.length > 0) texto += ` where ${onde.join(" and ")}`;
    if (this.ordens.length > 0) {
      texto += ` order by ${this.ordens.map((o) => `"${o.coluna}" ${o.asc ? "asc" : "desc"}`).join(", ")}`;
    }
    if (this.teto !== null) texto += ` limit ${this.teto}`;
    return { texto, valores };
  }

  /** A contagem de `count: "exact"`: os mesmos filtros, sem teto — como o PostgREST. */
  private async contar(): Promise<{ n: number; error: ErroPg | null }> {
    const valores: unknown[] = [];
    const onde = this.onde(valores);
    let texto = `select count(*)::int as n from public."${this.tabela}" linha`;
    if (onde.length > 0) texto += ` where ${onde.join(" and ")}`;
    try {
      const r = await this.pool.query<{ n: number }>(texto, valores);
      return { n: r.rows[0]?.n ?? 0, error: null };
    } catch (e) {
      return { n: 0, error: erroDe(e) };
    }
  }

  private async linhas(): Promise<{ rows: T[]; error: ErroPg | null }> {
    const { texto, valores } = this.montar();
    try {
      const r = await this.pool.query(texto, valores);
      return { rows: r.rows as T[], error: null };
    } catch (e) {
      return { rows: [], error: erroDe(e) };
    }
  }

  /** Zero linhas → `data: null` SEM erro. Mais de uma → ERRO, como o PostgREST. */
  async maybeSingle(): Promise<RespostaFalsa<T>> {
    const { rows, error } = await this.linhas();
    if (error) return { data: null, error };
    if (rows.length > 1) {
      return {
        data: null,
        error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
      };
    }
    return { data: rows[0] ?? null, error: null };
  }

  /** Exige exatamente uma. Zero também é erro — a diferença para `maybeSingle`. */
  async single(): Promise<RespostaFalsa<T>> {
    const { rows, error } = await this.linhas();
    if (error) return { data: null, error };
    if (rows.length !== 1) {
      return {
        data: null,
        error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" },
      };
    }
    return { data: rows[0]!, error: null };
  }

  then<R1 = RespostaFalsa<T[]>, R2 = never>(
    aoResolver?: ((v: RespostaFalsa<T[]>) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    if (this.contagem.count === "exact") {
      return this.contar()
        .then(async ({ n, error }) => {
          if (error) return { data: null, error, count: null };
          if (this.contagem.head) return { data: null, error: null, count: n };
          const r = await this.linhas();
          return r.error ? { data: null, error: r.error, count: null } : { data: r.rows, error: null, count: n };
        })
        .then(aoResolver as never, aoRejeitar);
    }
    return this.linhas()
      .then(({ rows, error }) => (error ? { data: null, error } : { data: rows, error: null }))
      .then(aoResolver, aoRejeitar);
  }
}

class InsercaoPg<T> implements PromiseLike<RespostaFalsa<null>> {
  private colunasDeVolta: string | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly tabela: string,
    /**
     * Uma linha ou uma LISTA — o insert em lote do PostgREST. Nasceu pela
     * preparação da campanha, que congela os destinatários em lotes de 500.
     * Linhas de colunas diferentes ESTOURAM: o PostgREST preencheria a falta com
     * o default, e adivinhar aqui mediria outra coisa.
     */
    private readonly linhas: Record<string, unknown> | Array<Record<string, unknown>>,
  ) {}

  select(colunas = "*"): this {
    this.colunasDeVolta = colunas;
    return this;
  }

  private montar(): { texto: string; valores: unknown[] } {
    const lista = Array.isArray(this.linhas) ? this.linhas : [this.linhas];
    const chaves = Object.keys(lista[0] ?? {});
    for (const l of lista) {
      const outras = Object.keys(l);
      if (outras.length !== chaves.length || outras.some((k) => !chaves.includes(k))) {
        naoImplementado("insert com linhas de colunas diferentes");
      }
    }
    // jsonb/array vão como parâmetro — ver `parametro`.
    const valores: unknown[] = [];
    const tuplas = lista.map(
      (l) =>
        `(${chaves
          .map((k) => {
            valores.push(parametro(l[k]));
            return `$${valores.length}`;
          })
          .join(", ")})`,
    );
    const texto =
      `insert into public."${this.tabela}" (${chaves.map((k) => `"${k}"`).join(", ")}) values ${tuplas.join(", ")}` +
      (this.colunasDeVolta ? ` returning ${colunasSql(this.colunasDeVolta)}` : "");
    return { texto, valores };
  }

  async single(): Promise<RespostaFalsa<T>> {
    const { texto, valores } = this.montar();
    try {
      const r = await this.pool.query(texto, valores);
      return { data: (r.rows[0] ?? null) as T, error: null };
    } catch (e) {
      return { data: null, error: erroDe(e) };
    }
  }

  /**
   * Difere de `single` no que faz com o ERRO, não com o sucesso: quem usa
   * `maybeSingle` num insert está dizendo "se não deu, sigo sem" — é o caso do
   * item da Central, que não pode derrubar o vencimento das propostas.
   */
  async maybeSingle(): Promise<RespostaFalsa<T>> {
    return this.single();
  }

  then<R1 = RespostaFalsa<null>, R2 = never>(
    aoResolver?: ((v: RespostaFalsa<null>) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const { texto, valores } = this.montar();
    return this.pool
      .query(texto, valores)
      .then(() => ({ data: null, error: null }) as RespostaFalsa<null>)
      .catch((e: unknown) => ({ data: null, error: erroDe(e) }) as RespostaFalsa<null>)
      .then(aoResolver, aoRejeitar);
  }
}


/**
 * UPDATE com filtros — a forma `.update(obj).eq(a,b).select(cols).maybeSingle()`.
 *
 * Nasceu porque `patchContactHandler` a usa, e o adaptador ESTOUROU ao ser
 * chamado (em vez de devolver vazio, que teria deixado o teste verde medindo
 * nada). O `naoImplementado` fez o trabalho dele.
 */
class AtualizacaoPg<T> implements PromiseLike<RespostaFalsa<unknown>> {
  /** [operador, coluna, valor] — mesmo contrato do `ConsultaPg`. */
  private filtros: Array<[string, string, unknown]> = [];
  private colunasDeVolta: string | null = null;

  constructor(
    private readonly pool: pg.Pool,
    private readonly tabela: string,
    private readonly patch: Record<string, unknown>,
  ) {}

  eq(coluna: string, valor: unknown): this {
    this.filtros.push(["=", coluna, valor]);
    return this;
  }

  /**
   * `.is()` na ESCRITA — o caminho que motivou a peça.
   *
   * Um ingest de canal gravava o telefone do contato recém-criado com
   * `update(...).eq("id", id).is("phone_number", null)`: a condição é uma
   * TRAVA, o telefone só é escrito se ainda estiver vazio. Sem `is` no
   * builder de update, esse `update` estourava em vez de filtrar.
   */
  is(coluna: string, valor: unknown): this {
    this.filtros.push(["is", coluna, valor]);
    return this;
  }

  /** `.in()` na ESCRITA — a promoção de agendadas atualiza só os ids escolhidos. */
  in(coluna: string, valores: readonly unknown[]): this {
    this.filtros.push(["= any", coluna, [...valores]]);
    return this;
  }

  /** `<>` na ESCRITA — o webhook da Meta não reescreve mensagem que já falhou. */
  neq(coluna: string, valor: unknown): this {
    this.filtros.push(["<>", coluna, valor]);
    return this;
  }

  /** `.not(coluna, operador, valor)` — a negação textual do PostgREST. */
  not(coluna: string, operador: string, valor: unknown): this {
    if (operador === "in") {
      this.filtros.push(["not = any", coluna, listaDoPostgrest(valor)]);
      return this;
    }
    if (operador === "eq") {
      this.filtros.push(["<>", coluna, valor]);
      return this;
    }
    // `.not(col, "is", null)` — nasceu pela cascata de LGPD (0497), que só
    // apaga a transcrição de mensagem que AINDA a tem. Um `is not` que não
    // filtrasse faria a varredura parecer idempotente sem ser.
    if (operador === "is") {
      this.filtros.push(["is not", coluna, valor]);
      return this;
    }
    return naoImplementado(`not(${operador})`);
  }

  select(colunas = "*"): this {
    this.colunasDeVolta = colunas;
    return this;
  }

  private montar(): { texto: string; valores: unknown[] } {
    const valores: unknown[] = [];
    const sets = Object.keys(this.patch).map((k) => {
      valores.push(parametro(this.patch[k]));
      return `"${k}" = $${valores.length}`;
    });
    const onde = this.filtros.map(([op, c, v]) => filtroSql(op, `"${c}"`, v, valores));
    // Alias na escrita também: o `returning` pode trazer embed (o webhook da
    // Meta devolve o telefone do contato junto da mensagem que falhou).
    let texto = `update public."${this.tabela}" linha set ${sets.join(", ")}`;
    if (onde.length > 0) texto += ` where ${onde.join(" and ")}`;
    if (this.colunasDeVolta) texto += ` returning ${projecaoSql(this.colunasDeVolta, "linha").sql}`;
    return { texto, valores };
  }

  async maybeSingle(): Promise<RespostaFalsa<T>> {
    const { texto, valores } = this.montar();
    try {
      const r = await this.pool.query(texto, valores);
      if (r.rows.length > 1) {
        return { data: null, error: { message: "multiple rows returned", code: "PGRST116" } };
      }
      return { data: (r.rows[0] ?? null) as T, error: null };
    } catch (e) {
      return { data: null, error: erroDe(e) };
    }
  }

  async single(): Promise<RespostaFalsa<T>> {
    const r = await this.maybeSingle();
    if (r.error) return r;
    if (r.data === null) {
      return { data: null, error: { message: "no rows returned", code: "PGRST116" } };
    }
    return r;
  }

  /**
   * ⚠️ Com `.select()`, o `await` direto devolve AS LINHAS — não `null`.
   *
   * A primeira versão devolvia `{data: null}` sempre, e isso quebrava um padrão
   * que o repo usa como TRAVA: `update().eq(id).eq(stage_id).select("id")` e
   * depois `if (linhas.length === 0)` para detectar "um humano moveu o card no
   * meio da operação". Com `null`, toda escrita bem-sucedida virava
   * `conflito_humano` — o adaptador afirmava que a trava tinha disparado
   * quando o UPDATE tinha funcionado.
   *
   * Sem `.select()`, `data: null` continua certo: é o que o PostgREST devolve.
   */
  then<R1 = RespostaFalsa<unknown>, R2 = never>(
    aoResolver?: ((v: RespostaFalsa<unknown>) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const { texto, valores } = this.montar();
    const pediuRetorno = this.colunasDeVolta !== null;
    return this.pool
      .query(texto, valores)
      .then(
        (r) =>
          ({ data: pediuRetorno ? r.rows : null, error: null }) as RespostaFalsa<unknown>,
      )
      .catch((e: unknown) => ({ data: null, error: erroDe(e) }) as RespostaFalsa<unknown>)
      .then(aoResolver, aoRejeitar);
  }
}

/**
 * DELETE com filtros — `.delete().eq(a, b)`. Nasceu pela preparação da campanha,
 * que apaga a lista anterior antes de reconstruí-la. Sem filtro ESTOURA: um
 * delete sem `where` apagaria a tabela inteira, e o PostgREST também o recusa.
 */
class ExclusaoPg implements PromiseLike<RespostaFalsa<null>> {
  private filtros: Array<[string, string, unknown]> = [];

  constructor(
    private readonly pool: pg.Pool,
    private readonly tabela: string,
  ) {}

  eq(coluna: string, valor: unknown): this {
    this.filtros.push(["=", coluna, valor]);
    return this;
  }

  in(coluna: string, valores: readonly unknown[]): this {
    this.filtros.push(["= any", coluna, [...valores]]);
    return this;
  }

  then<R1 = RespostaFalsa<null>, R2 = never>(
    aoResolver?: ((v: RespostaFalsa<null>) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    if (this.filtros.length === 0) naoImplementado("delete sem filtro");
    const valores: unknown[] = [];
    const onde = this.filtros.map(([op, c, v]) => filtroSql(op, `"${c}"`, v, valores));
    return this.pool
      .query(`delete from public."${this.tabela}" where ${onde.join(" and ")}`, valores)
      .then(() => ({ data: null, error: null }) as RespostaFalsa<null>)
      .catch((e: unknown) => ({ data: null, error: erroDe(e) }) as RespostaFalsa<null>)
      .then(aoResolver, aoRejeitar);
  }
}

/**
 * `upsert(linhas, { onConflict })` — `insert … on conflict (…) do update`.
 *
 * Nasceu porque a sincronização de modelos da Meta (`syncTemplates`) é um
 * upsert, e o invariante de modelos do canal oficial (issue #6) a dirige pela
 * rota de verdade. Só a forma que o PostgREST aceita com `onConflict`: sem ele,
 * ou com linhas de colunas diferentes, ESTOURA — o PostgREST resolveria pela
 * chave primária, e adivinhar aqui faria o teste medir outra coisa.
 *
 * O `do update` reescreve só as colunas ENVIADAS, como o PostgREST: coluna que
 * a linha não traz (ex.: `saved_values`) sobrevive ao upsert.
 */
class UpsertPg implements PromiseLike<RespostaFalsa<null>> {
  constructor(
    private readonly pool: pg.Pool,
    private readonly tabela: string,
    private readonly linhas: Array<Record<string, unknown>>,
    private readonly conflito: string[],
  ) {}

  private montar(): { texto: string; valores: unknown[] } {
    const chaves = Object.keys(this.linhas[0] ?? {});
    for (const l of this.linhas) {
      const outras = Object.keys(l);
      if (outras.length !== chaves.length || outras.some((k) => !chaves.includes(k))) {
        naoImplementado("upsert com linhas de colunas diferentes");
      }
    }
    const valores: unknown[] = [];
    const tuplas = this.linhas.map(
      (l) =>
        `(${chaves
          .map((k) => {
            valores.push(parametro(l[k]));
            return `$${valores.length}`;
          })
          .join(", ")})`,
    );
    const atualiza = chaves.filter((k) => !this.conflito.includes(k));
    const texto =
      `insert into public."${this.tabela}" (${chaves.map((k) => `"${k}"`).join(", ")}) values ${tuplas.join(", ")}` +
      ` on conflict (${this.conflito.map((c) => `"${c}"`).join(", ")})` +
      (atualiza.length > 0
        ? ` do update set ${atualiza.map((k) => `"${k}" = excluded."${k}"`).join(", ")}`
        : " do nothing");
    return { texto, valores };
  }

  then<R1 = RespostaFalsa<null>, R2 = never>(
    aoResolver?: ((v: RespostaFalsa<null>) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    if (this.linhas.length === 0) {
      return Promise.resolve({ data: null, error: null } as RespostaFalsa<null>).then(aoResolver, aoRejeitar);
    }
    const { texto, valores } = this.montar();
    return this.pool
      .query(texto, valores)
      .then(() => ({ data: null, error: null }) as RespostaFalsa<null>)
      .catch((e: unknown) => ({ data: null, error: erroDe(e) }) as RespostaFalsa<null>)
      .then(aoResolver, aoRejeitar);
  }
}

/**
 * `rpc(nome, args)` — chamada de função por argumentos NOMEADOS, como o
 * PostgREST faz. Sem isto, todo caminho que emite evento (`emit_event`) morre no
 * meio do handler sob teste.
 */
async function chamarRpc(
  pool: pg.Pool,
  nome: string,
  args: Record<string, unknown>,
): Promise<RespostaFalsa<unknown>> {
  const chaves = Object.keys(args);
  const valores = chaves.map((k) => {
    const v = args[k];
    return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
  });
  const nomeados = chaves.map((k, i) => `${k} => $${i + 1}`).join(", ");
  try {
    // Função que devolve CONJUNTO (`returns table`/`setof`) volta como lista de
    // linhas, como o PostgREST devolve. Nasceu pela reserva em lote da campanha
    // oficial (`fn_campanha_reservar_lote`, migration 0538).
    const conjunto = await pool.query<{ proretset: boolean }>(
      `select p.proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1 limit 1`,
      [nome],
    );
    if (conjunto.rows[0]?.proretset) {
      const conj = await pool.query(`select * from public."${nome}"(${nomeados})`, valores);
      return { data: conj.rows, error: null };
    }
    const r = await pool.query(`select public."${nome}"(${nomeados}) as valor`, valores);
    return { data: (r.rows[0] as { valor: unknown } | undefined)?.valor ?? null, error: null };
  } catch (e) {
    return { data: null, error: erroDe(e) };
  }
}

/**
 * O cast para `SupabaseClient` é deliberado e está confinado a esta linha: o
 * tipo real tem dezenas de membros que este objeto não tem, e listá-los como
 * `undefined` só esconderia a mesma verdade com mais texto.
 */
export function pgComoSupabase(pool: pg.Pool): SupabaseClient {
  return {
    from(tabela: string) {
      return {
        select: (colunas = "*", opcoes?: { count?: string; head?: boolean }) =>
          new ConsultaPg(pool, tabela, colunas, opcoes ?? {}),
        insert: (linhas: Record<string, unknown> | Array<Record<string, unknown>>) =>
          new InsercaoPg(pool, tabela, linhas),
        update: (patch: Record<string, unknown>) => new AtualizacaoPg(pool, tabela, patch),
        delete: () => new ExclusaoPg(pool, tabela),
        upsert: (linhas: Record<string, unknown> | Array<Record<string, unknown>>, opcoes?: { onConflict?: string }) => {
          if (!opcoes?.onConflict) return naoImplementado("upsert sem onConflict");
          return new UpsertPg(
            pool,
            tabela,
            Array.isArray(linhas) ? linhas : [linhas],
            opcoes.onConflict.split(",").map((c) => c.trim()),
          );
        },
      };
    },
    rpc: (nome: string, args: Record<string, unknown> = {}) => chamarRpc(pool, nome, args),
  } as unknown as SupabaseClient;
}
