/**
 * O CONSTRUTOR DE FOLLOW-UP, GUIADO: a tela, como quem configura a usa.
 *
 * Três promessas, cada uma com o seu controle:
 *  1. o tempo deixa de ser um número solto: "1440" ganha "= 1 dia" e atalhos com o que os
 *     modelos prontos do produto usam, e o valor gravado continua sendo em minutos;
 *  2. a faixa "O que este fluxo faz" responde quando começa, o que envia, por quanto tempo
 *     acompanha e quando para, lendo o próprio fluxo;
 *  3. "Vai disparar?" avisa o que a tela antes só dizia num diálogo: fluxo que pede IA, com
 *     gatilho automático, e nenhum agente publicado usando-o.
 *
 * As contas puras têm prova própria em `lib/followup/*.test.ts`.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AjudaDeDuracao } from "@/app/app/ai/followups/[id]/_components/AjudaDeDuracao";
import { WaitForm } from "@/app/app/ai/followups/[id]/_components/forms/WaitForm";
import { ResumoDoFluxo } from "@/app/app/ai/followups/[id]/_components/ResumoDoFluxo";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import { modeloPorId } from "@/lib/followup/modelos";
import { esperasDeExemplo } from "@/lib/followup/modelos/esperas";

const consulta = modeloPorId("clinica-consulta-retomada")!;

function comIa(grafo: FlowGraph): FlowGraph {
  let feito = false;
  return {
    ...grafo,
    nodes: grafo.nodes.map((n) => {
      if (!feito && n.type === "action") {
        feito = true;
        return { ...n, config: { mode: "ai_message", prompt_hint: "Retome a conversa." } } as typeof n;
      }
      return n;
    }),
  };
}

describe("tempo em dias e horas", () => {
  it("mostra o equivalente só quando a unidade natural não é minuto", () => {
    const { rerender } = render(<AjudaDeDuracao minutos={1440} />);
    expect(screen.getByTestId("duracao-equivale")).toHaveTextContent("= 1 dia");
    rerender(<AjudaDeDuracao minutos={45} />);
    expect(screen.queryByTestId("duracao-equivale")).toBeNull();
    rerender(<AjudaDeDuracao minutos={180} />);
    expect(screen.getByTestId("duracao-equivale")).toHaveTextContent("= 3 horas");
  });

  it("os atalhos preenchem o campo e trazem a jornada do modelo de onde vêm", () => {
    const aoEscolher = vi.fn();
    const exemplos = esperasDeExemplo();
    render(<AjudaDeDuracao minutos={5} exemplos={exemplos} onEscolher={aoEscolher} />);
    const primeiro = exemplos[0]!;
    const botao = screen.getByTestId(`duracao-exemplo-${primeiro.minutos}`);
    expect(botao).toHaveTextContent(primeiro.jornada);
    fireEvent.click(botao);
    expect(aoEscolher).toHaveBeenCalledWith(primeiro.minutos);
  });

  it("na espera fixa o campo segue em minutos (mesmo rótulo), e escolher um atalho grava em ms", () => {
    const aoMudar = vi.fn();
    render(<WaitForm config={{ mode: "fixed", duration_ms: 86_400_000 }} onChange={aoMudar} />);
    const campo = screen.getByLabelText("Duração (minutos)") as HTMLInputElement;
    expect(campo.value).toBe("1440");
    expect(screen.getByTestId("duracao-equivale")).toHaveTextContent("= 1 dia");
    expect(screen.getByTestId("recomendado-espera")).toHaveTextContent(/bloqueio/i);

    const exemplo = esperasDeExemplo().find((e) => e.minutos !== 1440)!;
    fireEvent.click(screen.getByTestId(`duracao-exemplo-${exemplo.minutos}`));
    expect(campo.value).toBe(String(exemplo.minutos));
    expect(aoMudar).toHaveBeenLastCalledWith({ mode: "fixed", duration_ms: exemplo.minutos * 60_000 });

    fireEvent.change(campo, { target: { value: "10" } });
    expect(aoMudar).toHaveBeenLastCalledWith({ mode: "fixed", duration_ms: 600_000 });
  });

  it("na espera adaptativa mostra o equivalente do mínimo e do máximo", () => {
    render(<WaitForm config={{ mode: "smart", min_ms: 3_600_000, max_ms: 172_800_000 }} onChange={vi.fn()} />);
    const equivalentes = screen.getAllByTestId("duracao-equivale");
    expect(equivalentes.map((e) => e.textContent)).toEqual(["= 1 hora", "= 2 dias"]);
  });
});

describe("a faixa 'O que este fluxo faz'", () => {
  const props = {
    grafo: consulta.grafo,
    triggerConfig: consulta.gatilho({}) as unknown as Record<string, unknown>,
    handoff: "pause" as const,
    status: "active",
    agentesQueArmam: [],
  };

  it("responde as quatro perguntas, lendo o fluxo", () => {
    render(<ResumoDoFluxo {...props} />);
    expect(screen.getByTestId("resumo-quando")).toHaveTextContent("1 dia sem o cliente responder");
    expect(screen.getByTestId("resumo-envia")).toHaveTextContent("3 mensagens");
    expect(screen.getByTestId("resumo-acompanha")).toHaveTextContent(/\d+ (dias?|horas?|min)/);
    expect(screen.getByTestId("resumo-para")).toHaveTextContent("o cliente responde ou uma pessoa assume (o fluxo pausa)");
  });

  it("fluxo vazio diz 'nenhuma mensagem ainda' e leva o problema para as conferências", () => {
    render(<ResumoDoFluxo {...props} grafo={{ nodes: [], edges: [] }} />);
    expect(screen.getByTestId("resumo-envia")).toHaveTextContent("nenhuma mensagem ainda");
    expect(screen.getByTestId("vai-disparar-estado")).toHaveAttribute("data-estado", "atencao");
    expect(screen.getByTestId("conferencia-validacao")).toHaveAttribute("data-estado", "atencao");
  });
});

describe("'Vai disparar?'", () => {
  const base = {
    grafo: consulta.grafo,
    triggerConfig: consulta.gatilho({}) as unknown as Record<string, unknown>,
    handoff: "pause" as const,
    status: "active",
    agentesQueArmam: [] as Array<{ id: string; name: string }>,
  };

  it("modelo pronto de texto fixo: tudo certo e não exige agente", () => {
    render(<ResumoDoFluxo {...base} />);
    expect(screen.getByTestId("vai-disparar-estado")).toHaveAttribute("data-estado", "ok");
    expect(screen.getByTestId("conferencia-agente")).toHaveTextContent("Não precisa de agente");
  });

  it("fluxo que pede IA, com gatilho automático e nenhum agente usando: avisa e leva aos agentes", () => {
    render(<ResumoDoFluxo {...base} grafo={comIa(consulta.grafo)} />);
    expect(screen.getByTestId("vai-disparar-estado")).toHaveAttribute("data-estado", "atencao");
    const item = screen.getByTestId("conferencia-agente");
    expect(item).toHaveAttribute("data-estado", "atencao");
    expect(item).toHaveTextContent("Nenhum agente publicado usa este fluxo");
    expect(within(item).getByRole("link", { name: "Escolher o agente" })).toHaveAttribute("href", "/app/ai/agents");
    // O estado fica à vista no botão, e o detalhe abre só por clique: nunca empurra o canvas.
    expect(screen.getByTestId("vai-disparar")).not.toHaveAttribute("open");
  });

  it("o mesmo fluxo com um agente publicado usando: tudo certo, e o agente é citado", () => {
    render(<ResumoDoFluxo {...base} grafo={comIa(consulta.grafo)} agentesQueArmam={[{ id: "a1", name: "Sofia" }]} />);
    expect(screen.getByTestId("vai-disparar-estado")).toHaveAttribute("data-estado", "ok");
    expect(screen.getByTestId("conferencia-agente")).toHaveTextContent("Sofia");
  });

  it("gatilho manual não entra na conferência de agente (alarme falso)", () => {
    render(<ResumoDoFluxo {...base} grafo={comIa(consulta.grafo)} triggerConfig={{ kind: "manual" }} />);
    expect(screen.queryByTestId("conferencia-agente")).toBeNull();
  });

  it("rascunho é só informação: não conta como problema", () => {
    render(<ResumoDoFluxo {...base} status="draft" />);
    expect(screen.getByTestId("conferencia-publicado")).toHaveAttribute("data-estado", "info");
    expect(screen.getByTestId("vai-disparar-estado")).toHaveAttribute("data-estado", "ok");
  });
});
