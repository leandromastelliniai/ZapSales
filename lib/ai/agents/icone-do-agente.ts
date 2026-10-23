import { z } from "zod";

/**
 * O ÍCONE QUE IDENTIFICA UM AGENTE nas telas da equipe (lista, editor).
 *
 * É identidade visual, não comportamento: mora em `ai_agents.config.icone` e não
 * na versão, porque trocar o ícone não muda o que o agente responde e não deve
 * pedir uma publicação nova. O cliente do WhatsApp nunca o vê.
 *
 * Os ids são estáveis (ficam gravados no banco); o desenho de cada um é decidido
 * em `components/ai/AvatarDoAgente.tsx`. Id desconhecido — de uma versão futura
 * ou digitado à mão — cai na sugestão, nunca em erro.
 */
export const ICONES_DO_AGENTE = [
  "assistente",
  "atendente",
  "vendas",
  "loja",
  "agenda",
  "suporte",
  "saude",
  "imoveis",
  "educacao",
  "financeiro",
  "entregas",
  "restaurante",
  "beleza",
  "marketing",
  "juridico",
  "pet",
  "automoveis",
  "academia",
  "robo",
] as const;

export type IconeDoAgente = (typeof ICONES_DO_AGENTE)[number];

export const iconeDoAgenteSchema = z.enum(ICONES_DO_AGENTE);

/** O nome de cada ícone, em português (a tela passa por `t()`). */
export const ROTULO_DO_ICONE: Record<IconeDoAgente, string> = {
  assistente: "Assistente",
  atendente: "Atendimento",
  vendas: "Vendas",
  loja: "Loja",
  agenda: "Agendamento",
  suporte: "Suporte",
  saude: "Saúde",
  imoveis: "Imóveis",
  educacao: "Educação",
  financeiro: "Financeiro",
  entregas: "Entregas",
  restaurante: "Restaurante",
  beleza: "Beleza",
  marketing: "Marketing",
  juridico: "Jurídico",
  pet: "Pet",
  automoveis: "Automóveis",
  academia: "Academia",
  robo: "Robô",
};

/**
 * Palavras que sugerem o ícone, na ORDEM em que são testadas: a primeira que
 * casa vence. As mais específicas vêm antes ("agendamento da clínica" é agenda,
 * não saúde) e "atendimento" fica por último, porque quase todo agente atende.
 * Português e espanhol: o nome é escrito pelo dono, no idioma dele.
 */
const PISTAS: ReadonlyArray<readonly [IconeDoAgente, RegExp]> = [
  ["agenda", /agend|marca[çc][ãa]o|hor[áa]rio|consulta|reserva|\bcita/],
  ["vendas", /vend|venta|pedido|comercial|or[çc]amento|sdr|closer|qualifica/],
  ["suporte", /suporte|soporte|t[ée]cnic|ajuda|ayuda|help|chamado/],
  ["financeiro", /financ|cobran|pagamento|pago|boleto|fatura|factura/],
  ["entregas", /entrega|frete|log[íi]stic|rastre/],
  ["marketing", /marketing|campanha|campa[ñn]a|an[úu]ncio|lan[çc]amento/],
  ["saude", /cl[íi]nic|sa[úu]de|salud|m[ée]dic|odonto|\bdent|paciente|terapi|psic/],
  ["imoveis", /im[óo]ve|imobili|inmobili|aluguel|alquiler|corretor/],
  ["educacao", /curso|aluno|alumno|escola|escuela|educa|matr[íi]cula|\baula/],
  ["restaurante", /restaurante|delivery|card[áa]pio|pizza|lanche|comida|hamburg/],
  ["beleza", /sal[ãa]o|sal[óo]n|beleza|belleza|est[ée]tica|barbe|\bunha|cabelo/],
  ["juridico", /advoga|abogad|jur[íi]dic|direito|derecho/],
  ["pet", /\bpet|veterin|cachorro|perro|gato/],
  ["automoveis", /carro|\bauto\b|autom[óo]v|ve[íi]culo|oficina|\bmoto/],
  ["academia", /academia|gimnasio|fitness|treino|\bpersonal\b/],
  ["loja", /loja|tienda|e-?commerce|shop|produto|producto/],
  ["atendente", /atend|recep|sac\b|secret[áa]ri/],
];

/** O ícone que o nome (e a descrição) sugerem; `assistente` quando nada casa. */
export function sugerirIcone(nome: string, descricao?: string | null): IconeDoAgente {
  const texto = `${nome} ${descricao ?? ""}`.toLowerCase();
  for (const [icone, pista] of PISTAS) {
    if (pista.test(texto)) return icone;
  }
  return "assistente";
}

/** O ícone escolhido pelo dono, se for um que esta versão conhece. */
export function iconeEscolhido(config: unknown): IconeDoAgente | null {
  if (!config || typeof config !== "object") return null;
  const r = iconeDoAgenteSchema.safeParse((config as { icone?: unknown }).icone);
  return r.success ? r.data : null;
}

/** O ícone a desenhar: o escolhido, ou o sugerido pelo nome. */
export function iconeDoAgente(agente: {
  name: string;
  description?: string | null;
  config?: unknown;
}): IconeDoAgente {
  return iconeEscolhido(agente.config) ?? sugerirIcone(agente.name, agente.description);
}
