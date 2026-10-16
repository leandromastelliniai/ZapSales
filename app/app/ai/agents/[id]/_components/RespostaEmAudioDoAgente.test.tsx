/**
 * "Resposta em áudio" no editor do agente.
 *
 * O dono abre o editor de um agente numa instalação que pode NÃO ter o recurso:
 * a tela precisa dizer por que (e levar a Provedores), deixar o interruptor
 * funcionar mesmo assim (preparar o agente e ligar a organização depois), e,
 * com a ElevenLabs, mostrar a lista de vozes da conta do cliente. Em número
 * conectado por QR code, avisa do risco de banimento — por CAPACIDADE do canal.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

import { RespostaEmAudioDoAgente, type ValorDaRespostaEmAudio } from "./RespostaEmAudioDoAgente";

// O Radix Select abre o painel com APIs que o jsdom não tem (rolar até a opção,
// capturar o ponteiro). Sem estes dois, o clique no gatilho lança fora do teste.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

function org(sobre: Record<string, unknown> = {}) {
  return {
    config: { provedor: "openai_compativel", voz: null, modelo: null, limite_de_caracteres: 1000 },
    disponivel: false,
    por_que_indisponivel: "desligado",
    ...sobre,
  };
}

let respostas: Record<string, { status?: number; corpo: unknown }>;
let urls: string[];

beforeEach(() => {
  urls = [];
  respostas = { "/api/v1/ai/audio": { corpo: { data: org() } } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const r = respostas[url.split("?")[0]!] ?? { status: 404, corpo: {} };
      return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Pai({ inicial, risco = false, aoMudar }: { inicial?: Partial<ValorDaRespostaEmAudio>; risco?: boolean; aoMudar?: (v: ValorDaRespostaEmAudio) => void }) {
  const [v, setV] = useState<ValorDaRespostaEmAudio>({ enabled: false, voiceId: null, modelId: null, ...inicial });
  return (
    <IdiomaProvider locale="pt-BR">
      <RespostaEmAudioDoAgente
        value={v}
        onChange={(n) => {
          setV(n);
          aoMudar?.(n);
        }}
        riscoDeBanimento={risco}
      />
    </IdiomaProvider>
  );
}

describe("o interruptor do agente", () => {
  it("vem DESLIGADO por padrão, e liga mesmo com a organização sem o recurso (o dono prepara e liga depois)", async () => {
    const mudancas: ValorDaRespostaEmAudio[] = [];
    render(<Pai aoMudar={(v) => mudancas.push(v)} />);
    const sw = screen.getByTestId("audio-reply-enabled");
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(mudancas.at(-1)).toEqual({ enabled: true, voiceId: null, modelId: null });
  });
});

describe("organização sem o recurso", () => {
  it.each([
    ["desligado", /desligada na organização/],
    ["sem_aceite", /ainda não foi aceita por um administrador/],
    ["sem_chave", /Falta gravar a chave do provedor de voz/],
  ])("diz por que não está disponível (%s) e leva a Provedores", async (motivo, texto) => {
    respostas["/api/v1/ai/audio"] = { corpo: { data: org({ por_que_indisponivel: motivo }) } };
    render(<Pai />);
    const caixa = await screen.findByTestId("audio-reply-indisponivel");
    expect(caixa).toHaveTextContent(texto);
    expect(screen.getByRole("link", { name: "Abrir Provedores" })).toHaveAttribute("href", "/app/ai/providers");
  });

  it("não consegue consultar a organização: diz isso, em vez de calar", async () => {
    respostas["/api/v1/ai/audio"] = { status: 500, corpo: {} };
    render(<Pai />);
    expect(await screen.findByTestId("audio-reply-estado")).toHaveTextContent(/Não consegui consultar o provedor de voz/);
  });

  it("não pede a lista de vozes enquanto a organização não tem o recurso", async () => {
    render(<Pai inicial={{ enabled: true }} />);
    await screen.findByTestId("audio-reply-indisponivel");
    expect(urls.some((u) => u.includes("/vozes"))).toBe(false);
  });
});

describe("organização com o recurso", () => {
  it("compatível com a OpenAI: a voz e o modelo são os da organização, sem seletor no agente", async () => {
    respostas["/api/v1/ai/audio"] = { corpo: { data: org({ disponivel: true, por_que_indisponivel: null }) } };
    render(<Pai inicial={{ enabled: true }} />);
    expect(await screen.findByTestId("audio-reply-estado")).toHaveTextContent(/Compatível com a OpenAI/);
    expect(screen.getByTestId("audio-reply-estado")).toHaveTextContent(/Respostas com mais de 1000 caracteres saem como texto/);
    expect(screen.getByText(/A voz e o modelo são os da organização/)).toBeInTheDocument();
    expect(screen.queryByTestId("audio-reply-voz")).toBeNull();
    expect(urls.some((u) => u.includes("/vozes"))).toBe(false);
  });

  it("ElevenLabs: lista as vozes da conta do cliente e grava a escolhida", async () => {
    respostas["/api/v1/ai/audio"] = {
      corpo: { data: org({ disponivel: true, por_que_indisponivel: null, config: { provedor: "elevenlabs", voz: null, modelo: null, limite_de_caracteres: 600 } }) },
    };
    respostas["/api/v1/ai/audio/vozes"] = {
      corpo: {
        data: {
          ok: true,
          disponivel: true,
          vozes: [
            { id: "v1", nome: "Rachel", categoria: "premade", descricao: "american · young" },
            { id: "v2", nome: "Voz da Loja", categoria: "cloned", descricao: null },
          ],
        },
      },
    };
    const mudancas: ValorDaRespostaEmAudio[] = [];
    render(<Pai inicial={{ enabled: true }} aoMudar={(v) => mudancas.push(v)} />);
    const gatilho = await screen.findByTestId("audio-reply-voz");
    expect(screen.getByText(/Sem voz escolhida, este agente responde em texto/)).toBeInTheDocument();
    fireEvent.click(gatilho);
    expect(await screen.findByRole("option", { name: "Rachel — american · young" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Voz da Loja" }));
    expect(mudancas.at(-1)).toMatchObject({ voiceId: "v2" });
    expect(urls).toContain("/api/v1/ai/audio/vozes?provedor=elevenlabs");
  });

  it("ElevenLabs com a chave recusada: mostra a frase no lugar da lista", async () => {
    respostas["/api/v1/ai/audio"] = {
      corpo: { data: org({ disponivel: true, por_que_indisponivel: null, config: { provedor: "elevenlabs", voz: null, modelo: null, limite_de_caracteres: 600 } }) },
    };
    respostas["/api/v1/ai/audio/vozes"] = {
      corpo: { data: { ok: false, motivo: "chave_invalida", mensagem: "O provedor de voz recusou a chave. Confira se ela está inteira e se é a chave deste provedor." } },
    };
    render(<Pai inicial={{ enabled: true }} />);
    expect(await screen.findByTestId("audio-reply-vozes-erro")).toHaveTextContent(/recusou a chave/);
    expect(screen.queryByTestId("audio-reply-voz")).toBeNull();
  });

  it("uma voz que saiu da conta continua visível (não some do campo em silêncio)", async () => {
    respostas["/api/v1/ai/audio"] = {
      corpo: { data: org({ disponivel: true, por_que_indisponivel: null, config: { provedor: "elevenlabs", voz: null, modelo: null, limite_de_caracteres: 600 } }) },
    };
    respostas["/api/v1/ai/audio/vozes"] = { corpo: { data: { ok: true, disponivel: true, vozes: [{ id: "v1", nome: "Rachel", categoria: null, descricao: null }] } } };
    render(<Pai inicial={{ enabled: true, voiceId: "apagada" }} />);
    const gatilho = await screen.findByTestId("audio-reply-voz");
    await waitFor(() => expect(gatilho).toHaveTextContent("Voz que não está mais na sua conta"));
  });

  it("o modelo de voz oferece os da ElevenLabs e o padrão da organização", async () => {
    respostas["/api/v1/ai/audio"] = {
      corpo: { data: org({ disponivel: true, por_que_indisponivel: null, config: { provedor: "elevenlabs", voz: null, modelo: null, limite_de_caracteres: 600 } }) },
    };
    respostas["/api/v1/ai/audio/vozes"] = { corpo: { data: { ok: true, disponivel: true, vozes: [] } } };
    const mudancas: ValorDaRespostaEmAudio[] = [];
    render(<Pai inicial={{ enabled: true }} aoMudar={(v) => mudancas.push(v)} />);
    fireEvent.click(await screen.findByTestId("audio-reply-modelo"));
    expect(await screen.findByRole("option", { name: "Padrão da organização" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Multilíngue v2 (melhor qualidade)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Turbo v2.5 (mais rápido)" }));
    expect(mudancas.at(-1)).toMatchObject({ modelId: "eleven_turbo_v2_5" });
  });
});

describe("risco de banimento (número por QR code)", () => {
  it("avisa quando o agente liga a opção num número com risco", async () => {
    render(<Pai inicial={{ enabled: true }} risco />);
    expect(screen.getByTestId("audio-reply-risco-de-banimento")).toHaveTextContent(/conectado por QR code/);
    expect(screen.getByTestId("audio-reply-risco-de-banimento")).toHaveTextContent(/aumentam esse risco/);
  });

  it("sem risco no canal, ou com a opção desligada, não há aviso", async () => {
    const semRisco = render(<Pai inicial={{ enabled: true }} risco={false} />);
    expect(screen.queryByTestId("audio-reply-risco-de-banimento")).toBeNull();
    semRisco.unmount();
    render(<Pai inicial={{ enabled: false }} risco />);
    expect(screen.queryByTestId("audio-reply-risco-de-banimento")).toBeNull();
  });
});
