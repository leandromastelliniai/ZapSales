import { describe, expect, it } from "vitest";

import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import {
  avisosDeRitmo,
  contarAtencao,
  estimarDuracao,
  prontidaoDoDisparo,
  recomendarRitmo,
  diaDaSemanaNoFuso,
  ritmoDoNumero,
  type EntradaDaProntidao,
  type RitmoDigitado,
  type RitmoDoNumero,
} from "@/lib/campanhas/resumo-do-disparo";

const EM_BRANCO: RitmoDigitado = {
  intervaloSegundos: null,
  janelaInicioHora: null,
  janelaFimHora: null,
  tetoDiario: null,
  tetoHorario: null,
};

/** Um número formado: sem aquecimento, janela 7h–22h (15 h), 1,2 s de intervalo, domingo liberado. */
const FORMADO: RitmoDoNumero = {
  intervaloSegundos: 1.2,
  janelaInicioHora: 7,
  janelaFimHora: 22,
  domingoLiberado: true,
  limiteDiario: null,
  aquecimento: [],
  idadeDias: 400,
};

/** Um número novo, com os degraus de aquecimento do próprio produto. */
const NOVO: RitmoDoNumero = { ...FORMADO, aquecimento: PACING_DEFAULTS.warmupDailyCaps, idadeDias: 0 };

const SEGUNDA = 1;

