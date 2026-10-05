/**
 * O editor de modelo (issues #6 e #7): o preview mostra o corpo com os
 * exemplos, o rodapé e os botões — e, no #7, a mídia do cabeçalho, a oferta por
 * tempo limitado, o botão de flow e os cards do carrossel; o envio leva à rota o
 * modelo do jeito que o schema do servidor aceita; e o que a Meta recusaria
 * aparece no campo, sem envio.
 *
 * A rota de upload é dublê aqui (`useUploadTemplateMedia`): o que ela faz pelo
 * fio — Meta e storage — é medido em `tests/unit/meta-midia-de-modelo.test.ts`
 * e em `tests/invariants/modelos-do-canal-oficial.test.ts`.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const subir = vi.fn();

vi.mock("@/hooks/channels/useTemplates", () => ({
  useSubmitTemplate: () => ({ mutateAsync, isPending: false }),
  useUploadTemplateMedia: () => ({ mutateAsync: subir, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EditorDeModelo } from "./EditorDeModelo";

/** `{{` é sintaxe do user-event; o texto vai pelo `change` cru. */
function digitar(testId: string, valor: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value: valor } });
}

const ORG = "0d0e0007-0000-4000-8000-00000000000a";
const EXTENSAO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};
let enviados = 0;

/** O que a rota de upload devolve para o n-ésimo arquivo. */
function midiaEnviada(arquivo: File, format: string) {
  enviados += 1;
  return {
    handle: `4::HANDLE_${enviados}`,
    path: `${ORG}/templates/0d0e0007-0000-4000-8000-00000000000${enviados}.${EXTENSAO[arquivo.type]}`,
    mime_type: arquivo.type,
    file_name: arquivo.name,
    size_bytes: arquivo.size,
    format,
    preview_url: `https://storage.exemplo/assinado/${enviados}`,
  };
}

async function escolherArquivo(testId: string, nome: string, tipo: string) {
  const arquivo = new File([new Uint8Array([1, 2, 3])], nome, { type: tipo });
  await userEvent.upload(screen.getByTestId(`${testId}-arquivo`), arquivo);
  await screen.findByTestId(`${testId}-nome`);
}

