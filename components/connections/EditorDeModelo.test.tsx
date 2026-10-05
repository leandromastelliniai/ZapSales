/**
 * O editor básico de modelo (issue #6): o preview mostra o corpo com os
 * exemplos, o rodapé e os botões; o envio leva à rota o modelo do jeito que o
 * schema do servidor aceita; e o que a Meta recusaria aparece no campo, sem
 * envio.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();

vi.mock("@/hooks/channels/useTemplates", () => ({
  useSubmitTemplate: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditorDeModelo } from "./EditorDeModelo";

/** `{{` é sintaxe do user-event; o texto vai pelo `change` cru. */
function digitar(testId: string, valor: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: valor } });
}

describe("EditorDeModelo", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ data: { status: "PENDING" } });
  });

  it("o preview mostra o corpo com as variáveis de exemplo, o rodapé e os botões", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-corpo", "Olá {{1}}, seu cupom chegou.");
    digitar("modelo-exemplo-1", "Ana");
    digitar("modelo-rodape", "Loja de Teste");
    await userEvent.click(screen.getByTestId("btn-add-resposta"));
    digitar("botao-texto", "Quero");
    await userEvent.click(screen.getByTestId("btn-add-codigo"));

    const preview = screen.getByTestId("preview-do-modelo");
    expect(within(preview).getByTestId("preview-corpo")).toHaveTextContent(
      "Olá Ana, seu cupom chegou.",
    );
    expect(within(preview).getByTestId("preview-rodape")).toHaveTextContent("Loja de Teste");
    expect(
      within(preview)
        .getAllByTestId("preview-botao")
        .map((b) => b.textContent),
    ).toEqual(["Quero", "Copiar código"]);
  });

  it("envia o modelo no formato do schema da rota", async () => {
    const fechar = vi.fn();
    render(<EditorDeModelo onFechar={fechar} />);
    digitar("modelo-nome", "Oferta de Outubro");
    fireEvent.change(screen.getByTestId("modelo-categoria"), { target: { value: "UTILITY" } });
    fireEvent.change(screen.getByTestId("modelo-formato"), { target: { value: "NAMED" } });
    digitar("modelo-corpo", "Olá {{nome}}, seu pedido saiu.");
    digitar("modelo-exemplo-nome", "Ana");
    await userEvent.click(screen.getByTestId("btn-add-link"));
    digitar("botao-texto", "Ver pedido");
    digitar("botao-url", "https://loja.exemplo/p/{{1}}");
    digitar("botao-url-exemplo", "ZAP-1");

    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(mutateAsync).toHaveBeenCalledWith({
      // O campo do nome já escreve no formato da Meta.
      name: "oferta_de_outubro",
      language: "pt_BR",
      category: "UTILITY",
      parameter_format: "NAMED",
      body: "Olá {{nome}}, seu pedido saiu.",
      examples: { nome: "Ana" },
      footer: null,
      buttons: [
        { type: "URL", text: "Ver pedido", url: "https://loja.exemplo/p/{{1}}", example: "ZAP-1" },
      ],
    });
    expect(fechar).toHaveBeenCalled();
  });

  it("o que a Meta recusaria aparece no campo e nada é enviado", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "oferta");
    digitar("modelo-corpo", "Olá {{1}}, seu cupom chegou.");
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("modelo-tem-problemas")).toBeInTheDocument();
    expect(
      screen.getByText("Preencha um exemplo: a Meta exige exemplo de cada variável."),
    ).toBeInTheDocument();
  });

  it("“Adicionar variável” acrescenta a próxima da sequência", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-corpo", "Olá {{1}}, código");
    await userEvent.click(screen.getByTestId("btn-variavel"));
    expect(screen.getByTestId("modelo-corpo")).toHaveValue("Olá {{1}}, código {{2}}");
  });

  it("“Adicionar variável” entra onde está o cursor, não colada no fim", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-corpo", "Olá , tudo bem?");
    const corpo = screen.getByTestId("modelo-corpo") as HTMLTextAreaElement;
    corpo.setSelectionRange(4, 4);
    await userEvent.click(screen.getByTestId("btn-variavel"));
    expect(corpo).toHaveValue("Olá {{1}}, tudo bem?");
  });

  it("o preview aplica a formatação do WhatsApp (*negrito*, _itálico_, ~riscado~)", () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-corpo", "Oferta *imperdível* e _só hoje_, ~antes~ agora.");
    const corpo = screen.getByTestId("preview-corpo");
    expect(corpo.querySelector("strong")).toHaveTextContent("imperdível");
    expect(corpo.querySelector("em")).toHaveTextContent("só hoje");
    expect(corpo.querySelector("s")).toHaveTextContent("antes");
    expect(corpo).toHaveTextContent("Oferta imperdível e só hoje, antes agora.");
  });

  it("com mais de 3 botões o preview mostra 2 e “Ver todas as opções”, como o WhatsApp", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    for (let i = 0; i < 4; i += 1) await userEvent.click(screen.getByTestId("btn-add-resposta"));
    screen.getAllByTestId("botao-texto").forEach((campo, i) => {
      fireEvent.change(campo, { target: { value: `Opção ${i + 1}` } });
    });
    expect(screen.getAllByTestId("preview-botao").map((b) => b.textContent)).toEqual([
      "Opção 1",
      "Opção 2",
      "Ver todas as opções",
    ]);
  });
});
