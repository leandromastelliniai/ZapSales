/**
 * A faixa "Seu funil" na tela — o que ela mostra, o que ela conta e quando pede atenção.
 *
 * Duas camadas: o componente de apresentação (props → o que se vê) e o conector, que lê a MESMA
 * consulta do mapeamento e some enquanto ela carrega.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/pipelines/useAgentMapping", () => ({ useAgentMapping: vi.fn() }));

import { ResumoDoFunilFaixa } from "@/components/funil/ResumoDoFunil";
import { useAgentMapping } from "@/hooks/pipelines/useAgentMapping";
import { resumoDoFunil, type EtapaDoResumo, type MapaDoResumo } from "@/lib/funil/resumo-do-funil";
import { ResumoDoFunil } from "@/app/app/settings/tenant/pipelines/_resumo";

const etapa = (id: string, name: string, tipo: "aberta" | "ganho" | "perda" = "aberta"): EtapaDoResumo => ({
  id,
  name,
  is_won: tipo === "ganho",
  is_lost: tipo === "perda",
});

const PEDIDOS = [
  etapa("e1", "Carrinho abandonado"),
  etapa("e2", "Aguardando pagamento"),
  etapa("e3", "Pago", "ganho"),
  etapa("e4", "Cancelado", "perda"),
];

const VAZIO: MapaDoResumo = {
  new: null,
  contacted: null,
  qualifying: null,
  qualified: null,
  negotiating: null,
  won: null,
  lost: null,
};

const VOCAB = { lead: "Cliente", deal: "Pedido", won: "Pago", lost: "Cancelado" };

function faixa(etapas = PEDIDOS, mapa = VAZIO, vocabulario: typeof VOCAB | null = VOCAB) {
  return render(
    <ResumoDoFunilFaixa pipelineId="p1" resumo={resumoDoFunil(etapas, mapa)} vocabulario={vocabulario} />,
  );
}

describe("ResumoDoFunilFaixa", () => {
  it("responde as quatro perguntas de quem abre a tela", () => {
    faixa(PEDIDOS, { ...VAZIO, won: "e3", qualifying: "e1" });
    expect(screen.getByTestId("resumo-funil-etapas")).toHaveTextContent("4 etapas");
    expect(screen.getByTestId("resumo-funil-etapas")).toHaveTextContent("2 abertas · 1 de fechamento · 1 de perda");
    expect(screen.getByTestId("resumo-funil-fechamento")).toHaveTextContent("Pago");
    expect(screen.getByTestId("resumo-funil-perda")).toHaveTextContent("Cancelado");
    expect(screen.getByTestId("resumo-funil-agente")).toHaveTextContent("2 de 7 passos");
  });

  it("diz como o dono chama as coisas, sem mostrar os nomes em inglês do banco", () => {
    faixa();
    const linha = screen.getByTestId("resumo-funil-vocabulario");
    expect(linha).toHaveTextContent("Contato Cliente · Negócio Pedido · Fecha Pago · Perde Cancelado");
    expect(linha.textContent).not.toMatch(/\b(Lead|Deal|Won|Lost)\b/);
  });

  it("sem vocabulário gravado, a linha não aparece", () => {
    faixa(PEDIDOS, VAZIO, null);
    expect(screen.queryByTestId("resumo-funil-vocabulario")).not.toBeInTheDocument();
  });

  it("funil completo: «Tudo certo» — e o agente parado não é pendência", () => {
    faixa();
    expect(screen.getByTestId("funil-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
    expect(screen.getByTestId("resumo-funil-agente")).toHaveTextContent("0 de 7 passos");
    expect(screen.getByTestId("resumo-funil-agente")).toHaveTextContent("Hoje o card fica onde entrou");
  });

  it("sem fechamento nem perda: «2 pedem atenção», e as conferências explicam", () => {
    faixa([etapa("e1", "Novo"), etapa("e2", "Atendendo")]);
    expect(screen.getByTestId("funil-esta-certo-estado")).toHaveAttribute("data-estado", "atencao");
    expect(screen.getByTestId("funil-esta-certo-estado")).toHaveTextContent("2 pedem atenção");
    expect(screen.getByTestId("resumo-funil-fechamento")).toHaveTextContent("Nenhuma");

    fireEvent.click(screen.getByTestId("funil-esta-certo-botao"));
    expect(screen.getByTestId("conferencia-funil-fechamento")).toHaveTextContent(
      "Nenhuma etapa marca o fechamento",
    );
    expect(screen.getByTestId("conferencia-funil-perda")).toHaveAttribute("data-estado", "atencao");
    expect(screen.getByTestId("conferencia-funil-agente")).toHaveAttribute("data-estado", "info");
  });

  it("as conferências abrem e fecham, e o botão diz o estado", () => {
    faixa();
    const botao = screen.getByTestId("funil-esta-certo-botao");
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("conferencia-funil-etapas")).not.toBeInTheDocument();
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("conferencia-funil-fechamento")).toHaveTextContent("O cliente fecha em «Pago».");
  });
});

describe("ResumoDoFunil (conectado)", () => {
  it("lê a consulta do mapeamento e desenha a faixa", () => {
    vi.mocked(useAgentMapping).mockReturnValue({
      data: { etapas: PEDIDOS, mapeamento: VAZIO },
    } as unknown as ReturnType<typeof useAgentMapping>);
    render(<ResumoDoFunil pipelineId="p1" vocabulario={VOCAB} />);
    expect(screen.getByTestId("resumo-do-funil")).toBeInTheDocument();
    expect(screen.getByTestId("resumo-funil-fechamento")).toHaveTextContent("Pago");
  });

  it("some enquanto carrega ou falha — quem avisa do erro é a seção de baixo", () => {
    vi.mocked(useAgentMapping).mockReturnValue({ data: undefined } as unknown as ReturnType<
      typeof useAgentMapping
    >);
    const { container } = render(<ResumoDoFunil pipelineId="p1" vocabulario={VOCAB} />);
    expect(container).toBeEmptyDOMElement();
  });
});
