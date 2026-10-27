/**
 * O RESUMO DA IA — as contas que a tela "Provedores de IA" mostra antes de qualquer seletor.
 *
 * Tudo aqui é leitura do que `GET /api/v1/ai/providers` já devolve (pontos, credenciais, padrão) mais
 * o estado dos três ajudantes opcionais (Jev, resposta em áudio, mapas); nada é gravado e nenhuma
 * regra de resolução nasce neste arquivo. A regra de QUAL chave o motor usa é do registry — aqui só
 * se responde "tem alguma chave para o provedor do padrão?", com os mesmos dados que a tela já tem.
 *
 * ⚠️ OS OPCIONAIS SÃO `info`, NUNCA `atencao`. Nada obriga a empresa a ligar o Jev, a resposta em
 * áudio ou a chave de mapas, e o atendimento funciona sem eles: tratá-los como pendência cobraria
 * uma escolha que a pessoa pode ter feito de propósito. Já a falta de chave para a IA que conversa
 * é fato sobre a instalação — o agente não responde ninguém — e é `atencao`.
 */

/** O que a conta precisa de cada ponto de IA. */
export interface PontoDoResumo {
  /** `efetivo.origem` do ponto; `padrao_da_organizacao` = herda o Modelo padrão. */
  origem: string;
  avisos: string[];
}

export interface CredencialDoResumo {
  provider: string;
  label: string;
  api_key_last4: string | null;
}

export type EstadoDoLigavel = "ligado" | "desligado" | "desconhecido";
export type EstadoDosMapas = "com_chave" | "sem_chave" | "desconhecido";

export interface EntradaDaIA {
  pontos: PontoDoResumo[];
  /** O provedor do Modelo padrão da empresa. */
  provedorDoPadrao: string;
  credenciais: CredencialDoResumo[];
  /** Há chave de IA no `.env` da instalação. */
  instalacaoTemChave: boolean;
  jev: EstadoDoLigavel;
  audio: EstadoDoLigavel;
  mapas: EstadoDosMapas;
}

export type OrigemDaChave =
  | { tipo: "empresa"; rotulo: string; ultimos4: string | null }
  | { tipo: "instalacao" }
  | { tipo: "falta" };

/**
 * Quem fornece a chave da IA que conversa: a da empresa (para o provedor do padrão) vale primeiro,
 * a da instalação é o piso, e sem nenhuma o agente não responde. Chave de OUTRO provedor não
 * conta — cadastrar a da OpenAI não faz o Claude do padrão funcionar.
 */
export function origemDaChave(entrada: EntradaDaIA): OrigemDaChave {
  const daEmpresa = entrada.credenciais.find((c) => c.provider === entrada.provedorDoPadrao);
  if (daEmpresa) return { tipo: "empresa", rotulo: daEmpresa.label, ultimos4: daEmpresa.api_key_last4 };
  if (entrada.instalacaoTemChave) return { tipo: "instalacao" };
  return { tipo: "falta" };
}

export type IdDaConferenciaDaIA = "chave" | "avisos" | "jev" | "audio" | "mapas";

export interface ConferenciaDaIA {
  id: IdDaConferenciaDaIA;
  estado: "ok" | "atencao" | "info";
  motivo: string;
  /** Quantidade citada na frase (partes com aviso). */
  quantidade?: number;
}

export interface Opcional {
  id: "jev" | "audio" | "mapas";
  estado: "ligado" | "desligado" | "sem_chave" | "desconhecido";
}

export interface ResumoDaIA {
  origemDaChave: OrigemDaChave;
  /** Pontos que herdam o Modelo padrão. */
  herdam: number;
  total: number;
  comAviso: number;
  opcionais: Opcional[];
  /** Quantos dos três opcionais estão em uso (Jev ligado, áudio ligado, mapas com chave). */
  opcionaisEmUso: number;
  conferencias: ConferenciaDaIA[];
}

export function resumoDaIA(entrada: EntradaDaIA): ResumoDaIA {
  const origem = origemDaChave(entrada);
  const herdam = entrada.pontos.filter((p) => p.origem === "padrao_da_organizacao").length;
  const comAviso = entrada.pontos.filter((p) => p.avisos.length > 0).length;

  const opcionais: Opcional[] = [
    { id: "jev", estado: entrada.jev },
    { id: "audio", estado: entrada.audio },
    // Mapas não liga nem desliga: tem ou não tem chave, e a frase precisa dizer o que falta.
    {
      id: "mapas",
      estado: entrada.mapas === "com_chave" ? "ligado" : entrada.mapas === "sem_chave" ? "sem_chave" : "desconhecido",
    },
  ];
  const opcionaisEmUso = opcionais.filter((o) => o.estado === "ligado").length;

  const conferencias: ConferenciaDaIA[] = [
    origem.tipo === "falta"
      ? { id: "chave", estado: "atencao", motivo: "sem_chave" }
      : { id: "chave", estado: "ok", motivo: origem.tipo === "empresa" ? "chave_da_empresa" : "chave_da_instalacao" },
    comAviso > 0
      ? { id: "avisos", estado: "atencao", motivo: "partes_com_aviso", quantidade: comAviso }
      : { id: "avisos", estado: "ok", motivo: "sem_avisos" },
    ...opcionais.map<ConferenciaDaIA>((o) => ({
      id: o.id,
      estado: o.estado === "ligado" ? "ok" : "info",
      motivo: `${o.id}_${o.estado}`,
    })),
  ];

  return { origemDaChave: origem, herdam, total: entrada.pontos.length, comAviso, opcionais, opcionaisEmUso, conferencias };
}

export function contarAtencaoDaIA(conferencias: ConferenciaDaIA[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

export type RecomendacaoDoPadrao =
  | { tipo: "cadastrar_chave" }
  | { tipo: "manter_padrao"; herdam: number; total: number };

/**
 * A recomendação do cartão "Modelo padrão", sempre com motivo.
 *
 * Sem chave para a IA que conversa nada mais importa: é a primeira coisa a fazer. Com chave, a
 * orientação é não mexer sem razão — o padrão vale para quase todas as partes do sistema e uma
 * troca ali muda todas de uma vez. Não recomenda um modelo específico: qual modelo serve melhor
 * depende de custo e de privacidade, que a tela não conhece.
 */
export function recomendarParaOPadrao(resumo: ResumoDaIA): RecomendacaoDoPadrao {
  if (resumo.origemDaChave.tipo === "falta") return { tipo: "cadastrar_chave" };
  return { tipo: "manter_padrao", herdam: resumo.herdam, total: resumo.total };
}
