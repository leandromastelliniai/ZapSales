import { describe, expect, it } from "vitest";

import { agentConfigPatchSchema, agentConfigSchema } from "@/lib/ai/guardrails-schema";

import { ICONES_DO_AGENTE, ROTULO_DO_ICONE, iconeDoAgente, iconeEscolhido, sugerirIcone } from "./icone-do-agente";

describe("sugerirIcone", () => {
  it("o nome do agente sugere o ícone do ramo", () => {
    expect(sugerirIcone("Atendente de agendamento")).toBe("agenda");
    expect(sugerirIcone("Vendas - Pedidos")).toBe("vendas");
    expect(sugerirIcone("Recepção da Clínica Sorriso")).toBe("saude");
    expect(sugerirIcone("Corretor de imóveis")).toBe("imoveis");
    expect(sugerirIcone("Atendente da Loja")).toBe("loja");
    expect(sugerirIcone("Soporte técnico")).toBe("suporte");
  });

  it("pedaço de palavra não engana: atendente não é dentista, solicitação não é cita", () => {
    expect(sugerirIcone("Atendente")).toBe("atendente");
    expect(sugerirIcone("Responde solicitações")).toBe("assistente");
    expect(sugerirIcone("Atendimento automático")).toBe("atendente");
    expect(sugerirIcone("Dentista Dra. Ana")).toBe("saude");
  });

  it("a descrição também conta quando o nome não diz nada", () => {
    expect(sugerirIcone("Marina", "Qualifica quem quer comprar e move o negócio")).toBe("vendas");
  });

  it("sem pista nenhuma, o ícone é o do assistente — nunca vazio", () => {
    expect(sugerirIcone("Zeca")).toBe("assistente");
    expect(sugerirIcone("")).toBe("assistente");
  });
});

describe("iconeDoAgente", () => {
  it("o ícone escolhido vence a sugestão", () => {
    expect(iconeDoAgente({ name: "Vendas", config: { icone: "pet" } })).toBe("pet");
  });

  it("id desconhecido (de outra versão, ou digitado à mão) cai na sugestão, sem erro", () => {
    expect(iconeEscolhido({ icone: "foguete" })).toBeNull();
    expect(iconeDoAgente({ name: "Vendas", config: { icone: "foguete" } })).toBe("vendas");
    expect(iconeDoAgente({ name: "Vendas", config: null })).toBe("vendas");
  });

  it("todo ícone tem nome para a tela", () => {
    for (const id of ICONES_DO_AGENTE) expect(ROTULO_DO_ICONE[id]).toBeTruthy();
  });
});

describe("o ícone passa pelo config do agente", () => {
  it("o PATCH aceita o ícone e grava só ele", () => {
    expect(agentConfigPatchSchema.parse({ icone: "agenda" })).toEqual({ icone: "agenda" });
  });

  it("ícone inventado é recusado na entrada", () => {
    expect(agentConfigPatchSchema.safeParse({ icone: "foguete" }).success).toBe(false);
  });

  it("o config lido do banco preserva o ícone (sem ele, salvar outro ajuste o apagaria)", () => {
    expect(agentConfigSchema.parse({ icone: "pet" }).icone).toBe("pet");
  });
});
