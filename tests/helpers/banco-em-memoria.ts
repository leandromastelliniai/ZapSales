/**
 * Um banco em memória que responde ao subconjunto do PostgREST que o indexador e as rotas
 * do acervo usam. Cada tabela é um array. Quem lê recebe CÓPIAS, como no banco de verdade.
 * Não filtra organização sozinho: quem consulta tem de pedir (`.eq("organization_id", …)`),
 * e é por isso que dá para plantar linha de outra organização e provar que ela não é tocada.
 */
export type Linha = Record<string, unknown>;

export interface RpcChamada {
  nome: string;
  args: unknown;
}

export function criarBancoEmMemoria(inicial: Record<string, Linha[]> = {}) {
  const tabelas: Record<string, Linha[]> = inicial;
  const rpcs: RpcChamada[] = [];

  const client = {
    rpc(nome: string, args: unknown) {
      rpcs.push({ nome, args });
      return Promise.resolve({ data: null, error: null });
    },
    from(nome: string) {
      const linhas = () => (tabelas[nome] ??= []);
      const filtros: Array<(l: Linha) => boolean> = [];
      let operacao: "select" | "update" | "delete" | "upsert" | "insert" = "select";
      let valores: Linha | Linha[] = {};
      let ordem: { coluna: string; asc: boolean } | null = null;
      let opcoes: { onConflict?: string; ignoreDuplicates?: boolean } = {};

      const executar = () => {
        const alvo = linhas().filter((l) => filtros.every((f) => f(l)));
        if (operacao === "update") {
          for (const l of alvo) Object.assign(l, valores);
          return { data: alvo, error: null };
        }
        if (operacao === "delete") {
          tabelas[nome] = linhas().filter((l) => !alvo.includes(l));
          return { data: alvo, error: null };
        }
        if (operacao === "insert" || operacao === "upsert") {
          const novas = (Array.isArray(valores) ? valores : [valores]).map((v): Linha => ({
            id: `${nome}-${linhas().length + 1}`,
            ...v,
          }));
          if (operacao === "upsert" && opcoes.onConflict) {
            const chaves = opcoes.onConflict.split(",");
            for (const n of novas) {
              const existente = linhas().find((l) => chaves.every((c) => l[c] === n[c]));
              if (existente) {
                if (!opcoes.ignoreDuplicates) Object.assign(existente, n);
                continue;
              }
              linhas().push(n);
            }
          } else {
            linhas().push(...novas);
          }
          return { data: novas.map((l) => ({ ...l })), error: null };
        }
        const ordenado = ordem
          ? [...alvo].sort((a, b) => {
              const x = a[ordem!.coluna] as number | string;
              const y = b[ordem!.coluna] as number | string;
              return (x < y ? -1 : x > y ? 1 : 0) * (ordem!.asc ? 1 : -1);
            })
          : alvo;
        return { data: ordenado.map((l) => ({ ...l })), error: null };
      };

      const cadeia: Record<string, unknown> = {
        select: () => cadeia,
        insert: (v: Linha | Linha[]) => ((operacao = "insert"), (valores = v), cadeia),
        upsert: (v: Linha | Linha[], o?: typeof opcoes) => ((operacao = "upsert"), (valores = v), (opcoes = o ?? {}), cadeia),
        update: (v: Linha) => ((operacao = "update"), (valores = v), cadeia),
        delete: () => ((operacao = "delete"), cadeia),
        eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), cadeia),
        in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), cadeia),
        is: (c: string, v: unknown) => (filtros.push((l) => (l[c] ?? null) === v), cadeia),
        order: (coluna: string, o?: { ascending?: boolean }) => ((ordem = { coluna, asc: o?.ascending !== false }), cadeia),
        maybeSingle: () => Promise.resolve({ data: executar().data[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: executar().data[0] ?? null, error: null }),
        then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, ko),
      };
      return cadeia;
    },
  };
  return { client, tabelas, rpcs };
}
