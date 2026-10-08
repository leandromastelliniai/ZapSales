import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LinhaDoFunil } from "./LinhaDoFunil";
import { ChipDeComando, EtiquetaDeQuemAtende, MarcoDaPassagem, seloDoComando } from "./QuemAtende";
import { AvatarDoContato, iniciaisDe } from "./AvatarDoContato";
import { resumoDaJornada } from "@/hooks/inbox/useResumoDoContato";

/**
 * As peças da direção "Linha do Funil" (07/10/2026). O pedido do dono que elas
 * carregam: "é preciso saber quando um agente de IA está trabalhando ou quando
 * foi transferido para um humano, e qual é o atendente".
 */

const ETAPAS = [
  { id: "a", nome: "Conversa" },
  { id: "b", nome: "Qualificado" },
  { id: "c", nome: "Proposta enviada" },
  { id: "x", nome: "Perdido", perdida: true },
  { id: "d", nome: "Fechado" },
];

describe("LinhaDoFunil", () => {
  it("marca a estação atual e diz o nome dela para o leitor de tela", () => {
    render(<LinhaDoFunil etapas={ETAPAS} atualId="b" />);
    expect(screen.getByRole("list", { name: "Etapa do funil: Qualificado" })).toBeTruthy();
    const atual = screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step");
    expect(atual?.textContent).toContain("Qualificado");
  });

  it("etapa perdida não é estação do caminho — a menos que o lead esteja nela", () => {
    const { rerender } = render(<LinhaDoFunil etapas={ETAPAS} atualId="b" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    rerender(<LinhaDoFunil etapas={ETAPAS} atualId="x" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("sem etapas não desenha nada (guarda de vacuidade)", () => {
    const { container } = render(<LinhaDoFunil etapas={[]} atualId={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("quem atende", () => {
  it("cada estado tem o seu selo — e o selo diz em palavras quem é", () => {
    expect(seloDoComando({ quem: "automatico" })).toBe("ia");
    expect(seloDoComando({ quem: "humano", userId: "u", nome: "Ana" })).toBe("humano");
    expect(seloDoComando({ quem: "aguardando" })).toBe("fila");
    expect(seloDoComando({ quem: "encerrada" })).toBe("neutro");
    render(<AvatarDoContato nome="Mariana Costa" selo="ia" rotuloDoSelo="Automático atendendo" />);
    expect(screen.getByRole("img", { name: "Automático atendendo" })).toBeTruthy();
  });

  it("a etiqueta da lista nomeia a pessoa, ou diz que é a IA", () => {
    const { rerender } = render(
      <EtiquetaDeQuemAtende comando={{ quem: "humano", userId: "u", nome: "Ana Paula" }} />,
    );
    expect(screen.getByText("Ana Paula")).toBeTruthy();
    rerender(<EtiquetaDeQuemAtende comando={{ quem: "automatico" }} />);
    expect(screen.getByText("IA atendendo")).toBeTruthy();
  });

  it("o chip diz quem, desde quando e quem passou", () => {
    render(
      <ChipDeComando
        comando={{ quem: "humano", userId: "u", nome: "Ana Paula" }}
        desde="2026-10-07T14:27:00"
        transferidaPelaIa
      />,
    );
    const chip = screen.getByTestId("chip-de-comando");
    expect(chip.textContent).toContain("Em atendimento: Ana Paula");
    expect(chip.textContent).toContain("14:27");
    expect(chip.textContent).toContain("transferida pela IA");
  });

  it("sem passagem, o chip não inventa que a IA transferiu", () => {
    render(<ChipDeComando comando={{ quem: "humano", userId: "u", nome: "Bruno" }} />);
    expect(screen.getByTestId("chip-de-comando").textContent).not.toContain("IA");
  });

  it("o marco da passagem diz a hora e para quem foi", () => {
    render(<MarcoDaPassagem quando="2026-10-07T14:27:00" para="Ana Paula" />);
    const marco = screen.getByTestId("marco-da-passagem");
    expect(marco.textContent).toContain("14:27");
    expect(marco.textContent).toContain("IA transferiu para Ana Paula");
  });

  it("iniciais: duas letras, do primeiro e do último nome", () => {
    expect(iniciaisDe("Mariana Costa")).toBe("MC");
    expect(iniciaisDe("Ana Paula Souza")).toBe("AS");
    expect(iniciaisDe("Bruno")).toBe("BR");
    expect(iniciaisDe("   ")).toBe("?");
  });
});

describe("resumoDaJornada — o que a faixa mostra", () => {
  it("lê o lead mais recente: funil, etapa atual, valor e próximo passo", () => {
    const r = resumoDaJornada({
      leads: [
        {
          id: "l1",
          value_cents: 115000,
          currency: "BRL",
          stage_id: "b",
          funil_nome: "Comercial",
          etapas_do_funil: [
            { id: "a", name: "Conversa" },
            { id: "b", name: "Proposta" },
            { id: "x", name: "Perdido", is_lost: true },
          ],
        },
      ],
      demandas: [{ proximo_passo: "confirmar quinta 14h", estado: "aberta" }],
    });
    expect(r.funil?.nome).toBe("Comercial");
    expect(r.funil?.atualId).toBe("b");
    expect(r.funil?.etapas.find((e) => e.id === "x")?.perdida).toBe(true);
    expect(r.valor).toMatch(/1\.150,00/);
    expect(r.proximoPasso).toBe("confirmar quinta 14h");
  });

  it("contato sem lead: nada a afirmar, e nada inventado", () => {
    expect(resumoDaJornada({ leads: [], demandas: [] })).toEqual({
      funil: null,
      valor: null,
      proximoPasso: null,
    });
  });
});
