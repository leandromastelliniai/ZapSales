/**
 * Servidores MCP de terceiros (issue #96, parte da #86): o agente passa a poder usar
 * as ferramentas que um servidor MCP oferece, escolhidas por um administrador.
 *
 * Client-safe: zero import de zod, supabase ou next/headers. O vocabulário daqui é o
 * mesmo dos CHECKs de `mcp_servers` (vigiado por
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts`).
 */

import { FRASE_DA_FALHA, fraseDaRecusaDeEndereco, type MotivoDeFalha } from "../tipos";

/** As versões do protocolo que o sistema sabe falar, da mais nova para a mais velha. */
export const VERSOES_DO_PROTOCOLO = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

/**
 * Os limites do MCP. Constantes e não variáveis de ambiente, pelo mesmo motivo de
 * `LIMITES_DA_CHAMADA`: uma variável nova a editar no `.env` é exatamente o que uma
 * instalação existente não pode precisar (e o recurso nasce desligado).
 */
export const LIMITES_DO_MCP = {
  /** O prazo de UMA operação inteira (apresentar-se, avisar e listar ou chamar), todos os passos. */
  timeoutMs: 15_000,
  /** O prazo de cada tentativa de fechar a sessão — cortesia, nunca espera. */
  timeoutDeEncerrarMs: 1_500,
  /** Quanto de CADA resposta de uma chamada de ferramenta é lido. Acima disso, a chamada falha. */
  maxBytesDaResposta: 64 * 1024,
  /** Quanto de CADA página da lista de ferramentas é lido. */
  maxBytesDaLista: 512 * 1024,
  /** Páginas da lista de ferramentas que são seguidas. */
  maxPaginasDaLista: 5,
  /** Ferramentas que a descoberta devolve; as demais são ignoradas, com aviso. */
  maxFerramentasDescobertas: 200,
  /** Uma consulta repete uma vez em falha de rede; uma ação que altera nunca repete. */
  tentativasDaConsulta: 2,
  esperaEntreTentativasMs: 600,
} as const;

export const LIMITES_DO_SERVIDOR = {
  nome: { min: 3, max: 60 },
  url: { max: 2000 },
  credencial: { min: 1, max: 4000 },
  cabecalho: { max: 40 },
} as const;

/** O cabeçalho padrão da credencial: `Authorization: Bearer <credencial>`. */
export const CABECALHO_PADRAO_DA_CREDENCIAL = "authorization";

/**
 * Cabeçalhos que a credencial NÃO pode usar: os que o protocolo ou o transporte controlam.
 * Um nome aqui deixaria a pessoa (ou um colar errado) quebrar a conversa com o servidor ou
 * fazer passar uma credencial por um cabeçalho que o sistema usa para outra coisa.
 */
export const CABECALHOS_RESERVADOS: ReadonlySet<string> = new Set([
  "host",
  "content-type",
  "content-length",
  "accept",
  "accept-encoding",
  "connection",
  "transfer-encoding",
  "user-agent",
  "cookie",
  "set-cookie",
  "origin",
  "referer",
  "upgrade",
  "te",
  "trailer",
  "mcp-session-id",
  "mcp-protocol-version",
]);

/** As frases de uma recusa de nome de cabeçalho — objeto constante para a tela traduzir cada uma. */
export const FRASE_DO_CABECALHO_RECUSADO = {
  formato: "O nome do cabeçalho pode ter só letras, números e hífen (ex.: X-API-Key).",
  reservado:
    "Este cabeçalho é usado pelo próprio protocolo e não pode levar a credencial. Use Authorization ou outro nome.",
} as const;

/** Por que o nome não serve, ou `null` se serve. Mora aqui (e não no Zod) para a tela e a rota darem a mesma resposta. */
export function motivoDaRecusaDoCabecalho(nome: string): keyof typeof FRASE_DO_CABECALHO_RECUSADO | null {
  if (!/^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(nome)) return "formato";
  const minusculo = nome.toLowerCase();
  if (CABECALHOS_RESERVADOS.has(minusculo) || minusculo.startsWith("proxy-") || minusculo.startsWith("sec-")) {
    return "reservado";
  }
  return null;
}

/** A recusa de um nome de cabeçalho para a credencial, em português simples — ou `null` se o nome serve. */
export function recusaDoCabecalho(nome: string): string | null {
  const motivo = motivoDaRecusaDoCabecalho(nome);
  return motivo ? FRASE_DO_CABECALHO_RECUSADO[motivo] : null;
}

