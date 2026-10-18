/**
 * O TESTE DE CONEXÃO com um servidor MCP: apresenta-se, lista as ferramentas e grava o resultado.
 *
 * É o que o cadastro faz logo depois de gravar, o que o botão «Testar conexão» faz e o que a
 * descoberta de ferramentas faz — uma função só, para o administrador ler a mesma frase nos três.
 * Nunca lança: todo desfecho é um resultado, com a causa em português.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { listarFerramentasDoServidor, type DependenciasDoMcp, type ResultadoDaListagem } from "./cliente";
import { carregarServidorParaChamar, registrarConexao } from "./repositorio";
import { fraseDaConexao, type FerramentaDoServidor, type InfoDoServidor } from "./tipos";
import type { MotivoDeFalha } from "../tipos";

export type ResultadoDaConexao =
  | {
      ok: true;
      servidor: InfoDoServidor;
      ferramentas: FerramentaDoServidor[];
      listaIncompleta: boolean;
    }
  | { ok: false; motivo: MotivoDeFalha | "servidor_nao_encontrado"; httpStatus: number | null; frase: string };

export async function conectarAoServidor(
  admin: SupabaseClient,
  organizationId: string,
  servidorId: string,
  deps: DependenciasDoMcp = {},
  opcoes: { gravar?: boolean } = {},
): Promise<ResultadoDaConexao> {
  const carregado = await carregarServidorParaChamar(admin, organizationId, servidorId);
  if (!carregado) {
    return { ok: false, motivo: "servidor_nao_encontrado", httpStatus: null, frase: "Servidor não encontrado." };
  }
  // Havendo credencial gravada e não a tendo lido, NÃO se tenta «sem autenticação»: a causa é dita.
  if (!carregado.credencialLegivel) {
    const r = {
      ok: false as const,
      motivo: "segredo_indisponivel" as const,
      httpStatus: null,
      frase:
        "Não foi possível ler a credencial guardada deste servidor (a cifra do servidor não respondeu). Grave a credencial de novo ou peça a quem instalou o sistema para conferir.",
    };
    if (opcoes.gravar !== false) await registrarConexao(admin, organizationId, servidorId, { ok: false, motivo: r.motivo });
    return r;
  }

  const lista: ResultadoDaListagem = await listarFerramentasDoServidor(carregado.servidor, deps);
  if (!lista.ok) {
    if (opcoes.gravar !== false) await registrarConexao(admin, organizationId, servidorId, { ok: false, motivo: lista.motivo });
    return {
      ok: false,
      motivo: lista.motivo,
      httpStatus: lista.httpStatus,
      frase: fraseDaConexao({ motivo: lista.motivo, httpStatus: lista.httpStatus, ...(lista.detalhe ? { detalhe: lista.detalhe } : {}) }),
    };
  }
  if (opcoes.gravar !== false) await registrarConexao(admin, organizationId, servidorId, { ok: true, info: lista.servidor });
  return { ok: true, servidor: lista.servidor, ferramentas: lista.ferramentas, listaIncompleta: lista.listaIncompleta };
}
