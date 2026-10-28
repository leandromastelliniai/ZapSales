/**
 * O RESUMO DOS RECURSOS OPCIONAIS — as contas que a tela mostra antes da lista de 34 itens, e os
 * blocos em que a lista da empresa se divide.
 *
 * Tudo aqui é leitura do estado que a página já calcula (`estadoDoRecurso`): nada é gravado e nenhuma
 * chave nasce neste arquivo. Puro de propósito — "7 dependem do servidor" é afirmação de tela, e
 * afirmação de tela precisa ser testável sem montar componente.
 *
 * ⚠️ A CONTA NÃO CHUTA. Item que `varia` por número, etapa ou agente, ou cujo estado mora na tela dele
 * (`nao_verificado`), NÃO entra em "ligados" nem em "desligados": entra em "você confere". E item que
 * a leitura não alcançou (`nao_lido`) também cai em "você confere" — nunca vira "desligado" (a mesma
 * regra do catálogo: "não sei" disfarçado de "desligado" faz procurar um interruptor quando o problema
 * é o banco). Cada item cai em UMA categoria só, então as quatro contagens somam o total.
 *
 * ⚠️ O QUE FALTA NO SERVIDOR É `info`, NUNCA `atencao`. A empresa não tem como ligar um módulo que
 * quem administra o servidor desligou — pedir é o único passo —, e "atenção" é para o que ela pode
 * resolver. Já a leitura que falhou é fato novo e pede atenção.
 */
import type { EstadoDoRecurso } from "@/lib/recursos-opcionais/catalogo";

export interface ItemParaResumir {
  id: string;
  estado: EstadoDoRecurso;
  /** O recurso exige um módulo que o servidor desligou (a empresa não consegue ligá-lo). */
  dependeDoServidor: boolean;
}

export type IdDaConferenciaDeRecursos = "leitura" | "servidor" | "conferir";

export interface ConferenciaDeRecursos {
  id: IdDaConferenciaDeRecursos;
  estado: "ok" | "atencao" | "info";
  motivo: string;
  quantidade?: number;
}

export interface ResumoDosRecursos {
  total: number;
  ligados: number;
  desligados: number;
  /** `varia` + `nao_verificado` + `nao_lido`: o estado não cabe numa palavra aqui. */
  conferir: number;
  /** Dos que se conferem, quantos são por falha de leitura agora (esses pedem atenção). */
  naoLidos: number;
  dependemDoServidor: number;
  conferencias: ConferenciaDeRecursos[];
}

export function resumoDosRecursos(itens: readonly ItemParaResumir[]): ResumoDosRecursos {
  let ligados = 0;
  let desligados = 0;
  let conferir = 0;
  let naoLidos = 0;
  let dependemDoServidor = 0;

  for (const i of itens) {
    if (i.estado === "nao_lido") {
      conferir += 1;
      naoLidos += 1;
    } else if (i.dependeDoServidor) {
      dependemDoServidor += 1;
    } else if (i.estado === "ligado") {
      ligados += 1;
    } else if (i.estado === "desligado") {
      desligados += 1;
    } else {
      conferir += 1;
    }
  }

  const aConferirNaTela = conferir - naoLidos;
  const conferencias: ConferenciaDeRecursos[] = [
    naoLidos > 0
      ? { id: "leitura", estado: "atencao", motivo: "nao_lidos", quantidade: naoLidos }
      : { id: "leitura", estado: "ok", motivo: "todos_lidos" },
    dependemDoServidor > 0
      ? { id: "servidor", estado: "info", motivo: "dependem_do_servidor", quantidade: dependemDoServidor }
      : { id: "servidor", estado: "ok", motivo: "nada_depende_do_servidor" },
    { id: "conferir", estado: "info", motivo: aConferirNaTela > 0 ? "conferir_na_tela" : "nada_a_conferir", quantidade: aConferirNaTela },
  ];

  return { total: itens.length, ligados, desligados, conferir, naoLidos, dependemDoServidor, conferencias };
}

export function contarAtencaoDeRecursos(conferencias: readonly ConferenciaDeRecursos[]): number {
  return conferencias.filter((c) => c.estado === "atencao").length;
}