/** Por que uma ferramenta que o servidor oferece NÃO pode ser usada pelo agente. Vocabulário fechado. */
export const MOTIVOS_DE_FERRAMENTA_NAO_SUPORTADA = [
  "campos_demais",
  "campo_obrigatorio_complexo",
  "nome_de_campo_invalido",
  "esquema_invalido",
] as const;
export type MotivoDeFerramentaNaoSuportada = (typeof MOTIVOS_DE_FERRAMENTA_NAO_SUPORTADA)[number];

export const FRASE_DA_FERRAMENTA_NAO_SUPORTADA: Record<MotivoDeFerramentaNaoSuportada, string> = {
  campos_demais: "Pede campos demais (o agente preenche até 10).",
  campo_obrigatorio_complexo:
    "Tem um campo obrigatório que não é texto, número ou sim/não (lista ou objeto): o agente ainda não sabe preenchê-lo.",
  nome_de_campo_invalido: "Um dos campos tem um nome que o agente não consegue usar.",
  esquema_invalido: "A definição dos campos desta ferramenta não está no formato esperado.",
};

/** As frases de por que a conexão não deu certo — constantes, para a tela e a API traduzirem cada uma. */
export const FRASE_DA_CONEXAO = {
  credencial_recusada: "O servidor recusou a credencial. Confira a credencial e o cabeçalho em que ela é enviada.",
  nao_encontrado:
    "O endereço respondeu «não encontrado» (erro 404). Confira o caminho do servidor MCP — costuma terminar em /mcp.",
  nao_aceitou:
    "O endereço respondeu, mas não aceitou o pedido do protocolo MCP. O servidor precisa falar MCP por HTTP («Streamable HTTP»).",
  nao_e_mcp:
    "O endereço respondeu, mas não é um servidor MCP que o sistema consiga usar. O servidor precisa falar MCP por HTTP («Streamable HTTP»).",
} as const;

/**
 * A frase, sem jargão, de por que a conexão com o servidor não deu certo — para o administrador
 * que acabou de cadastrar ou testar. Diz o que olhar, não só o que aconteceu. Devolve sempre uma
 * frase CONSTANTE (o número do erro HTTP viaja à parte, no campo `http_status`).
 */
export function fraseDaConexao(falha: { motivo: MotivoDeFalha; httpStatus: number | null; detalhe?: string }): string {
  if (falha.motivo === "recusada_pela_politica") {
    return fraseDaRecusaDeEndereco(falha.detalhe ?? "unsafe_url:private_ip");
  }
  if (falha.motivo === "credencial_recusada") return FRASE_DA_CONEXAO.credencial_recusada;
  if (falha.motivo === "recusada_pelo_outro_sistema") {
    return falha.httpStatus === 404 ? FRASE_DA_CONEXAO.nao_encontrado : FRASE_DA_CONEXAO.nao_aceitou;
  }
  if (falha.motivo === "protocolo_invalido") return FRASE_DA_CONEXAO.nao_e_mcp;
  return FRASE_DA_FALHA[falha.motivo];
}

/** Uma ferramenta como o servidor a descreve, JÁ sanitizada. */
export interface FerramentaDoServidor {
  /** O nome no servidor — é o que `tools/call` envia. */
  nome: string;
  titulo: string | null;
  descricao: string;
  /** O esquema de entrada como o servidor o declarou. */
  esquema: unknown;
  /**
   * O que o servidor DECLAROU sobre alterar dados (`annotations.readOnlyHint`). É só uma dica:
   * o servidor é de terceiro, e o risco que vale é o que o administrador marca. `null` = não declarou.
   */
  somenteLeituraDeclarado: boolean | null;
}

export interface InfoDoServidor {
  nome: string | null;
  versao: string | null;
  protocolo: string;
}

/**
 * O que uma ferramenta de servidor MCP precisa para ser CHAMADA, além do que toda ferramenta
 * externa tem: de que servidor ela vem, em que cabeçalho a credencial viaja, se há credencial
 * (para a falha de leitura dela ser falha fechada) e o nome dela NO servidor. O endereço do
 * servidor viaja no campo `url` da ferramenta carregada — uma visão em memória; o banco guarda
 * o endereço só em `mcp_servers`.
 */
export interface DestinoMcp {
  servidorId: string;
  cabecalho: string;
  temCredencial: boolean;
  nomeNoServidor: string;
}
