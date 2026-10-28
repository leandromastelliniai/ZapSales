/**
 * A faixa "Seus recursos opcionais" na tela — o que mostra, quando pede atenção e que NÃO recomenda
 * nada (a tela é um mapa).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ResumoDosRecursosFaixa } from "@/components/recursos-opcionais/ResumoDosRecursos";
import type { EstadoDoRecurso } from "@/lib/recursos-opcionais/catalogo";
import { resumoDosRecursos, type ItemParaResumir } from "@/lib/recursos-opcionais/resumo-dos-recursos";

afterEach(cleanup);

const item = (estado: EstadoDoRecurso, dependeDoServidor = false): ItemParaResumir => ({
  id: `${estado}-${dependeDoServidor}`,
  estado,
  dependeDoServidor,
});

function faixa(itens: ItemParaResumir[]) {
  return render(<ResumoDosRecursosFaixa resumo={resumoDosRecursos(itens)} />);
}

const texto = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, " ").trim();

describe("a faixa Seus recursos opcionais", () => {
  it("mostra as quatro contagens, e o total sai do que a página lista", () => {
    faixa([
      item("ligado"),
      item("desligado"),
      item("desligado"),
      item("varia"),
      item("desligado", true),
      item("desligado", true),
      item("desligado", true),
    ]);
    expect(texto("resumo-rec-ligados")).toContain("1");
    expect(texto("resumo-rec-ligados")).toContain("7 recursos no total");
    expect(texto("resumo-rec-desligados")).toContain("2");
    expect(texto("resumo-rec-conferir")).toContain("1");
    expect(texto("resumo-rec-servidor")).toContain("3");
    expect(texto("resumo-rec-servidor")).toContain("peça a quem administra");
  });

  it("quando o que falta é do servidor, a faixa NÃO pede atenção — só informa", () => {
    faixa([item("ligado"), item("desligado", true)]);
    expect(screen.getByTestId("rec-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("leitura que falhou pede atenção e aparece destacada na célula 'você confere'", () => {
    faixa([item("ligado"), item("nao_lido"), item("nao_lido")]);
    expect(screen.getByTestId("rec-esta-certo-estado")).toHaveAttribute("data-estado", "atencao");
    expect(texto("rec-esta-certo-estado")).toContain("1 pede atenção");
    expect(texto("resumo-rec-conferir")).toContain("2 não consegui ler agora");
    expect(texto("resumo-rec-desligados")).toContain("0");
  });

  it("as conferências abrem e fecham, e dizem o motivo em português claro", () => {
    faixa([item("ligado"), item("varia"), item("desligado", true)]);
    expect(screen.queryByTestId("conferencia-rec-servidor")).toBeNull();
    fireEvent.click(screen.getByTestId("rec-esta-certo-botao"));
    expect(texto("conferencia-rec-servidor")).toContain("1 recurso depende de um módulo que o servidor não liga");
    expect(texto("conferencia-rec-conferir")).toContain("1 recurso mostra o estado só na tela dele");
    expect(texto("conferencia-rec-leitura")).toContain("O estado de todos os recursos foi lido.");
    fireEvent.click(screen.getByTestId("rec-esta-certo-botao"));
    expect(screen.queryByTestId("conferencia-rec-servidor")).toBeNull();
  });

  it("não há recomendação: a tela é um mapa e não opina sobre a empresa", () => {
    faixa([item("desligado"), item("desligado")]);
    expect(screen.queryByTestId("recomendacao-dos-recursos")).toBeNull();
    expect(document.body.textContent).not.toMatch(/recomend/i);
  });
});
