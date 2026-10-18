import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buscarSeguroEmFluxo } from "./cliente";
import type { ResolvedorDeNomes } from "./cliente";

/**
 * O transporte EM FLUXO (issue #108): a resposta de um modelo é SSE, então o
 * corpo precisa chegar trecho a trecho — e a conexão continua presa ao endereço
 * julgado, como em `buscarSeguro`. Provado contra servidores HTTP reais em
 * 127.0.0.1, liberado pelo mesmo gancho `ipPermitido` que a instalação usa.
 */
const SO_LOOPBACK = { permitirHttp: true, ipPermitido: (ip: string) => ip === "127.0.0.1" };

type Servidor = { porta: number; url: string; acessos: () => number; fechar: () => Promise<void> };
const abertos: Servidor[] = [];

async function servidor(tratar: http.RequestListener): Promise<Servidor> {
  let acessos = 0;
  const srv = http.createServer((req, res) => {
    acessos += 1;
    tratar(req, res);
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const porta = (srv.address() as AddressInfo).port;
  const s: Servidor = {
    porta,
    url: `http://127.0.0.1:${porta}`,
    acessos: () => acessos,
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

const texto = (v: Uint8Array | undefined) => Buffer.from(v ?? []).toString();

async function lerTudo(corpo: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!corpo) return "";
  const leitor = corpo.getReader();
  const partes: Buffer[] = [];
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    partes.push(Buffer.from(value));
  }
  return Buffer.concat(partes).toString();
}

function dns(tabela: Record<string, string[]>): ResolvedorDeNomes {
  return async (nome: string) => {
    const enderecos = tabela[nome];
    if (!enderecos) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return enderecos.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
}

describe("buscarSeguroEmFluxo — o corpo chega em fluxo", () => {
  it("entrega o primeiro trecho SSE antes de o servidor terminar a resposta", async () => {
    let encerrar!: () => void;
    const s = await servidor((_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: 1\n\n");
      encerrar = () => res.end("data: 2\n\n");
    });

    const r = await buscarSeguroEmFluxo(s.url, SO_LOOPBACK);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("text/event-stream");

    const leitor = r.corpo!.getReader();
    // O servidor NÃO terminou: se o corpo fosse bufferizado, esta leitura travaria.
    expect(texto((await leitor.read()).value)).toBe("data: 1\n\n");

    encerrar();
    expect(texto((await leitor.read()).value)).toBe("data: 2\n\n");
    expect((await leitor.read()).done).toBe(true);
  });

  it("envia método, cabeçalhos e corpo informados", async () => {
    let visto: unknown;
    const s = await servidor((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (p: Buffer) => partes.push(p));
      req.on("end", () => {
        visto = { metodo: req.method, tipo: req.headers["content-type"], corpo: Buffer.concat(partes).toString() };
        res.end("ok");
      });
    });
    const r = await buscarSeguroEmFluxo(s.url, {
      ...SO_LOOPBACK,
      metodo: "POST",
      headers: { "content-type": "application/json" },
      corpo: '{"a":1}',
    });
    await lerTudo(r.corpo);
    expect(visto).toEqual({ metodo: "POST", tipo: "application/json", corpo: '{"a":1}' });
  });
});

describe("buscarSeguroEmFluxo — a conexão fica presa ao endereço julgado", () => {
  it("rebinding entre a resolução e a conexão não alcança endereço interno", async () => {
    const s = await servidor((_req, res) => res.end("do endereço julgado"));
    // Primeira resposta do DNS: o loopback autorizado. Qualquer resolução depois
    // dela devolveria o metadata de nuvem — que o socket tentaria alcançar se a
    // conexão resolvesse o nome por conta própria (TTL zero).
    let chamadas = 0;
    const resolver: ResolvedorDeNomes = async () => {
      chamadas += 1;
      return [{ address: chamadas === 1 ? "127.0.0.1" : "169.254.169.254", family: 4 }];
    };
    const r = await buscarSeguroEmFluxo(`http://troca.exemplo.test:${s.porta}/x`, { ...SO_LOOPBACK, resolver });
    expect(await lerTudo(r.corpo)).toBe("do endereço julgado");
    expect(chamadas).toBe(1);
    expect(s.acessos()).toBe(1);
  });

  it.each([
    ["IPv4 privado", "https://10.0.0.5/x", "unsafe_url:private_host"],
    ["metadata de nuvem", "https://169.254.169.254/latest/meta-data", "unsafe_url:private_host"],
    ["loopback sem válvula", "https://127.0.0.1/x", "unsafe_url:private_host"],
    ["IPv6 literal", "https://[::1]/x", "unsafe_url:ipv6_literal"],
    ["esquema que não é http", "file:///etc/passwd", "unsafe_url:scheme"],
    ["http sem permissão", "http://exemplo.test/x", "unsafe_url:https_required"],
  ])("recusa antes de abrir conexão: %s", async (_rotulo, url, codigo) => {
    await expect(buscarSeguroEmFluxo(url, { resolver: dns({ "exemplo.test": ["8.8.8.8"] }) })).rejects.toThrow(codigo);
  });

  it("recusa o nome que resolve para IP privado, e o conjunto inteiro se UM endereço for especial", async () => {
    await expect(
      buscarSeguroEmFluxo("https://interno.exemplo.test/x", { resolver: dns({ "interno.exemplo.test": ["10.0.0.9"] }) }),
    ).rejects.toThrow("unsafe_url:private_ip");
    await expect(
      buscarSeguroEmFluxo("http://misto.exemplo.test/x", {
        ...SO_LOOPBACK,
        resolver: dns({ "misto.exemplo.test": ["127.0.0.1", "10.0.0.9"] }),
      }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });

  it("não segue redirecionamento por padrão: devolve o 3xx, sem tocar o destino", async () => {
    const alvo = await servidor((_req, res) => res.end("alcançado"));
    const s = await servidor((_req, res) => {
      res.writeHead(307, { location: `${alvo.url}/x` });
      res.end();
    });
    const r = await buscarSeguroEmFluxo(s.url, SO_LOOPBACK);
    expect(r.status).toBe(307);
    expect(alvo.acessos()).toBe(0);
  });
});

describe("buscarSeguroEmFluxo — limites", () => {
  it("corta o corpo no teto de bytes e derruba a conexão", async () => {
    let conexaoCaiu = false;
    const s = await servidor((req, res) => {
      req.socket.once("close", () => (conexaoCaiu = true));
      res.writeHead(200);
      const bombear = () => {
        if (res.destroyed) return;
        res.write(Buffer.alloc(32 * 1024, 65), bombear);
      };
      bombear();
    });
    const r = await buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, maxBytes: 100_000 });
    expect(r.status).toBe(200);
    await expect(lerTudo(r.corpo)).rejects.toThrow("net:response_too_large");
    await vi.waitFor(() => expect(conexaoCaiu).toBe(true));
  });

  it("recusa de antemão a resposta que ANUNCIA mais que o teto", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200, { "content-length": String(50 * 1024 * 1024) });
      res.write("x");
    });
    await expect(buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, maxBytes: 1024 })).rejects.toThrow("net:response_too_large");
  });

  it("estoura o prazo dos cabeçalhos quando o servidor aceita a conexão e nunca responde", async () => {
    const s = await servidor(() => undefined);
    await expect(buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, timeoutMs: 150 })).rejects.toThrow("net:timeout");
  });

  it("o prazo dos cabeçalhos NÃO limita a duração do corpo: uma geração longa e contínua termina", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200);
      res.write("t0;");
      let n = 1;
      const t = setInterval(() => {
        res.write(`t${n++};`);
        if (n === 6) {
          clearInterval(t);
          res.end();
        }
      }, 80);
    });
    const r = await buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, timeoutMs: 150, timeoutEntreTrechosMs: 1_000 });
    expect(await lerTudo(r.corpo)).toBe("t0;t1;t2;t3;t4;t5;");
  });

  it("derruba o fluxo quando o servidor fica calado entre dois trechos", async () => {
    let conexaoCaiu = false;
    const s = await servidor((req, res) => {
      req.socket.once("close", () => (conexaoCaiu = true));
      res.writeHead(200);
      res.write("começou;");
    });
    const r = await buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, timeoutEntreTrechosMs: 150 });
    const leitor = r.corpo!.getReader();
    expect(texto((await leitor.read()).value)).toBe("começou;");
    await expect(leitor.read()).rejects.toThrow("net:timeout");
    await vi.waitFor(() => expect(conexaoCaiu).toBe(true));
  });

  it("o cancelamento de quem chamou vale durante a leitura do corpo", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200);
      res.write("começou;");
    });
    const cancelar = new AbortController();
    const r = await buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, signal: cancelar.signal });
    const leitor = r.corpo!.getReader();
    expect(texto((await leitor.read()).value)).toBe("começou;");
    cancelar.abort();
    await expect(leitor.read()).rejects.toThrow("net:aborted");
  });

  it("cancelar a leitura (reader.cancel) derruba a conexão", async () => {
    let conexaoCaiu = false;
    const s = await servidor((req, res) => {
      req.socket.once("close", () => (conexaoCaiu = true));
      res.writeHead(200);
      res.write("começou;");
    });
    const r = await buscarSeguroEmFluxo(s.url, SO_LOOPBACK);
    const leitor = r.corpo!.getReader();
    await leitor.read();
    await leitor.cancel();
    await vi.waitFor(() => expect(conexaoCaiu).toBe(true));
  });
});

