/**
 * Os dois provedores de voz contra um servidor HTTP DE VERDADE (porta efêmera
 * em 127.0.0.1) — não contra um `fetch` dublê. O que precisa ser provado é o que
 * sai pela rede (rota, cabeçalho, corpo, chave fora da URL) e como cada resposta
 * do provedor vira um motivo que o dono do negócio entende; um dublê de `fetch`
 * não estressa nem o formato da requisição nem a proteção de endereço.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ErroDeVoz } from "../tipos";

import { classificarFalhaHttp, semAChave } from "./http";
import { criarProvedorDeVoz } from "./index";
import { criarProvedorElevenLabs } from "./elevenlabs";
import { criarProvedorOpenaiCompativel, urlDaFala } from "./openai-compativel";

interface Visto {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  corpo: string;
}

const MP3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0x21, 0xff, 0xfb, 0x90, 0x00]);
const CHAVE = "chave-de-teste-123456";

let servidor: http.Server;
let base: string;
const vistos: Visto[] = [];
type Resposta = { status: number; tipo?: string; corpo: Buffer | string; atrasoMs?: number };
let proxima: Resposta = { status: 200, tipo: "audio/mpeg", corpo: MP3 };

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    const pedaços: Buffer[] = [];
    req.on("data", (c: Buffer) => pedaços.push(c));
    req.on("end", () => {
      vistos.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        corpo: Buffer.concat(pedaços).toString("utf8"),
      });
      const r = proxima;
      const responder = () => {
        res.writeHead(r.status, { "content-type": r.tipo ?? "application/json" });
        res.end(r.corpo);
      };
      if (r.atrasoMs) setTimeout(responder, r.atrasoMs);
      else responder();
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

beforeEach(() => {
  vistos.length = 0;
  proxima = { status: 200, tipo: "audio/mpeg", corpo: MP3 };
});

/** O `fetch` simples: aqui a proteção de endereço de ORGANIZAÇÃO fica de fora (é provada à parte, abaixo). */
const direto = fetch;

async function motivoDe(promessa: Promise<unknown>) {
  try {
    await promessa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErroDeVoz);
    return e as ErroDeVoz;
  }
  throw new Error("deveria ter lançado");
}

