import { describe, expect, it } from "vitest";

import type { FlowGraph } from "./graph-schema";
import { MODELOS_DE_FOLLOWUP, modeloPorId } from "./modelos";
import { horizonteDoModeloMs, toquesDoModelo } from "./modelos/tipos";
import { prontidaoDoFluxo, resumoDoFluxo, temCiclo } from "./resumo-do-fluxo";

const consulta = modeloPorId("clinica-consulta-retomada")!;
const ETAPA = "44444444-4444-4444-8444-444444444444";

/** O mesmo grafo, com a primeira mensagem passando a pedir a IA. */
function comMensagemPorIa(grafo: FlowGraph): FlowGraph {
  let trocou = false;
  return {
    ...grafo,
    nodes: grafo.nodes.map((n) => {
      if (!trocou && n.type === "action") {
        trocou = true;
        return { ...n, config: { mode: "ai_message", prompt_hint: "Retome a conversa." } } as typeof n;
      }
      return n;
    }),
  };
}

describe("resumoDoFluxo", () => {
  it("usa as mesmas contas da galeria: mensagens e horizonte", () => {
    const r = resumoDoFluxo(consulta.grafo, consulta.gatilho({}), consulta.handoffPolicy);
    expect(r.mensagens).toBe(toquesDoModelo(consulta.grafo));
    expect(r.horizonteMs).toBe(horizonteDoModeloMs(consulta.grafo));
    expect(r.gatilho).toEqual({ kind: "silence", minutos: 24 * 60 });
    expect(r.para).toEqual({ clienteResponde: true, handoff: "pause" });
  });

  it("todo modelo pronto tem horizonte calculável (sem ciclo)", () => {
    for (const m of MODELOS_DE_FOLLOWUP) {
      expect(resumoDoFluxo(m.grafo, m.gatilho({ stageId: ETAPA }), m.handoffPolicy).horizonteMs).not.toBeNull();
    }
  });

  it("grafo com ciclo não promete um tempo: o horizonte é nulo", () => {
    const ciclico: FlowGraph = {
      nodes: [
        { id: "a", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
        { id: "b", type: "wait", label: "Espera", position: { x: 0, y: 0 }, config: { mode: "fixed", duration_ms: 3_600_000 } },
      ],
      edges: [
        { id: "e1", source: "a", target: "b", condition: { type: "always" } },
        { id: "e2", source: "b", target: "b", condition: { type: "always" } },
      ],
    } as FlowGraph;
    expect(temCiclo(ciclico)).toBe(true);
    expect(resumoDoFluxo(ciclico, {}, "pause").horizonteMs).toBeNull();
    expect(temCiclo(consulta.grafo)).toBe(false);
  });

  it("gatilho ausente é manual; sem cancelar na resposta, o cliente respondendo não para o fluxo", () => {
    const r = resumoDoFluxo(consulta.grafo, {}, "allow");
    expect(r.gatilho.kind).toBe("manual");
    expect(r.para).toEqual({ clienteResponde: false, handoff: "allow" });
  });

  it("falta confirmada sempre cancela na resposta", () => {
    expect(resumoDoFluxo(consulta.grafo, { kind: "appointment_no_show" }, "pause").para.clienteResponde).toBe(true);
  });
});

describe("prontidaoDoFluxo", () => {
  const base = { grafo: consulta.grafo, gatilho: { kind: "silence" }, status: "active", agentesQueArmam: 0 };
  const achar = (itens: ReturnType<typeof prontidaoDoFluxo>, id: string) => itens.find((i) => i.id === id);

  it("modelo pronto, de texto fixo: passa na validação e NÃO exige agente", () => {
    const itens = prontidaoDoFluxo(base);
    expect(achar(itens, "validacao")?.estado).toBe("ok");
    expect(achar(itens, "agente")).toMatchObject({ estado: "ok", motivo: "nao_precisa" });
    expect(achar(itens, "publicado")?.estado).toBe("ok");
  });

  it("fluxo que pede IA com gatilho automático e nenhum agente armando: atenção", () => {
    const itens = prontidaoDoFluxo({ ...base, grafo: comMensagemPorIa(consulta.grafo) });
    expect(achar(itens, "agente")).toMatchObject({ estado: "atencao", motivo: "sem_agente" });
  });

  it("o mesmo fluxo, com um agente publicado armando: ok", () => {
    const itens = prontidaoDoFluxo({ ...base, grafo: comMensagemPorIa(consulta.grafo), agentesQueArmam: 1 });
    expect(achar(itens, "agente")).toMatchObject({ estado: "ok", motivo: "agente_arma" });
  });

  it("gatilho manual ou webhook não entra na conferência de agente (alarme falso)", () => {
    for (const kind of ["manual", "webhook"]) {
      const itens = prontidaoDoFluxo({ ...base, gatilho: { kind }, grafo: comMensagemPorIa(consulta.grafo) });
      expect(achar(itens, "agente")).toBeUndefined();
    }
  });

  it("grafo vazio reprova a validação e leva as mensagens do publicar", () => {
    const itens = prontidaoDoFluxo({ ...base, grafo: { nodes: [], edges: [] } });
    const v = achar(itens, "validacao")!;
    expect(v.estado).toBe("atencao");
    expect(v.quantidade).toBeGreaterThan(0);
    expect(v.detalhes.length).toBe(v.quantidade);
  });

  it("rascunho ou desativado é só informação, não erro", () => {
    expect(achar(prontidaoDoFluxo({ ...base, status: "draft" }), "publicado")).toMatchObject({ estado: "info", status: "draft" });
    expect(achar(prontidaoDoFluxo({ ...base, status: "disabled" }), "publicado")?.estado).toBe("info");
  });
});
