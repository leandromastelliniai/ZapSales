import { describe, expect, it } from "vitest";

import {
  botaoClicado,
  botoesDaRespostaSchema,
  planejarResposta,
  type BotaoDaResposta,
} from "./destino-da-resposta";

const ETAPA_DA_CAMPANHA = "11111111-1111-4111-8111-111111111111";
const ETAPA_DO_BOTAO = "22222222-2222-4222-8222-222222222222";

const BOTOES: BotaoDaResposta[] = [
  { botao: "Quero saber mais", acao: "atribuir_ia" },
  { botao: "Falar com atendente", acao: "atribuir_humano" },
  { botao: "Já comprei", acao: "mover_etapa", stage_id: ETAPA_DO_BOTAO },
  { botao: "Não tenho interesse", acao: "marcar_perdido" },
  { botao: "Parar", acao: "opt_out" },
];

describe("botaoClicado — qual linha do mapa o toque aciona", () => {
  it("casa pelo rótulo que a pessoa tocou", () => {
    expect(botaoClicado(BOTOES, { texto: "Falar com atendente", payload: null })?.acao).toBe(
      "atribuir_humano",
    );
  });

  it("ignora caixa e espaços nas pontas — o rótulo da Meta e o digitado na tela não precisam bater byte a byte", () => {
    expect(botaoClicado(BOTOES, { texto: "  parar ", payload: null })?.acao).toBe("opt_out");
  });

  it("casa pelo payload quando o rótulo não bate", () => {
    expect(botaoClicado(BOTOES, { texto: "outro rótulo", payload: "Já comprei" })?.acao).toBe(
      "mover_etapa",
    );
  });

  it("botão fora do mapa não aciona nada", () => {
    expect(botaoClicado(BOTOES, { texto: "Talvez", payload: "talvez" })).toBeNull();
  });

  it("sem clique não há botão", () => {
    expect(botaoClicado(BOTOES, null)).toBeNull();
  });
});

describe("botoesDaRespostaSchema — o mapa que a tela grava", () => {
  it("aceita o mapa completo", () => {
    expect(botoesDaRespostaSchema.safeParse(BOTOES).success).toBe(true);
  });

  it("mover para etapa sem etapa é recusado", () => {
    expect(botoesDaRespostaSchema.safeParse([{ botao: "X", acao: "mover_etapa" }]).success).toBe(
      false,
    );
  });

  it("o mesmo rótulo duas vezes é recusado — o toque não saberia qual ação seguir", () => {
    const r = botoesDaRespostaSchema.safeParse([
      { botao: "Sim", acao: "atribuir_ia" },
      { botao: " sim", acao: "opt_out" },
    ]);
    expect(r.success).toBe(false);
  });

  it("ação fora do vocabulário é recusada", () => {
    expect(botoesDaRespostaSchema.safeParse([{ botao: "X", acao: "apagar_tudo" }]).success).toBe(
      false,
    );
  });
});

describe("planejarResposta — o que a resposta faz", () => {
  const base = { etapaDaCampanha: ETAPA_DA_CAMPANHA, primeiraResposta: true, botao: null };

  describe("resposta digitada", () => {
    it("com 'IA': o card vai para a etapa da campanha e o agente é acordado", () => {
      expect(planejarResposta({ ...base, quemAssume: "ia" })).toEqual({
        optOut: false,
        marcarPerdido: false,
        moverPara: ETAPA_DA_CAMPANHA,
        paraHumano: false,
        despacharAgente: true,
      });
    });

    it("com 'humano': vai para a fila e o agente NÃO é acordado", () => {
      expect(planejarResposta({ ...base, quemAssume: "humano" })).toMatchObject({
        paraHumano: true,
        despacharAgente: false,
        moverPara: ETAPA_DA_CAMPANHA,
      });
    });

    it("com 'IA e depois humano': o agente atende primeiro — a passagem é da regra de handoff", () => {
      expect(planejarResposta({ ...base, quemAssume: "ia_e_humano" })).toMatchObject({
        paraHumano: false,
        despacharAgente: true,
      });
    });

    it("campanha sem etapa declarada não move card", () => {
      expect(
        planejarResposta({ ...base, quemAssume: "ia", etapaDaCampanha: null }).moverPara,
      ).toBeNull();
    });

    it("a segunda mensagem não repete a decisão — quem a equipe já devolveu ao robô continua com o robô", () => {
      expect(planejarResposta({ ...base, quemAssume: "humano", primeiraResposta: false })).toEqual({
        optOut: false,
        marcarPerdido: false,
        moverPara: null,
        paraHumano: false,
        despacharAgente: true,
      });
    });
  });

  describe("toque em botão mapeado", () => {
    const comBotao = (acao: string, extra: Partial<BotaoDaResposta> = {}) =>
      planejarResposta({
        ...base,
        quemAssume: "ia",
        botao: { botao: "x", acao, ...extra } as BotaoDaResposta,
      });

    it("opt-out: grava a saída e ninguém fala mais com a pessoa", () => {
      expect(comBotao("opt_out")).toEqual({
        optOut: true,
        marcarPerdido: false,
        moverPara: null,
        paraHumano: false,
        despacharAgente: false,
      });
    });

    it("marcar perdido: fecha o negócio sem acordar o agente", () => {
      expect(comBotao("marcar_perdido")).toMatchObject({
        marcarPerdido: true,
        despacharAgente: false,
        optOut: false,
      });
    });

    it("atribuir a humano: fila, sem agente — mesmo numa campanha de 'IA'", () => {
      expect(comBotao("atribuir_humano")).toMatchObject({
        paraHumano: true,
        despacharAgente: false,
      });
    });

    it("atribuir à IA: o agente atende — mesmo numa campanha de 'humano'", () => {
      expect(
        planejarResposta({
          ...base,
          quemAssume: "humano",
          botao: { botao: "x", acao: "atribuir_ia" },
        }),
      ).toMatchObject({ paraHumano: false, despacharAgente: true });
    });

    it("mover para etapa: o card vai para a etapa DO BOTÃO, e quem atende segue a campanha", () => {
      expect(comBotao("mover_etapa", { stage_id: ETAPA_DO_BOTAO })).toMatchObject({
        moverPara: ETAPA_DO_BOTAO,
        despacharAgente: true,
        paraHumano: false,
      });
      expect(
        planejarResposta({
          ...base,
          quemAssume: "humano",
          botao: { botao: "x", acao: "mover_etapa", stage_id: ETAPA_DO_BOTAO },
        }),
      ).toMatchObject({ moverPara: ETAPA_DO_BOTAO, paraHumano: true, despacharAgente: false });
    });

    it("o botão vale mesmo depois da primeira resposta — o toque é inequívoco", () => {
      expect(
        planejarResposta({
          ...base,
          quemAssume: "ia",
          primeiraResposta: false,
          botao: { botao: "x", acao: "atribuir_humano" },
        }),
      ).toMatchObject({ paraHumano: true, despacharAgente: false });
    });
  });
});
