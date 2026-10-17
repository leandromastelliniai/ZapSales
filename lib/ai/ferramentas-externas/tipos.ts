/**
 * Ferramenta externa do agente (issue #94, parte da #86): um webhook que o agente
 * chama NO MEIO da conversa para consultar algo em outro sistema (estoque,
 * planilha, ERP, Make, n8n).
 *
 * Client-safe: zero import de zod, supabase ou next/headers. O vocabulário daqui
 * é o mesmo dos CHECKs de `agent_external_tools` (vigiado por
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts`).
 */

/**
 * O que a ferramenta faz com o outro sistema.
 *
 *  - `consulta` — só lê. Pode ter nova tentativa limitada e roda sem aprovação.
 *  - `altera`   — muda algo lá. NÃO pode ser ativada nesta etapa: o motivo está
 *    em `MOTIVO_DO_BLOQUEIO_DE_ALTERACAO` e a trava mora no servidor (rota) e no
 *    motor (turno), não só na tela. Entra quando a aprovação existir.
 */
export const EFEITOS_DA_FERRAMENTA = ["consulta", "altera"] as const;
export type EfeitoDaFerramenta = (typeof EFEITOS_DA_FERRAMENTA)[number];

/** Os tipos de dado que o agente pode ser mandado a preencher. */
export const TIPOS_DE_PARAMETRO = ["texto", "numero", "inteiro", "booleano"] as const;
export type TipoDeParametro = (typeof TIPOS_DE_PARAMETRO)[number];

export const ROTULO_DO_TIPO: Record<TipoDeParametro, string> = {
  texto: "Texto",
  numero: "Número",
  inteiro: "Número inteiro",
  booleano: "Sim ou não",
};

export const ROTULO_DO_EFEITO: Record<EfeitoDaFerramenta, string> = {
  consulta: "Só consulta",
  altera: "Altera dados",
};

/** Por que "altera dados" fica bloqueado. É frase de tela: diz o que fazer. */
export const MOTIVO_DO_BLOQUEIO_DE_ALTERACAO =
  "Ferramentas que alteram dados no outro sistema ainda não podem ser ligadas: elas precisam da etapa de aprovação, para o agente nunca executar sozinho uma ação errada. Por enquanto, cadastre só consultas.";

export interface ParametroDaFerramenta {
  nome: string;
  tipo: TipoDeParametro;
  descricao: string;
  obrigatorio: boolean;
}

export const LIMITES_DA_FERRAMENTA = {
  nome: { min: 3, max: 60 },
  quandoUsar: { min: 10, max: 600 },
  url: { max: 2000 },
  parametros: { max: 10 },
  nomeDoParametro: { max: 40 },
  descricaoDoParametro: { min: 3, max: 200 },
  /** Texto que o agente preenche num parâmetro `texto`. */
  textoPreenchido: { max: 500 },
} as const;

/**
 * Os limites da CHAMADA. Constantes e não variáveis de ambiente: o enunciado pede
 * "tempo e tamanho de resposta limitados", e uma variável nova a editar no `.env`
 * é exatamente o que uma instalação existente não pode precisar.
 */
export const LIMITES_DA_CHAMADA = {
  /** Prazo de CADA tentativa (DNS, conexão, cabeçalhos e corpo). */
  timeoutMs: 8_000,
  /** Quanto da resposta do outro sistema é lido. Acima disso, a chamada falha. */
  maxBytesDaResposta: 64 * 1024,
  /** Quanto do que foi lido chega ao agente (o resto é cortado, com aviso). */
  maxCaracteresParaOAgente: 4_000,
  /** Tentativas de uma CONSULTA (a primeira mais uma nova tentativa). */
  tentativasDaConsulta: 2,
  esperaEntreTentativasMs: 600,
} as const;

/** Por que uma chamada não deu certo. Vocabulário fechado: vai para a Central e para a auditoria. */
export const MOTIVOS_DE_FALHA = [
  "altera_bloqueada",
  "recusada_pela_politica",
  "segredo_indisponivel",
  "timeout",
  "resposta_grande_demais",
  "redirecionamento",
  "erro_do_outro_sistema",
  "recusada_pelo_outro_sistema",
  "rede",
] as const;
export type MotivoDeFalha = (typeof MOTIVOS_DE_FALHA)[number];

/** A frase, sem jargão, do que aconteceu. Quem lê é o dono do negócio. */
export const FRASE_DA_FALHA: Record<MotivoDeFalha, string> = {
  altera_bloqueada: MOTIVO_DO_BLOQUEIO_DE_ALTERACAO,
  recusada_pela_politica:
    "O endereço da ferramenta foi recusado por segurança (precisa ser HTTPS e público, nunca da rede interna).",
  segredo_indisponivel:
    "Não foi possível assinar a chamada: a chave de assinatura da ferramenta não pôde ser lida. Gere uma nova chave na tela da ferramenta.",
  timeout: "O outro sistema não respondeu a tempo.",
  resposta_grande_demais: "A resposta do outro sistema era grande demais e foi descartada.",
  redirecionamento: "O endereço respondeu com um redirecionamento, que não é seguido. Use o endereço final.",
  erro_do_outro_sistema: "O outro sistema respondeu com erro.",
  recusada_pelo_outro_sistema: "O outro sistema recusou o pedido (erro de endereço, acesso ou dados).",
  rede: "Não foi possível alcançar o outro sistema.",
};

/** O prefixo do nome que o agente enxerga. Separa a ferramenta externa das do catálogo. */
export const PREFIXO_DO_NOME_NO_AGENTE = "ext_";

/** A frase de uma recusa do endereço pela rede segura: a causa certa, não sempre "rede interna". */
export function fraseDaRecusaDeEndereco(codigo: string): string {
  if (codigo === "unsafe_url:dns_failed" || codigo === "unsafe_url:dns_empty") {
    return "Não consegui encontrar este endereço: o nome não existe ou não responde. Confira se está escrito certo.";
  }
  if (codigo === "unsafe_url:https_required" || codigo === "unsafe_url:scheme" || codigo === "unsafe_url:invalid") {
    return "Este endereço não é válido: informe o endereço completo, começando com https://.";
  }
  return "Este endereço não pode ser usado: endereços da rede interna, privada ou local são recusados por segurança.";
}
