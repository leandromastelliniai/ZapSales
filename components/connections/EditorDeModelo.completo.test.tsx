/**
 * O editor de modelo completo — o que ele ganhou para ficar como o cadastro de
 * modelos do ManyChat: variáveis com NOME destacadas no texto, cabeçalho de
 * texto, botão de ligar, vários idiomas no mesmo cadastro e o aviso da categoria
 * Utilidade. O resto do editor (mídia, oferta, carrossel, flow) é medido em
 * `EditorDeModelo.test.tsx`.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const aviso = vi.hoisted(() => ({ warning: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock("@/hooks/channels/useTemplates", () => ({
  useSubmitTemplate: () => ({ mutateAsync, isPending: false }),
  useUploadTemplateMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({ toast: aviso }));

import { EditorDeModelo } from "./EditorDeModelo";

/** `{{` é sintaxe do user-event; o texto vai pelo `change` cru. */
function digitar(testId: string, valor: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: valor } });
}

function escolher(testId: string, valor: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: valor } });
}

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({ data: { status: "PENDING" } });
  aviso.warning.mockReset();
  aviso.success.mockReset();
});

describe("variáveis com nome", () => {
  it("nascem com NOME por padrão, e o nome que a pessoa digita vira a variável no cursor", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    expect(screen.getByTestId("modelo-formato")).toHaveValue("NAMED");

    digitar("modelo-corpo", "Olá , tudo bem?");
    const corpo = screen.getByTestId("modelo-corpo") as HTMLTextAreaElement;
    corpo.setSelectionRange(4, 4);
    digitar("nome-da-variavel", "Primeiro Nome");
    await userEvent.click(screen.getByTestId("btn-variavel"));

    // Sem acento, minúsculo e com _: o nome que a Meta aceita.
    expect(corpo).toHaveValue("Olá {{primeiro_nome}}, tudo bem?");
  });

  it("os atalhos inserem as variáveis mais usadas com um toque", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-corpo", "Olá , seu pedido de  chegou.");
    const corpo = screen.getByTestId("modelo-corpo") as HTMLTextAreaElement;
    corpo.setSelectionRange(4, 4);
    await userEvent.click(screen.getByTestId("variavel-sugerida-nome"));

    expect(corpo).toHaveValue("Olá {{nome}}, seu pedido de  chegou.");
  });

  it("no formato numerado o campo de nome some e a variável é a próxima da sequência", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    escolher("modelo-formato", "POSITIONAL");

    expect(screen.queryByTestId("nome-da-variavel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("variavel-sugerida-nome")).not.toBeInTheDocument();
  });

  it("cada variável do texto aparece destacada atrás do campo, e cada uma pede o exemplo", () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-corpo", "Olá {{nome}}, o pedido {{pedido}} saiu.");

    const marcas = within(screen.getByTestId("modelo-corpo-destaque")).getAllByText(/\{\{/);
    expect(marcas.map((m) => m.textContent)).toEqual(["{{nome}}", "{{pedido}}"]);
    expect(screen.getByTestId("modelo-exemplo-nome")).toBeInTheDocument();
    expect(screen.getByTestId("modelo-exemplo-pedido")).toBeInTheDocument();
  });

  it("variável no começo do texto é recusada no campo, como a Meta recusaria", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "aviso");
    digitar("modelo-corpo", "{{nome}} seu pedido saiu.");
    digitar("modelo-exemplo-nome", "Ana");
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText("A Meta não aceita variável no começo nem no fim do texto."),
    ).toBeInTheDocument();
  });
});

