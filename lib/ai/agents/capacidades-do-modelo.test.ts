import { describe, expect, it } from "vitest";

import { IDIOMAS } from "@/lib/i18n/idiomas";
import { ligarPacote, TETO_TOOLS_POR_AGENTE } from "@/lib/mcp/tools/selecao-por-pacote";

import { capacidadesPadraoDoOnboarding, catalogoComHandler } from "./capacidades-padrao";
import {
  capacidadesDoModelo,
  capacidadesPorModelo,
  fraseDoQueFaz,
  modeloMexeNoFunil,
  PACOTE_DO_MODELO,
} from "./capacidades-do-modelo";
import { IDS_DE_MODELO } from "./modelos";

const MEXEM_NO_FUNIL = ["crm_create_lead", "crm_update_lead", "crm_move_lead_stage"];

describe("capacidades de cada modelo de agente", () => {
  it("Vendas e Agendamento ligam o pacote vender, o mesmo que o onboarding", () => {
    expect(capacidadesDoModelo("vendas")).toEqual(capacidadesPadraoDoOnboarding());
    expect(capacidadesDoModelo("agendamento")).toEqual(capacidadesPadraoDoOnboarding());
  });

  it("Suporte e Atendimento ligam o pacote atender", () => {
    const atender = ligarPacote([], catalogoComHandler(), "atender");
    expect(capacidadesDoModelo("suporte")).toEqual(atender);
    expect(capacidadesDoModelo("atendimento")).toEqual(atender);
  });

  it("Suporte e Atendimento não mexem no funil; Vendas e Agendamento mexem", () => {
    for (const id of ["suporte", "atendimento"] as const) {
      const ids = capacidadesDoModelo(id);
      for (const proibida of MEXEM_NO_FUNIL)
        expect(ids, `${id} tem ${proibida}`).not.toContain(proibida);
      expect(modeloMexeNoFunil(id)).toBe(false);
    }
    for (const id of ["vendas", "agendamento"] as const) {
      expect(modeloMexeNoFunil(id)).toBe(true);
    }
  });

  it("nenhum conjunto liga capacidade de risco crítico e todos cabem no teto", () => {
    const criticas = new Set(
      catalogoComHandler()
        .filter((c) => c.risco === "critico")
        .map((c) => c.name),
    );
    for (const id of IDS_DE_MODELO) {
      const ids = capacidadesDoModelo(id);
      expect(
        ids.filter((n) => criticas.has(n)),
        id,
      ).toEqual([]);
      expect(ids.length, id).toBeLessThanOrEqual(TETO_TOOLS_POR_AGENTE);
      expect(PACOTE_DO_MODELO[id]).toMatch(/^(vender|atender)$/);
    }
  });

  it("capacidadesPorModelo entrega o mesmo que as funções por modelo, pronto para as telas", () => {
    const todas = capacidadesPorModelo();
    for (const id of IDS_DE_MODELO) {
      expect(todas[id].tool_ids).toEqual(capacidadesDoModelo(id));
      expect(todas[id].usa_funil).toBe(modeloMexeNoFunil(id));
    }
  });

  it("a frase do que o agente faz existe nos três idiomas e nunca diz 'capacidade'", () => {
    for (const id of IDS_DE_MODELO) {
      for (const idioma of IDIOMAS) {
        const frase = fraseDoQueFaz(id, idioma);
        expect(frase.trim().length, `${id}/${idioma}`).toBeGreaterThan(10);
        expect(frase.toLowerCase()).not.toMatch(/capacidad|capabilit/);
      }
    }
  });
});
