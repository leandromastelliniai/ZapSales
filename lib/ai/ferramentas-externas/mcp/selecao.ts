/**
 * Da lista que o servidor oferece à seleção do administrador — as duas pontas, sem banco.
 *
 *  - `prepararSelecao`: a seleção que chegou da tela (ferramentas pelo nome no servidor, risco,
 *    «quando usar») + a lista que o servidor devolveu AGORA → os itens que o repositório grava.
 *    O corpo da requisição nunca traz esquema, descrição nem impressão: tudo vem do servidor, na
 *    hora, e o administrador só ESCOLHE. O padrão do risco é «altera dados»; a dica do servidor
 *    (`readOnlyHint`) é guardada, mas nunca decide.
 *  - `descreverFerramentasDescobertas`: a lista que a tela mostra para escolher — o que cada
 *    ferramenta é, se o agente consegue usá-la, o que já foi escolhido e se o servidor a mudou
 *    desde então.
 */
import { LIMITES_DA_FERRAMENTA, type EfeitoDaFerramenta, type ParametroDaFerramenta } from "../tipos";
import type { FerramentaSelecionada } from "./esquema-api";
import { impressaoDaDefinicao, parametrosDoEsquemaMcp, sanitizarTextoDoServidor } from "./esquema";
import {
  FRASE_DA_FERRAMENTA_NAO_SUPORTADA,
  type FerramentaDoServidor,
  type MotivoDeFerramentaNaoSuportada,
} from "./tipos";

export interface ItemPreparado {
  nomeNoServidor: string;
  nome: string;
  quandoUsar: string;
  parametros: ParametroDaFerramenta[];
  efeito: EfeitoDaFerramenta;
  /** `null` = o padrão do efeito. */
  pedirAprovacao: boolean | null;
  validadeHoras: number | null;
  impressao: string;
  dicaSomenteLeitura: boolean | null;
  /** Campos opcionais que o agente não sabe preencher e ficaram de fora. */
  ignorados: string[];
}

export type ErroDeSelecao = {
  ferramenta: string;
  motivo: "nao_existe_no_servidor" | MotivoDeFerramentaNaoSuportada;
};

export type ResultadoDaSelecao = { ok: true; itens: ItemPreparado[] } | { ok: false; erros: ErroDeSelecao[] };

function nomeDaFerramenta(f: FerramentaDoServidor): string {
  const base = sanitizarTextoDoServidor(f.titulo ?? f.nome, LIMITES_DA_FERRAMENTA.nome.max);
  return base.length >= LIMITES_DA_FERRAMENTA.nome.min
    ? base
    : `${base || f.nome} (MCP)`.slice(0, LIMITES_DA_FERRAMENTA.nome.max);
}

/** O «quando usar» que a tela sugere (e que vale se o administrador não escrever o dele). */
export function quandoUsarSugerido(f: FerramentaDoServidor, servidorNome: string): string {
  const descricao = sanitizarTextoDoServidor(f.descricao, LIMITES_DA_FERRAMENTA.quandoUsar.max);
  if (descricao.length >= LIMITES_DA_FERRAMENTA.quandoUsar.min) return descricao;
  return sanitizarTextoDoServidor(
    `Usa a ferramenta «${f.nome}» do servidor «${servidorNome}».`,
    LIMITES_DA_FERRAMENTA.quandoUsar.max,
  );
}

export function prepararSelecao(entrada: {
  servidorNome: string;
  oferecidas: readonly FerramentaDoServidor[];
  escolhidas: readonly FerramentaSelecionada[];
}): ResultadoDaSelecao {
  const porNome = new Map(entrada.oferecidas.map((f) => [f.nome, f]));
  const itens: ItemPreparado[] = [];
  const erros: ErroDeSelecao[] = [];
  for (const escolha of entrada.escolhidas) {
    const f = porNome.get(escolha.ferramenta);
    if (!f) {
      erros.push({ ferramenta: escolha.ferramenta, motivo: "nao_existe_no_servidor" });
      continue;
    }
    const conversao = parametrosDoEsquemaMcp(f.esquema);
    if (!conversao.ok) {
      erros.push({ ferramenta: f.nome, motivo: conversao.motivo });
      continue;
    }
    itens.push({
      nomeNoServidor: f.nome,
      nome: nomeDaFerramenta(f),
      quandoUsar: escolha.quando_usar ?? quandoUsarSugerido(f, entrada.servidorNome),
      parametros: conversao.parametros,
      // O padrão é «altera dados»: a anotação do servidor é só uma dica.
      efeito: escolha.efeito ?? "altera",
      pedirAprovacao: escolha.pedir_aprovacao ?? null,
      validadeHoras: escolha.validade_horas ?? null,
      impressao: impressaoDaDefinicao({ descricao: f.descricao, esquema: f.esquema }),
      dicaSomenteLeitura: f.somenteLeituraDeclarado,
      ignorados: conversao.ignorados,
    });
  }
  return erros.length > 0 ? { ok: false, erros } : { ok: true, itens };
}

