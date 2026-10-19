/**
 * O PROVEDOR PERSONALIZADO (#1642): endpoint do operador, compatível com OpenAI.
 *
 * Três coisas precisam ser verdadeiras ao mesmo tempo, e é isto que este
 * arquivo mede:
 *
 *  1. A tela OFERECE a opção (está em `PROVEDORES`, com o rótulo da issue) —
 *     e, sendo ela da lista, os testes de par já a cobram no registry, no
 *     seletor do agente e nos pontos de escrita.
 *  2. Sem ENDEREÇO nada é chamado. O provedor não tem endpoint canônico: cair
 *     no da OpenAI seria mandar a chave de um gateway privado para a OpenAI,
 *     silenciosamente. A recusa é medida nos dois caminhos (registry de
 *     produção e ensaio da aba Teste).
 *  3. O teste de CONECTIVIDADE antes de salvar diz o que falta: código certo,
 *     frase certa, e a rede só é consultada quando o endereço tem forma de URL.
 */
import * as http from "node:http";
import type { AddressInfo } from "node:net";

import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultRegistry } from "@/lib/agent-engine/edge/llm/providers";
import { buildModel } from "@/lib/ai/runtime/agent";
import { descreverErroDeValidacao } from "@/lib/ai/credenciais/erro-de-validacao";
import { validateCustomKey, validateProviderKey } from "@/lib/ai/provider-validators";
import { IDS_COM_CHAVE, PROVEDORES, PROVEDOR_POR_ID } from "@/lib/ai/pontos/provedores";
import { fetchParaDestinoDaOrganizacao } from "@/lib/automation/destinos-internos-autorizados";

// O DNS é controlado aqui: a régua de destino resolve o nome antes de a chave
// sair, e o teste não pode depender da rede de quem roda. Nome fora do mapa
// resolve para um IP público; os do mapa imitam um serviço do compose e um
// nome público que passou a apontar para dentro.
const dns = vi.hoisted(() => ({
  mapa: { db: "172.18.0.5", "virou-interno.exemplo": "10.0.0.7" } as Record<string, string>,
}));
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async (nome: string) => [{ address: dns.mapa[nome] ?? "93.184.216.34", family: 4 }]);
  return { lookup, default: { lookup } };
});

const registry = createDefaultRegistry();
const ENDERECO = "https://gateway.exemplo/v1";

// O loopback é exatamente o que a régua da organização recusa; os testes de
// conexão real o liberam pelo gancho `ipPermitido` de teste, e tudo o mais
// segue valendo. O nome (`gw.exemplo`) é o que a URL carrega: o transporte o
// resolve UMA vez, e aqui essa resolução aponta para o servidor do teste.
const LOOPBACK = {
  ipPermitido: (ip: string) => ip === "127.0.0.1",
  resolver: async () => [{ address: "127.0.0.1", family: 4 }],
};
const abertos: http.Server[] = [];
afterEach(() => {
  for (const srv of abertos.splice(0)) {
    srv.closeAllConnections();
    srv.close();
  }
});
async function subir(tratar: http.RequestListener): Promise<string> {
  const srv = http.createServer(tratar);
  abertos.push(srv);
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  return `http://gw.exemplo:${(srv.address() as AddressInfo).port}/v1`;
}

