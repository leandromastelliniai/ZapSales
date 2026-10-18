import * as http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { ResolvedorDeNomes } from "@/lib/net/rede-segura";

import { buscarImagemParaPdf } from "./imagem-para-pdf";

/**
 * Servidores HTTP REAIS em 127.0.0.1 — o egress de verdade, como em
 * `lib/net/rede-segura/cliente.test.ts`. O loopback é o que a política recusa,
 * então os casos felizes o liberam pelo mesmo gancho `ipPermitido` da instalação
 * e os hostis NÃO o liberam: aí a prova é o servidor ter recebido zero acessos.
 */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

const LIBERA_LOOPBACK = { permitirHttp: true, ipPermitido: (ip: string) => ip === "127.0.0.1" };
const SO_HTTP = { permitirHttp: true };

type Servidor = { url: string; acessos: () => number; fechar: () => Promise<void> };
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

function dns(tabela: Record<string, string[]>): ResolvedorDeNomes {
  return async (nome) => {
    const enderecos = tabela[nome];
    if (!enderecos) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return enderecos.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
}

function imagem(tipo: string, corpo: Buffer): http.RequestListener {
  return (_req, res) => {
    res.writeHead(200, { "content-type": tipo });
    res.end(corpo);
  };
}

describe("buscarImagemParaPdf — imagem pública segue igual", () => {
  it("PNG vira data URI com os mesmos bytes", async () => {
    const s = await servidor(imagem("image/png", PNG));
    const uri = await buscarImagemParaPdf(`${s.url}/logo.png`, { politica: LIBERA_LOOPBACK });
    expect(uri).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
  });

  it("JPEG vira data URI image/jpeg", async () => {
    const s = await servidor(imagem("image/jpeg", JPEG));
    const uri = await buscarImagemParaPdf(`${s.url}/foto.jpg`, { politica: LIBERA_LOOPBACK });
    expect(uri).toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);
  });

  it("segue o redirecionamento de CDN para outra imagem pública", async () => {
    const destino = await servidor(imagem("image/png", PNG));
    const origem = await servidor((_req, res) => {
      res.writeHead(302, { location: `${destino.url}/real.png` });
      res.end();
    });
    const uri = await buscarImagemParaPdf(`${origem.url}/atalho`, { politica: LIBERA_LOOPBACK });
    expect(uri).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
  });
});

describe("buscarImagemParaPdf — o que não é buscado", () => {
  it("nome que resolve para IP interno: null e nenhum acesso ao servidor", async () => {
    const s = await servidor(imagem("image/png", PNG));
    const porta = new URL(s.url).port;
    const uri = await buscarImagemParaPdf(`http://interno.exemplo.test:${porta}/x.png`, {
      politica: { ...SO_HTTP, resolver: dns({ "interno.exemplo.test": ["127.0.0.1"] }) },
    });
    expect(uri).toBeNull();
    expect(s.acessos()).toBe(0);
  });

  it("IP interno por extenso: null e nenhum acesso", async () => {
    const s = await servidor(imagem("image/png", PNG));
    expect(await buscarImagemParaPdf(`${s.url}/x.png`, { politica: SO_HTTP })).toBeNull();
    expect(s.acessos()).toBe(0);
  });

  it("redirecionamento para o endereço interno (metadata de nuvem): null, nada lá é buscado", async () => {
    const origem = await servidor((_req, res) => {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    });
    expect(await buscarImagemParaPdf(`${origem.url}/x.png`, { politica: LIBERA_LOOPBACK })).toBeNull();
    expect(origem.acessos()).toBe(1);
  });

  it("redirecionamento para um servidor que a política não libera: null, segundo servidor intocado", async () => {
    const interno = await servidor(imagem("image/png", PNG));
    // O nome do primeiro resolve para um IP liberado; o do segundo, não.
    const porta = new URL(interno.url).port;
    const origem = await servidor((_req, res) => {
      res.writeHead(302, { location: `http://interno.exemplo.test:${porta}/segredo.png` });
      res.end();
    });
    const uri = await buscarImagemParaPdf(`${origem.url}/x.png`, {
      politica: {
        permitirHttp: true,
        ipPermitido: (ip) => ip === "127.0.0.1",
        resolver: dns({ "interno.exemplo.test": ["10.0.0.9"] }),
      },
    });
    expect(uri).toBeNull();
    expect(interno.acessos()).toBe(0);
  });
});

describe("buscarImagemParaPdf — falha vira sem imagem, nunca exceção", () => {
  it("imagem maior que o teto: null", async () => {
    const s = await servidor(imagem("image/png", Buffer.concat([PNG, Buffer.alloc(4096)])));
    expect(await buscarImagemParaPdf(`${s.url}/g.png`, { politica: LIBERA_LOOPBACK, maxBytes: 1024 })).toBeNull();
  });

  it("imagem gigante sem Content-Length: derruba no teto e devolve null", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      const escrever = () => {
        if (!res.destroyed) res.write(Buffer.alloc(64 * 1024), escrever);
      };
      escrever();
    });
    expect(await buscarImagemParaPdf(`${s.url}/g.png`, { politica: LIBERA_LOOPBACK, maxBytes: 128 * 1024 })).toBeNull();
  });

  it("servidor lento: estoura o prazo e devolve null", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      res.write(PNG.subarray(0, 8)); // o resto nunca chega
    });
    const inicio = Date.now();
    expect(await buscarImagemParaPdf(`${s.url}/l.png`, { politica: LIBERA_LOOPBACK, timeoutMs: 300 })).toBeNull();
    expect(Date.now() - inicio).toBeLessThan(3000);
  });

  it("resposta que não é imagem (HTML de erro com 200): null", async () => {
    const s = await servidor(imagem("text/html", Buffer.from("<html>login</html>")));
    expect(await buscarImagemParaPdf(`${s.url}/x.png`, { politica: LIBERA_LOOPBACK })).toBeNull();
  });

  it("status 404: null", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(404, { "content-type": "image/png" });
      res.end(PNG);
    });
    expect(await buscarImagemParaPdf(`${s.url}/x.png`, { politica: LIBERA_LOOPBACK })).toBeNull();
  });

  it("image/* que o PDF não desenha (SVG, WebP) ou bytes que não batem com o tipo: null", async () => {
    const svg = await servidor(imagem("image/svg+xml", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")));
    expect(await buscarImagemParaPdf(`${svg.url}/x.svg`, { politica: LIBERA_LOOPBACK })).toBeNull();
    const mentiroso = await servidor(imagem("image/png", Buffer.from("não sou uma imagem")));
    expect(await buscarImagemParaPdf(`${mentiroso.url}/x.png`, { politica: LIBERA_LOOPBACK })).toBeNull();
  });

  it("URL inválida, file:// e host que não existe: null, sem lançar", async () => {
    expect(await buscarImagemParaPdf("não é url")).toBeNull();
    expect(await buscarImagemParaPdf("file:///etc/passwd")).toBeNull();
    expect(
      await buscarImagemParaPdf("https://sumiu.exemplo.test/x.png", { politica: { resolver: dns({}) } }),
    ).toBeNull();
  });
});
