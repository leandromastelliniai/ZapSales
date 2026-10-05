/**
 * O MAPA DE ERROS DA META — código numérico da Cloud API vira categoria,
 * natureza (temporário ou definitivo) e motivo legível.
 *
 * Até aqui o código da Meta sobrevivia só DENTRO de um texto (`meta_131049: …`),
 * e cada consumidor teria de reaprender o que cada número significa. O motor de
 * campanhas oficial (Fase 3 da issue #1) decide pela CATEGORIA — voltar para a
 * fila com espera, marcar opt-out de marketing, pausar por falta de pagamento —,
 * e o operador lê o MOTIVO. Os dois saem daqui, e só daqui.
 *
 * ─── O que é "temporário" ────────────────────────────────────────────────────
 *
 * Temporário é "a mesma mensagem pode sair se tentada de novo, depois de
 * esperar": limite de taxa, instabilidade da plataforma e o 131049 (limite de
 * marketing por usuário), que tem espera mínima de 24h — a Meta penaliza quem
 * reenvia marketing ao mesmo contato antes disso. Definitivo é "tentar de novo
 * não muda nada": destinatário inválido, template recusado, opt-out, falta de
 * pagamento, credencial. Código desconhecido é definitivo, salvo quando a própria
 * Graph marca `is_transient` — repetir no escuro é o que gasta dinheiro.
 *
 * Fonte: tabela de códigos da Cloud API
 * (developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes),
 * conferida em 03/10/2026 junto da spec (issue #1).
 */
import type { FalhaDoCanal } from "../types";

export type CategoriaDeErroMeta =
  | "limite_de_taxa"
  | "limite_de_marketing_por_usuario"
  | "opt_out_de_marketing"
  | "destinatario_invalido"
  | "template_invalido"
  | "pagamento"
  | "credencial"
  | "fora_da_janela"
  | "indisponivel"
  | "parametro_invalido"
  | "desconhecido";

export interface ErroMetaClassificado {
  /** `error.code` da Graph; `null` quando a resposta não trouxe corpo de erro. */
  codigo: number | null;
  subcodigo: number | null;
  categoria: CategoriaDeErroMeta;
  temporario: boolean;
  /** Quanto esperar antes de tentar de novo. `null` em erro definitivo. */
  esperaMinimaSegundos: number | null;
  /** Frase para o operador. Nunca o texto cru da Graph. */
  motivo: string;
  /** `error_data.details` da Graph — diz QUAL parâmetro divergiu. Diagnóstico, não tela. */
  detalhe: string | null;
}

/** O corpo de erro como a Graph devolve, mais o status HTTP. Tudo opcional: o fio não é confiável. */
export interface EntradaDeErroMeta {
  code?: number | null;
  error_subcode?: number | null;
  message?: string | null;
  error_data?: { details?: string | null } | null;
  is_transient?: boolean | null;
  httpStatus?: number | null;
}

const UM_MINUTO = 60;
const UM_DIA = 24 * 60 * 60;

interface Regra {
  categoria: CategoriaDeErroMeta;
  temporario: boolean;
  espera: number | null;
  motivo: string;
}

const LIMITE_DE_TAXA: Regra = {
  categoria: "limite_de_taxa",
  temporario: true,
  espera: UM_MINUTO,
  motivo: "A Meta limitou o ritmo de envio deste número. A mensagem volta a ser tentada em instantes.",
};

const INDISPONIVEL: Regra = {
  categoria: "indisponivel",
  temporario: true,
  espera: UM_MINUTO,
  motivo: "A Meta está instável ou em manutenção agora. A mensagem pode ser tentada de novo.",
};

const DESTINATARIO_INVALIDO: Regra = {
  categoria: "destinatario_invalido",
  temporario: false,
  espera: null,
  motivo: "O destinatário não pode receber esta mensagem: o número não tem WhatsApp, é inválido ou não está liberado para esta conta.",
};

const TEMPLATE_INVALIDO: Regra = {
  categoria: "template_invalido",
  temporario: false,
  espera: null,
  motivo: "O modelo de mensagem foi recusado: não existe, não está aprovado, foi pausado ou as variáveis não batem com o aprovado.",
};

const CREDENCIAL: Regra = {
  categoria: "credencial",
  temporario: false,
  espera: null,
  motivo: "A credencial da Meta deste número venceu ou não tem a permissão necessária. Reconecte o canal oficial.",
};

const PARAMETRO_INVALIDO: Regra = {
  categoria: "parametro_invalido",
  temporario: false,
  espera: null,
  motivo: "A Meta recusou o formato da mensagem (parâmetro ou tipo de mídia não aceito).",
};

