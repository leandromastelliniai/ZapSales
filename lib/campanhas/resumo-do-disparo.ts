/**
 * O RESUMO DO DISPARO — as contas que a tela "Nova campanha" mostra antes de salvar.
 *
 * Tudo aqui é leitura de regra que o produto já tem; nenhum número de ritmo nasce neste arquivo:
 *
 * - o ritmo efetivo é o do `ritmo.ts` (campanha só sabe ir mais devagar que o número) e o do motor
 *   de envio (`rodada.ts` para QR code, `rodada-oficial.ts` para a API Oficial);
 * - o aquecimento de hoje e dos próximos dias vem de `warmupCapFor`, a MESMA função do motor
 *   (uma segunda cópia na tela é a receita para prometer um número e o motor aplicar outro);
 * - os números do canal (intervalo, janela, domingo, passos do aquecimento) chegam prontos de
 *   `GET /api/v1/ai/pacing`, já com o override do número aplicado.
 *
 * A API Oficial NÃO passa pelo aquecimento nem pelo intervalo nem pelo teto diário do número
 * (a rodada oficial lê só a janela e os tetos da campanha): quem manda ali é o limite do portfólio
 * da Meta e o teto de gasto. Por isso `oficial` troca quais limites entram na conta.
 *
 * Puro de propósito: é a promessa que a tela faz ("leva uns 3 dias"), e promessa de tela tem de
 * ser testável sem montar um componente.
 */
import type { WarmupStep } from "@/lib/agent-engine/pacing/defaults";
import { warmupCapFor } from "@/lib/agent-engine/pacing/engine";

/** O ritmo que a pessoa digitou na campanha; `null` = em branco = herda o número. */
export interface RitmoDigitado {
  intervaloSegundos: number | null;
  janelaInicioHora: number | null;
  janelaFimHora: number | null;
  tetoDiario: number | null;
  tetoHorario: number | null;
}

/** O que o número escolhido já impõe (lido de `GET /api/v1/ai/pacing`). */
export interface RitmoDoNumero {
  /** Intervalo mínimo entre envios do MESMO número, em segundos (o `throttle`). */
  intervaloSegundos: number;
  janelaInicioHora: number;
  janelaFimHora: number;
  domingoLiberado: boolean;
  /** Teto diário absoluto do número (`channel_sessions.daily_message_limit`). */
  limiteDiario: number | null;
  /** Degraus do aquecimento. Vazio quando o aquecimento foi pulado. */
  aquecimento: WarmupStep[];
  /** Idade do número em dias, para achar o degrau de hoje. */
  idadeDias: number;
}

export type QuemLimita =
  | "teto_da_campanha"
  | "teto_por_hora"
  | "limite_do_numero"
  | "aquecimento"
  | "intervalo";

export type Duracao =
  | { tipo: "sem_destinatarios" }
  | { tipo: "janela_invalida" }
  /** Campanha oficial sem teto nenhum: sai no mesmo dia; o limite da Meta pode estender. */
  | { tipo: "sem_teto_proprio"; horasNaJanela: number }
  | { tipo: "dias"; dias: number; porDia: number; limitadoPor: QuemLimita; horasNaJanela: number }
  | { tipo: "muito_longo"; porDia: number; limitadoPor: QuemLimita };

/** Mais que isto e a conta deixa de ser promessa: a tela diz "muito longo" em vez de um número. */
export const DIAS_MAXIMOS_DA_ESTIMATIVA = 366;

function janelaEfetiva(ritmo: RitmoDigitado, numero: RitmoDoNumero): { inicio: number; fim: number } {
  // Igual ao motor: a janela da campanha só vale inteira; metade preenchida herda a do número.
  if (ritmo.janelaInicioHora !== null && ritmo.janelaFimHora !== null) {
    return { inicio: ritmo.janelaInicioHora, fim: ritmo.janelaFimHora };
  }
  return { inicio: numero.janelaInicioHora, fim: numero.janelaFimHora };
}