describe("cabeçalho de texto", () => {
  it("o título entra no preview com o exemplo e vai ao envio com a variável", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "pedido_saiu");
    await userEvent.click(screen.getByTestId("modelo-cabecalho-TEXT"));
    digitar("modelo-cabecalho-texto", "Pedido de");
    await userEvent.click(screen.getByTestId("btn-variavel-titulo"));
    expect(screen.getByTestId("modelo-cabecalho-texto")).toHaveValue("Pedido de {{variavel_titulo}}");
    digitar("modelo-cabecalho-exemplo-variavel_titulo", "Ana");
    digitar("modelo-corpo", "Seu pedido saiu para entrega hoje.");

    expect(screen.getByTestId("preview-titulo")).toHaveTextContent("Pedido de Ana");

    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        header: {
          format: "TEXT",
          text: "Pedido de {{variavel_titulo}}",
          examples: { variavel_titulo: "Ana" },
        },
      }),
    );
  });

  it("o título aceita uma variável só, e sem o exemplo a recusa aparece no campo", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "pedido_saiu");
    await userEvent.click(screen.getByTestId("modelo-cabecalho-TEXT"));
    digitar("modelo-cabecalho-texto", "{{a}} e {{b}} no título");
    digitar("modelo-corpo", "Seu pedido saiu para entrega hoje.");
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("O título aceita no máximo 1 variável.")).toBeInTheDocument();
  });

  it("clicar de novo no tipo escolhido tira o cabeçalho", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    await userEvent.click(screen.getByTestId("modelo-cabecalho-TEXT"));
    expect(screen.getByTestId("modelo-cabecalho-texto")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("modelo-cabecalho-TEXT"));
    expect(screen.queryByTestId("modelo-cabecalho-texto")).not.toBeInTheDocument();
  });

  it("na oferta por tempo limitado o título de texto não existe", () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    escolher("modelo-tipo", "LIMITED_TIME_OFFER");

    expect(screen.queryByTestId("modelo-cabecalho-TEXT")).not.toBeInTheDocument();
    expect(screen.getByTestId("modelo-cabecalho-IMAGE")).toBeInTheDocument();
  });
});

describe("botão de ligar", () => {
  it("o número vai ao envio e o preview mostra o botão", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "fale_conosco");
    digitar("modelo-corpo", "Qualquer dúvida, é só ligar para a gente.");
    await userEvent.click(screen.getByTestId("btn-add-ligar"));
    digitar("botao-texto", "Ligar agora");
    digitar("botao-telefone", "+5511999998888");

    expect(within(screen.getByTestId("preview-do-modelo")).getByTestId("preview-botao")).toHaveTextContent(
      "Ligar agora",
    );
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: [{ type: "PHONE_NUMBER", text: "Ligar agora", phone_number: "+5511999998888" }],
      }),
    );
  });

  it("número sem o código do país é recusado no campo", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "fale_conosco");
    digitar("modelo-corpo", "Qualquer dúvida, é só ligar para a gente.");
    await userEvent.click(screen.getByTestId("btn-add-ligar"));
    digitar("botao-texto", "Ligar agora");
    digitar("botao-telefone", "11999998888");
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText("Use o número com o código do país, ex.: +5511999998888."),
    ).toBeInTheDocument();
  });

  it("não há botão de ligar no card do carrossel nem na oferta", () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    escolher("modelo-tipo", "LIMITED_TIME_OFFER");
    expect(screen.queryByTestId("btn-add-ligar")).not.toBeInTheDocument();
    escolher("modelo-tipo", "CAROUSEL");
    expect(screen.queryByTestId("card-0-btn-add-ligar")).not.toBeInTheDocument();
  });
});

describe("categoria Utilidade", () => {
  it("avisa o que a Meta espera de uma mensagem de utilidade", () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    expect(screen.getByTestId("dica-da-categoria")).not.toHaveTextContent(/Utilidade é para/);

    escolher("modelo-categoria", "UTILITY");
    expect(screen.getByTestId("dica-da-categoria")).toHaveTextContent(/Utilidade é para mensagem ligada/);
    expect(screen.getByTestId("dica-da-categoria")).toHaveTextContent(/passa para Marketing/);
  });
});