describe("provedor compatível com a API de fala da OpenAI", () => {
  const criar = (extra: Partial<Parameters<typeof criarProvedorOpenaiCompativel>[0]> = {}) =>
    criarProvedorOpenaiCompativel({ chave: CHAVE, endereco: `${base}/v1`, fetch: direto, ...extra });

  it("manda o pedido no contrato da OpenAI e devolve o áudio", async () => {
    const audio = await criar().sintetizar({ texto: "Olá, tudo bem?", voz: null, modelo: null });
    expect(audio.mime).toBe("audio/mpeg");
    expect(audio.bytes.equals(MP3)).toBe(true);

    expect(vistos).toHaveLength(1);
    const v = vistos[0]!;
    expect(v.method).toBe("POST");
    expect(v.url).toBe("/v1/audio/speech");
    expect(JSON.parse(v.corpo)).toEqual({
      model: "tts-1",
      voice: "alloy",
      input: "Olá, tudo bem?",
      response_format: "mp3",
    });
  });

  it("a chave vai no cabeçalho Authorization — nunca na URL", async () => {
    await criar().sintetizar({ texto: "oi", voz: null, modelo: null });
    const v = vistos[0]!;
    expect(v.headers.authorization).toBe(`Bearer ${CHAVE}`);
    expect(v.url).not.toContain(CHAVE);
  });

  it("modelo e voz do agente vencem os padrões da organização, que vencem os do produto", async () => {
    const p = criar({ modeloPadrao: "tts-1-hd", vozPadrao: "nova" });
    await p.sintetizar({ texto: "a", voz: null, modelo: null });
    await p.sintetizar({ texto: "b", voz: "onyx", modelo: "gpt-4o-mini-tts" });
    expect(JSON.parse(vistos[0]!.corpo)).toMatchObject({ model: "tts-1-hd", voice: "nova" });
    expect(JSON.parse(vistos[1]!.corpo)).toMatchObject({ model: "gpt-4o-mini-tts", voice: "onyx" });
  });

  it("chave recusada (401) é chave_invalida, com o status do provedor", async () => {
    proxima = { status: 401, corpo: JSON.stringify({ error: { message: "Incorrect API key provided" } }) };
    const e = await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }));
    expect(e.motivo).toBe("chave_invalida");
    expect(e.status).toBe(401);
  });

  it("429 por falta de saldo é sem_creditos; 429 por excesso de pedidos é limite_de_uso", async () => {
    proxima = { status: 429, corpo: JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }) };
    expect((await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }))).motivo).toBe("sem_creditos");
    proxima = { status: 429, corpo: JSON.stringify({ error: { message: "Rate limit reached" } }) };
    expect((await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }))).motivo).toBe("limite_de_uso");
  });

  it("402 é sem_creditos; 404 é voz_inexistente; 500 é indisponivel", async () => {
    for (const [status, esperado] of [
      [402, "sem_creditos"],
      [404, "voz_inexistente"],
      [503, "indisponivel"],
    ] as const) {
      proxima = { status, corpo: "{}" };
      expect((await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }))).motivo).toBe(esperado);
    }
  });

  it("resposta que não é áudio (uma página HTML, por exemplo) é resposta_invalida", async () => {
    proxima = { status: 200, tipo: "text/html", corpo: "<html>Bem-vindo</html>" };
    const e = await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }));
    expect(e.motivo).toBe("resposta_invalida");
  });

  it("corpo vazio com cabeçalho de áudio também é resposta_invalida", async () => {
    proxima = { status: 200, tipo: "audio/mpeg", corpo: Buffer.alloc(0) };
    expect((await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }))).motivo).toBe("resposta_invalida");
  });

  it("provedor que não responde no prazo é indisponivel", async () => {
    proxima = { status: 200, tipo: "audio/mpeg", corpo: MP3, atrasoMs: 400 };
    const e = await motivoDe(criar({ prazoMs: 60 }).sintetizar({ texto: "oi", voz: null, modelo: null }));
    expect(e.motivo).toBe("indisponivel");
  });

  it("4xx sem categoria própria é recusado, e o detalhe NUNCA carrega a chave", async () => {
    proxima = { status: 400, corpo: `input too long; token ${CHAVE} rejected` };
    const e = await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }));
    expect(e.motivo).toBe("recusado");
    expect(e.message).not.toContain(CHAVE);
    expect(e.message).toContain("***");
  });

  it("texto vazio nem sai pela rede", async () => {
    await motivoDe(criar().sintetizar({ texto: "   ", voz: null, modelo: null }));
    expect(vistos).toHaveLength(0);
  });

  it("a base é escolhida pela ORGANIZAÇÃO: endereço interno é recusado pela régua de destino, sem sair nenhum byte", async () => {
    // Sem injetar `fetch`: é o caminho de produção, com a proteção de organização.
    const p = criarProvedorOpenaiCompativel({ chave: CHAVE, endereco: `${base}/v1` });
    const e = await motivoDe(p.sintetizar({ texto: "oi", voz: null, modelo: null }));
    expect(e.motivo).toBe("endereco_recusado");
    expect(vistos).toHaveLength(0);
  });

  it("monta a URL da fala sem barra duplicada e com a OpenAI como padrão", () => {
    expect(urlDaFala(null)).toBe("https://api.openai.com/v1/audio/speech");
    expect(urlDaFala("https://voz.exemplo.com/v1///")).toBe("https://voz.exemplo.com/v1/audio/speech");
  });
});

