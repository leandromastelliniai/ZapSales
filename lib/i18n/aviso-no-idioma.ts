import { IDIOMA_PADRAO, normalizarIdioma, type Idioma } from "./idiomas";

/**
 * O idioma da organização lido pela conexão que QUEM ESCREVE já tem na mão —
 * para o aviso da Central, que a tela mostra como foi gravado (sem `t()`), e
 * por isso tem de nascer no idioma de quem vai lê-lo.
 *
 * Irmã de `idiomaDaOrganizacao` (`./idioma-da-organizacao.ts`), que abre o
 * próprio admin client. Aqui o cliente vem de fora, por dois motivos: o mundo
 * `pg` do agent-engine não tem cliente Supabase nenhum, e um emissor que já
 * recebeu o seu `admin` (ou um dublê dele nos testes) não deve abrir outro.
 *
 * As duas NUNCA lançam: aviso em português é muito melhor que aviso nenhum, e o
 * idioma é enfeite perto do alerta. Leitura que falha, linha que não veio, ou
 * dublê de teste que não conhece `organizations` — tudo cai no padrão.
 */

/** O mínimo do supabase-js que a leitura usa: um `select` por id. */
interface ClienteComFrom {
  from(tabela: string): unknown;
}

interface ConsultaDoLocale {
  select(colunas: string): { eq(coluna: string, valor: string): { maybeSingle(): PromiseLike<{ data: unknown }> } };
}

/** Pelo supabase-js (admin client do emissor). */
export async function idiomaPeloCliente(cliente: ClienteComFrom, organizationId: string): Promise<Idioma> {
  try {
    const consulta = cliente.from("organizations") as ConsultaDoLocale;
    const { data } = await consulta.select("locale").eq("id", organizationId).maybeSingle();
    return normalizarIdioma((data as { locale?: string | null } | null)?.locale ?? null);
  } catch {
    return IDIOMA_PADRAO;
  }
}

/** O mínimo do `pg` que a leitura usa — `Pool`, `PoolClient` e `Queryable` servem. */
interface ComQuery {
  query(texto: string, valores?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Pelo `pg` (agent-engine, workers). */
export async function idiomaPeloPool(db: ComQuery, organizationId: string): Promise<Idioma> {
  try {
    const { rows } = await db.query("select locale from organizations where id = $1", [organizationId]);
    return normalizarIdioma((rows?.[0] as { locale?: string | null } | undefined)?.locale ?? null);
  } catch {
    return IDIOMA_PADRAO;
  }
}

/**
 * Para a rodada que avisa VÁRIAS organizações (cron): uma leitura por
 * organização, não uma por aviso.
 */
export function leitorDeIdiomaPeloCliente(cliente: ClienteComFrom): (organizationId: string) => Promise<Idioma> {
  const lidos = new Map<string, Promise<Idioma>>();
  return (organizationId) => {
    let idioma = lidos.get(organizationId);
    if (!idioma) {
      idioma = idiomaPeloCliente(cliente, organizationId);
      lidos.set(organizationId, idioma);
    }
    return idioma;
  };
}

/**
 * Troca os `{marcadores}` DEPOIS da tradução — a ordem das palavras é a de cada
 * língua, e o guarda de forma do catálogo (`catalogo-de-idioma-tem-forma`)
 * reprova a tradução que perder um deles. Função na substituição, e não a
 * string: um valor com `$&` (nome de modelo, telefone) não vira padrão.
 */
export function preencher(texto: string, valores: Record<string, string | number>): string {
  return Object.entries(valores).reduce(
    (parcial, [nome, valor]) => parcial.replaceAll(`{${nome}}`, () => String(valor)),
    texto,
  );
}
