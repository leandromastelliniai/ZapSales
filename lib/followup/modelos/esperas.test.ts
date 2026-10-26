import { describe, expect, it } from "vitest";

import { MODELOS_DE_FOLLOWUP } from "./index";
import { esperasDeExemplo, silenciosDeExemplo } from "./esperas";

describe("esperasDeExemplo", () => {
  it("devolve até 4 tempos, em ordem crescente, cada um com a jornada de onde veio", () => {
    const lista = esperasDeExemplo();
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.length).toBeLessThanOrEqual(4);
    expect(lista.map((e) => e.minutos)).toEqual([...lista.map((e) => e.minutos)].sort((a, b) => a - b));
    const jornadas = new Set(MODELOS_DE_FOLLOWUP.map((m) => m.jornada));
    for (const e of lista) expect(jornadas.has(e.jornada)).toBe(true);
  });

  it("só usa tempos que existem de verdade num modelo (nada inventado)", () => {
    const usados = new Set<number>();
    for (const m of MODELOS_DE_FOLLOWUP) {
      for (const no of m.grafo.nodes) {
        if (no.type === "wait" && no.config.mode === "fixed") usados.add(Math.round(no.config.duration_ms / 60_000));
      }
    }
    for (const e of esperasDeExemplo()) expect(usados.has(e.minutos)).toBe(true);
  });

  it("inclui o menor e o maior tempo dos modelos (a espera curta e a de decisão grande)", () => {
    const todos = MODELOS_DE_FOLLOWUP.flatMap((m) =>
      m.grafo.nodes.flatMap((n) =>
        n.type === "wait" && n.config.mode === "fixed" ? [Math.round(n.config.duration_ms / 60_000)] : [],
      ),
    );
    const lista = esperasDeExemplo().map((e) => e.minutos);
    expect(lista[0]).toBe(Math.min(...todos));
    expect(lista.at(-1)).toBe(Math.max(...todos));
  });
});

describe("silenciosDeExemplo", () => {
  it("lê o silêncio de gatilho dos modelos", () => {
    const lista = silenciosDeExemplo();
    expect(lista.length).toBeGreaterThan(0);
    for (const e of lista) expect(e.minutos).toBeGreaterThan(0);
  });
});