describe("provedor ElevenLabs", () => {
  const criar = (extra: Partial<Parameters<typeof criarProvedorElevenLabs>[0]> = {}) =>
    criarProvedorElevenLabs({ chave: CHAVE, endereco: base, fetch: direto, ...extra });

  it("sintetiza na voz do agente, com a chave em xi-api-key e fora da URL", async () => {
    const audio = await criar().sintetizar({ texto: "Bom dia!", voz: "21m00Tcm4TlvDq8ikWAM", modelo: null });
    expect(audio.bytes.equals(MP3)).toBe(true);
    const v = vistos[0]!;
    expect(v.method).toBe("POST");
    expect(v.url).toBe("/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_64");
    expect(v.headers["xi-api-key"]).toBe(CHAVE);
    expect(v.url).not.toContain(CHAVE);
    expect(JSON.parse(v.corpo)).toEqual({ text: "Bom dia!", model_id: "eleven_multilingual_v2" });
  });

  it("o id da voz é escapado na rota (nada de ../ vindo do banco)", async () => {
    await criar().sintetizar({ texto: "oi", voz: "../v1/user", modelo: "eleven_turbo_v2_5" });
    expect(vistos[0]!.url.startsWith("/v1/text-to-speech/..%2Fv1%2Fuser?")).toBe(true);
    expect(JSON.parse(vistos[0]!.corpo).model_id).toBe("eleven_turbo_v2_5");
  });

  it("sem voz escolhida não há o que sintetizar: voz_inexistente, e nada sai pela rede", async () => {
    const e = await motivoDe(criar().sintetizar({ texto: "oi", voz: null, modelo: null }));
    expect(e.motivo).toBe("voz_inexistente");
    expect(vistos).toHaveLength(0);
  });

  it("a voz padrão da organização serve quando o agente não escolheu", async () => {
    await criar({ vozPadrao: "padrao-da-org" }).sintetizar({ texto: "oi", voz: null, modelo: null });
    expect(vistos[0]!.url).toContain("/v1/text-to-speech/padrao-da-org?");
  });

  it("o MESMO 401 vira motivos diferentes: chave inválida x cota esgotada", async () => {
    proxima = { status: 401, corpo: JSON.stringify({ detail: { status: "invalid_api_key", message: "Invalid API key" } }) };
    expect((await motivoDe(criar().sintetizar({ texto: "oi", voz: "v", modelo: null }))).motivo).toBe("chave_invalida");
    proxima = { status: 401, corpo: JSON.stringify({ detail: { status: "quota_exceeded", message: "You have 0 credits remaining" } }) };
    expect((await motivoDe(criar().sintetizar({ texto: "oi", voz: "v", modelo: null }))).motivo).toBe("sem_creditos");
  });

  it("voz que não existe na conta do cliente é voz_inexistente", async () => {
    proxima = { status: 404, corpo: JSON.stringify({ detail: { status: "voice_not_found" } }) };
    expect((await motivoDe(criar().sintetizar({ texto: "oi", voz: "fantasma", modelo: null }))).motivo).toBe("voz_inexistente");
  });

  it("lista as vozes da conta do cliente, normalizadas para a tela", async () => {
    proxima = {
      status: 200,
      corpo: JSON.stringify({
        voices: [
          { voice_id: "v1", name: "Rachel", category: "premade", labels: { accent: "american", age: "young" } },
          { voice_id: "v2", name: "Voz da Loja", category: "cloned", description: "  Clone da dona  " },
          { voice_id: "", name: "sem id" },
          { name: "sem id nenhum" },
        ],
      }),
    };
    const vozes = await criar().listarVozes!();
    expect(vozes).toEqual([
      { id: "v1", nome: "Rachel", categoria: "premade", descricao: "american · young" },
      { id: "v2", nome: "Voz da Loja", categoria: "cloned", descricao: "Clone da dona" },
    ]);
    expect(vistos[0]!.url).toBe("/v1/voices");
    expect(vistos[0]!.headers["xi-api-key"]).toBe(CHAVE);
  });

  it("chave inválida ao listar as vozes é chave_invalida (a tela mostra a frase certa)", async () => {
    proxima = { status: 401, corpo: JSON.stringify({ detail: { status: "invalid_api_key" } }) };
    expect((await motivoDe(criar().listarVozes!())).motivo).toBe("chave_invalida");
  });

  it("lista de vozes ausente na resposta é resposta_invalida", async () => {
    proxima = { status: 200, corpo: JSON.stringify({ outra: [] }) };
    expect((await motivoDe(criar().listarVozes!())).motivo).toBe("resposta_invalida");
  });
});

describe("a fábrica", () => {
  it("entrega o provedor certo para cada id do vocabulário", () => {
    const config = { endereco: null, modelo: null, voz: null };
    expect(criarProvedorDeVoz({ provedor: "openai_compativel", chave: CHAVE, config }).id).toBe("openai_compativel");
    const eleven = criarProvedorDeVoz({ provedor: "elevenlabs", chave: CHAVE, config });
    expect(eleven.id).toBe("elevenlabs");
    expect(typeof eleven.listarVozes).toBe("function");
  });
});

describe("classificarFalhaHttp", () => {
  it("o corpo vale mais que o status quando o provedor reaproveita o status", () => {
    expect(classificarFalhaHttp(401, "quota_exceeded")).toBe("sem_creditos");
    expect(classificarFalhaHttp(401, "invalid_api_key")).toBe("chave_invalida");
    expect(classificarFalhaHttp(429, "insufficient_quota")).toBe("sem_creditos");
    expect(classificarFalhaHttp(429, "slow down")).toBe("limite_de_uso");
    expect(classificarFalhaHttp(418, "")).toBe("recusado");
  });

  it("semAChave troca a chave por *** e ignora chave curta demais para ser chave", () => {
    expect(semAChave(`erro com ${CHAVE} aqui`, CHAVE)).toBe("erro com *** aqui");
    expect(semAChave("abc abc", "abc")).toBe("abc abc");
  });
});