describe("estimarDuracao", () => {
  it("lista vazia não tem duração", () => {
    expect(
      estimarDuracao({ destinatarios: 0, oficial: false, ritmo: EM_BRANCO, numero: FORMADO, diaDaSemanaHoje: SEGUNDA }),
    ).toEqual({ tipo: "sem_destinatarios" });
  });

  it("janela de 0 hora ou invertida não é promessa", () => {
    const r = estimarDuracao({
      destinatarios: 10,
      oficial: false,
      ritmo: { ...EM_BRANCO, janelaInicioHora: 20, janelaFimHora: 8 },
      numero: FORMADO,
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(r.tipo).toBe("janela_invalida");
  });

  it("QR em número formado e sem tetos: o intervalo do número é quem limita, e cabe em 1 dia", () => {
    const r = estimarDuracao({ destinatarios: 300, oficial: false, ritmo: EM_BRANCO, numero: FORMADO, diaDaSemanaHoje: SEGUNDA });
    // 15 h × 3600 s / 1,2 s = 45 000 por dia.
    expect(r).toMatchObject({ tipo: "dias", dias: 1, porDia: 45_000, limitadoPor: "intervalo", horasNaJanela: 15 });
  });

  it("o intervalo digitado na campanha só pode deixar MAIS devagar que o do número", () => {
    const devagar = estimarDuracao({
      destinatarios: 10_000,
      oficial: false,
      ritmo: { ...EM_BRANCO, intervaloSegundos: 30 },
      numero: FORMADO,
      diaDaSemanaHoje: SEGUNDA,
    });
    // 15 h × 3600 / 30 s = 1 800 por dia → 6 dias para 10 000.
    expect(devagar).toMatchObject({ tipo: "dias", porDia: 1_800, dias: 6, limitadoPor: "intervalo" });

    const rapido = estimarDuracao({
      destinatarios: 10_000,
      oficial: false,
      ritmo: { ...EM_BRANCO, intervaloSegundos: 0.1 },
      numero: FORMADO,
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(rapido).toMatchObject({ porDia: 45_000 });
  });

  it("o aquecimento SOBE com os dias: 20 hoje, 50 depois do 4º dia (a conta simula dia a dia)", () => {
    const r = estimarDuracao({ destinatarios: 100, oficial: false, ritmo: EM_BRANCO, numero: NOVO, diaDaSemanaHoje: SEGUNDA });
    // dias 0-3: 20 cada = 80; dia 4: 50 → fecha no 5º dia.
    expect(r).toMatchObject({ tipo: "dias", dias: 5, porDia: 20, limitadoPor: "aquecimento" });
  });

  it("o teto diário da campanha vence quando é o menor", () => {
    const r = estimarDuracao({
      destinatarios: 250,
      oficial: false,
      ritmo: { ...EM_BRANCO, tetoDiario: 100 },
      numero: FORMADO,
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(r).toMatchObject({ tipo: "dias", dias: 3, porDia: 100, limitadoPor: "teto_da_campanha" });
  });

  it("o teto por hora vira teto do dia pelas horas da janela", () => {
    const r = estimarDuracao({
      destinatarios: 100,
      oficial: false,
      ritmo: { ...EM_BRANCO, tetoHorario: 5, janelaInicioHora: 9, janelaFimHora: 17 },
      numero: FORMADO,
      diaDaSemanaHoje: SEGUNDA,
    });
    // 8 h × 5 = 40 por dia → 3 dias.
    expect(r).toMatchObject({ dias: 3, porDia: 40, limitadoPor: "teto_por_hora", horasNaJanela: 8 });
  });

  it("o limite diário do número vale mais que um teto maior digitado na campanha", () => {
    const r = estimarDuracao({
      destinatarios: 200,
      oficial: false,
      ritmo: { ...EM_BRANCO, tetoDiario: 500 },
      numero: { ...FORMADO, limiteDiario: 80 },
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(r).toMatchObject({ dias: 3, porDia: 80, limitadoPor: "limite_do_numero" });
  });

  it("domingo fechado pula um dia do calendário", () => {
    // Sexta (5): sexta, sábado, [domingo fechado], segunda → 3 dias de envio, 4 do calendário.
    const r = estimarDuracao({
      destinatarios: 300,
      oficial: false,
      ritmo: { ...EM_BRANCO, tetoDiario: 100 },
      numero: { ...FORMADO, domingoLiberado: false },
      diaDaSemanaHoje: 5,
    });
    expect(r).toMatchObject({ tipo: "dias", dias: 4 });
    const liberado = estimarDuracao({
      destinatarios: 300,
      oficial: false,
      ritmo: { ...EM_BRANCO, tetoDiario: 100 },
      numero: FORMADO,
      diaDaSemanaHoje: 5,
    });
    expect(liberado).toMatchObject({ tipo: "dias", dias: 3 });
  });

  it("API Oficial ignora aquecimento, intervalo e limite diário do número", () => {
    const r = estimarDuracao({
      destinatarios: 1_000,
      oficial: true,
      ritmo: { ...EM_BRANCO, intervaloSegundos: 60 },
      numero: { ...NOVO, limiteDiario: 10 },
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(r).toEqual({ tipo: "sem_teto_proprio", horasNaJanela: 15 });
  });

  it("API Oficial com teto diário da campanha conta por ele", () => {
    const r = estimarDuracao({
      destinatarios: 1_000,
      oficial: true,
      ritmo: { ...EM_BRANCO, tetoDiario: 400 },
      numero: NOVO,
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(r).toMatchObject({ dias: 3, porDia: 400, limitadoPor: "teto_da_campanha" });
  });

  it("não promete número quando passa de um ano", () => {
    const r = estimarDuracao({
      destinatarios: 1_000_000,
      oficial: false,
      ritmo: { ...EM_BRANCO, tetoDiario: 1 },
      numero: FORMADO,
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(r.tipo).toBe("muito_longo");
  });

  it("janela da campanha pela metade herda a do número (como o motor)", () => {
    const r = estimarDuracao({
      destinatarios: 10,
      oficial: false,
      ritmo: { ...EM_BRANCO, janelaInicioHora: 10 },
      numero: FORMADO,
      diaDaSemanaHoje: SEGUNDA,
    });
    expect(r).toMatchObject({ horasNaJanela: 15 });
  });
});

describe("recomendarRitmo", () => {
  it("API Oficial: o que protege é o teto de gasto, não o intervalo", () => {
    expect(recomendarRitmo({ oficial: true, temTetoDeGasto: false, numero: NOVO })).toEqual({
      tipo: "oficial",
      temTetoDeGasto: false,
    });
  });

  it("número novo: diz o teto de hoje e o próximo degrau, vindo dos passos do próprio motor", () => {
    expect(recomendarRitmo({ oficial: false, temTetoDeGasto: false, numero: { ...NOVO, idadeDias: 2 } })).toEqual({
      tipo: "aquecimento",
      hoje: 20,
      proximo: { cap: 50, emDias: 2 },
    });
  });

  it("número no último degrau com teto: não há próximo", () => {
    const r = recomendarRitmo({ oficial: false, temTetoDeGasto: false, numero: { ...NOVO, idadeDias: 20 } });
    expect(r).toEqual({ tipo: "aquecimento", hoje: 200, proximo: { cap: null, emDias: 11 } });
  });

  it("número formado (ou aquecimento pulado): sem recomendação de aquecimento", () => {
    expect(recomendarRitmo({ oficial: false, temTetoDeGasto: false, numero: FORMADO })).toEqual({ tipo: "formado" });
    expect(recomendarRitmo({ oficial: false, temTetoDeGasto: false, numero: { ...NOVO, idadeDias: 40 } })).toEqual({
      tipo: "formado",
    });
  });
});

describe("avisosDeRitmo", () => {
  it("janela invertida", () => {
    expect(
      avisosDeRitmo({ oficial: false, ritmo: { ...EM_BRANCO, janelaInicioHora: 20, janelaFimHora: 8 }, numero: FORMADO }),
    ).toEqual([{ id: "janela_invalida" }]);
  });

  it("janela com só uma metade preenchida não é erro: herda a do número", () => {
    expect(avisosDeRitmo({ oficial: false, ritmo: { ...EM_BRANCO, janelaInicioHora: 23 }, numero: FORMADO })).toEqual([]);
  });

  it("teto acima do limite do número não adianta, e intervalo abaixo do número também", () => {
    const avisos = avisosDeRitmo({
      oficial: false,
      ritmo: { ...EM_BRANCO, tetoDiario: 500, intervaloSegundos: 0.5 },
      numero: { ...FORMADO, limiteDiario: 100 },
    });
    expect(avisos).toEqual([
      { id: "teto_acima_do_numero", limite: 100 },
      { id: "intervalo_abaixo_do_numero", minimo: 1.2 },
    ]);
  });

  it("na API Oficial o limite e o intervalo do número não se aplicam", () => {
    expect(
      avisosDeRitmo({
        oficial: true,
        ritmo: { ...EM_BRANCO, tetoDiario: 500, intervaloSegundos: 0.5 },
        numero: { ...FORMADO, limiteDiario: 100 },
      }),
    ).toEqual([]);
  });
});

describe("prontidaoDoDisparo", () => {
  const PRONTA: EntradaDaProntidao = {
    temNumero: true,
    temCriterio: true,
    elegiveis: 312,
    oficial: false,
    mensagemCompleta: true,
    temModelo: false,
    baseLegalSemReferencia: false,
    respostaPedeAgenteSemAgente: false,
    avisos: [],
    custoEstimadoCents: null,
    tetoDeGastoCents: null,
  };

  it("QR pronto: tudo ok, e o aceite do risco aparece como informação (não como problema)", () => {
    const c = prontidaoDoDisparo(PRONTA);
    expect(contarAtencao(c)).toBe(0);
    expect(c.find((x) => x.id === "publico")).toMatchObject({ estado: "ok", quantidade: 312 });
    expect(c.find((x) => x.id === "risco")).toMatchObject({ estado: "info" });
  });

  it("formulário vazio: diz POR QUE o salvar está cinza", () => {
    const c = prontidaoDoDisparo({
      ...PRONTA,
      temNumero: false,
      temCriterio: false,
      elegiveis: null,
      mensagemCompleta: false,
    });
    expect(c.filter((x) => x.estado === "atencao").map((x) => `${x.id}:${x.motivo}`)).toEqual([
      "numero:falta_escolher",
      "publico:sem_criterio",
      "mensagem:texto_vazio",
    ]);
  });

  it("critério sem contagem ainda é informação, não alarme", () => {
    const c = prontidaoDoDisparo({ ...PRONTA, elegiveis: null });
    expect(c.find((x) => x.id === "publico")).toMatchObject({ estado: "info", motivo: "contando" });
  });

  it("ninguém recebe pede atenção", () => {
    const c = prontidaoDoDisparo({ ...PRONTA, elegiveis: 0 });
    expect(c.find((x) => x.id === "publico")).toMatchObject({ estado: "atencao", motivo: "ninguem_recebe" });
  });

  it("oficial: distingue 'falta o modelo' de 'faltam variáveis'", () => {
    const base = { ...PRONTA, oficial: true, mensagemCompleta: false };
    expect(prontidaoDoDisparo({ ...base, temModelo: false }).find((x) => x.id === "mensagem")?.motivo).toBe("falta_modelo");
    expect(prontidaoDoDisparo({ ...base, temModelo: true }).find((x) => x.id === "mensagem")?.motivo).toBe("faltam_variaveis");
  });

  it("oficial: estimativa acima do teto de gasto avisa que a campanha vai pausar", () => {
    const c = prontidaoDoDisparo({ ...PRONTA, oficial: true, custoEstimadoCents: 20_000, tetoDeGastoCents: 15_000 });
    expect(c.find((x) => x.id === "custo")).toMatchObject({ estado: "atencao", motivo: "estimativa_passa_do_teto" });
    expect(c.some((x) => x.id === "risco")).toBe(false);
  });

  it("oficial sem teto de gasto é informação; dentro do teto é ok", () => {
    expect(prontidaoDoDisparo({ ...PRONTA, oficial: true }).find((x) => x.id === "custo")?.estado).toBe("info");
    expect(
      prontidaoDoDisparo({ ...PRONTA, oficial: true, custoEstimadoCents: 100, tetoDeGastoCents: 500 }).find((x) => x.id === "custo")
        ?.estado,
    ).toBe("ok");
  });

  it("base legal sem LIA, resposta sem agente e janela inválida entram como atenção", () => {
    const c = prontidaoDoDisparo({
      ...PRONTA,
      baseLegalSemReferencia: true,
      respostaPedeAgenteSemAgente: true,
      avisos: [{ id: "janela_invalida" }],
    });
    expect(contarAtencao(c)).toBe(3);
  });
});

describe("ritmoDoNumero e diaDaSemanaNoFuso", () => {
  const item = {
    channel_session: { daily_message_limit: 150 },
    effective: {
      throttleMs: 1200,
      windowStartHour: 7,
      windowEndHour: 22,
      allowSunday: false,
      timezone: "America/Sao_Paulo",
      warmupDailyCaps: PACING_DEFAULTS.warmupDailyCaps,
    },
    warmup: { age_days: 5, skipped: false },
  };

  it("lê o intervalo em segundos e leva o limite do número", () => {
    expect(ritmoDoNumero(item)).toMatchObject({
      intervaloSegundos: 1.2,
      domingoLiberado: false,
      limiteDiario: 150,
      idadeDias: 5,
    });
    expect(ritmoDoNumero(item).aquecimento).toHaveLength(5);
  });

  it("aquecimento pulado não entra na conta (o motor também não o aplica)", () => {
    expect(ritmoDoNumero({ ...item, warmup: { age_days: 5, skipped: true } }).aquecimento).toEqual([]);
  });

  it("o dia da semana é o do fuso do número, não o do navegador", () => {
    // 2026-10-26 02:00 UTC ainda é domingo (23h) em São Paulo.
    const instante = new Date("2026-10-26T02:00:00Z");
    expect(diaDaSemanaNoFuso(instante, "America/Sao_Paulo")).toBe(0);
    expect(diaDaSemanaNoFuso(instante, "UTC")).toBe(1);
  });

  it("fuso inválido não lança", () => {
    expect(() => diaDaSemanaNoFuso(new Date(), "Marte/Olimpo")).not.toThrow();
  });
});
