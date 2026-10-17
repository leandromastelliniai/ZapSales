/**
 * O PERFIL GUIADO DO AGENTE (issue #89) — o que o dono preenche num formulário
 * em vez de escrever prompt, e como isso vira o que o agente recebe.
 *
 * O perfil é dado da VERSÃO (`ai_agent_versions.profile_*`): rascunho, diff,
 * histórico e desfazer valem para ele como valem para o prompt. O que o modelo
 * recebe é a COMPOSIÇÃO do perfil com o prompt livre (que segue existindo, como
 * modo avançado) — `comporInstrucoes`, aplicada num lugar só: a carga da config
 * publicada (`mapAgentConfigRow`). A tela usa a MESMA função para mostrar "como
 * as duas partes se combinam", então a prévia não pode divergir do turno.
 *
 * ⚠️ Perfil vazio devolve o prompt INTACTO, byte a byte. É a garantia de que o
 * agente que existia antes desta funcionalidade se comporta exatamente como antes
 * até alguém editá-lo — e o teste que a prova está em `perfil.test.ts`.
 */

/** Tom de voz em três níveis. Mesmo vocabulário do CHECK de `profile_tone`. */
export const TONS_DO_AGENTE = ["formal", "normal", "descontraido"] as const;
export type TomDoAgente = (typeof TONS_DO_AGENTE)[number];

/**
 * Idiomas do agente = os do produto (pt-BR, es, en). Mesmo vocabulário do CHECK
 * de `profile_language`; `perfil.test.ts` reprova se o registro de idiomas
 * ganhar um e esta lista não.
 */
export const IDIOMAS_DO_AGENTE = ["pt-BR", "es", "en"] as const;
export type IdiomaDoAgente = (typeof IDIOMAS_DO_AGENTE)[number];

/** Tetos dos campos de texto — os mesmos que a tela mostra e o Zod recusa. */
export const LIMITES_DO_PERFIL = {
  persona: 600,
  objetivo: 600,
  boasVindas: 500,
} as const;

/**
 * Tetos da restrição de temas (issue #92). Os mesmos valores vivem nos CHECKs da
 * migration 0549 (`allowed_topics`, `off_topic_reply`).
 */
export const LIMITES_DOS_TEMAS = {
  /** Quantos assuntos permitidos. */
  assuntos: 20,
  /** Tamanho de cada assunto. */
  assunto: 120,
  /** Tamanho da resposta padrão para o que está fora. */
  respostaFora: 500,
} as const;

export interface PerfilDoAgente {
  persona: string | null;
  tom: TomDoAgente | null;
  objetivo: string | null;
  boasVindas: string | null;
  idioma: IdiomaDoAgente | null;
  /** Chave "restringir temas" (#92). Desligada = a lista abaixo não vale nada. */
  restringirTemas: boolean;
  temasPermitidos: string[];
  /** A resposta para o que está fora da lista. `null` = recusa educada no estilo do agente. */
  respostaForaDoTema: string | null;
}

export const PERFIL_VAZIO: PerfilDoAgente = {
  persona: null,
  tom: null,
  objetivo: null,
  boasVindas: null,
  idioma: null,
  restringirTemas: false,
  temasPermitidos: [],
  respostaForaDoTema: null,
};

const DESCRICAO_DO_TOM: Record<TomDoAgente, string> = {
  formal: "formal — trate o contato com cerimônia e correção, sem gírias nem emojis.",
  normal: "normal — cordial e direto, natural, sem exagero de formalidade nem de intimidade.",
  descontraido:
    "descontraído — fale de forma leve e próxima, como numa conversa entre conhecidos, sem perder o respeito.",
};

const NOME_DO_IDIOMA: Record<IdiomaDoAgente, string> = {
  "pt-BR": "português do Brasil",
  es: "español",
  en: "English",
};

function texto(valor: string | null): string | null {
  const limpo = valor?.trim() ?? "";
  return limpo === "" ? null : limpo;
}

/** O perfil tem ALGUM campo preenchido (espaço em branco não conta)? */
export function perfilPreenchido(perfil: PerfilDoAgente): boolean {
  return (
    texto(perfil.persona) !== null ||
    perfil.tom !== null ||
    texto(perfil.objetivo) !== null ||
    texto(perfil.boasVindas) !== null ||
    perfil.idioma !== null
  );
}

