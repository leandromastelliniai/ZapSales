/**
 * "A tabela não existe" — a pergunta que um módulo opcional faz ao banco para
 * saber se foi instalado (ADR-0002: as tabelas do módulo só nascem quando ele é
 * instalado na instância).
 *
 * São DOIS códigos, e quem testa só um erra em produção:
 *  - `42P01` é do Postgres (`undefined_table`): chega por SQL/RPC direto.
 *  - `PGRST205` é do PostgREST ("Could not find the table … in the schema
 *    cache"): é o que o supabase-js devolve em `.from("tabela")` quando a tabela
 *    nunca foi criada. É o caminho de TODO handler desta base.
 *
 * Os testes que simulavam só `42P01` passavam enquanto a "Prévia de dados do
 * titular" dava 500 numa instalação sem o módulo de honorários.
 */
export function tabelaAusente(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
