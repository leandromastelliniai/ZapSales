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

export interface PerfilDoAgente {
  persona: string | null;
  tom: TomDoAgente | null;
  objetivo: string | null;
  boasVindas: string | null;
  idioma: IdiomaDoAgente | null;
}

export const PERFIL_VAZIO: PerfilDoAgente = {
  persona: null,
  tom: null,
  objetivo: null,
  boasVindas: null,
  idioma: null,
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

/**
 * Perfil + prompt livre = o que o agente recebe. Sem perfil, o prompt exato.
 * Com perfil, a seção do perfil vem ANTES das instruções livres, e só os campos
 * preenchidos aparecem.
 */
export function comporInstrucoes(systemPrompt: string, perfil: PerfilDoAgente): string {
  if (!perfilPreenchido(perfil)) return systemPrompt;

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
  return [...linhas, "", "## Instruções", systemPrompt].join("\n");
}