// ─── Os blocos da lista "Da sua empresa" ─────────────────────────────────────────────────────────

export type AssuntoDaEmpresa =
  | "atendimento"
  | "funil_e_agenda"
  | "vendas_e_anuncios"
  | "ia_e_conhecimento"
  | "voz_e_telefonia"
  | "seguranca_e_menus";

/** A ordem de quem lê: o dia a dia do atendimento primeiro, o que se mexe uma vez por último. */
export const ASSUNTOS_DA_EMPRESA: readonly { id: AssuntoDaEmpresa; titulo: string }[] = [
  { id: "atendimento", titulo: "Atendimento e equipe" },
  { id: "funil_e_agenda", titulo: "Funil e agenda" },
  { id: "vendas_e_anuncios", titulo: "Vendas e anúncios" },
  { id: "ia_e_conhecimento", titulo: "IA e conhecimento" },
  { id: "voz_e_telefonia", titulo: "Voz e telefonia" },
  { id: "seguranca_e_menus", titulo: "Segurança e menus" },
];

/**
 * Em qual bloco cada recurso da EMPRESA (`nivel === "organizacao"`) aparece. Chave = `id` do
 * catálogo. `tests/unit/resumo-dos-recursos.test.ts` reprova recurso da empresa sem bloco — o mesmo
 * mecanismo que impede recurso fora do mapa —, então item novo não some numa lista sem título.
 */
export const ASSUNTO_DO_RECURSO: Readonly<Record<string, AssuntoDaEmpresa>> = {
  conversa_fica_com_quem_atendeu: "atendimento",
  ia_volta_sozinha: "atendimento",
  atendente_so_ve_os_seus: "atendimento",
  assinatura_do_emissor: "atendimento",
  acesso_da_ia_por_numero: "atendimento",
  protecao_de_envio: "atendimento",
  grupos_na_inbox: "atendimento",
  aviso_no_whatsapp: "atendimento",

  etapa_move_o_card: "funil_e_agenda",
  etapa_avisa_na_central: "funil_e_agenda",
  cliente_pela_agenda: "funil_e_agenda",
  colegas_mexem_na_agenda: "funil_e_agenda",
  propostas_da_empresa: "funil_e_agenda",

  conversoes_meta: "vendas_e_anuncios",
  conversoes_google: "vendas_e_anuncios",
  captura_de_origem: "vendas_e_anuncios",

  jev: "ia_e_conhecimento",
  resposta_em_audio: "ia_e_conhecimento",
  mcp_externo: "ia_e_conhecimento",
  base_com_google: "ia_e_conhecimento",
  mapas: "ia_e_conhecimento",
  teto_de_gasto: "ia_e_conhecimento",

  voz_da_empresa: "voz_e_telefonia",
  tronco_sip: "voz_e_telefonia",

  mfa_obrigatorio: "seguranca_e_menus",
  interface: "seguranca_e_menus",
  extensoes: "seguranca_e_menus",
};

export const TITULO_DO_BLOCO_SEM_ASSUNTO = "Outros recursos";

/**
 * Reparte os recursos da empresa pelos blocos, na ordem de `ASSUNTOS_DA_EMPRESA`; bloco vazio some.
 * Recurso sem bloco declarado cai em "Outros recursos" em vez de sumir da tela — o teste cobra o
 * bloco, mas a página não pode perder um item por esquecimento de quem o cadastrou.
 */
export function repartirPorAssunto<T extends { id: string }>(
  recursos: readonly T[],
): { id: AssuntoDaEmpresa | "outros"; titulo: string; recursos: T[] }[] {
  const grupos: { id: AssuntoDaEmpresa | "outros"; titulo: string; recursos: T[] }[] = ASSUNTOS_DA_EMPRESA.map((a) => ({
    ...a,
    recursos: recursos.filter((r) => ASSUNTO_DO_RECURSO[r.id] === a.id),
  }));
  grupos.push({
    id: "outros",
    titulo: TITULO_DO_BLOCO_SEM_ASSUNTO,
    recursos: recursos.filter((r) => !(r.id in ASSUNTO_DO_RECURSO)),
  });
  return grupos.filter((g) => g.recursos.length > 0);
}