/** A ferramenta que o administrador já escolheu (uma linha de `agent_external_tools`). */
export interface EscolhidaExistente {
  id: string;
  nomeNoServidor: string;
  efeito: EfeitoDaFerramenta;
  pedirAprovacao: boolean | null;
  validadeHoras: number;
  ativa: boolean;
  quandoUsar: string;
  impressao: string | null;
}

export interface FerramentaDescoberta {
  ferramenta: string;
  titulo: string | null;
  descricao: string;
  suportada: boolean;
  motivo_nao_suportada: MotivoDeFerramentaNaoSuportada | null;
  frase_nao_suportada: string | null;
  campos: ParametroDaFerramenta[];
  campos_ignorados: string[];
  dica_somente_leitura: boolean | null;
  escolhida: boolean;
  /** O id da linha em `agent_external_tools`, quando a ferramenta já foi escolhida alguma vez. */
  id_da_ferramenta: string | null;
  efeito: EfeitoDaFerramenta;
  pedir_aprovacao: boolean | null;
  validade_horas: number;
  quando_usar: string;
  /** O servidor mudou a descrição ou o esquema desde que o administrador escolheu. */
  mudou_no_servidor: boolean;
  /** Escolhida, mas o servidor já não a oferece. */
  sumiu_do_servidor: boolean;
}

export function descreverFerramentasDescobertas(entrada: {
  oferecidas: readonly FerramentaDoServidor[];
  escolhidas: readonly EscolhidaExistente[];
  servidorNome?: string;
}): FerramentaDescoberta[] {
  const existentes = new Map(entrada.escolhidas.map((e) => [e.nomeNoServidor, e]));
  const vistas = new Set<string>();
  const lista: FerramentaDescoberta[] = [];

  for (const f of entrada.oferecidas) {
    vistas.add(f.nome);
    const existente = existentes.get(f.nome);
    const conversao = parametrosDoEsquemaMcp(f.esquema);
    const impressao = impressaoDaDefinicao({ descricao: f.descricao, esquema: f.esquema });
    lista.push({
      ferramenta: f.nome,
      titulo: f.titulo,
      descricao: f.descricao,
      suportada: conversao.ok,
      motivo_nao_suportada: conversao.ok ? null : conversao.motivo,
      frase_nao_suportada: conversao.ok ? null : FRASE_DA_FERRAMENTA_NAO_SUPORTADA[conversao.motivo],
      campos: conversao.ok ? conversao.parametros : [],
      campos_ignorados: conversao.ok ? conversao.ignorados : [],
      dica_somente_leitura: f.somenteLeituraDeclarado,
      escolhida: existente?.ativa === true,
      id_da_ferramenta: existente?.id ?? null,
      efeito: existente?.efeito ?? "altera",
      pedir_aprovacao: existente?.pedirAprovacao ?? null,
      validade_horas: existente?.validadeHoras ?? 24,
      quando_usar: existente?.quandoUsar ?? quandoUsarSugerido(f, entrada.servidorNome ?? "o servidor"),
      mudou_no_servidor: existente?.impressao != null && existente.impressao !== impressao,
      sumiu_do_servidor: false,
    });
  }

  for (const e of entrada.escolhidas) {
    if (vistas.has(e.nomeNoServidor) || !e.ativa) continue;
    lista.push({
      ferramenta: e.nomeNoServidor,
      titulo: null,
      descricao: "",
      suportada: false,
      motivo_nao_suportada: null,
      frase_nao_suportada: null,
      campos: [],
      campos_ignorados: [],
      dica_somente_leitura: null,
      escolhida: true,
      id_da_ferramenta: e.id,
      efeito: e.efeito,
      pedir_aprovacao: e.pedirAprovacao,
      validade_horas: e.validadeHoras,
      quando_usar: e.quandoUsar,
      mudou_no_servidor: false,
      sumiu_do_servidor: true,
    });
  }
  return lista;
}
