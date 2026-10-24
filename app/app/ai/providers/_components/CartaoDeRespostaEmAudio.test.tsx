/**
 * O cartão "Resposta em áudio" em Provedores: o caminho de quem nunca viu o recurso.
 *
 * O que a tela precisa fazer, e o que este arquivo prova:
 *   - instalação NOVA, sem chave de voz nenhuma: abre dizendo por que está
 *     indisponível, e NÃO deixa ligar (a chave e o aceite vêm primeiro);
 *   - a chave nunca aparece depois de salva: só os 4 últimos;
 *   - "Salvar" manda o que está na tela (inclusive o aceite, uma vez só) e mostra o estado novo;
 *   - "Testar" mostra a frase de cada falha em vez de dizer "funcionou";
 *   - o uso do mês e a ÚLTIMA FALHA em conversa real aparecem na configuração.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

import { CartaoDeRespostaEmAudio } from "./CartaoDeRespostaEmAudio";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

const ACEITE = { em: "2026-10-15T12:00:00.000Z", por: "22222222-2222-4222-8222-222222222222" };

// O Radix Select abre o painel com APIs que o jsdom não tem (rolar até a opção,
// capturar o ponteiro). Sem estes dois, o clique no gatilho lança fora do teste.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

function estado(sobre: Record<string, unknown> = {}) {
  return {
    config: {
      ligado: false,
      provedor: "openai_compativel",
      endereco: null,
      modelo: null,
      voz: null,
      limite_de_caracteres: 1000,
      custo_por_mil_caracteres_cents: null,
      aceite: null,
    },
    chaves: {
      openai_compativel: { configurada: false, ultimos4: null, atualizada_em: null },
      elevenlabs: { configurada: false, ultimos4: null, atualizada_em: null },
    },
    disponivel: false,
    por_que_indisponivel: "desligado",
    uso: { respostas_em_audio: 0, falhas: 0, caracteres: 0, custo_cents: 0, sem_preco: 0, ultima_falha: null },
    padroes: {
      endereco: "https://api.openai.com/v1",
      modelo_openai: "tts-1",
      voz_openai: "alloy",
      modelo_elevenlabs: "eleven_multilingual_v2",
      limite_de_caracteres: 1000,
      limite_minimo: 100,
      limite_maximo: 4000,
    },
    ...sobre,
  };
}

interface Chamada {
  url: string;
  metodo: string;
  corpo: unknown;
}
let chamadas: Chamada[];
let resposta: (c: Chamada) => { status?: number; corpo: unknown };

beforeEach(() => {
  chamadas = [];
  resposta = (c) => (c.url === "/api/v1/ai/audio" && c.metodo === "GET" ? { corpo: { data: estado() } } : { corpo: { data: estado() } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const chamada: Chamada = {
        url,
        metodo: init?.method ?? "GET",
        corpo: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      chamadas.push(chamada);
      const r = resposta(chamada);
      return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar() {
  return render(
    <IdiomaProvider locale="pt-BR">
      <CartaoDeRespostaEmAudio />
    </IdiomaProvider>,
  );
}
const cartao = () => screen.findByTestId("cartao-de-resposta-em-audio");

describe("instalação nova, sem nenhuma chave de voz", () => {
  it("explica por que está indisponível e não deixa ligar — a chave e o aceite vêm primeiro", async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId("audio-estado")).toHaveTextContent("Indisponível"));
    expect(screen.getByTestId("audio-por-que")).toHaveTextContent(/Desligada\. Os agentes respondem sempre em texto/);
    const ligar = screen.getByTestId("audio-ligado");
    expect(ligar).toBeDisabled();
    expect(screen.getByTestId("audio-ligar-bloqueado")).toHaveTextContent(/grave a chave do provedor de voz e marque o aceite/);
    // Só leu: nada foi gravado.
    expect(chamadas.map((c) => c.metodo)).toEqual(["GET"]);
  });

  it("com a chave COLADA e o aceite marcado, o interruptor libera", async () => {
    montar();
    await cartao();
    const ligar = await screen.findByTestId("audio-ligado");
    fireEvent.change(screen.getByTestId("audio-chave"), { target: { value: "sk-chave-do-cliente-0001" } });
    expect(ligar).toBeDisabled(); // falta o aceite
    fireEvent.click(screen.getByTestId("audio-aceite"));
    await waitFor(() => expect(ligar).toBeEnabled());
  });

  it("a chave é um campo de senha, e o texto de ajuda fala do que o dono precisa saber", async () => {
    montar();
    const campo = await screen.findByTestId("audio-chave");
    expect(campo).toHaveAttribute("type", "password");
    // `new-password`, não `off`: o Chrome ignora `off` em campo de senha e preenche a senha de login aqui.
    expect(campo).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByTestId("cartao-de-resposta-em-audio")).toHaveTextContent(/usa a chave de voz da sua própria empresa/);
  });
});

describe("salvar", () => {
  it("manda o que está na tela — o aceite sai UMA vez — e passa a mostrar só os 4 últimos da chave", async () => {
    resposta = (c) => {
      if (c.metodo === "PUT") {
        return {
          corpo: {
            data: estado({
              config: { ...estado().config, ligado: true, aceite: ACEITE },
              chaves: {
                openai_compativel: { configurada: true, ultimos4: "0001", atualizada_em: "2026-10-15T12:00:00Z" },
                elevenlabs: { configurada: false, ultimos4: null, atualizada_em: null },
              },
              disponivel: true,
              por_que_indisponivel: null,
            }),
          },
        };
      }
      return { corpo: { data: estado() } };
    };
    montar();
    await screen.findByTestId("audio-ligado");
    fireEvent.change(screen.getByTestId("audio-chave"), { target: { value: "sk-chave-do-cliente-0001" } });
    fireEvent.click(screen.getByTestId("audio-aceite"));
    fireEvent.click(screen.getByTestId("audio-ligado"));
    fireEvent.change(screen.getByTestId("audio-limite"), { target: { value: "600" } });
    fireEvent.click(screen.getByTestId("audio-salvar"));

    await waitFor(() => expect(screen.getByTestId("audio-estado")).toHaveTextContent("Disponível"));
    const put = chamadas.find((c) => c.metodo === "PUT")!;
    expect(put.corpo).toMatchObject({
      ligado: true,
      provedor: "openai_compativel",
      limite_de_caracteres: 600,
      aceitar: true,
      api_key: "sk-chave-do-cliente-0001",
    });
    // Depois de salvar: o campo da chave limpo, e só os 4 últimos na tela.
    expect(screen.getByTestId("audio-chave")).toHaveValue("");
    expect(screen.getByTestId("audio-chave-gravada")).toHaveTextContent("···0001");
    expect(document.body.textContent).not.toContain("sk-chave-do-cliente-0001");
    // O aceite já gravado não é pedido de novo.
    expect(screen.getByTestId("audio-aceite")).toBeDisabled();
    expect(screen.getByTestId("audio-aceite")).toBeChecked();
  });

  it("o aceite já gravado NÃO é reenviado em salvamentos seguintes", async () => {
    resposta = () => ({
      corpo: {
        data: estado({
          config: { ...estado().config, ligado: true, aceite: ACEITE },
          chaves: {
            openai_compativel: { configurada: true, ultimos4: "0001", atualizada_em: "x" },
            elevenlabs: { configurada: false, ultimos4: null, atualizada_em: null },
          },
          disponivel: true,
          por_que_indisponivel: null,
        }),
      },
    });
    montar();
    await screen.findByTestId("audio-salvar");
    await waitFor(() => expect(screen.getByTestId("audio-ligado")).toBeChecked());
    fireEvent.click(screen.getByTestId("audio-salvar"));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "PUT")).toBe(true));
    const put = chamadas.find((c) => c.metodo === "PUT")!;
    expect(put.corpo).not.toHaveProperty("aceitar");
    expect(put.corpo).not.toHaveProperty("api_key");
  });

  it("a recusa do servidor aparece como mensagem — o estado não finge que gravou", async () => {
    const { toast } = await import("sonner");
    resposta = (c) =>
      c.metodo === "PUT"
        ? { status: 422, corpo: { error: { message: "Grave a chave do provedor de voz antes de ligar a resposta em áudio." } } }
        : { corpo: { data: estado() } };
    montar();
    await screen.findByTestId("audio-salvar");
    fireEvent.click(screen.getByTestId("audio-salvar"));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Grave a chave do provedor de voz antes de ligar a resposta em áudio."),
    );
    expect(screen.getByTestId("audio-estado")).toHaveTextContent("Indisponível");
  });
});

describe("trocar de provedor", () => {
  it("o provedor compatível pede endereço e voz; a ElevenLabs manda escolher a voz no agente", async () => {
    montar();
    await screen.findByTestId("audio-endereco");
    expect(screen.getByTestId("audio-voz")).toBeInTheDocument();
    expect(screen.getByTestId("audio-endereco")).toHaveAttribute("placeholder", "https://api.openai.com/v1");

    // Radix Select: troca pelo estado exposto no gatilho.
    fireEvent.click(screen.getByTestId("audio-provedor"));
    fireEvent.click(await screen.findByRole("option", { name: "ElevenLabs" }));
    await waitFor(() => expect(screen.queryByTestId("audio-endereco")).toBeNull());
    expect(screen.queryByTestId("audio-voz")).toBeNull();
    expect(screen.getByTestId("cartao-de-resposta-em-audio")).toHaveTextContent(
      /cada agente escolhe a sua voz na lista da sua conta/,
    );
  });
});

describe("testar", () => {
  async function prepararParaTestar() {
    montar();
    await screen.findByTestId("audio-chave");
    fireEvent.change(screen.getByTestId("audio-chave"), { target: { value: "sk-chave-do-cliente-0001" } });
    return screen.getByTestId("audio-testar");
  }

  it("só testa quando há uma chave (colada ou gravada)", async () => {
    montar();
    expect(await screen.findByTestId("audio-testar")).toBeDisabled();
  });

  it("falha do provedor: mostra a frase do que fazer, nunca 'funcionou'", async () => {
    resposta = (c) =>
      c.url.endsWith("/testar")
        ? { corpo: { data: { ok: false, motivo: "sem_creditos", mensagem: "A conta do provedor de voz está sem créditos ou sem saldo. Recarregue lá e tente de novo." } } }
        : { corpo: { data: estado() } };
    fireEvent.click(await prepararParaTestar());
    const r = await screen.findByTestId("audio-resultado");
    expect(r).toHaveTextContent(/sem créditos ou sem saldo/);
    expect(r).not.toHaveTextContent("Funcionou");
    const post = chamadas.find((c) => c.url.endsWith("/testar"))!;
    expect(post.corpo).toMatchObject({ provedor: "openai_compativel", api_key: "sk-chave-do-cliente-0001" });
  });

  it("sucesso: diz que gerou uma nota de voz de teste sem enviar nada a ninguém", async () => {
    resposta = (c) =>
      c.url.endsWith("/testar")
        ? { corpo: { data: { ok: true, somente_a_chave: false, caracteres: 40, latencia_ms: 900 } } }
        : { corpo: { data: estado() } };
    fireEvent.click(await prepararParaTestar());
    expect(await screen.findByTestId("audio-resultado")).toHaveTextContent(/sem enviar nada a ninguém/);
  });

  it("ElevenLabs sem voz padrão: prova a chave e diz quantas vozes a conta tem", async () => {
    resposta = (c) =>
      c.url.endsWith("/testar")
        ? { corpo: { data: { ok: true, somente_a_chave: true, vozes: 12, latencia_ms: 300 } } }
        : { corpo: { data: estado({ config: { ...estado().config, provedor: "elevenlabs" } }) } };
    fireEvent.click(await prepararParaTestar());
    expect(await screen.findByTestId("audio-resultado")).toHaveTextContent(/A sua conta tem 12 vozes/);
  });
});

describe("uso do mês e última falha", () => {
  it("mostra respostas, caracteres, custo e a ÚLTIMA falha em conversa real — a chave que parou de valer não passa em silêncio", async () => {
    resposta = () => ({
      corpo: {
        data: estado({
          disponivel: true,
          por_que_indisponivel: null,
          uso: {
            respostas_em_audio: 12,
            falhas: 3,
            caracteres: 4321,
            custo_cents: 6.4815,
            sem_preco: 2,
            ultima_falha: {
              motivo: "sem_creditos",
              em: "2026-10-14T20:00:00Z",
              mensagem: "A conta do provedor de voz está sem créditos ou sem saldo. Recarregue lá e tente de novo.",
            },
          },
        }),
      },
    });
    montar();
    const uso = await screen.findByTestId("audio-uso");
    expect(uso).toHaveTextContent("12 respostas em áudio");
    expect(uso).toHaveTextContent(/4\.321 caracteres convertidos/);
    expect(uso).toHaveTextContent("US$ 0,0648");
    expect(uso).toHaveTextContent(/2 sem preço conhecido/);
    const falha = within(uso).getByTestId("audio-ultima-falha");
    expect(falha).toHaveTextContent(/Última falha em conversa real: A conta do provedor de voz está sem créditos/);
    expect(falha).toHaveTextContent(/Nessas conversas a resposta saiu em texto/);
  });

  it("sem falha nenhuma, o aviso não existe", async () => {
    montar();
    await screen.findByTestId("audio-uso");
    expect(screen.queryByTestId("audio-ultima-falha")).toBeNull();
  });
});

describe("remover a chave", () => {
  it("só aparece com chave gravada, e pede o provedor certo na URL", async () => {
    resposta = (c) =>
      c.metodo === "DELETE"
        ? { corpo: { data: { removida: true, ...estado() } } }
        : {
            corpo: {
              data: estado({
                chaves: {
                  openai_compativel: { configurada: true, ultimos4: "0001", atualizada_em: "x" },
                  elevenlabs: { configurada: false, ultimos4: null, atualizada_em: null },
                },
              }),
            },
          };
    montar();
    fireEvent.click(await screen.findByTestId("audio-remover"));
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "DELETE")!.url).toBe("/api/v1/ai/audio?provedor=openai_compativel");
  });

  it("sem chave gravada, o botão não existe", async () => {
    montar();
    await screen.findByTestId("audio-salvar");
    expect(screen.queryByTestId("audio-remover")).toBeNull();
  });
});

describe("a leitura falhou", () => {
  it("diz que não conseguiu ler — não finge um cartão vazio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    montar();
    expect(await screen.findByText(/Não consegui ler a configuração da resposta em áudio/)).toBeInTheDocument();
    expect(screen.queryByTestId("audio-salvar")).toBeNull();
  });
});
