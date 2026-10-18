// @vitest-environment node
import * as http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { fetchSeguro } from "./fetch";

/**
 * O `fetch` da rede segura (issue #108): o que o SDK de modelos recebe no lugar
 * do `fetch` global. Entra o que o SDK passa (string, `URL`, `Request`; corpo em
 * string, bytes ou `FormData`), sai um `Response` padrão cujo corpo chega em
 * fluxo — e o transporte por baixo é `buscarSeguroEmFluxo`, com a conexão presa
 * ao endereço julgado. Servidores HTTP reais em 127.0.0.1, liberados pelo gancho
 * `ipPermitido` que a instalação usa.
 */
const SO_LOOPBACK = { permitirHttp: true, ipPermitido: (ip: string) => ip === "127.0.0.1" };

type Servidor = { url: string; fechar: () => Promise<void> };
const abertos: Servidor[] = [];

async function servidor(tratar: http.RequestListener): Promise<Servidor> {
  const srv = http.createServer(tratar);
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const s: Servidor = {
    url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
    fechar: () =>
      new Promise<void>((ok) => {
        srv.closeAllConnections();
        srv.close(() => ok());
      }),
  };
  abertos.push(s);
  return s;
}

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((s) => s.fechar()));
});

type Visto = { metodo?: string; headers: http.IncomingHttpHeaders; corpo: string };

/** Servidor que ecoa o que recebeu, para provar o que o adaptador mandou. */
async function ecoador(): Promise<{ s: Servidor; visto: () => Visto }> {
  let visto: Visto | undefined;
  const s = await servidor((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (p: Buffer) => partes.push(p));
    req.on("end", () => {
      visto = { metodo: req.method, headers: req.headers, corpo: Buffer.concat(partes).toString() };
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    });
  });
  return { s, visto: () => visto! };
}

describe("fetchSeguro — o que o SDK passa", () => {
  it("string + corpo JSON: o método, os cabeçalhos e o corpo chegam, e o Response é padrão", async () => {
    const { s, visto } = await ecoador();
    const f = fetchSeguro(SO_LOOPBACK);

    const res = await f(`${s.url}/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: "Bearer sk-x", "content-type": "application/json" },
      body: JSON.stringify({ model: "m" }),
    });

    expect(res).toBeInstanceOf(Response);
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true });
    expect(visto().metodo).toBe("POST");
    expect(visto().headers.authorization).toBe("Bearer sk-x");
    expect(visto().corpo).toBe('{"model":"m"}');
  });

  it("Request como entrada: método, cabeçalhos e corpo vêm do Request", async () => {
    const { s, visto } = await ecoador();
    const f = fetchSeguro(SO_LOOPBACK);

    const res = await f(
      new Request(`${s.url}/x`, {
        method: "PUT",
        headers: { "x-chave": "1", "content-type": "application/json" },
        body: '{"a":1}',
      }),
    );

    expect(res.status).toBe(200);
    expect(visto().metodo).toBe("PUT");
    expect(visto().headers["x-chave"]).toBe("1");
    expect(visto().corpo).toBe('{"a":1}');
  });

  it("URL como entrada e corpo em bytes", async () => {
    const { s, visto } = await ecoador();
    const f = fetchSeguro(SO_LOOPBACK);

    await f(new URL(`${s.url}/x`), { method: "POST", body: new Uint8Array([104, 105]) });

    expect(visto().corpo).toBe("hi");
  });

  it("FormData como corpo: vai como multipart com a fronteira no Content-Type", async () => {
    const { s, visto } = await ecoador();
    const f = fetchSeguro(SO_LOOPBACK);
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob(["audio"], { type: "audio/mpeg" }), "a.mp3");

    await f(`${s.url}/audio/transcriptions`, { method: "POST", body: form });

    expect(visto().headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(visto().corpo).toContain('name="model"');
    expect(visto().corpo).toContain("whisper-1");
    expect(visto().corpo).toContain('filename="a.mp3"');
  });
});

describe("fetchSeguro — o que sai", () => {
  it("o corpo da resposta chega em fluxo: o primeiro trecho SSE sai antes de o servidor terminar", async () => {
    let encerrar!: () => void;
    const s = await servidor((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: 1\n\n");
      encerrar = () => res.end("data: 2\n\n");
    });
    const res = await fetchSeguro(SO_LOOPBACK)(s.url);

    const leitor = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    expect((await leitor.read()).value).toBe("data: 1\n\n");
    encerrar();
    expect((await leitor.read()).value).toBe("data: 2\n\n");
    expect((await leitor.read()).done).toBe(true);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  it("status sem corpo vira Response sem corpo, e o 4xx do provedor chega como Response (não como exceção)", async () => {
    const s = await servidor((req, res) => {
      if (req.url === "/vazio") {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(429, { "retry-after": "3" });
        res.end('{"error":"limite"}');
      }
    });
    const f = fetchSeguro(SO_LOOPBACK);

    const vazio = await f(`${s.url}/vazio`);
    expect(vazio.status).toBe(204);
    expect(vazio.body).toBeNull();

    const limite = await f(`${s.url}/x`);
    expect(limite.status).toBe(429);
    expect(limite.headers.get("retry-after")).toBe("3");
    expect(await limite.json()).toEqual({ error: "limite" });
  });

  it("não segue redirecionamento: devolve o 3xx e não toca o destino", async () => {
    let alcancado = false;
    const alvo = await servidor((_req, res) => {
      alcancado = true;
      res.end("x");
    });
    const s = await servidor((_req, res) => {
      res.writeHead(302, { location: `${alvo.url}/x` });
      res.end();
    });

    const res = await fetchSeguro(SO_LOOPBACK)(s.url);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${alvo.url}/x`);
    expect(alcancado).toBe(false);
  });

  it("o AbortSignal do SDK cancela a chamada em curso", async () => {
    const s = await servidor(() => undefined);
    const cancelar = new AbortController();
    const pendente = fetchSeguro(SO_LOOPBACK)(s.url, { signal: cancelar.signal });
    cancelar.abort();
    await expect(pendente).rejects.toThrow();
  });
});

describe("fetchSeguro — a política continua sendo a da rede segura", () => {
  it.each([
    ["IPv4 privado", "https://10.0.0.5/v1/chat/completions", "unsafe_url:private_host"],
    ["metadata de nuvem", "https://169.254.169.254/latest", "unsafe_url:private_host"],
    ["loopback", "https://127.0.0.1/v1", "unsafe_url:private_host"],
    ["http em produção", "http://gateway.exemplo.test/v1", "unsafe_url:https_required"],
  ])("recusa %s com o código da política, antes de qualquer pacote", async (_rotulo, url, codigo) => {
    await expect(fetchSeguro()(url, { method: "POST", body: "{}" })).rejects.toThrow(codigo);
  });

  it("rebinding: a conexão usa o endereço julgado, não uma segunda resolução", async () => {
    const { s } = await ecoador();
    const porta = new URL(s.url).port;
    let chamadas = 0;
    const f = fetchSeguro({
      ...SO_LOOPBACK,
      resolver: async () => {
        chamadas += 1;
        return [{ address: chamadas === 1 ? "127.0.0.1" : "169.254.169.254", family: 4 }];
      },
    });

    const res = await f(`http://troca.exemplo.test:${porta}/x`);

    expect(res.status).toBe(200);
    expect(chamadas).toBe(1);
  });
});
