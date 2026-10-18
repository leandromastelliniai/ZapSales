import * as http from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { baixarMidiaExterna, TETO_DE_MIDIA_EXTERNA } from "@/lib/messaging/media/baixar-midia-externa";
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import type { ResolvedorDeNomes } from "@/lib/net/rede-segura";

/**
 * Issue #110: quem baixa a `media_url` é ESTE processo, pela rede segura — o
 * gateway só recebe a URL assinada do nosso Storage. Os casos hostis rodam
 * contra servidores HTTP reais em 127.0.0.1; o loopback é liberado pelo mesmo
 * gancho `ipPermitido` que a instalação usa, e tudo o mais segue valendo.
 */
const SO_LOOPBACK = { permitirHttp: true, ipPermitido: (ip: string) => ip === "127.0.0.1" };

type Servidor = { url: string; acessos: () => number };
const abertos: http.Server[] = [];

async function servidor(tratar: http.RequestListener): Promise<Servidor> {
  let acessos = 0;
  const srv = http.createServer((req, res) => {
    acessos += 1;
    tratar(req, res);
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  abertos.push(srv);
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, acessos: () => acessos };
}

afterEach(async () => {
  await Promise.all(
    abertos.splice(0).map(
      (s) =>
        new Promise<void>((ok) => {
          s.closeAllConnections();
          s.close(() => ok());
        }),
    ),
  );
});

function dns(tabela: Record<string, string[]>): ResolvedorDeNomes {
  return async (nome) => {
    const enderecos = tabela[nome];
    if (!enderecos) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return enderecos.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
}

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

describe("baixarMidiaExterna — o caminho feliz", () => {
  it("baixa o arquivo e devolve os bytes, o mime do servidor e a classe de mídia", async () => {
    const srv = await servidor((_req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
    });

    const midia = await baixarMidiaExterna(`${srv.url}/foto.png`, { type: "image", politica: SO_LOOPBACK });

    expect(midia.buffer.equals(PNG)).toBe(true);
    expect(midia.mime).toBe("image/png");
    expect(midia.kind).toBe("image");
    expect(srv.acessos()).toBe(1);
  });
});

describe("baixarMidiaExterna — teto de tamanho por tipo", () => {
  // Os valores são os da Meta por tipo de mídia (e o do bucket para documento). Os
  // testes de transporte abaixo usam tetos pequenos por injeção: o loopback do
  // Windows derruba corpo de vários MB de forma intermitente, e o que se prova
  // aqui é a CONTA do teto, não a vazão da máquina.
  it("a tabela é a da Meta: imagem 5 MB, vídeo e áudio 16 MB, documento até o teto do bucket", () => {
    expect(TETO_DE_MIDIA_EXTERNA).toEqual({
      image: 5_000_000,
      sticker: 500_000,
      video: 16_000_000,
      audio: 16_000_000,
      document: MAX_MEDIA_BYTES,
    });
  });

  const tetos = { image: 1_000, sticker: 500, video: 3_000, audio: 3_000, document: 3_000 };
  const corpoDe = (mime: string, bytes: number) =>
    servidor((_req, res) => {
      res.writeHead(200, { "content-type": mime });
      res.end(Buffer.alloc(bytes, 1));
    });

  it("imagem exatamente no teto passa; um byte a mais é recusado como payload_too_large", async () => {
    const dentro = await corpoDe("image/jpeg", 1_000);
    await expect(
      baixarMidiaExterna(dentro.url, { type: "image", politica: SO_LOOPBACK, tetos }),
    ).resolves.toMatchObject({ kind: "image" });

    const fora = await corpoDe("image/jpeg", 1_001);
    await expect(
      baixarMidiaExterna(fora.url, { type: "image", politica: SO_LOOPBACK, tetos }),
    ).rejects.toMatchObject({ codigo: "payload_too_large" });
  });

  it("o mesmo tamanho que estoura como imagem cabe como vídeo e como documento", async () => {
    const srvVideo = await corpoDe("video/mp4", 2_000);
    await expect(
      baixarMidiaExterna(srvVideo.url, { type: "video", politica: SO_LOOPBACK, tetos }),
    ).resolves.toMatchObject({ kind: "video" });
    const srvDoc = await corpoDe("application/pdf", 2_000);
    await expect(
      baixarMidiaExterna(srvDoc.url, { type: "document", politica: SO_LOOPBACK, tetos }),
    ).resolves.toMatchObject({ kind: "document" });
    await expect(
      baixarMidiaExterna(srvVideo.url, { type: "image", politica: SO_LOOPBACK, tetos }),
    ).rejects.toMatchObject({ codigo: "payload_too_large" });
  });

  it("corpo sem Content-Length (chunked) que passa do teto é derrubado no meio", async () => {
    let enviados = 0;
    const srv = await servidor((_req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      const gotejar = () => {
        if (res.destroyed) return;
        enviados += 500;
        res.write(Buffer.alloc(500, 1), () => setTimeout(gotejar, 1));
      };
      gotejar();
    });

    await expect(
      baixarMidiaExterna(srv.url, { type: "image", politica: SO_LOOPBACK, tetos }),
    ).rejects.toMatchObject({ codigo: "payload_too_large" });
    // Parou perto do teto: não leu o que o servidor ainda ia mandar.
    expect(enviados).toBeLessThan(20_000);
  });
});

describe("baixarMidiaExterna — o que a rede segura recusa", () => {
  const imagem = () =>
    servidor((_req, res) => {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
    });

  it.each([
    ["metadata da nuvem", "http://169.254.169.254/latest/meta-data/", "unsafe_url:private_host"],
    ["serviço do compose por IP", "http://172.18.0.5:6379/", "unsafe_url:private_host"],
    ["loopback por nome", "http://localhost:3000/api/v1/health", "unsafe_url:private_host"],
    ["IPv6 literal", "https://[::ffff:169.254.169.254]/x", "unsafe_url:ipv6_literal"],
    ["esquema file", "file:///etc/passwd", "unsafe_url:scheme"],
  ])("recusa %s sem abrir conexão", async (_nome, url, codigo) => {
    await expect(baixarMidiaExterna(url, { type: "image" })).rejects.toThrow(codigo);
  });

  it("recusa nome que resolve para um endereço público E um privado (assinatura de rebinding)", async () => {
    await expect(
      baixarMidiaExterna("https://midia.exemplo.test/x.png", {
        type: "image",
        politica: { resolver: dns({ "midia.exemplo.test": ["8.8.8.8", "10.0.0.9"] }) },
      }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });

  it("rebinding: o DNS responde público/liberado na 1ª vez e interno nas seguintes — só a 1ª vale, e a conexão fica nela", async () => {
    const srv = await imagem();
    const porta = new URL(srv.url).port;
    const respostas = ["127.0.0.1", "169.254.169.254", "10.0.0.9"];
    let resolucoes = 0;
    const resolver: ResolvedorDeNomes = async () => [{ address: respostas[Math.min(resolucoes++, 2)]!, family: 4 }];

    const midia = await baixarMidiaExterna(`http://midia.exemplo.test:${porta}/x.png`, {
      type: "image",
      politica: { ...SO_LOOPBACK, resolver },
    });

    expect(midia.buffer.equals(PNG)).toBe(true);
    expect(srv.acessos()).toBe(1);
    // Uma única resolução: não existe segunda chance de o nome apontar para outro lugar.
    expect(resolucoes).toBe(1);
  });

  // O alvo interno é um servidor REAL em 127.0.0.2: só 127.0.0.1 é liberado pela válvula
  // do teste, então 127.0.0.2 é "rede interna" de verdade e a contagem de acessos prova
  // que nenhum pacote chegou lá.
  async function internoEm127_0_0_2() {
    const srv = http.createServer((_req, res) => {
      acessosInternos += 1;
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
    });
    let acessosInternos = 0;
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.2", ok));
    abertos.push(srv);
    return { porta: (srv.address() as AddressInfo).port, acessos: () => acessosInternos };
  }

  it("redirecionamento para IP interno é recusado, e o alvo interno nunca é acessado", async () => {
    const interno = await internoEm127_0_0_2();
    const fachada = await servidor((_req, res) => {
      res.writeHead(302, { location: `http://127.0.0.2:${interno.porta}/segredo.png` });
      res.end();
    });

    await expect(
      baixarMidiaExterna(`${fachada.url}/foto.png`, { type: "image", politica: SO_LOOPBACK }),
    ).rejects.toThrow("unsafe_url:private_host");
    expect(interno.acessos()).toBe(0);
  });

  it("redirecionamento para um NOME que resolve a endereço interno é recusado antes de conectar", async () => {
    const interno = await internoEm127_0_0_2();
    const fachada = await servidor((_req, res) => {
      res.writeHead(302, { location: `http://interno.exemplo.test:${interno.porta}/segredo.png` });
      res.end();
    });

    await expect(
      baixarMidiaExterna(`${fachada.url}/foto.png`, {
        type: "image",
        politica: { ...SO_LOOPBACK, resolver: dns({ "interno.exemplo.test": ["127.0.0.2"], "127.0.0.1": ["127.0.0.1"] }) },
      }),
    ).rejects.toThrow("unsafe_url:private_ip");
    expect(interno.acessos()).toBe(0);
  });

  it("redirecionamento para outro endereço permitido é seguido (CDN, link encurtado)", async () => {
    const destino = await imagem();
    const fachada = await servidor((_req, res) => {
      res.writeHead(302, { location: `${destino.url}/real.png` });
      res.end();
    });

    const midia = await baixarMidiaExterna(`${fachada.url}/curto`, { type: "image", politica: SO_LOOPBACK });

    expect(midia.buffer.equals(PNG)).toBe(true);
    expect(destino.acessos()).toBe(1);
  });

  it("laço de redirecionamentos é cortado", async () => {
    const laco = await servidor((_req, res) => {
      res.writeHead(302, { location: "/outra" });
      res.end();
    });

    await expect(
      baixarMidiaExterna(`${laco.url}/a`, { type: "image", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "net:too_many_redirects" });
  });

  it("servidor lento é cortado pelo prazo total", async () => {
    const lento = await servidor(() => {
      /* nunca responde */
    });

    await expect(
      baixarMidiaExterna(lento.url, { type: "image", politica: SO_LOOPBACK, timeoutMs: 200 }),
    ).rejects.toMatchObject({ codigo: "net:timeout" });
  });
});

describe("baixarMidiaExterna — o que o servidor devolve", () => {
  const responde = (status: number, mime: string | null, corpo: Buffer = PNG) =>
    servidor((_req, res) => {
      res.writeHead(status, mime ? { "content-type": mime } : {});
      res.end(corpo);
    });

  it("resposta que não é 2xx não vira mídia", async () => {
    const srv = await responde(404, "text/html", Buffer.from("<html>nao achei</html>"));
    await expect(
      baixarMidiaExterna(srv.url, { type: "image", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "media_http_status" });
  });

  it("página HTML no lugar da imagem é recusada como tipo não suportado", async () => {
    const srv = await responde(200, "text/html; charset=utf-8", Buffer.from("<html>login</html>"));
    await expect(
      baixarMidiaExterna(srv.url, { type: "image", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "unsupported_media_type" });
  });

  it("o mime do servidor tem de ser da classe do tipo pedido (vídeo enviado como imagem é recusado)", async () => {
    const srv = await responde(200, "video/mp4");
    await expect(
      baixarMidiaExterna(srv.url, { type: "image", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "unsupported_media_type" });
  });

  it("servidor que não declara tipo útil (octet-stream) usa o media_mime informado", async () => {
    const srv = await responde(200, "application/octet-stream", Buffer.from("%PDF-1.4"));
    await expect(
      baixarMidiaExterna(srv.url, { type: "document", mimeInformado: "application/pdf", politica: SO_LOOPBACK }),
    ).resolves.toMatchObject({ mime: "application/pdf", kind: "document" });
  });

  it("sem tipo útil no servidor nem no pedido, recusa", async () => {
    const srv = await responde(200, "application/octet-stream");
    await expect(
      baixarMidiaExterna(srv.url, { type: "document", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "unsupported_media_type" });
  });

  it("corpo vazio é recusado", async () => {
    const srv = await responde(200, "image/png", Buffer.alloc(0));
    await expect(
      baixarMidiaExterna(srv.url, { type: "image", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "unsupported_media_type" });
  });

  it("figurinha tem de ser webp e cabe no teto de figurinha, não no de imagem", async () => {
    const webp = await responde(200, "image/webp");
    await expect(
      baixarMidiaExterna(webp.url, { type: "sticker", politica: SO_LOOPBACK }),
    ).resolves.toMatchObject({ kind: "image", mime: "image/webp" });

    const png = await responde(200, "image/png");
    await expect(
      baixarMidiaExterna(png.url, { type: "sticker", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "unsupported_media_type" });

    const grande = await responde(200, "image/webp", Buffer.alloc(501, 1));
    await expect(
      baixarMidiaExterna(grande.url, {
        type: "sticker",
        politica: SO_LOOPBACK,
        tetos: { image: 5_000, sticker: 500, video: 5_000, audio: 5_000, document: 5_000 },
      }),
    ).rejects.toMatchObject({ codigo: "payload_too_large" });
  });

  it("o media_mime informado NÃO sobrepõe um tipo que o servidor declarou (página de login não vira PNG)", async () => {
    const srv = await responde(200, "text/html", Buffer.from("<html>login</html>"));
    await expect(
      baixarMidiaExterna(srv.url, { type: "image", mimeInformado: "image/png", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "unsupported_media_type" });
  });

  it("SVG não é imagem de mensagem (a Meta só aceita JPEG/PNG e SVG carrega script)", async () => {
    const srv = await responde(200, "image/svg+xml", Buffer.from("<svg onload='x()'/>"));
    await expect(
      baixarMidiaExterna(srv.url, { type: "image", politica: SO_LOOPBACK }),
    ).rejects.toMatchObject({ codigo: "unsupported_media_type" });
  });

  it.each(["text", "location", "contact", "template"])(
    "type '%s' não é mídia: recusa sem abrir conexão",
    async (type) => {
      const srv = await responde(200, "image/png");
      await expect(
        baixarMidiaExterna(srv.url, { type, politica: SO_LOOPBACK }),
      ).rejects.toMatchObject({ codigo: "unsupported_media_type" });
      expect(srv.acessos()).toBe(0);
    },
  );
});

