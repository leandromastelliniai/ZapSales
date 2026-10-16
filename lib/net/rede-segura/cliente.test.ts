import * as http from "node:http";
import * as net from "node:net";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buscarSeguro, lookupJulgado, type ResolvedorDeNomes } from "./cliente";

/**
 * A política é provada contra servidores HTTP REAIS em 127.0.0.1 — o egress de
 * verdade, e não um dublê do `fetch`. Como o loopback é exatamente o que a
 * política recusa, os testes o liberam pelo mesmo gancho que a instalação usa
 * para os destinos internos que o dono autoriza (`ipPermitido`); tudo o mais
 * segue valendo.
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

/** Um resolvedor de nomes fixo, para o teste mandar o DNS dizer o que quiser. */
function dns(tabela: Record<string, string[]>): ResolvedorDeNomes & { chamadas: string[] } {
  const chamadas: string[] = [];
  const resolver = async (nome: string) => {
    chamadas.push(nome);
    const enderecos = tabela[nome];
    if (!enderecos) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return enderecos.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return Object.assign(resolver, { chamadas });
}

describe("buscarSeguro — o que é recusado antes de qualquer pacote sair", () => {
  it.each([
    ["IPv4 privado 10/8", "https://10.0.0.5/x", "unsafe_url:private_host"],
    ["IPv4 privado 192.168/16", "https://192.168.1.1/x", "unsafe_url:private_host"],
    ["rede do Docker 172.16/12", "https://172.17.0.2/x", "unsafe_url:private_host"],
    ["metadata de nuvem", "https://169.254.169.254/latest/meta-data", "unsafe_url:private_host"],
    ["loopback", "https://127.0.0.1/x", "unsafe_url:private_host"],
    ["localhost", "https://localhost/x", "unsafe_url:private_host"],
    ["subdomínio de localhost", "https://api.localhost/x", "unsafe_url:private_host"],
    ["IPv4 em forma decimal que o URL normaliza", "https://2130706433/x", "unsafe_url:private_host"],
    ["IPv6 loopback", "https://[::1]/x", "unsafe_url:ipv6_literal"],
    ["IPv6 mapeado escondendo o metadata", "https://[::ffff:169.254.169.254]/x", "unsafe_url:ipv6_literal"],
    ["esquema que não é http", "file:///etc/passwd", "unsafe_url:scheme"],
    ["gopher", "gopher://10.0.0.1/x", "unsafe_url:scheme"],
    ["URL que não é URL", "isso não é um endereço", "unsafe_url:invalid"],
    ["http sem permissão", "http://exemplo.test/x", "unsafe_url:https_required"],
  ])("%s", async (_rotulo, url, codigo) => {
    await expect(buscarSeguro(url, { resolver: dns({ "exemplo.test": ["8.8.8.8"] }) })).rejects.toThrow(codigo);
  });

  it("recusa nome que resolve para IPv4 privado", async () => {
    await expect(
      buscarSeguro("https://interno.exemplo.test/x", { resolver: dns({ "interno.exemplo.test": ["10.0.0.9"] }) }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });

  it.each([
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 ULA", "fd00::1"],
    ["IPv4-mapped em hexadecimal, que o prefixo de texto não via", "::ffff:7f00:1"],
    ["IPv4-compatível escondendo loopback", "::7f00:1"],
    ["NAT64", "64:ff9b::a00:1"],
  ])("recusa nome que resolve para IPv6 especial: %s", async (_rotulo, endereco) => {
    await expect(
      buscarSeguro("https://v6.exemplo.test/x", { resolver: dns({ "v6.exemplo.test": [endereco] }) }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });

  it("recusa o conjunto inteiro quando UM dos endereços é especial (a assinatura do rebinding)", async () => {
    await expect(
      buscarSeguro("https://misto.exemplo.test/x", { resolver: dns({ "misto.exemplo.test": ["8.8.8.8", "127.0.0.1"] }) }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });

  it("falha fechado quando o DNS não responde ou volta vazio", async () => {
    await expect(buscarSeguro("https://sumiu.exemplo.test/x", { resolver: dns({}) })).rejects.toThrow(
      "unsafe_url:dns_failed",
    );
    await expect(
      buscarSeguro("https://vazio.exemplo.test/x", { resolver: dns({ "vazio.exemplo.test": [] }) }),
    ).rejects.toThrow("unsafe_url:dns_empty");
  });
});

describe("buscarSeguro — o caminho feliz e o vínculo entre DNS e conexão", () => {
  it("entrega status, cabeçalhos e corpo de um destino liberado", async () => {
    const s = await servidor((_req, res) => {
      res.setHeader("x-teste", "ok");
      res.end("olá");
    });
    const r = await buscarSeguro(`${s.url}/ping`, SO_LOOPBACK);
    expect(r.status).toBe(200);
    expect(r.headers["x-teste"]).toBe("ok");
    expect(r.corpo.toString("utf8")).toBe("olá");
    expect(r.urlFinal).toBe(`${s.url}/ping`);
  });

  it("envia método, cabeçalhos e corpo informados", async () => {
    let visto = { metodo: "", tipo: "", corpo: "" };
    const s = await servidor((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (p: Buffer) => partes.push(p));
      req.on("end", () => {
        visto = { metodo: req.method ?? "", tipo: String(req.headers["content-type"]), corpo: Buffer.concat(partes).toString() };
        res.end("{}");
      });
    });
    await buscarSeguro(s.url, {
      ...SO_LOOPBACK,
      metodo: "POST",
      headers: { "Content-Type": "application/json" },
      corpo: '{"a":1}',
    });
    expect(visto).toEqual({ metodo: "POST", tipo: "application/json", corpo: '{"a":1}' });
  });

  it("conecta no endereço JULGADO e não abre segunda janela de resolução (rebinding)", async () => {
    const s = await servidor((_req, res) => res.end("do endereço julgado"));
    // Primeira resposta do DNS: o loopback autorizado. Qualquer resolução depois
    // dela devolveria o metadata de nuvem — que o socket tentaria alcançar se a
    // conexão resolvesse o nome por conta própria.
    let chamadas = 0;
    const resolver: ResolvedorDeNomes = async () => {
      chamadas += 1;
      return [{ address: chamadas === 1 ? "127.0.0.1" : "169.254.169.254", family: 4 }];
    };
    const r = await buscarSeguro(`http://troca.exemplo.test:${s.porta}/x`, { ...SO_LOOPBACK, resolver });
    expect(r.corpo.toString()).toBe("do endereço julgado");
    expect(chamadas).toBe(1);
    expect(s.acessos()).toBe(1);
  });

  it("a exceção de IP liberado vale só para o IP liberado, não para o nome inteiro", async () => {
    await expect(
      buscarSeguro("http://misto.exemplo.test/x", { ...SO_LOOPBACK, resolver: dns({ "misto.exemplo.test": ["127.0.0.1", "10.0.0.9"] }) }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });
});

describe("buscarSeguro — redirecionamento com as mesmas regras", () => {
  it("recusa o redirecionamento para o endereço interno (metadata de nuvem)", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/iam" });
      res.end();
    });
    await expect(buscarSeguro(s.url, { ...SO_LOOPBACK, maxRedirecionamentos: 3 })).rejects.toThrow(
      "unsafe_url:private_host",
    );
  });

  it("recusa o redirecionamento para um NOME que resolve para IP interno", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(301, { location: "http://interno.exemplo.test/admin" });
      res.end();
    });
    await expect(
      buscarSeguro(s.url, {
        ...SO_LOOPBACK,
        maxRedirecionamentos: 3,
        resolver: dns({ "interno.exemplo.test": ["10.0.0.9"] }),
      }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });

  it("segue o redirecionamento legítimo e informa a URL final", async () => {
    const destino = await servidor((_req, res) => res.end("chegou"));
    const origem = await servidor((_req, res) => {
      res.writeHead(302, { location: `${destino.url}/fim` });
      res.end();
    });
    const r = await buscarSeguro(origem.url, { ...SO_LOOPBACK, maxRedirecionamentos: 3 });
    expect(r.corpo.toString()).toBe("chegou");
    expect(r.urlFinal).toBe(`${destino.url}/fim`);
  });

  it("sem teto de saltos configurado, devolve o 3xx sem segui-lo (contrato do webhook)", async () => {
    const destino = await servidor((_req, res) => res.end("não devia chegar"));
    const origem = await servidor((_req, res) => {
      res.writeHead(302, { location: destino.url });
      res.end();
    });
    const r = await buscarSeguro(origem.url, SO_LOOPBACK);
    expect(r.status).toBe(302);
    expect(destino.acessos()).toBe(0);
  });

  it("corta o laço de redirecionamentos", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(302, { location: "/de-novo" });
      res.end();
    });
    await expect(buscarSeguro(s.url, { ...SO_LOOPBACK, maxRedirecionamentos: 3 })).rejects.toThrow(
      "net:too_many_redirects",
    );
    expect(s.acessos()).toBe(4);
  });

  it("não leva credencial para outra origem, mas a mantém dentro da mesma", async () => {
    let authNoDestino: string | undefined = "nunca chegou";
    const destino = await servidor((req, res) => {
      authNoDestino = req.headers.authorization;
      res.end("ok");
    });
    const origem = await servidor((_req, res) => {
      res.writeHead(307, { location: destino.url });
      res.end();
    });
    await buscarSeguro(origem.url, {
      ...SO_LOOPBACK,
      maxRedirecionamentos: 3,
      headers: { Authorization: "Bearer segredo", "X-Api-Key": "chave" },
    });
    expect(authNoDestino).toBeUndefined();
  });

  it("303 troca para GET e descarta o corpo; 307 preserva método e corpo", async () => {
    const vistos: Array<{ metodo: string; corpo: string }> = [];
    const destino = await servidor((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (p: Buffer) => partes.push(p));
      req.on("end", () => {
        vistos.push({ metodo: req.method ?? "", corpo: Buffer.concat(partes).toString() });
        res.end("ok");
      });
    });
    const via303 = await servidor((_req, res) => {
      res.writeHead(303, { location: destino.url });
      res.end();
    });
    const via307 = await servidor((_req, res) => {
      res.writeHead(307, { location: destino.url });
      res.end();
    });
    await buscarSeguro(via303.url, { ...SO_LOOPBACK, maxRedirecionamentos: 2, metodo: "POST", corpo: "dados" });
    await buscarSeguro(via307.url, { ...SO_LOOPBACK, maxRedirecionamentos: 2, metodo: "POST", corpo: "dados" });
    expect(vistos).toEqual([
      { metodo: "GET", corpo: "" },
      { metodo: "POST", corpo: "dados" },
    ]);
  });
});

