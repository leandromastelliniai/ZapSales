/**
 * A tela Provedores de IA, guiada: a faixa "Sua IA", a recomendação do Modelo padrão e a divisão
 * entre "A IA que conversa" e "Ajudantes opcionais" — com a página inteira montada e a rede de mentira.
 *
 * Cada caso mede um par: o que a faixa diz E o que a tela de baixo mostra, porque o defeito que a faixa
 * existe para evitar é a tela que afirma uma coisa em cima e outra embaixo.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PainelDeProvedores } from "@/app/app/ai/providers/_components/PainelDeProvedores";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app/ai/credentials/_actions", () => ({ refreshCredentialsView: vi.fn() }));

function ponto(id: string, papel: string, over: Record<string, unknown> = {}) {
  return {
    id,
    rotulo: `Parte ${id}`,
    oQueFaz: "Faz algo.",
    papel,
    exige: {},
    sintomaDeFalha: "Algo falha.",
    fixo: null,
    mandadoPeloAgente: false,
    efetivo: {
      provider: "anthropic",
      modelId: "claude-sonnet-5",
      credentialId: null,
      baseUrl: null,
      origem: "padrao_da_organizacao",
      porQue: "padrão da empresa",
    },
    avisos: [],
    ...over,
  };
}

function providers(sobre: Record<string, unknown> = {}) {
  return {
    papeis: {
      atender: { rotulo: "Atender o cliente", explicacao: "Responde o cliente." },
      entender: { rotulo: "Entender a conversa", explicacao: "Lê o que chegou." },
    },
    pontos: [ponto("a1", "atender"), ponto("a2", "atender"), ponto("e1", "entender")],
    provedores: [{ id: "anthropic", rotulo: "Anthropic (Claude)", quandoUsar: "", ondePegarAChave: "", aceitaEndpointProprio: false }],
    credenciais: [] as unknown[],
    instalacaoTemChave: false,
    modelos: [
      { provider: "anthropic", model_id: "claude-sonnet-5", display_name: "Claude Sonnet 5", supports_tools: true, supports_vision: true, input_price_per_million_cents: null },
    ],
    padrao: { provider: "anthropic", defaultModel: "claude-sonnet-5" },
    podeEditar: true,
    ...sobre,
  };
}

const CHAVE = { id: "c1", provider: "anthropic", label: "Chave da loja", api_key_last4: "c0de" };

function jev(ligado: boolean) {
  return {
    provedor: { rotulo: "Jev", quandoUsar: "x", ondePegarAChave: "https://x", prefixoDaChave: "apikey_" },
    chave: { existe: true, validada: true, credencial_id: "j1", rotulo: "Jev", erro_de_validacao: null },
    config: { ligado, modo: "observacao", aceite: ligado ? { em: "2026-09-20T00:00:00Z", por: "u1" } : null },
    tarefas: [],
    tem_ia_de_sempre: true,
    numeros: { dias: 7, decisoes: 0, custo_cents: 0, latencia_media_ms: null, reservas: 0, irritados: 0, custo_incompleto: false, observacao: { dias: 30, comparadas: 0, concordaram: 0 } },
    ultima_falha: null,
    pode_editar: true,
  };
}

interface Cenario {
  providers: ReturnType<typeof providers>;
  jevLigado: boolean;
  audioLigado: boolean;
  mapasComChave: boolean;
  audioFalha?: boolean;
}

let cenario: Cenario;

beforeEach(() => {
  cenario = { providers: providers(), jevLigado: false, audioLigado: false, mapasComChave: false };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/v1/ai/jev") return new Response(JSON.stringify({ data: jev(cenario.jevLigado) }), { status: 200 });
      if (url === "/api/v1/ai/audio") {
        if (cenario.audioFalha) return new Response("{}", { status: 500 });
        return new Response(JSON.stringify({ data: { config: { ligado: cenario.audioLigado } } }), { status: 200 });
      }
      if (url === "/api/v1/ai/mapas") {
        return new Response(JSON.stringify({ data: { configurada: cenario.mapasComChave, ultimos4: null } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: cenario.providers }), { status: 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

async function montar() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PainelDeProvedores />
    </QueryClientProvider>,
  );
  await screen.findByTestId("resumo-da-ia");
  // a faixa lê os opcionais depois da primeira pintura
  await waitFor(() => expect(screen.getByTestId("resumo-ia-opcionais").textContent).not.toContain("—"));
}

const texto = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, " ").trim();

describe("a faixa Sua IA", () => {
  it("sem nenhuma chave: a chave 'Falta', a faixa pede atenção e a frase diz a consequência", async () => {
    await montar();
    expect(texto("resumo-ia-chave")).toContain("Falta");
    expect(texto("resumo-ia-chave")).toContain("O agente não responde ninguém sem ela");
    expect(screen.getByTestId("ia-esta-certo-estado")).toHaveAttribute("data-estado", "atencao");

    fireEvent.click(screen.getByTestId("ia-esta-certo-botao"));
    const conferencia = screen.getByTestId("conferencia-ia-chave");
    expect(conferencia).toHaveAttribute("data-estado", "atencao");
    expect(conferencia).toHaveTextContent("o agente não consegue responder ninguém");
    expect(within(conferencia).getByRole("link", { name: "Cadastrar uma chave" })).toHaveAttribute(
      "href",
      "/app/ai/credentials",
    );
  });

  it("com a chave da empresa: diz de quem é, o modelo e o provedor, e o padrão vale em N de M", async () => {
    cenario.providers = providers({ credenciais: [CHAVE] });
    await montar();
    expect(texto("resumo-ia-conversa")).toContain("Claude Sonnet 5");
    expect(texto("resumo-ia-conversa")).toContain("Anthropic (Claude)");
    expect(texto("resumo-ia-chave")).toContain("Da empresa");
    expect(texto("resumo-ia-chave")).toContain("Chave da loja ••c0de");
    expect(texto("resumo-ia-padrao")).toContain("3 de 3 partes");
    expect(screen.getByTestId("ia-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("a chave só da instalação conta como pronta, e a faixa diz que veio da instalação", async () => {
    cenario.providers = providers({ instalacaoTemChave: true });
    await montar();
    expect(texto("resumo-ia-chave")).toContain("Da instalação");
    expect(screen.getByTestId("ia-esta-certo-estado")).toHaveAttribute("data-estado", "ok");
  });

  it("ajudantes opcionais desligados não pedem atenção — são só informação", async () => {
    cenario.providers = providers({ credenciais: [CHAVE] });
    await montar();
    expect(texto("resumo-ia-opcionais")).toContain("0 de 3 em uso");
    expect(texto("resumo-ia-opcionais")).toContain("Jev desligado");
    expect(texto("resumo-ia-opcionais")).toContain("Mapas sem chave");
    fireEvent.click(screen.getByTestId("ia-esta-certo-botao"));
    for (const id of ["jev", "audio", "mapas"]) {
      expect(screen.getByTestId(`conferencia-ia-${id}`)).toHaveAttribute("data-estado", "info");
    }
  });

  it("com os três ligados a faixa conta 3 de 3", async () => {
    cenario = { ...cenario, providers: providers({ credenciais: [CHAVE] }), jevLigado: true, audioLigado: true, mapasComChave: true };
    await montar();
    await waitFor(() => expect(texto("resumo-ia-opcionais")).toContain("3 de 3 em uso"));
  });

  it("se a leitura do áudio falha, a faixa NÃO afirma 'desligado' — diz que não leu", async () => {
    cenario.providers = providers({ credenciais: [CHAVE] });
    cenario.audioFalha = true;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PainelDeProvedores />
      </QueryClientProvider>,
    );
    await screen.findByTestId("resumo-da-ia");
    await waitFor(() => expect(texto("resumo-ia-opcionais")).toContain("Mapas sem chave"));
    expect(texto("resumo-ia-opcionais")).not.toContain("Resposta em áudio desligada");
    fireEvent.click(screen.getByTestId("ia-esta-certo-botao"));
    expect(screen.getByTestId("conferencia-ia-audio")).toHaveTextContent("Não consegui ler");
  });

  it("parte com aviso pede atenção e a faixa conta quantas", async () => {
    cenario.providers = providers({
      credenciais: [CHAVE],
      pontos: [ponto("a1", "atender", { avisos: ["sem catálogo"] }), ponto("a2", "atender"), ponto("e1", "entender")],
    });
    await montar();
    expect(screen.getByTestId("ia-esta-certo-estado")).toHaveTextContent("1 pede atenção");
    fireEvent.click(screen.getByTestId("ia-esta-certo-botao"));
    expect(screen.getByTestId("conferencia-ia-avisos")).toHaveTextContent("1 parte do sistema pede atenção");
  });
});

describe("a recomendação do Modelo padrão", () => {
  it("sem chave: recomenda cadastrar a da IA principal, com o motivo", async () => {
    await montar();
    const r = screen.getByTestId("recomendacao-do-padrao");
    expect(r).toHaveTextContent("Recomendado:");
    expect(r).toHaveTextContent("cadastrar a chave da Anthropic (Claude)");
    expect(r).toHaveTextContent("Motivo:");
    expect(r).toHaveTextContent("sem chave, ele não responde ninguém");
  });

  it("com chave: recomenda não mexer sem razão, e o motivo cita os números", async () => {
    cenario.providers = providers({ credenciais: [CHAVE] });
    await montar();
    const r = screen.getByTestId("recomendacao-do-padrao");
    expect(r).toHaveTextContent("deixar o padrão como está");
    expect(r).toHaveTextContent("ele vale para 3 de 3 partes do sistema");
    // nunca recomenda um modelo
    expect(r.textContent).not.toMatch(/claude|gpt|gemini/i);
  });

  it("não troca nada sozinha: o Salvar padrão continua desabilitado até alguém mexer", async () => {
    await montar();
    expect(screen.getByTestId("salvar-padrao")).toBeDisabled();
  });
});

describe("a página em duas partes", () => {
  it("'A IA que conversa' vem antes dos grupos e 'Ajudantes opcionais' depois deles", async () => {
    cenario.providers = providers({ credenciais: [CHAVE] });
    await montar();
    const titulos = screen.getAllByTestId("secao-da-pagina").map((e) => e.querySelector("h2")?.textContent);
    expect(titulos).toEqual(["A IA que conversa", "Ajudantes opcionais"]);
    const [conversa, opcionais] = screen.getAllByTestId("secao-da-pagina");
    const grupo = screen.getByTestId("papel-atender");
    const seguinte = Node.DOCUMENT_POSITION_FOLLOWING;
    expect(conversa!.compareDocumentPosition(screen.getByTestId("cartao-do-padrao")) & seguinte).toBeTruthy();
    expect(screen.getByTestId("cartao-do-padrao").compareDocumentPosition(grupo) & seguinte).toBeTruthy();
    expect(grupo.compareDocumentPosition(opcionais!) & seguinte).toBeTruthy();
    expect(opcionais!.compareDocumentPosition(screen.getByTestId("cartao-do-jev")) & seguinte).toBeTruthy();
    expect(opcionais!.compareDocumentPosition(screen.getByTestId("cartao-de-mapas")) & seguinte).toBeTruthy();
  });

  it("a abertura continua dizendo 'N lugares' (a spec e2e confere o número) e explica o que é cada um", async () => {
    await montar();
    const painel = screen.getByTestId("painel-de-provedores");
    expect(painel).toHaveTextContent("3 lugares");
    expect(painel).toHaveTextContent("cada um é uma tarefa");
  });

  it("o aviso amarelo antigo saiu: a faixa e a recomendação dizem a mesma coisa uma vez só", async () => {
    await montar();
    expect(screen.queryByTestId("aviso-sem-chave")).toBeNull();
  });
});
