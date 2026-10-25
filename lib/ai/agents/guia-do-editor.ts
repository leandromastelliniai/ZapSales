/**
 * O GUIA DO EDITOR COMPLETO: quão pronto o agente está e o que mais ajudaria agora.
 *
 * O editor tem nove partes e, até aqui, só dizia o que estava escrito em cada uma. Quem
 * configura um agente (dono de clínica, de loja) precisa de outra resposta: "está bom para
 * publicar?" e "o que eu faço a seguir?". Este módulo responde às duas, em funções puras
 * sobre fatos do formulário, sem texto de tela: o editor traduz os ids em frases com `t()`.
 *
 * A "força" é uma régua de PRONTIDÃO, não de qualidade da IA: soma pesos de passos que
 * qualquer agente publicável cumpre (nome, personalidade, material de consulta, ações,
 * quando chamar uma pessoa, número, modelo). Os pesos refletem o que mais derruba um
 * agente na prática: sem material ele inventa preço (20), sem personalidade responde
 * genérico (20), sem ações ou sem saída para uma pessoa ele conversa e ninguém age (15
 * cada). É CALCULADA no navegador a cada digitação; não é gravada em lugar nenhum.
 */

export const IDS_DE_SECAO_DO_GUIA = [
  "quem",
  "personalidade",
  "respostas",
  "conhecimento",
  "capacidades",
  "onde",
  "pessoas",
  "vendas",
  "inteligencia",
] as const;
export type IdDaSecaoDoGuia = (typeof IDS_DE_SECAO_DO_GUIA)[number];

/** Os fatos do formulário de que o guia precisa, já reduzidos: nada de texto livre inteiro. */
export interface FatosDoAgente {
  nome: string;
  /** Tom e (persona ou objetivo) preenchidos no perfil guiado. */
  temPerfil: boolean;
  /** Instruções livres não vazias: o agente que já existia vive nelas. */
  temInstrucoes: boolean;
  temBoasVindas: boolean;
  materiais: number;
  /** Capacidades ligadas, as de ferramenta externa incluídas. */
  acoes: number;
  numeroEscolhido: boolean;
  chamaPessoa: boolean;
  followupLigado: boolean;
  /** O modelo de IA está escolhido (vazio só numa criação em que ninguém escolheu). */
  modeloEscolhido: boolean;
}

export const IDS_DE_PASSO = [
  "materiais",
  "personalidade",
  "acoes",
  "pessoa",
  "nome",
  "numero",
  "boas_vindas",
  "modelo",
] as const;
export type IdDoPasso = (typeof IDS_DE_PASSO)[number];

export interface PassoDaForca {
  id: IdDoPasso;
  peso: number;
  /** Onde, no editor, o passo se resolve. */
  secao: IdDaSecaoDoGuia;
  feito: boolean;
}

/** Soma 100. A ordem do vetor desempata o "próximo passo" quando dois pesos empatam. */
const PESOS: ReadonlyArray<{ id: IdDoPasso; peso: number; secao: IdDaSecaoDoGuia }> = [
  { id: "materiais", peso: 20, secao: "conhecimento" },
  { id: "personalidade", peso: 20, secao: "personalidade" },
  { id: "acoes", peso: 15, secao: "capacidades" },
  { id: "pessoa", peso: 15, secao: "pessoas" },
  { id: "nome", peso: 10, secao: "quem" },
  { id: "numero", peso: 10, secao: "onde" },
  { id: "boas_vindas", peso: 5, secao: "personalidade" },
  { id: "modelo", peso: 5, secao: "inteligencia" },
];

function feito(id: IdDoPasso, f: FatosDoAgente): boolean {
  switch (id) {
    case "materiais":
      return f.materiais > 0;
    case "personalidade":
      return f.temPerfil || f.temInstrucoes;
    case "acoes":
      return f.acoes > 0;
    case "pessoa":
      return f.chamaPessoa;
    case "nome":
      return f.nome.trim() !== "";
    case "numero":
      return f.numeroEscolhido;
    case "boas_vindas":
      return f.temBoasVindas;
    case "modelo":
      return f.modeloEscolhido;
  }
}

export interface ForcaDoAgente {
  /** 0 a 100, inteiro. */
  percentual: number;
  passos: PassoDaForca[];
  /** O passo pendente que mais pesa; `null` quando está tudo feito. */
  proximo: PassoDaForca | null;
}

export function forcaDoAgente(f: FatosDoAgente): ForcaDoAgente {
  const passos = PESOS.map((p) => ({ ...p, feito: feito(p.id, f) }));
  const percentual = passos.reduce((soma, p) => soma + (p.feito ? p.peso : 0), 0);
  // `find` devolve o primeiro pendente e o vetor já está em ordem decrescente de peso.
  const proximo = passos.find((p) => !p.feito) ?? null;
  return { percentual, passos, proximo };
}

/** Como a faixa de força se chama: muda o tom do texto, não a cor (cor é da IA, em violeta). */
export type FaixaDaForca = "comecando" | "boa" | "completa";

export function faixaDaForca(percentual: number): FaixaDaForca {
  if (percentual >= 100) return "completa";
  if (percentual >= 60) return "boa";
  return "comecando";
}

/**
 * - `pronto`: a parte está preenchida ou tem um padrão bom;
 * - `revisar`: falta algo que o agente precisa para atender bem;
 * - `opcional`: dá para publicar sem ela (hoje, só a parte de retornos, e só desligada).
 */
export type EstadoDaSecao = "pronto" | "revisar" | "opcional";

export function estadoDasSecoes(f: FatosDoAgente): Record<IdDaSecaoDoGuia, EstadoDaSecao> {
  const ok = (v: boolean): EstadoDaSecao => (v ? "pronto" : "revisar");
  return {
    quem: ok(feito("nome", f)),
    personalidade: ok(feito("personalidade", f)),
    // Há sempre um padrão (texto único ou bolhas): nunca "falta" nada aqui.
    respostas: "pronto",
    conhecimento: ok(feito("materiais", f)),
    capacidades: ok(feito("acoes", f)),
    onde: ok(feito("numero", f)),
    pessoas: ok(feito("pessoa", f)),
    vendas: f.followupLigado ? "pronto" : "opcional",
    // Padrão da casa; só reclama se não há modelo.
    inteligencia: ok(feito("modelo", f)),
  };
}