/** Quantas mensagens cabem em UM dia, no dia `d` a contar de hoje, e quem é o limite. */
function capacidadeDoDia(
  d: number,
  oficial: boolean,
  ritmo: RitmoDigitado,
  numero: RitmoDoNumero,
  horas: number,
): { cabem: number; limitadoPor: QuemLimita } | null {
  const candidatos: Array<{ cabem: number; por: QuemLimita }> = [];

  if (ritmo.tetoDiario !== null) candidatos.push({ cabem: ritmo.tetoDiario, por: "teto_da_campanha" });
  if (ritmo.tetoHorario !== null) {
    candidatos.push({ cabem: Math.floor(ritmo.tetoHorario * horas), por: "teto_por_hora" });
  }
  if (!oficial) {
    if (numero.limiteDiario !== null) candidatos.push({ cabem: numero.limiteDiario, por: "limite_do_numero" });
    if (numero.aquecimento.length > 0) {
      const cap = warmupCapFor(numero.idadeDias + d, numero.aquecimento);
      if (cap !== null) candidatos.push({ cabem: cap, por: "aquecimento" });
    }
    // O intervalo vale o maior entre o da campanha e o do número: a campanha só sabe ir mais devagar.
    const intervalo = Math.max(ritmo.intervaloSegundos ?? 0, numero.intervaloSegundos);
    if (intervalo > 0) candidatos.push({ cabem: Math.floor((horas * 3600) / intervalo), por: "intervalo" });
  }

  if (candidatos.length === 0) return null;
  const menor = candidatos.reduce((a, b) => (b.cabem < a.cabem ? b : a));
  return { cabem: menor.cabem, limitadoPor: menor.por };
}

/**
 * Quantos dias a campanha leva para chegar a todos.
 *
 * Simula dia a dia a partir de hoje, e não divide uma vez: o aquecimento SOBE com a idade do
 * número (20/dia hoje, 50 daqui a quatro dias...), e domingo fechado pula um dia do calendário.
 * `diaDaSemanaHoje` é 0 (domingo) a 6, no fuso de quem opera.
 */
export function estimarDuracao(input: {
  destinatarios: number;
  oficial: boolean;
  ritmo: RitmoDigitado;
  numero: RitmoDoNumero;
  diaDaSemanaHoje: number;
}): Duracao {
  const { destinatarios, oficial, ritmo, numero, diaDaSemanaHoje } = input;
  if (destinatarios <= 0) return { tipo: "sem_destinatarios" };

  const janela = janelaEfetiva(ritmo, numero);
  const horas = janela.fim - janela.inicio;
  if (horas <= 0) return { tipo: "janela_invalida" };

  const primeiro = capacidadeDoDia(0, oficial, ritmo, numero, horas);
  if (primeiro === null) return { tipo: "sem_teto_proprio", horasNaJanela: horas };

  let restam = destinatarios;
  let primeiroDiaUtil: { cabem: number; limitadoPor: QuemLimita } | null = null;
  for (let d = 0; d < DIAS_MAXIMOS_DA_ESTIMATIVA; d++) {
    const domingo = (diaDaSemanaHoje + d) % 7 === 0;
    if (domingo && !numero.domingoLiberado) continue;
    const dia = capacidadeDoDia(d, oficial, ritmo, numero, horas) ?? primeiro;
    primeiroDiaUtil ??= dia;
    restam -= dia.cabem;
    if (restam <= 0) {
      return {
        tipo: "dias",
        dias: d + 1,
        // O que a tela mostra como "por dia" é o primeiro dia útil: no aquecimento é o menor.
        porDia: primeiroDiaUtil.cabem,
        limitadoPor: primeiroDiaUtil.limitadoPor,
        horasNaJanela: horas,
      };
    }
  }
  return { tipo: "muito_longo", porDia: (primeiroDiaUtil ?? primeiro).cabem, limitadoPor: (primeiroDiaUtil ?? primeiro).limitadoPor };
}

/** O que a faixa "Recomendado" do ritmo diz, em código — o texto é da tela. */
export type RecomendacaoDeRitmo =
  | { tipo: "oficial"; temTetoDeGasto: boolean }
  | {
      tipo: "aquecimento";
      /** Teto de HOJE pelo aquecimento. */
      hoje: number;
      /** O próximo degrau, e em quantos dias o número chega a ele. `null` = último degrau. */
      proximo: { cap: number | null; emDias: number } | null;
    }
  | { tipo: "formado" };