describe("buscarSeguro — limites de tamanho e de tempo", () => {
  it("corta a resposta gigante sem Content-Length no teto de bytes e derruba a conexão", async () => {
    let conexaoCaiu = false;
    const s = await servidor((req, res) => {
      req.socket.once("close", () => (conexaoCaiu = true));
      res.writeHead(200);
      const bombear = () => {
        if (res.destroyed) return;
        res.write(Buffer.alloc(64 * 1024, 65), bombear);
      };
      bombear();
    });
    await expect(buscarSeguro(s.url, { ...SO_LOOPBACK, maxBytes: 100_000 })).rejects.toThrow("net:response_too_large");
    await vi.waitFor(() => expect(conexaoCaiu).toBe(true));
  });

  it("recusa de antemão a resposta que ANUNCIA mais que o teto", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200, { "content-length": String(50 * 1024 * 1024) });
      res.write("x");
    });
    await expect(buscarSeguro(s.url, { ...SO_LOOPBACK, maxBytes: 1024 })).rejects.toThrow("net:response_too_large");
  });

  it("aceita a resposta que cabe no teto", async () => {
    const s = await servidor((_req, res) => res.end("x".repeat(1000)));
    const r = await buscarSeguro(s.url, { ...SO_LOOPBACK, maxBytes: 1000 });
    expect(r.corpo.length).toBe(1000);
  });

  it("estoura o prazo quando o servidor aceita a conexão e nunca responde", async () => {
    let conexaoCaiu = false;
    const s = await servidor((req) => {
      req.socket.once("close", () => (conexaoCaiu = true));
    });
    const inicio = Date.now();
    await expect(buscarSeguro(s.url, { ...SO_LOOPBACK, timeoutMs: 200 })).rejects.toThrow("net:timeout");
    expect(Date.now() - inicio).toBeLessThan(2_000);
    // Estourar o prazo não deixa socket aberto para trás.
    await vi.waitFor(() => expect(conexaoCaiu).toBe(true));
  });

  it("o prazo é TOTAL: pingar um byte de vez não o renova", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200);
      const gotejar = setInterval(() => res.write("."), 40);
      res.once("close", () => clearInterval(gotejar));
    });
    await expect(buscarSeguro(s.url, { ...SO_LOOPBACK, timeoutMs: 300 })).rejects.toThrow("net:timeout");
  });

  it("o prazo também cobre a resolução do DNS", async () => {
    const resolver: ResolvedorDeNomes = () => new Promise(() => undefined);
    await expect(buscarSeguro("https://lento.exemplo.test/x", { resolver, timeoutMs: 150 })).rejects.toThrow("net:timeout");
  });

  it("respeita o sinal de cancelamento de quem chamou", async () => {
    const s = await servidor(() => undefined);
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 100);
    await expect(buscarSeguro(s.url, { ...SO_LOOPBACK, signal: ctl.signal, timeoutMs: 5_000 })).rejects.toThrow(
      "net:aborted",
    );
  });

  it("com corpo ignorado devolve o status sem ler (nem limitar) uma resposta enorme", async () => {
    const s = await servidor((_req, res) => {
      res.writeHead(200);
      const bombear = () => {
        if (res.destroyed) return;
        res.write(Buffer.alloc(64 * 1024, 65), bombear);
      };
      bombear();
    });
    const r = await buscarSeguro(s.url, { ...SO_LOOPBACK, corpo: undefined, lerResposta: false, maxBytes: 10 });
    expect(r.status).toBe(200);
    expect(r.corpo.length).toBe(0);
  });

  it("traduz falha de conexão em código estável, sem vazar o detalhe do socket", async () => {
    // Porta fechada: abre e fecha um servidor só para ter uma porta livre.
    const s = await servidor(() => undefined);
    const porta = s.porta;
    await s.fechar();
    await expect(buscarSeguro(`http://127.0.0.1:${porta}/`, SO_LOOPBACK)).rejects.toThrow("net:connection_failed");
  });
});

