/**
 * O ESTADO do assistente de criação de agente: em que estação a pessoa está, o que já
 * respondeu e o nome do agente. Puro e sem React, para a tela só chamar e os testes
 * exercitarem sem navegador.
 *
 * Vive no `sessionStorage` e não no servidor: ninguém quer um agente criado só porque
 * abriu o assistente. A pessoa pode sair para cadastrar a chave de IA e voltar, ou
 * recarregar a página, sem perder as respostas — e o editor completo lê o mesmo estado
 * para continuar de onde ela parou.
 *
 * Todo acesso ao armazenamento é protegido: janela privada ou site bloqueado fazem o
 * `sessionStorage` lançar, e o assistente tem de funcionar do mesmo jeito (só não lembra).
 */
import { IDS_DE_MODELO, type IdDoModelo } from "../modelos";
import { IDIOMAS_DO_AGENTE, TONS_DO_AGENTE, type IdiomaDoAgente } from "../perfil";
import { respostasIniciais, tomSugerido, type RespostasDoAssistente } from "./compor";
import { ramoPorId } from "./ramos";

export const CHAVE_DO_ASSISTENTE = "assistente-de-agente.v1";

export type Estacao = 1 | 2 | 3 | 4 | 5;
export const ESTACOES: readonly Estacao[] = [1, 2, 3, 4, 5];

export interface EstadoDoAssistente {
  estacao: Estacao;
  respostas: RespostasDoAssistente;
  /** O nome do agente, digitado na última estação. Vazio = o do modelo. */
  nome: string;
}

/** O que o assistente precisa do armazenamento (`sessionStorage` cabe aqui). */
export interface Armazenamento {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

/** O idioma do agente para o idioma da tela de quem cria; idioma sem modelo cai em português. */
export function idiomaDoAgenteDaTela(idiomaDaTela: string): IdiomaDoAgente {
  return (IDIOMAS_DO_AGENTE as readonly string[]).includes(idiomaDaTela)
    ? (idiomaDaTela as IdiomaDoAgente)
    : "pt-BR";
}

/**
 * A pessoa respondeu alguma coisa? Quem sai do assistente na primeira tela, sem ter
 * respondido nada, não leva um agente pré-preenchido para o editor completo.
 */
export function temAlgoRespondido(e: EstadoDoAssistente): boolean {
  return (
    e.estacao > 1 ||
    e.respostas.ramoId !== null ||
    e.respostas.negocio.trim() !== "" ||
    e.nome.trim() !== ""
  );
}

export function estadoInicial(idioma: IdiomaDoAgente): EstadoDoAssistente {
  return { estacao: 1, respostas: respostasIniciais(idioma), nome: "" };
}

/** Trocar de ramo recomenda o modelo e o tom do ramo e descarta o que era do ramo anterior. */
export function escolherRamo(e: EstadoDoAssistente, ramoId: string | null): EstadoDoAssistente {
  const ramo = ramoId ? ramoPorId(ramoId) : undefined;
  const modeloId: IdDoModelo = ramo?.modeloRecomendado ?? "atendimento";
  return {
    ...e,
    respostas: {
      ...e.respostas,
      ramoId: ramo ? ramo.id : null,
      modeloId,
      tom: tomSugerido(ramo ? ramo.id : null, modeloId, e.respostas.idioma),
      abertura: null,
      chamarPessoaQuando: null,
    },
  };
}

/** Trocar de modelo volta ao tom sugerido e à abertura sugerida (que dependem do modelo). */
export function escolherModelo(e: EstadoDoAssistente, modeloId: IdDoModelo): EstadoDoAssistente {
  return {
    ...e,
    respostas: {
      ...e.respostas,
      modeloId,
      tom: tomSugerido(e.respostas.ramoId, modeloId, e.respostas.idioma),
      abertura: null,
    },
  };
}

function estadoValido(bruto: unknown): bruto is EstadoDoAssistente {
  if (typeof bruto !== "object" || bruto === null) return false;
  const e = bruto as Partial<EstadoDoAssistente>;
  if (!ESTACOES.includes(e.estacao as Estacao) || typeof e.nome !== "string") return false;
  const r = e.respostas as Partial<RespostasDoAssistente> | undefined;
  if (!r || typeof r !== "object") return false;
  return (
    (IDS_DE_MODELO as readonly string[]).includes(r.modeloId as string) &&
    (TONS_DO_AGENTE as readonly string[]).includes(r.tom as string) &&
    (IDIOMAS_DO_AGENTE as readonly string[]).includes(r.idioma as string) &&
    (r.ramoId === null || (typeof r.ramoId === "string" && ramoPorId(r.ramoId) !== undefined)) &&
    typeof r.negocio === "string" &&
    (r.abertura === null || typeof r.abertura === "string") &&
    (r.chamarPessoaQuando === null || typeof r.chamarPessoaQuando === "string") &&
    typeof r.usarNomeDoCliente === "boolean"
  );
}

export function lerEstado(
  armazenamento: Armazenamento | null,
  idioma: IdiomaDoAgente,
): EstadoDoAssistente {
  if (!armazenamento) return estadoInicial(idioma);
  try {
    const texto = armazenamento.getItem(CHAVE_DO_ASSISTENTE);
    if (!texto) return estadoInicial(idioma);
    const lido: unknown = JSON.parse(texto);
    if (!estadoValido(lido)) return estadoInicial(idioma);
    if (lido.respostas.idioma === idioma) return lido;
    // A tela mudou de idioma no meio: o texto editado estava em outro idioma e não serve.
    return {
      ...lido,
      respostas: {
        ...lido.respostas,
        idioma,
        abertura: null,
        chamarPessoaQuando: null,
        tom: tomSugerido(lido.respostas.ramoId, lido.respostas.modeloId, idioma),
      },
    };
  } catch {
    return estadoInicial(idioma);
  }
}

export function gravarEstado(
  armazenamento: Armazenamento | null,
  estado: EstadoDoAssistente,
): void {
  if (!armazenamento) return;
  try {
    armazenamento.setItem(CHAVE_DO_ASSISTENTE, JSON.stringify(estado));
  } catch {
    // Sem armazenamento o assistente funciona igual; só não lembra.
  }
}

export function limparEstado(armazenamento: Armazenamento | null): void {
  if (!armazenamento) return;
  try {
    armazenamento.removeItem(CHAVE_DO_ASSISTENTE);
  } catch {
    // idem
  }
}
