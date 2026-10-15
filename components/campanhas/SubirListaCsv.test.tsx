/**
 * A caixa "Subir uma lista de contatos (CSV)" pela tela: o formato do telefone
 * aparece ANTES do envio, o resumo diz o que entrou e o que ficou de fora com a
 * linha, e a lista de ids sobe para a campanha (e só para ela).
 *
 * O `fetch` é dublado com o que a rota devolve; o resto é o componente de verdade.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubirListaCsv } from "./SubirListaCsv";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function montar(incluidos: string[] = [], onIncluidos = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <SubirListaCsv incluidos={incluidos} onIncluidos={onIncluidos} />
    </QueryClientProvider>,
  );
  return onIncluidos;
}

function responder(corpo: unknown, status = 200) {
  const fetchFalso = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(corpo),
  });
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
}

function enviarArquivo() {
  const arquivo = new File(["nome;telefone\nAna;+5511999998888"], "lista.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Arquivo CSV"), { target: { files: [arquivo] } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar lista" }));
}

afterEach(() => vi.unstubAllGlobals());

describe("SubirListaCsv", () => {
  it("mostra os formatos de telefone e a planilha modelo antes de enviar qualquer coisa", () => {
    montar();
    const formatos = screen.getByTestId("formatos-de-telefone");

    expect(within(formatos).getByText("+5511999998888")).toBeTruthy();
    expect(within(formatos).getByText("(11) 99999-8888")).toBeTruthy();
    expect(within(formatos).getByText("5511999998888")).toBeTruthy();
    expect(within(formatos).getByText("+351912345678")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Baixar planilha modelo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar lista" }).hasAttribute("disabled")).toBe(true);
  });

  it("envia o arquivo EXIGINDO telefone e entrega à campanha os ids de novos e existentes", async () => {
    const fetchFalso = responder({
      data: {
        total_linhas: 3,
        imported: 1,
        skipped_duplicates: 1,
        errors: [{ linha: 4, motivo: 'telefone inválido: "abc"' }],
        contact_ids: [ID_A, ID_B],
      },
    });
    const onIncluidos = montar();
    enviarArquivo();

    await waitFor(() => expect(onIncluidos).toHaveBeenCalledWith([ID_A, ID_B]));
    const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/contacts/import");
    expect((init.body as FormData).get("exigir_telefone")).toBe("true");

    const resumo = await screen.findByTestId("resumo-da-lista");
    expect(resumo.textContent).toContain("3 linha(s) lidas");
    expect(resumo.textContent).toContain("1 novo(s) em Contatos");
    expect(resumo.textContent).toContain("1 já existiam");
    expect(resumo.textContent).toContain("Linha 4");
    expect(resumo.textContent).toContain('telefone inválido: "abc"');
  });

  it("uma segunda lista soma à primeira sem repetir ninguém", async () => {
    responder({
      data: { total_linhas: 2, imported: 0, skipped_duplicates: 2, errors: [], contact_ids: [ID_A, ID_B] },
    });
    const onIncluidos = montar([ID_A]);
    enviarArquivo();

    await waitFor(() => expect(onIncluidos).toHaveBeenCalledWith([ID_A, ID_B]));
  });

  it("arquivo recusado mostra a frase da rota e não mexe na lista", async () => {
    responder(
      { error: { code: "validation_failed", message: "cabeçalho sem coluna de telefone", request_id: "r1" } },
      422,
    );
    const onIncluidos = montar();
    enviarArquivo();

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("cabeçalho sem coluna de telefone");
    expect(onIncluidos).not.toHaveBeenCalled();
  });

  it("com lista já subida, mostra quantas pessoas são e deixa tirar a lista", () => {
    const onIncluidos = montar([ID_A, ID_B]);

    expect(screen.getByTestId("total-da-lista").textContent).toContain("2");
    fireEvent.click(screen.getByRole("button", { name: "Tirar a lista" }));
    expect(onIncluidos).toHaveBeenCalledWith([]);
  });
});
