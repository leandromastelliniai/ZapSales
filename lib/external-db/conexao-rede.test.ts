import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ resposta: [] as Array<{ address: string; family: number }>, chamadas: 0 }));
vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => {
    dns.chamadas += 1;
    return dns.resposta;
  });
  return { lookup, default: { lookup } };
});

import { testarConexao } from "./conexao";
import type { ConexaoExterna } from "./types";

function conexao(host: string): ConexaoExterna {
  return {
    id: "conn-1",
    organizationId: "org-1",
    label: "X",
    host,
    port: 5432,
    database: "db",
    username: "u",
    password: "p",
    sslMode: "disable",
    maxRows: 200,
    maxFilters: 20,
    maxResponseBytes: 30_000,
    versao: "2026-09-11T00:00:00.000Z",
  };
}

beforeEach(() => {
  dns.resposta = [];
  dns.chamadas = 0;
});

/**
 * O pool NÃO confia na checagem do cadastro: o nome pode ter passado a resolver
 * para outro lugar entre ela e o connect. O `lookup` do socket julga na hora.
 */
describe("o socket do banco externo julga o destino na hora de conectar", () => {
  it.each([
    ["metadata de nuvem", "169.254.169.254"],
    ["loopback (o Postgres do próprio compose)", "127.0.0.1"],
    ["CGNAT", "100.64.0.1"],
    ["IPv4-mapped escondendo o loopback", "::ffff:7f00:1"],
  ])("recusa o nome que resolve para %s — sem abrir a conexão", async (_rotulo, endereco) => {
    dns.resposta = [{ address: endereco, family: endereco.includes(":") ? 6 : 4 }];
    const r = await testarConexao(conexao("banco.exemplo.test"));
    expect(r).toEqual({ ok: false, erro: expect.stringContaining("unsafe_url:private_ip") });
    expect(dns.chamadas).toBe(1);
  });

  it("recusa o literal de IP especial sem consultar o DNS", async () => {
    const r = await testarConexao(conexao("169.254.169.254"));
    expect(r.ok).toBe(false);
    expect(dns.chamadas).toBe(0);
  });
});