describe("vários idiomas", () => {
  function modeloBasico() {
    digitar("modelo-nome", "aviso_de_entrega");
    digitar("modelo-corpo", "Seu pedido saiu para entrega hoje.");
  }

  it("“Novo idioma” parte de uma cópia da versão aberta, e o nome vale para todas", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    modeloBasico();
    escolher("novo-idioma", "en_US");

    expect(screen.getByTestId("idioma-en_US")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("modelo-nome")).toHaveValue("aviso_de_entrega");
    expect(screen.getByTestId("modelo-corpo")).toHaveValue("Seu pedido saiu para entrega hoje.");
    expect(screen.getByTestId("titulo-do-modelo")).toHaveTextContent("aviso_de_entrega • Inglês (EUA)");

    // O idioma já aberto não é oferecido de novo.
    const opcoes = within(screen.getByTestId("novo-idioma")).getAllByRole("option");
    expect(opcoes.map((o) => (o as HTMLOptionElement).value)).not.toContain("en_US");
    expect(opcoes.map((o) => (o as HTMLOptionElement).value)).not.toContain("pt_BR");
  });

  it("envia um modelo por idioma, com o mesmo nome e a mensagem de cada um", async () => {
    const fechar = vi.fn();
    render(<EditorDeModelo onFechar={fechar} />);
    modeloBasico();
    escolher("novo-idioma", "en_US");
    digitar("modelo-corpo", "Your order is out for delivery today.");
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: "aviso_de_entrega",
        language: "pt_BR",
        body: "Seu pedido saiu para entrega hoje.",
      }),
    );
    expect(mutateAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "aviso_de_entrega",
        language: "en_US",
        body: "Your order is out for delivery today.",
      }),
    );
    expect(aviso.success).toHaveBeenCalledWith(expect.stringContaining("2"));
    expect(fechar).toHaveBeenCalled();
  });

  it("mudar a categoria muda em todos os idiomas", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    modeloBasico();
    escolher("novo-idioma", "es");
    escolher("modelo-categoria", "UTILITY");
    await userEvent.click(screen.getByTestId("idioma-pt_BR"));
    expect(screen.getByTestId("modelo-categoria")).toHaveValue("UTILITY");
  });

  it("um idioma com problema não deixa enviar nenhum e é apontado na lista", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    modeloBasico();
    escolher("novo-idioma", "en_US");
    digitar("modelo-corpo", "Hello {{name}}, your order is out.");
    await userEvent.click(screen.getByTestId("idioma-pt_BR"));
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(mutateAsync).not.toHaveBeenCalled();
    // O editor abre o idioma que precisa de ajuste e marca o que falta.
    expect(screen.getByTestId("idioma-en_US")).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("idioma-en_US")).getByText("corrigir")).toBeInTheDocument();
    expect(
      screen.getByText("Preencha um exemplo: a Meta exige exemplo de cada variável."),
    ).toBeInTheDocument();
  });

  it("falha num idioma: o que foi enviado sai da tela e fica só o que falta", async () => {
    const fechar = vi.fn();
    mutateAsync
      .mockResolvedValueOnce({ data: { status: "PENDING" } })
      .mockRejectedValueOnce(new Error("recusado"));
    render(<EditorDeModelo onFechar={fechar} />);
    modeloBasico();
    escolher("novo-idioma", "en_US");
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(fechar).not.toHaveBeenCalled();
    expect(aviso.warning).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("idioma-pt_BR")).not.toBeInTheDocument();
    expect(screen.getByTestId("idioma-en_US")).toHaveAttribute("aria-pressed", "true");
  });

  it("tirar o idioma devolve a versão anterior, e o último não pode ser tirado", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    expect(screen.queryByTestId("tirar-idioma-pt_BR")).not.toBeInTheDocument();
    escolher("novo-idioma", "es");
    await userEvent.click(screen.getByTestId("tirar-idioma-es"));

    expect(screen.queryByTestId("idioma-es")).not.toBeInTheDocument();
    expect(screen.getByTestId("idioma-pt_BR")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("tirar-idioma-pt_BR")).not.toBeInTheDocument();
  });
});