describe("a opção existe e é executável", () => {
  it("está na lista de quem tem chave, com o rótulo da issue", () => {
    expect(IDS_COM_CHAVE).toContain("custom");
    expect(PROVEDOR_POR_ID.get("custom")?.rotulo).toBe(
      "Provedor personalizado (compatível com OpenAI)",
    );
  });

  it("se declara compatível com endpoint próprio (é o que habilita o campo)", () => {
    const custom = PROVEDORES.find((p) => p.id === "custom");
    expect(custom?.aceitaEndpointProprio).toBe(true);
    // E aponta para documentação de verdade — o link "Onde pegar a chave" do
    // diálogo usa este campo, e ele não pode virar 404.
    expect(custom?.ondePegarAChave).toMatch(/^https:\/\//);
  });

  it("no registry: SEM endereço a chamada é recusada, COM endereço vira modelo", () => {
    expect(() => registry.custom!("chave", "gpt-x")).toThrow(/custom_provider_sem_base_url/);
    expect(registry.custom!("chave", "gpt-x", ENDERECO)).toBeDefined();
  });

  it("no ensaio (aba Teste), a mesma recusa — ensaio e produção concordam", () => {
    expect(() => buildModel("custom", "chave", "gpt-x")).toThrow(/custom_provider_sem_base_url/);
    expect(buildModel("custom", "chave", "gpt-x", ENDERECO)).toBeDefined();
  });
});

describe("o teste de conectividade antes de salvar", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sem base_url o código DIZ o que falta, sem consultar a rede", async () => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    expect(await validateProviderKey("custom", "sk-x")).toEqual({
      ok: false,
      error: "base_url_ausente",
    });
    expect(await validateCustomKey("sk-x", "   ")).toEqual({
      ok: false,
      error: "base_url_ausente",
    });
    expect(espiao).not.toHaveBeenCalled();
  });

  it("endereço fora de http(s) é recusado antes da rede também", async () => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    expect(await validateCustomKey("sk-x", "ftp://gw.exemplo")).toEqual({
      ok: false,
      error: "base_url_invalida",
    });
    expect(espiao).not.toHaveBeenCalled();
  });

  it("URL certa: barra final sai e a chamada é GET {base}/models com a chave", async () => {
    const vistos: { metodo?: string; url?: string; auth?: string }[] = [];
    const base = await subir((req, res) => {
      vistos.push({ metodo: req.method, url: req.url, auth: req.headers.authorization });
      res.end(JSON.stringify({ data: [{ id: "gpt-x" }, { id: "" }] }));
    });

    const r = await validateCustomKey("sk-certa", `${base}/`, LOOPBACK);
    expect(r).toEqual({ ok: true, models: ["gpt-x"] });

    expect(vistos).toEqual([{ metodo: "GET", url: "/v1/models", auth: "Bearer sk-certa" }]);
  });

  it("catálogo no formato { models: [{ id }] } também serve", async () => {
    const base = await subir((_req, res) => res.end(JSON.stringify({ models: [{ id: "m1" }] })));
    expect(await validateCustomKey("sk-x", base, LOOPBACK)).toEqual({ ok: true, models: ["m1"] });
  });

  it("chave recusada pelo endpoint → auth_failed_401 (a frase já existe)", async () => {
    const base = await subir((_req, res) => {
      res.writeHead(401);
      res.end();
    });
    expect(await validateCustomKey("sk-errada", base, LOOPBACK)).toEqual({
      ok: false,
      error: "auth_failed_401",
    });
  });

  it("sem /models → o erro aponta a BASE URL, e não a chave", async () => {
    const base = await subir((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    const r = await validateCustomKey("sk-x", base, LOOPBACK);
    expect(r).toEqual({ ok: false, error: "provider_status_404" });
    if (r.ok) throw new Error("esperava a falha do /models para descrever o erro");

    const descrito = descreverErroDeValidacao(r.error, "custom");
    expect(descrito.generico).toBe(false);
    expect(descrito.chaveErrada).toBe(false);
    expect(descrito.frase).toMatch(/base URL/);
  });

  it("endereço ausente também vira frase legível no cartão", () => {
    const descrito = descreverErroDeValidacao("base_url_ausente", "custom");
    expect(descrito.generico).toBe(false);
    expect(descrito.frase).toMatch(/base URL/);
  });
});

/**
 * A URL é escolhida pelo admin de UMA empresa e quem chama é o SERVIDOR. Sem a
 * régua de destino (`motivoDaRecusaDeDestino(…, "organizacao")`, decisão 22-d),
 * numa instalação com várias empresas uma delas sondaria a rede interna
 * (loopback, metadados de nuvem, serviços do compose) pelo teste de conexão e
 * pelo turno do agente, e mandaria a chave para lá.
 */