/** Código → regra. Faixas (template 132xxx, permissão 200–299) são tratadas em `regraDoCodigo`. */
const POR_CODIGO: ReadonlyMap<number, Regra> = new Map<number, Regra>([
  [4, LIMITE_DE_TAXA],
  [80007, LIMITE_DE_TAXA],
  [130429, LIMITE_DE_TAXA],
  [131048, LIMITE_DE_TAXA],
  [131056, LIMITE_DE_TAXA],
  [
    131049,
    {
      categoria: "limite_de_marketing_por_usuario",
      temporario: true,
      espera: UM_DIA,
      motivo:
        "A Meta segurou esta mensagem de marketing para proteger a experiência do contato. Só pode ser tentada de novo depois de 24 horas.",
    },
  ],
  [
    131050,
    {
      categoria: "opt_out_de_marketing",
      temporario: false,
      espera: null,
      motivo: "O contato pediu para não receber mensagens de marketing desta empresa.",
    },
  ],
  [131021, DESTINATARIO_INVALIDO],
  [131026, DESTINATARIO_INVALIDO],
  [131030, DESTINATARIO_INVALIDO],
  [
    131042,
    {
      categoria: "pagamento",
      temporario: false,
      espera: null,
      motivo: "A conta da Meta está com problema de pagamento (sem forma de pagamento válida ou com limite de crédito). Regularize no Gerenciador do WhatsApp.",
    },
  ],
  [
    131047,
    {
      categoria: "fora_da_janela",
      temporario: false,
      espera: null,
      motivo: "Passaram mais de 24 horas desde a última mensagem do contato. Fora da janela, só um modelo aprovado pode ser enviado.",
    },
  ],
  [1, INDISPONIVEL],
  [2, INDISPONIVEL],
  [131000, INDISPONIVEL],
  [131016, INDISPONIVEL],
  [131057, INDISPONIVEL],
  [0, CREDENCIAL],
  [3, CREDENCIAL],
  [10, CREDENCIAL],
  [190, CREDENCIAL],
  [100, PARAMETRO_INVALIDO],
  [131008, PARAMETRO_INVALIDO],
  [131009, PARAMETRO_INVALIDO],
  [131051, PARAMETRO_INVALIDO],
  [131052, PARAMETRO_INVALIDO],
  [131053, PARAMETRO_INVALIDO],
]);

function regraDoCodigo(codigo: number): Regra | null {
  const exata = POR_CODIGO.get(codigo);
  if (exata) return exata;
  // 132000–132999: toda a família de erros de modelo (contagem de parâmetros,
  // formato, pausado, desativado, política).
  if (codigo >= 132000 && codigo <= 132999) return TEMPLATE_INVALIDO;
  // 200–299: permissões da Graph (`#200 Permissions error`, `#2xx` por escopo).
  if (codigo >= 200 && codigo <= 299) return CREDENCIAL;
  return null;
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function classificarErroMeta(entrada: EntradaDeErroMeta): ErroMetaClassificado {
  const codigo = numero(entrada.code);
  const subcodigo = numero(entrada.error_subcode);
  const detalhe = entrada.error_data?.details?.trim() || null;
  const status = numero(entrada.httpStatus);

  const regra =
    (codigo !== null ? regraDoCodigo(codigo) : null) ??
    (codigo === null && status !== null && status >= 500 ? INDISPONIVEL : null) ??
    (codigo === null && status === 429 ? LIMITE_DE_TAXA : null);

  if (regra) {
    return {
      codigo,
      subcodigo,
      categoria: regra.categoria,
      temporario: regra.temporario,
      esperaMinimaSegundos: regra.espera,
      motivo: regra.motivo,
      detalhe,
    };
  }

  const temporario = entrada.is_transient === true;
  return {
    codigo,
    subcodigo,
    categoria: "desconhecido",
    temporario,
    esperaMinimaSegundos: temporario ? UM_MINUTO : null,
    motivo: temporario
      ? "A Meta recusou a mensagem com um erro temporário não catalogado. Ela pode ser tentada de novo."
      : "A Meta recusou a mensagem com um erro não catalogado. Veja o código para diagnosticar.",
    detalhe: detalhe ?? (entrada.message?.trim() || null),
  };
}

/**
 * O erro de uma resposta da Graph, ou `null` quando ela é sucesso.
 *
 * `error` com HTTP 200 é comportamento real da Graph — por isso a pergunta olha
 * o corpo E o status, como os outros pontos do canal já faziam.
 */
export function erroDaRespostaDaGraph(corpo: unknown, httpStatus: number): ErroMetaClassificado | null {
  const erro =
    corpo && typeof corpo === "object" && "error" in corpo
      ? ((corpo as { error?: unknown }).error as Record<string, unknown> | undefined)
      : undefined;
  const okHttp = httpStatus >= 200 && httpStatus < 300;
  if (okHttp && !erro) return null;
  const e = erro && typeof erro === "object" ? erro : {};
  return classificarErroMeta({
    code: numero(e.code),
    error_subcode: numero(e.error_subcode),
    message: typeof e.message === "string" ? e.message : null,
    error_data:
      e.error_data && typeof e.error_data === "object"
        ? { details: String((e.error_data as { details?: unknown }).details ?? "") || null }
        : null,
    is_transient: e.is_transient === true,
    httpStatus,
  });
}

/**
 * A exceção que atravessa o adapter quando a Graph recusa.
 *
 * A mensagem conserva o prefixo `meta_<código>:` — o resto do sistema (handler,
 * tradutores de falha, logs) já reconhece essa forma. O que é novo é
 * `falhaDoCanal`: o contrato genérico que o handler lê sem nomear o provider.
 */
export class ErroDaMeta extends Error {
  readonly erro: ErroMetaClassificado;
  readonly falhaDoCanal: FalhaDoCanal;

  constructor(erro: ErroMetaClassificado) {
    const codigo = erro.codigo !== null ? String(erro.codigo) : "http";
    super(`meta_${codigo}: ${erro.motivo}${erro.detalhe ? ` (${erro.detalhe})` : ""}`);
    this.name = "ErroDaMeta";
    this.erro = erro;
    this.falhaDoCanal = {
      codigo,
      categoria: erro.categoria,
      temporario: erro.temporario,
      motivo: erro.motivo,
    };
  }
}