export function recomendarRitmo(input: {
  oficial: boolean;
  temTetoDeGasto: boolean;
  numero: RitmoDoNumero;
}): RecomendacaoDeRitmo {
  const { oficial, temTetoDeGasto, numero } = input;
  if (oficial) return { tipo: "oficial", temTetoDeGasto };

  const hoje = numero.aquecimento.length > 0 ? warmupCapFor(numero.idadeDias, numero.aquecimento) : null;
  if (hoje === null) return { tipo: "formado" };

  // O próximo degrau é o primeiro com idade mínima maior que a de hoje.
  const proximo = [...numero.aquecimento]
    .sort((a, b) => a.minAgeDays - b.minAgeDays)
    .find((s) => s.minAgeDays > numero.idadeDias);
  return {
    tipo: "aquecimento",
    hoje,
    proximo: proximo ? { cap: proximo.cap, emDias: proximo.minAgeDays - numero.idadeDias } : null,
  };
}

/** Avisos de ritmo: o que a pessoa digitou que NÃO muda nada, ou que não fecha. */
export type AvisoDeRitmo =
  | { id: "janela_invalida" }
  /** O teto digitado é maior que o limite do número: vale o do número, o digitado não adianta. */
  | { id: "teto_acima_do_numero"; limite: number }
  | { id: "intervalo_abaixo_do_numero"; minimo: number };

export function avisosDeRitmo(input: {
  oficial: boolean;
  ritmo: RitmoDigitado;
  numero: RitmoDoNumero;
}): AvisoDeRitmo[] {
  const { oficial, ritmo, numero } = input;
  const avisos: AvisoDeRitmo[] = [];
  const janela = janelaEfetiva(ritmo, numero);
  const digitouUmaMetade = (ritmo.janelaInicioHora === null) !== (ritmo.janelaFimHora === null);
  if (janela.fim <= janela.inicio && !digitouUmaMetade) avisos.push({ id: "janela_invalida" });

  if (!oficial) {
    if (numero.limiteDiario !== null && ritmo.tetoDiario !== null && ritmo.tetoDiario > numero.limiteDiario) {
      avisos.push({ id: "teto_acima_do_numero", limite: numero.limiteDiario });
    }
    if (ritmo.intervaloSegundos !== null && ritmo.intervaloSegundos < numero.intervaloSegundos) {
      avisos.push({ id: "intervalo_abaixo_do_numero", minimo: numero.intervaloSegundos });
    }
  }
  return avisos;
}

// ─── Vai disparar? ─────────────────────────────────────────────────────────────────────────

export type EstadoDaConferencia = "ok" | "atencao" | "info";

export type IdDaConferencia =
  | "nome"
  | "numero"
  | "publico"
  | "mensagem"
  | "base_legal"
  | "resposta"
  | "ritmo"
  | "custo"
  | "risco";

export interface Conferencia {
  id: IdDaConferencia;
  estado: EstadoDaConferencia;
  /** Variante do texto dentro do mesmo `id`; o texto é da tela. */
  motivo: string;
  /** Número que a frase cita (elegíveis, teto...), quando houver. */
  quantidade?: number;
}

export interface EntradaDaProntidao {
  /** O nome da campanha está preenchido? Sem ele o Salvar fica cinza, como o número. */
  temNome: boolean;
  temNumero: boolean;
  temCriterio: boolean;
  /** `null` = a contagem ainda não rodou (ou está rodando). */
  elegiveis: number | null;
  oficial: boolean;
  mensagemCompleta: boolean;
  /** Oficial: escolheu um modelo? (para distinguir "falta escolher" de "falta preencher"). */
  temModelo: boolean;
  baseLegalSemReferencia: boolean;
  respostaPedeAgenteSemAgente: boolean;
  avisos: AvisoDeRitmo[];
  /** Oficial: estimativa de custo dos elegíveis, em centavos, quando a prévia a trouxe. */
  custoEstimadoCents: number | null;
  tetoDeGastoCents: number | null;
}

/**
 * Por que o botão "Salvar rascunho" está (ou não) liberado, e o que mais merece o olho antes de
 * iniciar. Hoje o botão fica cinza sem dizer o motivo; aqui cada motivo vira uma linha.
 *
 * `info` nunca bloqueia nem conta como atenção: é o aviso que ainda não é problema.
 */