describe("buscarSeguroEmFluxo — o que o fetch fazia e o http cru não", () => {
  it("decodifica gzip e entrega cabeçalhos coerentes com o corpo decodificado", async () => {
    const s = await servidor((_req, res) => {
      const comprimido = gzipSync("data: ola\n\n");
      res.writeHead(200, { "content-encoding": "gzip", "content-length": String(comprimido.length) });
      res.end(comprimido);
    });
    const r = await buscarSeguroEmFluxo(s.url, SO_LOOPBACK);
    expect(await lerTudo(r.corpo)).toBe("data: ola\n\n");
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.headers["content-length"]).toBeUndefined();
  });

  it("o teto de bytes vale sobre o corpo decodificado (bomba de descompressão)", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200, { "content-encoding": "gzip" });
      res.end(gzipSync(Buffer.alloc(5 * 1024 * 1024, 65)));
    });
    const r = await buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, maxBytes: 100_000 });
    await expect(lerTudo(r.corpo)).rejects.toThrow("net:response_too_large");
  });

  it("204 e HEAD voltam sem corpo", async () => {
    const s = await servidor((req, res) => {
      res.writeHead(req.method === "HEAD" ? 200 : 204);
      res.end();
    });
    expect((await buscarSeguroEmFluxo(s.url, SO_LOOPBACK)).corpo).toBeNull();
    expect((await buscarSeguroEmFluxo(s.url, { ...SO_LOOPBACK, metodo: "HEAD" })).corpo).toBeNull();
  });
});