describe("o endereço da empresa não alcança a rede interna do servidor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ["loopback", "http://127.0.0.1:4000/v1"],
    ["localhost", "http://localhost/v1"],
    ["metadados de nuvem", "http://169.254.169.254/latest"],
    ["rede privada", "http://10.0.0.5/v1"],
    ["serviço do compose (nome que resolve para IP privado)", "http://db:5432"],
    ["nome público que passou a apontar para dentro", "https://virou-interno.exemplo/v1"],
    ["literal IPv6", "http://[::1]:4000/v1"],
  ])("teste de conexão recusa %s SEM chamar a rede", async (_rotulo, endereco) => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    const r = await validateCustomKey("sk-x", endereco);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/^unsafe_url:/);
    expect(espiao, "a chave saiu para a rede interna").not.toHaveBeenCalled();
    const descrito = descreverErroDeValidacao(r.error, "custom");
    expect(descrito.generico).toBe(false);
    expect(descrito.chaveErrada).toBe(false);
  });

  it("em produção, http:// é recusado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    expect(await validateCustomKey("sk-x", "http://gw.exemplo/v1")).toEqual({
      ok: false,
      error: "unsafe_url:https_required",
    });
    expect(espiao).not.toHaveBeenCalled();
  });

  it("rebinding no teste de conexão: a chave só sai para o endereço julgado, numa resolução só", async () => {
    let recebeu = 0;
    const base = await subir((_req, res) => {
      recebeu += 1;
      res.end(JSON.stringify({ data: [{ id: "gpt-x" }] }));
    });
    let resolucoes = 0;

    const r = await validateCustomKey("sk-x", base, {
      ipPermitido: LOOPBACK.ipPermitido,
      // 1ª resposta: o endereço julgado (o servidor do teste). Uma 2ª resolução,
      // se existisse, diria metadados de nuvem — e a chave iria para lá.
      resolver: async () => {
        resolucoes += 1;
        return [{ address: resolucoes === 1 ? "127.0.0.1" : "169.254.169.254", family: 4 }];
      },
    });

    expect(r).toEqual({ ok: true, models: ["gpt-x"] });
    expect(resolucoes, "uma resolução só: não há segunda janela").toBe(1);
    expect(recebeu).toBe(1);
  });

  it("redirect não é seguido: um 302 vira recusa, e o destino do redirect não é tocado", async () => {
    let alcancado = false;
    const alvo = await subir((_req, res) => {
      alcancado = true;
      res.end("{}");
    });
    const base = await subir((_req, res) => {
      res.writeHead(302, { location: `${alvo}/models` });
      res.end();
    });

    expect(await validateCustomKey("sk-x", base, LOOPBACK)).toEqual({
      ok: false,
      error: "unsafe_url:redirect_not_followed",
    });
    expect(alcancado, "a chave foi atrás do redirect").toBe(false);
  });

  it("endereço de rede interna: nem o servidor que lá estiver é tocado", async () => {
    // Sem o gancho de teste: o loopback é recusado pela régua da organização.
    let tocado = false;
    const base = await subir((_req, res) => {
      tocado = true;
      res.end("{}");
    });

    const r = await validateCustomKey("sk-x", base.replace("gw.exemplo", "127.0.0.1"));

    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^unsafe_url:/) });
    expect(tocado, "a chave saiu para a rede interna").toBe(false);
  });

  it("nome que não resolve vira a recusa que a tela já traduz", async () => {
    const r = await validateCustomKey("sk-x", "http://gw.exemplo:1/v1", {
      resolver: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(r).toEqual({ ok: false, error: "unsafe_url:dns_failed" });
  });

  it("provedor fora do ar: o código segue sendo o do erro de rede, como antes", async () => {
    const srv = http.createServer();
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
    const porta = (srv.address() as AddressInfo).port;
    await new Promise<void>((ok) => srv.close(() => ok()));

    expect(await validateCustomKey("sk-x", `http://gw.exemplo:${porta}/v1`, LOOPBACK)).toEqual({
      ok: false,
      error: "TypeError",
    });
  });

  it("prazo de 10 s: um provedor que não responde é cortado e a conexão é derrubada", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      let chegou!: () => void;
      const chegada = new Promise<void>((ok) => (chegou = ok));
      const base = await subir(() => chegou()); // aceita e nunca responde
      const pendente = validateCustomKey("sk-x", base, LOOPBACK);
      await chegada;

      await vi.advanceTimersByTimeAsync(10_000);

      expect(await pendente).toEqual({ ok: false, error: "AbortError" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("no turno do agente, cada chamada passa pela régua: nome que resolve para dentro é recusado", async () => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);
    const guardado = fetchParaDestinoDaOrganizacao();

    await expect(guardado("http://db/v1/chat/completions", { method: "POST" })).rejects.toThrow(
      "unsafe_url:private_ip",
    );
    await expect(guardado("http://virou-interno.exemplo/v1/chat/completions", { method: "POST" })).rejects.toThrow(
      "unsafe_url:private_ip",
    );
    expect(espiao, "o fetch global não é mais o transporte").not.toHaveBeenCalled();
  });

  describe("a conexão é do transporte seguro (#108), provada contra servidor real", () => {
    it("o 3xx não é seguido: vira recusa, e o destino do redirect não é tocado", async () => {
      let alcancado = false;
      const alvo = await subir((_req, res) => {
        alcancado = true;
        res.end("{}");
      });
      const base = await subir((_req, res) => {
        res.writeHead(307, { location: `${alvo}/x` });
        res.end();
      });

      await expect(
        fetchParaDestinoDaOrganizacao(undefined, LOOPBACK)(`${base}/chat/completions`, { method: "POST", body: "{}" }),
      ).rejects.toThrow("unsafe_url:redirect_not_followed");
      expect(alcancado).toBe(false);
    });

    it("quem envolve o transporte (a allowlist do motor de borda) recebe o transporte seguro, não o fetch global", async () => {
      const base = await subir((_req, res) => res.end('{"ok":1}'));
      const espiaoGlobal = vi.fn();
      vi.stubGlobal("fetch", espiaoGlobal);
      const vistos: string[] = [];

      const f = fetchParaDestinoDaOrganizacao(
        (transporte) => (input, init) => {
          vistos.push(String(input));
          return transporte(input, init);
        },
        LOOPBACK,
      );
      const res = await f(`${base}/models`);

      expect(await res.json()).toEqual({ ok: 1 });
      expect(vistos).toHaveLength(1);
      expect(espiaoGlobal).not.toHaveBeenCalled();
    });

    it("rebinding: o nome que resolve para público na checagem e para dentro na conexão não alcança o interno", async () => {
      const base = await subir((_req, res) => res.end("{}"));
      let resolucoes = 0;
      const f = fetchParaDestinoDaOrganizacao(undefined, {
        ipPermitido: LOOPBACK.ipPermitido,
        resolver: async () => {
          resolucoes += 1;
          return [{ address: resolucoes === 1 ? "127.0.0.1" : "169.254.169.254", family: 4 }];
        },
      });

      const res = await f(`${base}/models`);

      expect(res.status).toBe(200);
      expect(resolucoes, "uma resolução só: não há segunda janela").toBe(1);
    });

    it("provedor fora do ar: o SDK vê queda de rede (retentável) e a mensagem que o classificador de falhas reconhece", async () => {
      // Sobe um servidor só para saber uma porta livre e o fecha: a conexão é recusada.
      const srv = http.createServer();
      await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
      const base = `http://gw.exemplo:${(srv.address() as AddressInfo).port}/v1`;
      await new Promise<void>((ok) => srv.close(() => ok()));
      const modelo = createOpenAI({
        apiKey: "sk-x",
        baseURL: base,
        fetch: fetchParaDestinoDaOrganizacao(undefined, LOOPBACK),
      }).chat("gpt-x");

      const erro = await generateText({ model: modelo, prompt: "oi", maxRetries: 0 }).catch((e: unknown) => e);

      expect(APICallError.isInstance(erro)).toBe(true);
      expect((erro as APICallError).isRetryable).toBe(true);
      // `run-model-call.ts` classifica `provedor_indisponivel` por esta mensagem.
      expect((erro as APICallError).message).toMatch(/ECONNREFUSED|fetch failed|timeout|network/i);
    });

    it("a resposta SSE de um modelo chega em fluxo pelo SDK: o 1º trecho de texto sai antes de o servidor terminar", async () => {
      const trecho = (content: string, fim = false) =>
        `data: ${JSON.stringify({
          id: "c1",
          object: "chat.completion.chunk",
          created: 0,
          model: "gpt-x",
          choices: [{ index: 0, delta: fim ? {} : { role: "assistant", content }, finish_reason: fim ? "stop" : null }],
        })}\n\n`;
      let terminar!: () => void;
      const base = await subir((_req, res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(trecho("Olá"));
        terminar = () => res.end(trecho(" mundo") + trecho("", true) + "data: [DONE]\n\n");
      });
      const modelo = createOpenAI({
        apiKey: "sk-x",
        baseURL: base,
        fetch: fetchParaDestinoDaOrganizacao(undefined, LOOPBACK),
      }).chat("gpt-x");

      const { textStream } = streamText({ model: modelo, prompt: "oi", maxRetries: 0 });
      const leitor = textStream[Symbol.asyncIterator]();

      // O servidor NÃO terminou: com o corpo bufferizado esta leitura travaria.
      expect((await leitor.next()).value).toBe("Olá");
      terminar();
      let resto = "";
      for (let r = await leitor.next(); !r.done; r = await leitor.next()) resto += r.value;
      expect(resto).toBe(" mundo");
    });
  });

  it.each([
    ["registry do turno", () => registry.custom!("sk-x", "gpt-x", "http://127.0.0.1:4000/v1")],
    ["ensaio da aba Teste", () => buildModel("custom", "sk-x", "gpt-x", "http://127.0.0.1:4000/v1")],
  ])("o modelo do provedor personalizado usa a régua (%s)", async (_rotulo, montar) => {
    const espiao = vi.fn();
    vi.stubGlobal("fetch", espiao);

    await expect(generateText({ model: montar(), prompt: "oi", maxRetries: 0 })).rejects.toThrow(
      /unsafe_url:private_host/,
    );
    expect(espiao, "a chamada do modelo saiu para loopback").not.toHaveBeenCalled();
  });
});
