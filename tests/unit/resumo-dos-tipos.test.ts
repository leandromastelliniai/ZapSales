import { describe, expect, it } from "vitest";

import {
  contarAtencaoDosTipos,
  recomendarLembrete,
  resumoDosTipos,
  situacaoDoTipo,
  type HorariosDoResponsavel,
  type TipoParaResumir,
} from "@/lib/agenda/resumo-dos-tipos";

const tipo = (id: string, extra: Partial<TipoParaResumir> = {}): TipoParaResumir => ({
  id,
  is_active: true,
  default_owner_user_id: "ana",
  reminder_enabled: false,
  ...extra,
});

const publicado: Record<string, HorariosDoResponsavel> = { ana: "publicado" };

describe("situacaoDoTipo", () => {
  it("desativado não pede nada, mesmo sem responsável", () => {
    expect(situacaoDoTipo(tipo("a", { is_active: false, default_owner_user_id: null }), {})).toBe("desativado");
  });

  it("sem responsável vem antes de qualquer leitura de horário", () => {
    expect(situacaoDoTipo(tipo("a", { default_owner_user_id: null }), publicado)).toBe("sem_responsavel");
  });

  it("pronto exige responsável com horários publicados", () => {
    expect(situacaoDoTipo(tipo("a"), publicado)).toBe("pronto");
    expect(situacaoDoTipo(tipo("a"), { ana: "nao_publicado" })).toBe("sem_horarios");
  });

  it("responsável que a leitura não alcançou NÃO é pronto nem sem horários", () => {
    expect(situacaoDoTipo(tipo("a"), { ana: "nao_lido" })).toBe("horarios_nao_lidos");
    expect(situacaoDoTipo(tipo("a"), {})).toBe("horarios_nao_lidos");
  });
});

describe("resumoDosTipos", () => {
  it("cada tipo cai numa categoria só: prontos + ajustes + não lidos = ativos", () => {
    const tipos = [
      tipo("1"),
      tipo("2", { default_owner_user_id: null }),
      tipo("3", { default_owner_user_id: "bia" }),
      tipo("4", { default_owner_user_id: "caio" }),
      tipo("5", { is_active: false }),
    ];
    const r = resumoDosTipos(tipos, { ana: "publicado", bia: "nao_publicado", caio: "nao_lido" });
    expect(r).toMatchObject({
      total: 5,
      ativos: 4,
      desativados: 1,
      prontos: 1,
      semResponsavel: 1,
      semHorarios: 1,
      naoLidos: 1,
    });
    expect(r.prontos + r.semResponsavel + r.semHorarios + r.naoLidos).toBe(r.ativos);
  });

  it("tudo certo: só a sugestão do lembrete fica como info, e nada pede atenção", () => {
    const r = resumoDosTipos([tipo("1"), tipo("2")], publicado);
    expect(contarAtencaoDosTipos(r.conferencias)).toBe(0);
    expect(r.conferencias.map((c) => [c.id, c.estado])).toEqual([
      ["ativos", "ok"],
      ["responsavel", "ok"],
      ["horarios", "ok"],
      ["lembrete", "info"],
    ]);
  });

  it("sem responsável e sem horários pedem atenção, com a quantidade", () => {
    const r = resumoDosTipos(
      [tipo("1", { default_owner_user_id: null }), tipo("2", { default_owner_user_id: "bia" }), tipo("3", { default_owner_user_id: "bia" })],
      { bia: "nao_publicado" },
    );
    expect(r.conferencias.find((c) => c.id === "responsavel")).toMatchObject({ estado: "atencao", quantidade: 1 });
    expect(r.conferencias.find((c) => c.id === "horarios")).toMatchObject({ estado: "atencao", quantidade: 2 });
    expect(contarAtencaoDosTipos(r.conferencias)).toBe(2);
  });

  it("falha de leitura não vira 'sem horários': ganha conferência própria", () => {
    const r = resumoDosTipos([tipo("1")], { ana: "nao_lido" });
    expect(r.semHorarios).toBe(0);
    expect(r.conferencias.find((c) => c.id === "horarios")?.estado).toBe("ok");
    expect(r.conferencias.find((c) => c.id === "leitura")).toMatchObject({ estado: "atencao", quantidade: 1 });
  });

  it("nenhum tipo ativo: só a conferência 'ativos' fala, e pede atenção", () => {
    for (const tipos of [[], [tipo("1", { is_active: false })]]) {
      const r = resumoDosTipos(tipos, {});
      expect(r.conferencias).toEqual([{ id: "ativos", estado: "atencao", motivo: "nenhum_ativo" }]);
    }
  });

  it("lembrete conta só tipo ativo", () => {
    const r = resumoDosTipos(
      [tipo("1", { reminder_enabled: true }), tipo("2"), tipo("3", { is_active: false, reminder_enabled: true })],
      publicado,
    );
    expect(r).toMatchObject({ comLembrete: 1, semLembrete: 1 });
  });
});

describe("recomendarLembrete", () => {
  it("só quando há tipo ativo sem o aviso", () => {
    expect(recomendarLembrete(resumoDosTipos([tipo("1")], publicado))).toBe(true);
    expect(recomendarLembrete(resumoDosTipos([tipo("1", { reminder_enabled: true })], publicado))).toBe(false);
    expect(recomendarLembrete(resumoDosTipos([], {}))).toBe(false);
    expect(recomendarLembrete(resumoDosTipos([tipo("1", { is_active: false })], {}))).toBe(false);
  });
});
