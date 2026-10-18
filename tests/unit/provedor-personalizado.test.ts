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
    const espiao = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-x" }, { id: "" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", espiao);

    const r = await validateCustomKey("sk-certa", "https://gw.exemplo/v1/");
    expect(r).toEqual({ ok: true, models: ["gpt-x"] });

    const [url, init] = espiao.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gw.exemplo/v1/models");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-certa");
  });

  it("chave recusada pelo endpoint → auth_failed_401 (a frase já existe)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    expect(await validateCustomKey("sk-errada", ENDERECO)).toEqual({
      ok: false,
      error: "auth_failed_401",
    });
  });

  it("sem /models → o erro aponta a BASE URL, e não a chave", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    const r = await validateCustomKey("sk-x", ENDERECO);
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

  it("redirect não é seguido: o fetch sai com redirect manual, e um 302 vira recusa", async () => {
    const espiao = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }));
    vi.stubGlobal("fetch", espiao);

    expect(await validateCustomKey("sk-x", ENDERECO)).toEqual({
      ok: false,
      error: "unsafe_url:redirect_not_followed",
    });
    const [, init] = espiao.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe("manual");
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
    // O loopback é exatamente o que a régua da organização recusa; o teste o
    // libera pelo gancho `ipPermitido` de teste, e tudo o mais segue valendo.
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
