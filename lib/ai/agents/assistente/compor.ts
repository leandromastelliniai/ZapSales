/**
 * A COMPOSIÇÃO do agente do assistente: das respostas da pessoa (ramo, modelo, tom…)
 * aos campos do formulário de criação.
 *
 * Função pura, sem React nem Supabase: o assistente e os testes a chamam do mesmo
 * jeito. O que ela faz é só juntar o que já existe — `aplicarModelo` (o texto do
 * modelo, nos três idiomas), o bloco do ramo (vocabulário, o que nunca prometer,
 * quando chamar uma pessoa) e as capacidades do modelo. Sem ramo (ou com um ramo
 * sem texto próprio) o resultado é EXATAMENTE o da galeria de modelos do editor
 * completo: é a garantia de que as duas portas criam o mesmo agente.
 *
 * "Voltar à sugestão" é recompor: `sugestaoDe` devolve o texto que a composição usaria
 * se a pessoa não tivesse editado nada, então restaurar não guarda cópia de nada.
 */
import {
  aplicarModelo,
  instrucoesComNegocio,
  type CamposDoModelo,
  type IdDoModelo,
} from "../modelos";
import { LIMITES_DO_PERFIL, type IdiomaDoAgente, type TomDoAgente } from "../perfil";
import { ramoPorId } from "./ramos";

export interface RespostasDoAssistente {
  idioma: IdiomaDoAgente;
  /** `null` = "Outro" ou "Pular". */
  ramoId: string | null;
  modeloId: IdDoModelo;
  /** O nome do negócio; opcional (vazio = não informado). */
  negocio: string;
  tom: TomDoAgente;
  /** A frase de abertura editada pela pessoa. `null` = usar a sugestão. */
  abertura: string | null;
  /** Quando chamar uma pessoa, editado pela pessoa. `null` = usar a sugestão do ramo. */
  chamarPessoaQuando: string | null;
  /** O atalho "citar o nome do cliente". */
  usarNomeDoCliente: boolean;
}

/**
 * Os campos do formulário que a composição produz. As capacidades NÃO entram aqui: elas
 * vêm do servidor (`capacidadesPorModelo`) e este módulo roda no navegador.
 */
export type AgenteComposto = CamposDoModelo;

/** O tamanho máximo do nome do negócio que entra no texto do agente. */
export const NEGOCIO_MAX = 80;

/**
 * O tom que o assistente sugere: o do ramo, quando o ramo tem opinião, senão o do
 * próprio modelo. É a sugestão — a pessoa escolhe outro na estação do tom.
 */
export function tomSugerido(
  ramoId: string | null,
  modeloId: IdDoModelo,
  idioma: IdiomaDoAgente,
): TomDoAgente {
  const doRamo = ramoId ? ramoPorId(ramoId)?.tomRecomendado : undefined;
  return doRamo ?? aplicarModelo(modeloId, idioma).profile_tone;
}

/** Respostas de quem acabou de abrir o assistente: tudo neutro, Atendimento. */
export function respostasIniciais(idioma: IdiomaDoAgente): RespostasDoAssistente {
  return {
    idioma,
    ramoId: null,
    modeloId: "atendimento",
    negocio: "",
    tom: tomSugerido(null, "atendimento", idioma),
    abertura: null,
    chamarPessoaQuando: null,
    usarNomeDoCliente: false,
  };
}

function negocioLimpo(r: RespostasDoAssistente): string {
  return r.negocio.trim().slice(0, NEGOCIO_MAX).trim();
}

/** O texto que a composição usaria no campo, sem nenhuma edição da pessoa. */
export function sugestaoDe(
  r: RespostasDoAssistente,
  campo: "abertura" | "chamarPessoaQuando",
): string {
  const texto = r.ramoId ? ramoPorId(r.ramoId)?.texto?.[r.idioma] : undefined;
  if (campo === "chamarPessoaQuando") return texto?.chamarPessoaQuando ?? "";
  if (!texto) return aplicarModelo(r.modeloId, r.idioma).profile_welcome;
  const negocio = negocioLimpo(r);
  return negocio ? texto.aberturaComNegocio.replace("{negocio}", negocio) : texto.abertura;
}

