/**
 * A mensagem da campanha OFICIAL pela tela (issue #8): escolher o modelo
 * aprovado e dizer de onde vem cada variável, vendo o texto como vai chegar.
 *
 * O componente é controlado; o teste o monta com o estado de verdade
 * (`useState`) para medir o que o operador vê depois de cada clique.
 */
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ModeloParaCampanha } from "@/lib/campanhas/modelos-da-campanha";
import type { MapaDeVariaveis } from "@/lib/campanhas/variaveis-do-modelo";

import { MensagemOficial, mapaCompleto, mapaDoModelo } from "./MensagemOficial";

const OFERTA: ModeloParaCampanha = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "oferta_de_outubro",
  language: "pt_BR",
  category: "MARKETING",
  texto: "Oi {{1}}, sua oferta de {{2}} chegou.",
  variaveis: [
    {
      chave: "1",
      rotulo: "{{1}}",
      onde: "corpo",
      antes: "Oi",
      depois: ", sua oferta de",
      tipo: "text",
    },
    {
      chave: "2",
      rotulo: "{{2}}",
      onde: "corpo",
      antes: "sua oferta de",
      depois: "chegou.",
      tipo: "text",
    },
  ],
  botao_wa_me: null,
};

const AVISO: ModeloParaCampanha = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "aviso_geral",
  language: "pt_BR",
  category: "UTILITY",
  texto: "Nosso horário mudou.",
  variaveis: [],
  botao_wa_me: null,
};

function Tela({ modelos = [OFERTA, AVISO] }: { modelos?: ModeloParaCampanha[] }) {
  const [modeloId, setModeloId] = useState("");
  const [mapa, setMapa] = useState<MapaDeVariaveis>({});
  const modelo = modelos.find((m) => m.id === modeloId);
  return (
    <>
      <MensagemOficial
        modelos={modelos}
        carregando={false}
        modeloId={modeloId}
        onModelo={setModeloId}
        mapa={mapa}
        onMapa={setMapa}
      />
      <output data-testid="completo">{String(mapaCompleto(modelo, mapa))}</output>
      <output data-testid="mapa">{JSON.stringify(mapa)}</output>
    </>
  );
}

describe("MensagemOficial — modelo aprovado e a fonte de cada variável", () => {
  it("escolher o modelo mostra o texto aprovado e um campo por variável", async () => {
    render(<Tela />);
    await userEvent.selectOptions(screen.getByLabelText("Modelo aprovado"), OFERTA.id);

    expect(screen.getByTestId("previa-do-modelo").textContent).toBe(
      "Oi {{1}}, sua oferta de {{2}} chegou.",
    );
    expect(screen.getByLabelText(/\{\{1\}\} — corpo/)).toBeTruthy();
    expect(screen.getByLabelText(/\{\{2\}\} — corpo/)).toBeTruthy();
    expect(screen.getByTestId("completo").textContent).toBe("false");
  });

  it("cada fonte escolhida aparece no texto como vai chegar, e com todas preenchidas o mapa fica completo", async () => {
    render(<Tela />);
    await userEvent.selectOptions(screen.getByLabelText("Modelo aprovado"), OFERTA.id);
    await userEvent.selectOptions(
      screen.getByLabelText(/\{\{1\}\} — corpo/),
      "contato:primeiro_nome",
    );
    await userEvent.selectOptions(screen.getByLabelText(/\{\{2\}\} — corpo/), "fixo");
    await userEvent.type(screen.getByLabelText("Texto fixo"), "outubro");

    expect(screen.getByTestId("previa-do-modelo").textContent).toBe(
      "Oi [primeiro nome], sua oferta de outubro chegou.",
    );
    expect(JSON.parse(screen.getByTestId("mapa").textContent!)).toEqual({
      "1": { tipo: "contato", campo: "primeiro_nome" },
      "2": { tipo: "fixo", valor: "outubro" },
    });
    expect(screen.getByTestId("completo").textContent).toBe("true");
  });

  it("campo personalizado pede o nome do campo, e sem ele o mapa não fica completo", async () => {
    render(<Tela />);
    await userEvent.selectOptions(screen.getByLabelText("Modelo aprovado"), OFERTA.id);
    await userEvent.selectOptions(screen.getByLabelText(/\{\{1\}\} — corpo/), "contato:nome");
    await userEvent.selectOptions(
      screen.getByLabelText(/\{\{2\}\} — corpo/),
      "campo_personalizado",
    );
    expect(screen.getByTestId("completo").textContent).toBe("false");

    await userEvent.type(screen.getByLabelText("Nome do campo personalizado"), "plano");
    expect(screen.getByTestId("completo").textContent).toBe("true");
    expect(screen.getByTestId("previa-do-modelo").textContent).toBe(
      "Oi [nome completo], sua oferta de [plano] chegou.",
    );
  });

  it("modelo sem variável já está pronto e diz que todos recebem o mesmo texto", async () => {
    render(<Tela />);
    await userEvent.selectOptions(screen.getByLabelText("Modelo aprovado"), AVISO.id);
    expect(
      screen.getByText("Este modelo não tem variáveis: todos recebem o mesmo texto."),
    ).toBeTruthy();
    expect(screen.getByTestId("completo").textContent).toBe("true");
  });

  it("sem modelo aprovado na conta, a tela diz onde criar", () => {
    render(<Tela modelos={[]} />);
    expect(screen.getByText(/Nenhum modelo aprovado na conta deste número/)).toBeTruthy();
  });
});

describe("mapaDoModelo — trocar de modelo não arrasta fonte velha", () => {
  it("guarda só as chaves do modelo escolhido", () => {
    expect(mapaDoModelo(AVISO, { "1": { tipo: "contato", campo: "nome" } })).toEqual({});
    expect(
      mapaDoModelo(OFERTA, {
        "1": { tipo: "contato", campo: "nome" },
        x: { tipo: "fixo", valor: "a" },
      }),
    ).toEqual({
      "1": { tipo: "contato", campo: "nome" },
    });
  });
});

describe("modo dois números (issue #9)", () => {
  it("a variável do botão wa.me é do sistema, sem seletor de fonte", () => {
    const comBotao: ModeloParaCampanha = {
      ...AVISO,
      variaveis: [
        { chave: "button0:1", rotulo: "{{1}}", onde: "botão 1 (url)", antes: "", depois: "", tipo: "url_suffix" },
      ],
      botao_wa_me: { slot: "button0:1", numero_fixo: null },
    };
    expect(mapaCompleto(comBotao, {})).toBe(false);
    expect(mapaCompleto(comBotao, {}, "button0:1")).toBe(true);
    render(
      <MensagemOficial
        modelos={[comBotao]}
        carregando={false}
        modeloId={comBotao.id}
        onModelo={() => {}}
        mapa={{}}
        onMapa={() => {}}
        slotAutomatico="button0:1"
      />,
    );
    expect(screen.getByText(/Preenchido com o número que recebe a conversa/)).toBeTruthy();
    expect(screen.queryByLabelText(/botão 1/)).toBeNull();
  });
});
