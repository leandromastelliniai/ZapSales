/**
 * O RESUMO DOS TIPOS DE AGENDAMENTO — as contas que a tela mostra antes da lista.
 *
 * Tudo aqui é leitura de fatos que a página já tem (os tipos e a jornada publicada de cada responsável):
 * nada é gravado e nenhuma regra nasce neste arquivo. Puro de propósito — "pronto para marcar" é
 * afirmação de tela, e afirmação de tela precisa ser testável sem montar componente.
 *
 * ⚠️ "PRONTO PARA MARCAR" É O QUE ESTE ARQUIVO SABE, E SÓ ISSO: tipo ATIVO, com RESPONSÁVEL, cujo
 * responsável PUBLICOU horários de atendimento. É a mesma pergunta que `lib/agenda/consulta.ts` faz
 * antes de oferecer horário (`sem_responsavel`, `jornada_mal_configurada`). Dia fechado, buffer e
 * antecedência mínima ficam de fora — a tela não os lê aqui, e o texto não promete que "vai haver vaga".
 *
 * ⚠️ A CONTA NÃO CHUTA. Quando a leitura dos horários falhou (`nao_lido`), o tipo NÃO entra em "pronto"
 * nem em "sem horários": entra em "não consegui ler". "Não sei" disfarçado de "pronto" faria o dono
 * achar que está tudo bem; disfarçado de "sem horários" mandaria ele publicar o que já está publicado.
 *
 * ⚠️ DESATIVADO NÃO PEDE NADA. Tipo desativado não aparece para marcar de propósito; cobrar dele
 * responsável ou horário seria acusar quem fez a coisa certa.
 */

export type HorariosDoResponsavel = "publicado" | "nao_publicado" | "nao_lido";

export interface TipoParaResumir {
  id: string;
  is_active: boolean;
  default_owner_user_id: string | null;
  reminder_enabled: boolean;
}

export type SituacaoDoTipo =
  | "desativado"
  | "sem_responsavel"
  | "sem_horarios"
  | "horarios_nao_lidos"
  | "pronto";

export function situacaoDoTipo(
  tipo: TipoParaResumir,
  horarios: Readonly<Record<string, HorariosDoResponsavel>>,
): SituacaoDoTipo {
  if (!tipo.is_active) return "desativado";
  if (!tipo.default_owner_user_id) return "sem_responsavel";
  // Responsável que a página não conseguiu perguntar vale como "não lido", nunca como "publicado".
  const h = horarios[tipo.default_owner_user_id] ?? "nao_lido";
  if (h === "nao_lido") return "horarios_nao_lidos";
  return h === "publicado" ? "pronto" : "sem_horarios";
}

export type IdDaConferenciaDosTipos = "ativos" | "responsavel" | "horarios" | "leitura" | "lembrete";

export interface ConferenciaDosTipos {
  id: IdDaConferenciaDosTipos;
  estado: "ok" | "atencao" | "info";
  motivo: string;
  quantidade?: number;
}

export interface ResumoDosTipos {
  total: number;
  ativos: number;
  desativados: number;
  prontos: number;
  semResponsavel: number;
  semHorarios: number;
  naoLidos: number;
  /** Ativos com o aviso ao cliente ligado. */
  comLembrete: number;
  /** Ativos sem o aviso ao cliente. */
  semLembrete: number;
  conferencias: ConferenciaDosTipos[];
}

export function resumoDosTipos(
  tipos: readonly TipoParaResumir[],
  horarios: Readonly<Record<string, HorariosDoResponsavel>>,
): ResumoDosTipos {
  let ativos = 0;
  let prontos = 0;
  let semResponsavel = 0;
  let semHorarios = 0;
  let naoLidos = 0;
  let comLembrete = 0;

  for (const tipo of tipos) {
    const s = situacaoDoTipo(tipo, horarios);
    if (s === "desativado") continue;
    ativos += 1;
    if (tipo.reminder_enabled) comLembrete += 1;
    if (s === "pronto") prontos += 1;
    else if (s === "sem_responsavel") semResponsavel += 1;
    else if (s === "sem_horarios") semHorarios += 1;
    else naoLidos += 1;
  }

  const semLembrete = ativos - comLembrete;
  const conferencias: ConferenciaDosTipos[] = [];

  if (ativos === 0) {
    // Sem tipo ativo as outras conferências seriam verdades vazias ("todos têm responsável"): só esta fala.
    conferencias.push({ id: "ativos", estado: "atencao", motivo: "nenhum_ativo" });
  } else {
    conferencias.push({ id: "ativos", estado: "ok", motivo: "ha_ativos", quantidade: ativos });
    conferencias.push(
      semResponsavel > 0
        ? { id: "responsavel", estado: "atencao", motivo: "sem_responsavel", quantidade: semResponsavel }
        : { id: "responsavel", estado: "ok", motivo: "todos_com_responsavel" },
    );
    conferencias.push(
      semHorarios > 0
        ? { id: "horarios", estado: "atencao", motivo: "sem_horarios", quantidade: semHorarios }
        : { id: "horarios", estado: "ok", motivo: "todos_com_horarios" },
    );
    if (naoLidos > 0) {
      conferencias.push({ id: "leitura", estado: "atencao", motivo: "horarios_nao_lidos", quantidade: naoLidos });
    }
    // O aviso ao cliente é escolha da empresa: `info`, nunca `atencao`.
    conferencias.push(
      semLembrete > 0
        ? { id: "lembrete", estado: "info", motivo: "sem_lembrete", quantidade: semLembrete }
        : { id: "lembrete", estado: "ok", motivo: "todos_avisam" },
    );
  }

  return {
    total: tipos.length,
    ativos,
    desativados: tipos.length - ativos,
    prontos,
    semResponsavel,
    semHorarios,
    naoLidos,
    comLembrete,
    semLembrete,
    conferencias,
  };
}

export function contarAtencaoDosTipos(conferencias: readonly ConferenciaDosTipos[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

/**
 * A recomendação (a única da tela): ligar o aviso ao cliente. Só quando há tipo ativo sem ele — e
 * nunca porque algo "está errado": é sugestão, não pendência (por isso a conferência é `info`).
 */
export function recomendarLembrete(resumo: ResumoDosTipos): boolean {
  return resumo.ativos > 0 && resumo.semLembrete > 0;
}
