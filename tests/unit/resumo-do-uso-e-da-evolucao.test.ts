import { describe, expect, it } from "vitest";

import {
  contarAtencaoDoUso,
  protecaoEfetiva,
  recomendarLimite,
  resumoDoUso,
  type EntradaDoUso,
} from "@/lib/ai/budget/resumo-do-uso";
import { contarAtencaoDaEvolucao, resumoDaEvolucao } from "@/lib/ai/evolution/resumo-da-evolucao";

const uso = (extra: Partial<EntradaDoUso> = {}): EntradaDoUso => ({
  monthly_limit_cents: 5000,
  current_month_consumed_cents: 500,
  pct: 10,
  alarm_threshold_pct: 80,
  enforcement_mode: "avisar",
  enforcement_env: "on",
  blocked_now: false,
  gasto_incompleto: false,
  ...extra,
});

const conf = (e: EntradaDoUso, id: string) => resumoDoUso(e).conferencias.find((c) => c.id === id);

describe("resumoDoUso", () => {
  it("dentro do limite, sem parada e medição completa: nada pede atenção", () => {
    const r = resumoDoUso(uso());
    expect(contarAtencaoDoUso(r.conferencias)).toBe(0);
    expect(conf(uso(), "limite")).toMatchObject({ estado: "ok", motivo: "dentro_do_limite", valor: 10 });
  });

  it("IA parada por gasto pede atenção", () => {
    expect(conf(uso({ blocked_now: true }), "parada")).toMatchObject({ estado: "atencao", motivo: "ia_parada" });
  });

  it("passou do ponto de aviso ou do limite: atenção, com a porcentagem", () => {
    expect(conf(uso({ pct: 85 }), "limite")).toMatchObject({ estado: "atencao", motivo: "perto_do_limite", valor: 85 });
    expect(conf(uso({ pct: 120 }), "limite")).toMatchObject({ estado: "atencao", motivo: "passou_do_limite", valor: 120 });
  });

  it("o ponto de aviso é o da EMPRESA, não um número da faixa", () => {
    expect(conf(uso({ pct: 60, alarm_threshold_pct: 50 }), "limite")?.estado).toBe("atencao");
    expect(conf(uso({ pct: 60, alarm_threshold_pct: 90 }), "limite")?.estado).toBe("ok");
  });

  it("sem limite é info (escolha), nunca atenção", () => {
    const e = uso({ monthly_limit_cents: 0, pct: 0 });
    expect(conf(e, "limite")).toMatchObject({ estado: "info", motivo: "sem_limite" });
    expect(resumoDoUso(e).protecao).toBe("sem_limite");
  });

  it("medição incompleta pede atenção: o gasto mostrado é menor que o real", () => {
    expect(conf(uso({ gasto_incompleto: true }), "medicao")).toMatchObject({ estado: "atencao", motivo: "medicao_incompleta" });
    expect(resumoDoUso(uso({ gasto_incompleto: true })).medicaoCompleta).toBe(false);
  });

  it("a chave da instalação vale por cima do que a empresa escolheu", () => {
    expect(protecaoEfetiva(uso({ enforcement_mode: "bloquear", enforcement_env: "on" }))).toBe("para");
    expect(protecaoEfetiva(uso({ enforcement_mode: "bloquear", enforcement_env: "avisar" }))).toBe("so_avisa_na_instalacao");
    expect(protecaoEfetiva(uso({ enforcement_mode: "bloquear", enforcement_env: "off" }))).toBe("desligada_na_instalacao");
    expect(protecaoEfetiva(uso({ enforcement_mode: "off" }))).toBe("so_acompanha");
    expect(conf(uso({ enforcement_env: "off" }), "protecao")).toMatchObject({ estado: "info" });
    expect(conf(uso(), "protecao")).toBeUndefined();
  });

  it("só recomenda limite sem limite E a quem pode editar", () => {
    const semLimite = resumoDoUso(uso({ monthly_limit_cents: 0, pct: 0 }));
    expect(recomendarLimite(semLimite, true)).toBe(true);
    expect(recomendarLimite(semLimite, false)).toBe(false);
    expect(recomendarLimite(resumoDoUso(uso()), true)).toBe(false);
  });
});

describe("resumoDaEvolucao", () => {
  const base = { aprendeu: 3, usos: 10, fechados: 2, perdidos: 1, travas: 0 };

  it("sem lacunas é ok, com texto factual — não é elogio", () => {
    const r = resumoDaEvolucao(base);
    expect(r.conferencias.find((c) => c.id === "travando")).toMatchObject({ estado: "ok", motivo: "sem_lacunas" });
    expect(contarAtencaoDaEvolucao(r.conferencias)).toBe(0);
  });

  it("lacunas pedem atenção, com a quantidade", () => {
    const r = resumoDaEvolucao({ ...base, travas: 2 });
    expect(r.conferencias.find((c) => c.id === "travando")).toMatchObject({ estado: "atencao", quantidade: 2 });
    expect(contarAtencaoDaEvolucao(r.conferencias)).toBe(1);
  });

  it("não aprender nem usar nada é info, nunca atenção", () => {
    const r = resumoDaEvolucao({ aprendeu: 0, usos: 0, fechados: 0, perdidos: 0, travas: 0 });
    expect(r.conferencias.find((c) => c.id === "aprendizado")).toMatchObject({ estado: "info", motivo: "nada_aprendeu" });
    expect(r.conferencias.find((c) => c.id === "atividade")).toMatchObject({ estado: "info", motivo: "nada_usou" });
    expect(contarAtencaoDaEvolucao(r.conferencias)).toBe(0);
  });

  it("devolve a entrada intacta ao lado das conferências", () => {
    expect(resumoDaEvolucao(base)).toMatchObject(base);
  });
});