/** Os assuntos permitidos que de fato valem: aparados, sem vazios. */
export function assuntosValidos(perfil: PerfilDoAgente): string[] {
  return perfil.temasPermitidos.map((a) => a.trim()).filter((a) => a !== "");
}

/**
 * A restrição só existe com a chave ligada E ao menos um assunto: chave ligada
 * com lista vazia calaria o agente inteiro, e isso o dono nunca quis.
 */
export function restricaoDeTemasAtiva(perfil: PerfilDoAgente): boolean {
  return restricaoAtiva(perfil.restringirTemas, perfil.temasPermitidos);
}

/**
 * A mesma regra para quem só tem a chave e a lista (a confirmação de publicar lê
 * a linha da versão, e não um `PerfilDoAgente`): um lugar só decide o que vale.
 */
export function restricaoAtiva(ligada: boolean, assuntos: readonly string[]): boolean {
  return ligada && assuntos.some((a) => a.trim() !== "");
}

/**
 * A seção "Assuntos permitidos". Mora na COMPOSIÇÃO de instruções — não é uma
 * conferência antes do envio (as 11 seguem intactas) e não bloqueia nada por
 * código: é a instrução que o modelo lê. O pedido de atendente humano e o
 * opt-out são declarados como EXCEÇÃO aqui, e continuam tendo os seus próprios
 * caminhos (palavras de passagem da versão, `lib/opt-out`) que nem passam pelo
 * modelo.
 */
function secaoDeTemas(perfil: PerfilDoAgente): string[] {
  const resposta = texto(perfil.respostaForaDoTema);
  return [
    "## Assuntos permitidos",
    "Converse SOMENTE sobre estes assuntos:",
    ...assuntosValidos(perfil).map((a) => `- ${a}`),
    resposta !== null
      ? `Se o contato perguntar sobre qualquer outra coisa, não responda a pergunta e responda exatamente com esta mensagem: ${resposta}`
      : "Se o contato perguntar sobre qualquer outra coisa, não responda a pergunta: diga de forma educada, no seu tom, que não pode ajudar com esse assunto e lembre sobre o que você pode ajudar.",
    "Isto NUNCA é fora do tema, e vale sempre, mesmo fora da lista acima: (1) pedido para falar com um atendente humano ou com uma pessoa — encaminhe como suas instruções mandam; (2) pedido para parar de receber mensagens, sair da lista ou não ser mais contatado — respeite e confirme; (3) cumprimentos e a conversa social de abertura.",
  ];
}

/**
 * Perfil + prompt livre = o que o agente recebe. Sem perfil, o prompt exato.
 * Com perfil, a seção do perfil vem ANTES das instruções livres, e só os campos
 * preenchidos aparecem.
 */
export function comporInstrucoes(systemPrompt: string, perfil: PerfilDoAgente): string {
  const comPerfil = perfilPreenchido(perfil);
  const comTemas = restricaoDeTemasAtiva(perfil);
  if (!comPerfil && !comTemas) return systemPrompt;

  const secoes: string[][] = [];
  if (comPerfil) secoes.push(secaoDoPerfil(perfil));
  if (comTemas) secoes.push(secaoDeTemas(perfil));
  const blocos = secoes.map((linhas) => linhas.join("\n"));
  return [...blocos.flatMap((b) => [b, ""]), "## Instruções", systemPrompt].join("\n");
}

function secaoDoPerfil(perfil: PerfilDoAgente): string[] {
  const linhas: string[] = ["## Perfil do agente"];
  const persona = texto(perfil.persona);
  if (persona !== null) linhas.push(`- Persona: ${persona}`);
  if (perfil.tom !== null) linhas.push(`- Tom de voz: ${DESCRICAO_DO_TOM[perfil.tom]}`);
  const objetivo = texto(perfil.objetivo);
  if (objetivo !== null) linhas.push(`- Objetivo: ${objetivo}`);
  const boasVindas = texto(perfil.boasVindas);
  if (boasVindas !== null) {
    linhas.push(
      `- Boas-vindas: Ao iniciar a conversa com um contato novo, abra com esta mensagem (pode ajustar o nome do contato, sem mudar o sentido): ${boasVindas}`,
    );
  }
  if (perfil.idioma !== null) {
    linhas.push(`- Idioma: responda sempre em ${NOME_DO_IDIOMA[perfil.idioma]}.`);
  }
  return linhas;
}
