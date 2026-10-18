import { describe, expect, it } from "vitest";

import { configDeMcpSchema, gravarConfigDeMcp, lerConfigDeMcp, mesclarConfigDeMcp } from "./config";

const ATOR = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

describe("lerConfigDeMcp — desligada por padrão e falha desligada", () => {
  it("sem nada gravado está desligada", () => {
    expect(lerConfigDeMcp({})).toMatchObject({ ligado: false, aceite: null });
    expect(lerConfigDeMcp(null)).toMatchObject({ ligado: false });
    expect(lerConfigDeMcp(undefined)).toMatchObject({ ligado: false });
    expect(lerConfigDeMcp({ mcp_externo: {} })).toMatchObject({ ligado: false });
  });

  it("ligada com o aceite vale ligada", () => {
    const c = lerConfigDeMcp({ mcp_externo: { ligado: true, aceite: { em: "2026-10-18T12:00:00.000Z", por: ATOR } } });
    expect(c.ligado).toBe(true);
  });

  it("ligada SEM o aceite do administrador vale desligada (LGPD)", () => {
    expect(lerConfigDeMcp({ mcp_externo: { ligado: true } })).toMatchObject({ ligado: false });
    expect(lerConfigDeMcp({ mcp_externo: { ligado: true, aceite: null } })).toMatchObject({ ligado: false });
  });

  it("JSON torto vale desligado, nunca ligado", () => {
    expect(lerConfigDeMcp({ mcp_externo: "sim" })).toMatchObject({ ligado: false });
    expect(lerConfigDeMcp({ mcp_externo: { ligado: "true", aceite: { em: "x", por: "y" } } })).toMatchObject({ ligado: false });
    expect(lerConfigDeMcp({ mcp_externo: { ligado: true, aceite: { em: "ontem", por: ATOR } } })).toMatchObject({ ligado: false });
  });
});

describe("mesclarConfigDeMcp", () => {
  const carimbo = { em: "2026-10-18T12:00:00.000Z", por: ATOR };
  it("aceitar carimba quem e quando; ligar sem aceitar não passa pelo schema", () => {
    const atual = lerConfigDeMcp({});
    expect(configDeMcpSchema.safeParse(mesclarConfigDeMcp(atual, { ligado: true }, carimbo)).success).toBe(false);
    const ok = configDeMcpSchema.safeParse(mesclarConfigDeMcp(atual, { ligado: true, aceitar: true }, carimbo));
    expect(ok.success && ok.data.aceite).toEqual({ em: carimbo.em, por: ATOR });
  });

  it("desligar mantém o aceite (religar não pede de novo)", () => {
    const ligada = lerConfigDeMcp({ mcp_externo: { ligado: true, aceite: { em: carimbo.em, por: ATOR } } });
    const desligada = configDeMcpSchema.parse(mesclarConfigDeMcp(ligada, { ligado: false }, carimbo));
    expect(desligada).toMatchObject({ ligado: false, aceite: { por: ATOR } });
  });
});

describe("gravarConfigDeMcp — não apaga o resto de settings", () => {
  function fakeAdmin(settings: Record<string, unknown>) {
    const estado = { settings, gravouEm: null as string | null };
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { settings: estado.settings }, error: null }) }) }),
        update: (v: { settings: Record<string, unknown> }) => ({
          eq: (_c: string, id: string) => ({
            select: () => ({
              maybeSingle: async () => {
                estado.settings = v.settings;
                estado.gravouEm = id;
                return { data: { settings: v.settings }, error: null };
              },
            }),
          }),
        }),
      }),
    };
    return { admin: admin as never, estado };
  }

  it("mescla em settings e devolve a config", async () => {
    const { admin, estado } = fakeAdmin({ branding: { nome: "Acme" }, jev: { ligado: false } });
    const r = await gravarConfigDeMcp({ admin, orgId: ORG, actorUserId: ATOR, mudanca: { ligado: true, aceitar: true } });
    expect(r).toMatchObject({ ok: true, config: { ligado: true } });
    expect(estado.settings.branding).toEqual({ nome: "Acme" });
    expect(estado.settings.jev).toEqual({ ligado: false });
    expect(estado.gravouEm).toBe(ORG);
  });

  it("recusa ligar sem aceite", async () => {
    const { admin, estado } = fakeAdmin({});
    const r = await gravarConfigDeMcp({ admin, orgId: ORG, actorUserId: ATOR, mudanca: { ligado: true } });
    expect(r).toEqual({ ok: false, motivo: "config_invalida" });
    expect(estado.gravouEm).toBeNull();
  });
});
