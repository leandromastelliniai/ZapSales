/**
 * O RESUMO DAS CONVERSÕES — as contas que a tela "Conversões" mostra antes de qualquer formulário.
 *
 * Tudo aqui é leitura do que a página já carrega para si (a conexão da Meta, a do Google, o que o
 * livro-razão aceitou e o que ficou pendente, as capturas de origem); nada é gravado e nenhuma regra
 * de envio nasce neste arquivo. Puro de propósito: é a afirmação que a tela faz ("a Meta está
 * enviando", "3 vendas não chegaram ao anúncio"), e afirmação de tela precisa ser testável sem
 * montar um componente.
 *
 * ⚠️ PLATAFORMA NÃO CONECTADA É `info`, NUNCA `atencao`. Devolver vendas ao anúncio é opcional —
 * serve a quem paga mídia —, e uma empresa que não anuncia não tem nada a conectar. Já uma
 * plataforma conectada e PAUSADA, o código de teste ligado e as vendas pendentes são fato sobre o
 * que a empresa já escolheu fazer e não está acontecendo: esses são `atencao`.
 */

export interface EntradaDasConversoes {
  meta: { conectada: boolean; habilitada: boolean; emTeste: boolean };
  google: {
    /** A instalação tem as credenciais do Google Ads (só quem administra o servidor as põe). */
    instalacaoConfigurada: boolean;
    /** A empresa autorizou e escolheu a conta. */
    conectado: boolean;
    habilitado: boolean;
  };
  /** Conversões que a plataforma aceitou. */
  enviadas: number;
  /** Vendas de anúncio que deviam ter ido e não foram. */
  pendentes: number;
  /** A lista bateu no teto: o número é um piso ("20 ou mais"), não a conta exata. */
  pendentesAlemDoTeto?: boolean;
  /** Alguma das duas capturas de origem do site (Google ou Meta) está ligada. */
  capturaLigada: boolean;
}

export type EstadoDaPlataforma = "nao_conectada" | "enviando" | "pausada" | "em_teste" | "indisponivel";

export function estadoDaMeta(m: EntradaDasConversoes["meta"]): EstadoDaPlataforma {
  if (!m.conectada) return "nao_conectada";
  if (!m.habilitada) return "pausada";
  return m.emTeste ? "em_teste" : "enviando";
}

export function estadoDoGoogle(g: EntradaDasConversoes["google"]): EstadoDaPlataforma {
  if (!g.instalacaoConfigurada) return "indisponivel";
  if (!g.conectado) return "nao_conectada";
  return g.habilitado ? "enviando" : "pausada";
}

export type IdDaConferenciaDeConversoes = "meta" | "google" | "pendencias" | "captura";

export interface ConferenciaDeConversoes {
  id: IdDaConferenciaDeConversoes;
  estado: "ok" | "atencao" | "info";
  motivo: string;
  quantidade?: number;
}

export interface ResumoDasConversoes {
  meta: EstadoDaPlataforma;
  google: EstadoDaPlataforma;
  enviadas: number;
  pendentes: number;
  pendentesAlemDoTeto: boolean;
  conferencias: ConferenciaDeConversoes[];
}

/** Há alguma plataforma conectada (enviando, pausada ou em teste)? */
function conectada(e: EstadoDaPlataforma): boolean {
  return e === "enviando" || e === "pausada" || e === "em_teste";
}

export function resumoDasConversoes(entrada: EntradaDasConversoes): ResumoDasConversoes {
  const meta = estadoDaMeta(entrada.meta);
  const google = estadoDoGoogle(entrada.google);
  const algumaConectada = conectada(meta) || conectada(google);

  const conferencias: ConferenciaDeConversoes[] = [
    {
      id: "meta",
      estado: meta === "enviando" ? "ok" : meta === "nao_conectada" ? "info" : "atencao",
      motivo: `meta_${meta}`,
    },
    {
      id: "google",
      estado: google === "enviando" ? "ok" : google === "nao_conectada" || google === "indisponivel" ? "info" : "atencao",
      motivo: `google_${google}`,
    },
    entrada.pendentes > 0
      ? { id: "pendencias", estado: "atencao", motivo: "com_pendencias", quantidade: entrada.pendentes }
      : { id: "pendencias", estado: algumaConectada ? "ok" : "info", motivo: algumaConectada ? "sem_pendencias" : "nada_conectado" },
    entrada.capturaLigada
      ? { id: "captura", estado: "ok", motivo: "captura_ligada" }
      : { id: "captura", estado: "info", motivo: "captura_desligada" },
  ];

  return {
    meta,
    google,
    enviadas: entrada.enviadas,
    pendentes: entrada.pendentes,
    pendentesAlemDoTeto: entrada.pendentesAlemDoTeto === true,
    conferencias,
  };
}

export function contarAtencaoDeConversoes(conferencias: ConferenciaDeConversoes[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

export type RecomendacaoDeConversoes =
  | { tipo: "conectar_plataforma" }
  | { tipo: "apagar_codigo_de_teste" }
  | { tipo: "religar_envio" }
  | { tipo: "resolver_pendencias"; quantidade: number }
  | { tipo: "ligar_captura" };

/**
 * O próximo passo que a casa recomenda, UM de cada vez, sempre com motivo.
 *
 * A ordem é a do caminho de quem começa: sem nada conectado não há o que conferir; conectado em teste
 * as vendas não contam; pausado nada sai; com pendência há venda que o anúncio não soube; e só
 * então vale cuidar de saber de onde veio quem chega pelo site. `null` = nada a recomendar.
 */
export function recomendarParaConversoes(
  resumo: ResumoDasConversoes,
  capturaLigada: boolean,
): RecomendacaoDeConversoes | null {
  if (!conectada(resumo.meta) && !conectada(resumo.google)) return { tipo: "conectar_plataforma" };
  if (resumo.meta === "em_teste") return { tipo: "apagar_codigo_de_teste" };
  if (resumo.meta === "pausada" || resumo.google === "pausada") return { tipo: "religar_envio" };
  if (resumo.pendentes > 0) return { tipo: "resolver_pendencias", quantidade: resumo.pendentes };
  if (!capturaLigada) return { tipo: "ligar_captura" };
  return null;
}