describe("lookupJulgado — para quem abre o próprio socket (banco externo)", () => {
  function conectar(host: string, porta: number, politica: Parameters<typeof lookupJulgado>[0]) {
    return new Promise<net.Socket>((ok, falhou) => {
      const socket = net.connect({ host, port: porta, lookup: lookupJulgado(politica) });
      socket.once("connect", () => ok(socket));
      socket.once("error", falhou);
    });
  }

  it("resolve e julga NO MOMENTO da conexão: o socket só recebe o endereço julgado", async () => {
    const s = await servidor((_req, res) => res.end());
    const resolver = dns({ "banco.exemplo.test": ["127.0.0.1"] });
    const socket = await conectar("banco.exemplo.test", s.porta, { ...SO_LOOPBACK, resolver });
    socket.destroy();
    expect(resolver.chamadas).toEqual(["banco.exemplo.test"]);
  });

  it("recusa a conexão quando o nome passa a resolver para o endereço interno", async () => {
    await expect(
      conectar("banco.exemplo.test", 5432, { resolver: dns({ "banco.exemplo.test": ["169.254.169.254"] }) }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });

  it("a válvula de IP deixa passar só o que ela cobre: a LAN do dono, não o metadata", async () => {
    const soRedePrivada = { ipPermitido: (ip: string) => ip.startsWith("10.") };
    await expect(
      conectar("banco.exemplo.test", 5432, { ...soRedePrivada, resolver: dns({ "banco.exemplo.test": ["169.254.169.254"] }) }),
    ).rejects.toThrow("unsafe_url:private_ip");
  });
});

vi.setConfig({ testTimeout: 15_000 });
