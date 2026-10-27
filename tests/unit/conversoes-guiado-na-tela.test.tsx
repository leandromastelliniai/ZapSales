/**
 * A faixa "Suas conversões" na tela — o que ela mostra, quando pede atenção e o que recomenda — e o
 * formulário da Meta, que agora diz o nome dela.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FormularioDeConversoes } from "@/app/app/settings/conversoes/_form";
import { ResumoDasConversoesFaixa } from "@/components/conversoes/ResumoDasConversoes";
import {
  recomendarParaConversoes,
  resumoDasConversoes,
  type EntradaDasConversoes,
} from "@/lib/conversoes/resumo-das-conversoes";

vi.mock("@/app/actions/settings/updateAdPlatformConnection", () => ({
  updateAdPlatformConnection: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(cleanup);

const META_ENVIANDO = { conectada: true, habilitada: true, emTeste: false };

function faixa(sobre: Partial<EntradaDasConversoes> = {}) {
  const e: EntradaDasConversoes = {
    meta: { conectada: false, habilitada: false, emTeste: false },
    google: { instalacaoConfigurada: true, conectado: false, habilitado: false },
    enviadas: 0,
    pendentes: 0,
    capturaLigada: false,
    ...sobre,
  };
  const resumo = resumoDasConversoes(e);
  return render(
    <ResumoDasConversoesFaixa resumo={resumo} recomendacao={recomendarParaConversoes(resumo, e.capturaLigada)} />,
  );
}

const texto = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, " ").trim();

describe("a faixa Suas conversões", () => {
  it("nada conectado: as duas plataformas dizem 'Não conectada — opcional' e nada pede atenção", () => {
    faixa();
    expect(texto("resumo-conv-meta")).toContain("Não conectada");
    expect(texto("resumo-conv-meta")).toContain("Opcional: só para quem anuncia");
    expect(texto("resumo-conv-google")).toContain("Não conectada");
    expect(screen.getByTestId("conv-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("Google sem credenciais na instalação diz 'Indisponível' e que falta configurar — não 'Não conectada'", () => {
    faixa({ google: { instalacaoConfigurada: false, conectado: false, habilitado: false } });
    expect(texto("resumo-conv-google")).toContain("Indisponível");
    expect(texto("resumo-conv-google")).toContain("Falta configurar na instalação");
    expect(screen.getByTestId("conv-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("Meta enviando com números: mostra 'Enviando', as aceitas e 'Nenhuma pendência'", () => {
    faixa({ meta: META_ENVIANDO, enviadas: 42, capturaLigada: true });
    expect(texto("resumo-conv-meta")).toContain("Enviando");
    expect(texto("resumo-conv-enviadas")).toContain("42");
    expect(texto("resumo-conv-enviadas")).toContain("aceitas pela plataforma");
    expect(texto("resumo-conv-pendentes")).toContain("Nenhuma pendência");
    expect(screen.getByTestId("conv-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
    expect(screen.queryByTestId("recomendacao-das-conversoes")).toBeNull();
  });

  it("Meta em teste com pendências: pede atenção por duas razões e a conferência explica", () => {
    faixa({ meta: { ...META_ENVIANDO, emTeste: true }, pendentes: 3 });
    expect(texto("resumo-conv-meta")).toContain("Em teste");
    expect(texto("resumo-conv-pendentes")).toContain("3");
    expect(screen.getByTestId("conv-esta-certo-estado")).toHaveTextContent("2 pedem atenção");

    fireEvent.click(screen.getByTestId("conv-esta-certo-botao"));
    expect(screen.getByTestId("conferencia-conv-meta")).toHaveAttribute("data-estado", "atencao");
    expect(screen.getByTestId("conferencia-conv-meta")).toHaveTextContent("não contam para a otimização");
    expect(screen.getByTestId("conferencia-conv-pendencias")).toHaveTextContent("3 vendas de anúncio não foram reportadas");
  });

  it("quando a lista de pendências bate no teto, o número vira 'ou mais'", () => {
    faixa({ meta: META_ENVIANDO, pendentes: 20, pendentesAlemDoTeto: true });
    expect(texto("resumo-conv-pendentes")).toContain("20+");
  });
});

describe("a recomendação", () => {
  it("nada conectado: conectar a plataforma em que anuncia, com o motivo", () => {
    faixa();
    const r = screen.getByTestId("recomendacao-das-conversoes");
    expect(r).toHaveTextContent("Recomendado:");
    expect(r).toHaveTextContent("conectar a plataforma em que você anuncia");
    expect(r).toHaveTextContent("Motivo:");
  });

  it("em teste: apagar o código de teste, com o motivo", () => {
    faixa({ meta: { ...META_ENVIANDO, emTeste: true } });
    expect(screen.getByTestId("recomendacao-das-conversoes")).toHaveTextContent("apagar o código de teste");
  });

  it("tudo certo sem captura de origem: ligar o endereço de captura", () => {
    faixa({ meta: META_ENVIANDO });
    expect(screen.getByTestId("recomendacao-das-conversoes")).toHaveTextContent(
      "ligar o endereço de captura de origem do site",
    );
  });

  it("só UMA recomendação por vez", () => {
    faixa({ meta: { ...META_ENVIANDO, emTeste: true }, pendentes: 2 });
    expect(screen.getAllByTestId("recomendacao-das-conversoes")).toHaveLength(1);
  });
});

describe("o formulário da Meta", () => {
  it("diz que é a Meta, em vez de abrir direto em 'Identificador do destino'", () => {
    render(
      <FormularioDeConversoes
        estado={{ conectada: false, datasetId: null, temToken: false, habilitada: false, testEventCode: null }}
        idioma="pt-BR"
      />,
    );
    expect(screen.getByRole("heading", { name: "Meta Ads" })).toBeTruthy();
    expect(screen.getByText(/Devolve à Meta as vendas que vieram de anúncio/)).toBeTruthy();
    // os campos continuam os mesmos
    expect(screen.getByLabelText("Identificador do destino de conversões")).toBeTruthy();
    expect(screen.getByLabelText("Token de acesso")).toBeTruthy();
  });
});
