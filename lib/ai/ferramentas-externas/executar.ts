/**
 * A EXECUÇÃO de uma ferramenta externa, qualquer que seja o tipo.
 *
 * Três lugares executam: o turno do agente (`turno.ts`), a aprovação na Central (rota
 * `decide`) e o botão «Testar de verdade» (rota `test`). Os três pedem a MESMA coisa — «chame
 * esta ferramenta com estes dados e me diga o que aconteceu» — e não podem divergir sobre
 * COMO: um webhook sai assinado pela rede segura (`chamar.ts`); uma ferramenta de servidor MCP
 * sai pelo cliente MCP (`mcp/cliente.ts`), também pela rede segura. Os dois devolvem o mesmo
 * `ResultadoDaChamada`, então o resto (pedido, auditoria, Central, o que o modelo lê) é um só.
 *
 * Nunca lança.
 */
import { chamarFerramentaExterna, type DependenciasDaChamada, type ResultadoDaChamada } from "./chamar";
import { chamarFerramentaDoServidor } from "./mcp/cliente";
import type { DestinoMcp } from "./mcp/tipos";
import type { EfeitoDaFerramenta } from "./tipos";

export interface FerramentaExecutavel {
  slug: string;
  /** Webhook: o endereço da ferramenta. MCP: o endereço do SERVIDOR. */
  url: string;
  efeito: EfeitoDaFerramenta;
  /** Presente = a ferramenta vem de um servidor MCP. */
  mcp?: Pick<DestinoMcp, "cabecalho" | "temCredencial" | "nomeNoServidor">;
}

export interface EntradaDaExecucao {
  ferramenta: FerramentaExecutavel;
  /**
   * Webhook: a chave de assinatura (sem ela a chamada não sai). MCP: a credencial do servidor
   * (`null` é válido SE o servidor não tem credencial; havendo credencial e não a tendo lido, a
   * chamada não sai — falha fechada, sem tentar «sem autenticação»).
   */
  segredo: string | null;
  /** O que o agente preencheu, JÁ validado contra o esquema da ferramenta. */
  argumentos: Record<string, unknown>;
  /** O id do pedido aprovado: quem recebe deduplica por ele. */
  idDeEntrega?: string;
}

export async function executarFerramentaExterna(
  entrada: EntradaDaExecucao,
  deps: DependenciasDaChamada = {},
): Promise<ResultadoDaChamada> {
  const f = entrada.ferramenta;
  if (!f.mcp) {
    return chamarFerramentaExterna(
      {
        ferramenta: { slug: f.slug, url: f.url, efeito: f.efeito },
        segredo: entrada.segredo,
        argumentos: entrada.argumentos,
        ...(entrada.idDeEntrega ? { idDeEntrega: entrada.idDeEntrega } : {}),
      },
      deps,
    );
  }

  if (f.mcp.temCredencial && !entrada.segredo) {
    return { ok: false, motivo: "segredo_indisponivel", httpStatus: null, tentativas: 0, duracaoMs: 0, desfechoIncerto: false };
  }
  return chamarFerramentaDoServidor(
    {
      servidor: { url: f.url, credencial: entrada.segredo, cabecalho: f.mcp.cabecalho },
      ferramenta: f.mcp.nomeNoServidor,
      efeito: f.efeito,
      argumentos: entrada.argumentos,
      ...(entrada.idDeEntrega ? { idDeEntrega: entrada.idDeEntrega } : {}),
    },
    {
      ...(deps.politica ? { politica: deps.politica } : {}),
      ...(deps.dormir ? { dormir: deps.dormir } : {}),
      ...(deps.timeoutMs !== undefined ? { timeoutMs: deps.timeoutMs } : {}),
      ...(deps.agora ? { agora: deps.agora } : {}),
    },
  );
}