const AVISO_DE_IA: Record<IdiomaDoAgente, string> = {
  "pt-BR": "Sou uma inteligência artificial e, se precisar, chamo uma pessoa da equipe.",
  es: "Soy una inteligencia artificial y, si hace falta, llamo a una persona del equipo.",
  en: "I'm an AI assistant and, if needed, I'll bring in a person from the team.",
};

/** O atalho "avisar que é uma IA": acrescenta a frase ao fim da abertura. */
export function acrescentarAvisoDeIa(abertura: string, idioma: IdiomaDoAgente): string {
  const base = abertura.trim();
  return base === "" ? AVISO_DE_IA[idioma] : `${base} ${AVISO_DE_IA[idioma]}`;
}

const ROTULOS: Record<
  IdiomaDoAgente,
  {
    titulo: string;
    vocabulario: (pessoa: string, compromisso: string) => string;
    nunca: string;
    chamar: string;
    nome: string;
  }
> = {
  "pt-BR": {
    titulo: "Neste negócio:",
    vocabulario: (pessoa, compromisso) =>
      `Como chamar quem fala com você: ${pessoa}. O que você conduz: ${compromisso}.`,
    nunca: "Nunca prometa",
    chamar: "Chame uma pessoa da equipe quando",
    nome: "Quando souber o nome da pessoa, chame-a pelo nome.",
  },
  es: {
    titulo: "En este negocio:",
    vocabulario: (pessoa, compromisso) =>
      `Cómo llamar a quien te escribe: ${pessoa}. Lo que conduces: ${compromisso}.`,
    nunca: "Nunca prometas",
    chamar: "Llama a una persona del equipo cuando",
    nome: "Cuando sepas el nombre de la persona, llámala por su nombre.",
  },
  en: {
    titulo: "In this business:",
    vocabulario: (pessoa, compromisso) =>
      `How to call the person writing to you: ${pessoa}. What you lead them to: ${compromisso}.`,
    nunca: "Never promise",
    chamar: "Bring in a person from the team when",
    nome: "When you know the person's name, use it.",
  },
};

export function comporAgente(r: RespostasDoAssistente): AgenteComposto {
  const modelo = aplicarModelo(r.modeloId, r.idioma);
  const texto = r.ramoId ? ramoPorId(r.ramoId)?.texto?.[r.idioma] : undefined;
  const negocio = negocioLimpo(r);
  const rotulos = ROTULOS[r.idioma];

  let instrucoes = negocio
    ? instrucoesComNegocio(modelo.system_prompt, r.idioma, negocio)
    : modelo.system_prompt;

  const chamar = (r.chamarPessoaQuando ?? sugestaoDe(r, "chamarPessoaQuando")).trim();
  const linhas: string[] = [];
  if (texto) {
    linhas.push(rotulos.vocabulario(texto.pessoa, texto.compromisso));
    linhas.push(`${rotulos.nunca}: ${texto.nuncaPrometer.join("; ")}.`);
  }
  if (chamar !== "") linhas.push(`${rotulos.chamar} ${chamar}.`);
  if (linhas.length > 0) instrucoes += `\n\n${rotulos.titulo}\n${linhas.join("\n")}`;
  if (r.usarNomeDoCliente) instrucoes += `\n\n${rotulos.nome}`;

  const abertura = (r.abertura ?? sugestaoDe(r, "abertura")).slice(0, LIMITES_DO_PERFIL.boasVindas);

  return {
    ...modelo,
    system_prompt: instrucoes,
    profile_tone: r.tom,
    profile_welcome: abertura,
  };
}
