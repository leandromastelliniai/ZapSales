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
 *  - `consulta` — só lê. Pode ter nova tentativa limitada e, por padrão, roda sem aprovação.
 *  - `altera`   — muda algo lá (criar pedido, cadastrar). Nasce com «pedir aprovação»
 *    LIGADA: nada altera o mundo sem um humano, a menos que quem cadastra desligue a
 *    chave de propósito. Nunca é repetida automaticamente (envio em dobro é pior que
 *    não-envio) e, no modo Assistido, espera aprovação qualquer que seja a chave.
 */
export const EFEITOS_DA_FERRAMENTA = ["consulta", "altera"] as const;
export type EfeitoDaFerramenta = (typeof EFEITOS_DA_FERRAMENTA)[number];

/**
 * De onde a ferramenta vem (issue #96). `webhook` = o endereço que a pessoa cadastrou e o ZapSales
 * assina (#94). `mcp` = uma ferramenta que um servidor MCP de terceiros oferece e o administrador
 * escolheu. Igual ao CHECK de `agent_external_tools.kind` (vigiado por
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts`).
 */
export const TIPOS_DA_FERRAMENTA = ["webhook", "mcp"] as const;
export type TipoDaFerramenta = (typeof TIPOS_DA_FERRAMENTA)[number];

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
  "recusada_pela_politica",
  "segredo_indisponivel",
  "timeout",
  "resposta_grande_demais",
  "redirecionamento",
  "erro_do_outro_sistema",
  "recusada_pelo_outro_sistema",
  "rede",
  // Servidor MCP (issue #96): a credencial não foi aceita; o servidor respondeu algo que não é MCP;
  // a ferramenta respondeu «deu erro» (o que ela já tinha feito antes de falhar, ninguém sabe).
  "credencial_recusada",
  "protocolo_invalido",
  "ferramenta_com_erro",
] as const;
export type MotivoDeFalha = (typeof MOTIVOS_DE_FALHA)[number];

/**
 * Os motivos em que a chamada NEM SAIU da máquina ou o outro sistema recusou de forma
 * clara (4xx): nada foi alterado lá. Todo o resto — prazo estourado, queda de rede, 5xx,
 * resposta cortada, redirecionamento — deixa o desfecho INCERTO: o outro sistema pode
 * ter feito a alteração e a resposta se perdeu. Incerto não se repete sozinho.
 */
export const MOTIVOS_DE_FALHA_CERTA: ReadonlySet<MotivoDeFalha> = new Set<MotivoDeFalha>([
  "recusada_pela_politica",
  "segredo_indisponivel",
  "recusada_pelo_outro_sistema",
  "credencial_recusada",
]);

/** A frase, sem jargão, do que aconteceu. Quem lê é o dono do negócio. */
export const FRASE_DA_FALHA: Record<MotivoDeFalha, string> = {
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
  credencial_recusada:
    "O servidor recusou a credencial (não autorizado). Confira ou troque a credencial na tela do servidor MCP.",
  protocolo_invalido: "O endereço respondeu, mas não é um servidor MCP que o ZapSales consiga usar.",
  ferramenta_com_erro: "A ferramenta do servidor MCP respondeu com erro.",
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

// ─── O pedido de aprovação (issue #95) ───────────────────────────────────────

/**
 * A vida de um pedido de execução. Vocabulário fechado, igual ao CHECK de
 * `agent_external_tool_requests.status` (vigiado por
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts`).
 *
 *  - `pending`   — espera um humano na Central. Nada foi enviado.
 *  - `executing` — alguém aprovou (ou a chave estava desligada) e a chamada está saindo.
 *    É o estado que garante «uma única vez»: só UMA transição `pending → executing`
 *    vence, as outras recebem 0 linhas.
 *  - `executed`  — o outro sistema respondeu 2xx.
 *  - `failed`    — a chamada não deu certo; `uncertain` diz se o outro sistema pode ter feito.
 *  - `rejected`  — um humano recusou.
 *  - `expired`   — ninguém decidiu a tempo.
 */
export const ESTADOS_DO_PEDIDO = ["pending", "executing", "executed", "failed", "rejected", "expired"] as const;
export type EstadoDoPedido = (typeof ESTADOS_DO_PEDIDO)[number];

/** De onde o pedido nasceu: um turno de atendimento ao vivo ou um rascunho do modo Assistido. */
export const ORIGENS_DO_PEDIDO = ["live", "assisted"] as const;
export type OrigemDoPedido = (typeof ORIGENS_DO_PEDIDO)[number];

/** Quanto tempo um pedido espera por um humano antes de expirar (configurável por ferramenta). */
export const VALIDADE_DO_PEDIDO_HORAS = { padrao: 24, min: 1, max: 168 } as const;

export const ROTULO_DO_ESTADO: Record<EstadoDoPedido, string> = {
  pending: "Aguardando aprovação",
  executing: "Executando",
  executed: "Executada",
  failed: "Falhou",
  rejected: "Recusada",
  expired: "Expirada",
};

/**
 * Quanto tempo um pedido JÁ FEITO continua valendo como resposta à MESMA chamada repetida:
 * o executado e o de falha incerta valem por esta janela (o pendente e o em execução, enquanto
 * vivos). Passada a janela, o cliente pode legitimamente pedir de novo. É a MESMA régua do SQL
 * de abrir o pedido e do bloco que o agente lê — divergir faria o bloco prometer «não refaz a
 * ação» num pedido que a repetição já refaria.
 */
export const JANELA_DA_REPETICAO_HORAS = 24;
