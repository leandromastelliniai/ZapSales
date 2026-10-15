/**
 * O catálogo de tradução chega sob demanda, e a tela continua traduzida.
 *
 * Medido na produção em 15/10/2026: um pedaço de 570 KB comprimidos, em TODA tela, era quase só o dicionário
 * (espanhol e inglês). Quem usa português não precisa de um byte dele. O que estes casos garantem é o outro
 * lado da troca: quem usa espanhol ou inglês continua vendo a tela traduzida — sem piscar em português
 * antes da hora — e o português não dispara carga nenhuma.
 */
import { Suspense } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { carregarCatalogo, catalogoPronto, esquecerCatalogosParaTeste } from "@/lib/i18n/catalogos";
import { traduzir as traduzirDoServidor } from "@/lib/i18n/dicionario";
import { traduzir as traduzirDoNavegador, temTraducao } from "@/lib/i18n/dicionario.cliente";
import { IdiomaProvider, useAplicarIdioma, useT } from "@/lib/i18n/IdiomaProvider";

function Texto() {
  const t = useT();
  return <p data-testid="texto">{t("Novo contato")}</p>;
}

function Trocador() {
  const aplicar = useAplicarIdioma();
  return (
    <button type="button" onClick={() => aplicar("es")}>
      trocar
    </button>
  );
}

beforeEach(() => {
  esquecerCatalogosParaTeste();
});

afterEach(async () => {
  cleanup();
  // Devolve ao estado do setup global: os demais arquivos esperam os catálogos na memória.
  await Promise.all([carregarCatalogo("es"), carregarCatalogo("en")]);
});

describe("catálogos sob demanda", () => {
  it("português não carrega catálogo nenhum", () => {
    render(
      <Suspense fallback={<p>carregando</p>}>
        <IdiomaProvider locale="pt-BR">
          <Texto />
        </IdiomaProvider>
      </Suspense>,
    );
    expect(screen.getByTestId("texto").textContent).toBe("Novo contato");
    expect(catalogoPronto("es")).toBeUndefined();
    expect(catalogoPronto("en")).toBeUndefined();
  });

  it("espanhol espera o catálogo chegar e então traduz, sem erro de hook", async () => {
    // `await act(async …)`: a retomada do componente suspenso é uma atualização do React, e ela só
    // acontece dentro de um `act` assíncrono (o `render` síncrono deixa a promessa resolver fora dele).
    await act(async () => {
      render(
        <Suspense fallback={<p data-testid="fallback">carregando</p>}>
          <IdiomaProvider locale="es">
            <Texto />
          </IdiomaProvider>
        </Suspense>,
      );
    });
    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.getByText("Nuevo contacto")).toBeTruthy();
    expect(catalogoPronto("es")).toBeDefined();
  });

  it("com o catálogo já em memória, renderiza de uma vez (sem suspender)", async () => {
    await carregarCatalogo("es");
    render(
      <Suspense fallback={<p data-testid="fallback">carregando</p>}>
        <IdiomaProvider locale="es">
          <Texto />
        </IdiomaProvider>
      </Suspense>,
    );
    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.getByTestId("texto").textContent).toBe("Nuevo contacto");
  });

  it("trocar para espanhol pelo seletor mantém a tela até o catálogo chegar, e então traduz", async () => {
    render(
      <Suspense fallback={<p>carregando</p>}>
        <IdiomaProvider locale="pt-BR">
          <Texto />
          <Trocador />
        </IdiomaProvider>
      </Suspense>,
    );
    expect(screen.getByTestId("texto").textContent).toBe("Novo contato");
    await act(async () => {
      screen.getByText("trocar").click();
      await carregarCatalogo("es");
    });
    expect(screen.getByTestId("texto").textContent).toBe("Nuevo contacto");
  });
});

describe("a versão de navegador do dicionário", () => {
  it("devolve o mesmo que a do servidor, quando o catálogo está carregado", async () => {
    await Promise.all([carregarCatalogo("es"), carregarCatalogo("en")]);
    for (const frase of ["Novo contato", "Salvar", "Frase que ninguém traduziu"]) {
      for (const idioma of ["pt-BR", "es", "en"] as const) {
        expect(traduzirDoNavegador(frase, idioma), `${idioma}: ${frase}`).toBe(traduzirDoServidor(frase, idioma));
      }
    }
    expect(temTraducao("Novo contato", "es")).toBe(true);
    expect(temTraducao("Frase que ninguém traduziu", "es")).toBe(false);
  });

  it("sem o catálogo na memória cai no português, nunca em erro nem em vazio", () => {
    expect(traduzirDoNavegador("Novo contato", "es")).toBe("Novo contato");
    expect(temTraducao("Novo contato", "es")).toBe(false);
    expect(temTraducao("qualquer coisa", "pt-BR")).toBe(true);
  });
});