export function prontidaoDoDisparo(e: EntradaDaProntidao): Conferencia[] {
  const lista: Conferencia[] = [];

  lista.push(
    e.temNome
      ? { id: "nome", estado: "ok", motivo: "preenchido" }
      : { id: "nome", estado: "atencao", motivo: "falta_nome" },
  );

  lista.push(
    e.temNumero
      ? { id: "numero", estado: "ok", motivo: "escolhido" }
      : { id: "numero", estado: "atencao", motivo: "falta_escolher" },
  );

  if (!e.temCriterio) {
    lista.push({ id: "publico", estado: "atencao", motivo: "sem_criterio" });
  } else if (e.elegiveis === null) {
    lista.push({ id: "publico", estado: "info", motivo: "contando" });
  } else if (e.elegiveis === 0) {
    lista.push({ id: "publico", estado: "atencao", motivo: "ninguem_recebe", quantidade: 0 });
  } else {
    lista.push({ id: "publico", estado: "ok", motivo: "tem_gente", quantidade: e.elegiveis });
  }

  if (e.mensagemCompleta) {
    lista.push({ id: "mensagem", estado: "ok", motivo: "pronta" });
  } else if (e.oficial && !e.temModelo) {
    lista.push({ id: "mensagem", estado: "atencao", motivo: "falta_modelo" });
  } else if (e.oficial) {
    lista.push({ id: "mensagem", estado: "atencao", motivo: "faltam_variaveis" });
  } else {
    lista.push({ id: "mensagem", estado: "atencao", motivo: "texto_vazio" });
  }

  if (e.baseLegalSemReferencia) {
    lista.push({ id: "base_legal", estado: "atencao", motivo: "falta_lia" });
  }

  if (e.respostaPedeAgenteSemAgente) {
    lista.push({ id: "resposta", estado: "atencao", motivo: "falta_agente" });
  }

  if (e.avisos.some((a) => a.id === "janela_invalida")) {
    lista.push({ id: "ritmo", estado: "atencao", motivo: "janela_invalida" });
  }

  if (e.oficial) {
    if (e.tetoDeGastoCents === null) {
      lista.push({ id: "custo", estado: "info", motivo: "sem_teto" });
    } else if (e.custoEstimadoCents !== null && e.custoEstimadoCents > e.tetoDeGastoCents) {
      lista.push({ id: "custo", estado: "atencao", motivo: "estimativa_passa_do_teto", quantidade: e.custoEstimadoCents });
    } else {
      lista.push({ id: "custo", estado: "ok", motivo: "dentro_do_teto" });
    }
  } else {
    lista.push({ id: "risco", estado: "info", motivo: "aceite_ao_iniciar" });
  }

  return lista;
}

/**
 * Quantas conferências pedem atenção. Não é o `podeSalvar` da tela: salvar rascunho continua
 * dependendo só do que a API recusa; "ninguém recebe" e "passa do teto de gasto" avisam, mas o
 * rascunho existe para ser ajustado depois.
 */
export function contarAtencao(conferencias: readonly Conferencia[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

// ─── Do que a API de ritmo devolve para o que a conta usa ──────────────────────────────────

/** O pedaço de `GET /api/v1/ai/pacing` (um item por número) de que a conta precisa. */
export interface ItemDoRitmoDoNumero {
  channel_session: { daily_message_limit: number | null };
  effective: {
    throttleMs: number;
    windowStartHour: number;
    windowEndHour: number;
    allowSunday: boolean;
    timezone: string;
    warmupDailyCaps: WarmupStep[];
  };
  warmup: { age_days: number; skipped: boolean };
}

/**
 * O ritmo do número como a conta o lê. Aquecimento pulado vira lista vazia: o motor também não o
 * aplica, e a tela não pode prometer um teto que ele ignora.
 */
export function ritmoDoNumero(item: ItemDoRitmoDoNumero): RitmoDoNumero {
  return {
    intervaloSegundos: item.effective.throttleMs / 1000,
    janelaInicioHora: item.effective.windowStartHour,
    janelaFimHora: item.effective.windowEndHour,
    domingoLiberado: item.effective.allowSunday,
    limiteDiario: item.channel_session.daily_message_limit,
    aquecimento: item.warmup.skipped ? [] : item.effective.warmupDailyCaps,
    idadeDias: item.warmup.age_days,
  };
}

/** Dia da semana (0 = domingo) de um instante, lido no fuso do número — onde a janela é avaliada. */
export function diaDaSemanaNoFuso(agora: Date, fuso: string): number {
  try {
    const nome = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: fuso }).format(agora);
    const i = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome);
    if (i >= 0) return i;
  } catch {
    // Fuso inválido no banco: cai no relógio de quem olha a tela, que é melhor que lançar.
  }
  return agora.getDay();
}