describe("EditorDeModelo", () => {
  beforeEach(() => {
    enviados = 0;
    mutateAsync.mockReset().mockResolvedValue({ data: { status: "PENDING" } });
    subir
      .mockReset()
      .mockImplementation(async ({ file, format }: { file: File; format: string }) =>
        midiaEnviada(file, format),
      );
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
      kind: "STANDARD",
      // O campo do nome já escreve no formato da Meta.
      name: "oferta_de_outubro",
      language: "pt_BR",
      category: "UTILITY",
      parameter_format: "NAMED",
      body: "Olá {{nome}}, seu pedido saiu.",
      examples: { nome: "Ana" },
      header: null,
      offer: null,
      footer: null,
      buttons: [
        { type: "URL", text: "Ver pedido", url: "https://loja.exemplo/p/{{1}}", example: "ZAP-1" },
      ],
      cards: [],
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

  // ─── issue #7 ────────────────────────────────────────────────────────────

  it("cabeçalho de imagem: o arquivo sobe ao escolher, o preview mostra a imagem e o envio leva o handle", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "vitrine");
    digitar("modelo-corpo", "Chegou a coleção nova.");
    await userEvent.click(screen.getByTestId("modelo-cabecalho-IMAGE"));
    await escolherArquivo("modelo-cabecalho-midia", "vitrine.png", "image/png");

    expect(subir).toHaveBeenCalledWith({ file: expect.any(File), format: "IMAGE" });
    const imagem = within(screen.getByTestId("preview-do-modelo")).getByTestId("preview-midia");
    expect(imagem.tagName).toBe("IMG");
    expect(imagem).toHaveAttribute("src", "https://storage.exemplo/assinado/1");

    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "STANDARD",
        header: {
          format: "IMAGE",
          media: {
            handle: "4::HANDLE_1",
            path: `${ORG}/templates/0d0e0007-0000-4000-8000-000000000001.png`,
            mime_type: "image/png",
            file_name: "vitrine.png",
          },
        },
      }),
    );
  });

  it("cabeçalho de documento aparece no preview com o nome do arquivo", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    await userEvent.click(screen.getByTestId("modelo-cabecalho-DOCUMENT"));
    expect(screen.getByTestId("modelo-cabecalho-midia-arquivo")).toHaveAttribute(
      "accept",
      "application/pdf",
    );
    await escolherArquivo("modelo-cabecalho-midia", "catalogo.pdf", "application/pdf");
    const doc = within(screen.getByTestId("preview-do-modelo")).getByTestId("preview-midia");
    expect(doc).toHaveAttribute("data-formato", "DOCUMENT");
    expect(doc).toHaveTextContent("catalogo.pdf");
  });

  it("cabeçalho escolhido sem arquivo: a recusa aparece no campo e nada é enviado", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "vitrine");
    digitar("modelo-corpo", "Chegou a coleção nova.");
    await userEvent.click(screen.getByTestId("modelo-cabecalho-VIDEO"));
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Escolha o arquivo do cabeçalho.")).toBeInTheDocument();
  });

  it("botão de flow: o preview mostra o botão, e o envio leva id, ação e tela", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "agendamento");
    digitar("modelo-corpo", "Escolha o melhor horário.");
    await userEvent.click(screen.getByTestId("btn-add-flow"));
    digitar("botao-texto", "Agendar");
    digitar("botao-flow-id", "1234567890");
    digitar("botao-flow-tela", "AGENDA");

    expect(screen.getAllByTestId("preview-botao").map((b) => b.textContent)).toEqual(["Agendar"]);
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: [
          {
            type: "FLOW",
            text: "Agendar",
            flow_id: "1234567890",
            flow_action: "navigate",
            navigate_screen: "AGENDA",
          },
        ],
      }),
    );
  });

  it("oferta por tempo limitado: só marketing, o preview mostra a oferta, o prazo e o cupom antes do link", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "oferta_relampago");
    await userEvent.click(screen.getByTestId("modelo-tipo-LIMITED_TIME_OFFER"));
    // Utilidade some da lista: a oferta só existe em marketing.
    expect(
      within(screen.getByTestId("modelo-categoria")).queryByRole("option", { name: "Utilidade" }),
    ).toBeNull();
    digitar("modelo-oferta-texto", "Só hoje!");
    digitar("modelo-corpo", "Use o cupom e ganhe 20% de desconto.");
    digitar("botao-codigo", "OUTUBRO20");
    digitar("botao-texto", "Comprar");
    digitar("botao-url", "https://loja.exemplo/oferta");

    const oferta = screen.getByTestId("preview-oferta");
    expect(oferta).toHaveTextContent("Só hoje!");
    expect(within(oferta).getByTestId("preview-oferta-prazo")).toBeInTheDocument();
    expect(within(oferta).getByTestId("preview-oferta-codigo")).toHaveTextContent("OUTUBRO20");
    expect(screen.getAllByTestId("preview-botao").map((b) => b.textContent)).toEqual([
      "Copiar código",
      "Comprar",
    ]);

    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "LIMITED_TIME_OFFER",
        category: "MARKETING",
        offer: { text: "Só hoje!", has_expiration: true },
        footer: null,
        cards: [],
      }),
    );
  });

  it("carrossel: nasce com 2 cards, o preview mostra cada card e o envio leva os cards", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "vitrine_carrossel");
    await userEvent.click(screen.getByTestId("modelo-tipo-CAROUSEL"));
    expect(screen.getAllByTestId("modelo-card")).toHaveLength(2);
    // Sem rodapé nem botões soltos: no carrossel eles moram nos cards.
    expect(screen.queryByTestId("modelo-rodape")).toBeNull();

    digitar("modelo-corpo", "Separei estas ofertas para você.");
    for (const i of [0, 1]) {
      await escolherArquivo(`card-${i}-midia`, `produto_${i + 1}.jpg`, "image/jpeg");
      digitar(`card-${i}-corpo`, `Produto ${i + 1} com frete grátis.`);
      digitar(`card-${i}-botao-texto`, "Quero");
    }

    const cards = screen.getAllByTestId("preview-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[1]!).getByTestId("preview-card-corpo")).toHaveTextContent(
      "Produto 2 com frete grátis.",
    );
    expect(within(cards[0]!).getByTestId("preview-midia")).toHaveAttribute(
      "src",
      "https://storage.exemplo/assinado/1",
    );
    expect(within(cards[1]!).getByTestId("preview-card-botao")).toHaveTextContent("Quero");

    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const enviado = mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(enviado).toMatchObject({ kind: "CAROUSEL", header: null, buttons: [] });
    expect(enviado.cards).toEqual(
      [1, 2].map((n) => ({
        header: {
          format: "IMAGE",
          media: {
            handle: `4::HANDLE_${n}`,
            path: `${ORG}/templates/0d0e0007-0000-4000-8000-00000000000${n}.jpg`,
            mime_type: "image/jpeg",
            file_name: `produto_${n}.jpg`,
          },
        },
        body: `Produto ${n} com frete grátis.`,
        examples: {},
        buttons: [{ type: "QUICK_REPLY", text: "Quero" }],
      })),
    );
  });

  it("o card novo já nasce com os botões do anterior (a Meta exige os mesmos em todos)", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    await userEvent.click(screen.getByTestId("modelo-tipo-CAROUSEL"));
    digitar("card-1-botao-texto", "Quero");
    await userEvent.click(screen.getByTestId("btn-add-card"));
    const cards = screen.getAllByTestId("modelo-card");
    expect(cards).toHaveLength(3);
    expect(within(cards[2]!).getByTestId("card-2-botao-texto")).toHaveValue("Quero");
  });

  it("carrossel com cards de botões diferentes: a recusa da Meta aparece antes do envio", async () => {
    render(<EditorDeModelo onFechar={() => {}} />);
    digitar("modelo-nome", "vitrine_carrossel");
    await userEvent.click(screen.getByTestId("modelo-tipo-CAROUSEL"));
    digitar("modelo-corpo", "Separei estas ofertas para você.");
    for (const i of [0, 1]) {
      await escolherArquivo(`card-${i}-midia`, `produto_${i + 1}.jpg`, "image/jpeg");
      digitar(`card-${i}-corpo`, `Produto ${i + 1} com frete grátis.`);
      digitar(`card-${i}-botao-texto`, "Quero");
    }
    await userEvent.click(screen.getByTestId("card-1-btn-add-link"));
    await userEvent.click(screen.getByTestId("btn-enviar-modelo"));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Todos os cards precisam ter os mesmos botões, do mesmo tipo e na mesma ordem.",
      ),
    ).toBeInTheDocument();
  });
});
