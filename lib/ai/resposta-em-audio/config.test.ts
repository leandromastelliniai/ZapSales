import { describe, expect, it } from "vitest";

import {
  LIMITE_PADRAO_DE_CARACTERES,
  configDeAudioSchema,
  gravarConfigDeAudio,
  lerConfigDeAudio,
  mesclarConfigDeAudio,
} from "./config";

const ATOR = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-10-15T12:00:00.000Z");
const CARIMBO = { em: AGORA.toISOString(), por: ATOR };

describe("lerConfigDeAudio", () => {
  it("organização sem a chave nas settings: desligada, com os padrões", () => {
    for (const settings of [undefined, null, {}, { outra: 1 }, "texto", 7]) {
      const c = lerConfigDeAudio(settings);
      expect(c.ligado).toBe(false);
      expect(c.aceite).toBeNull();
      expect(c.provedor).toBe("openai_compativel");
      expect(c.limite_de_caracteres).toBe(LIMITE_PADRAO_DE_CARACTERES);
    }
  });

  it("JSON torto nunca liga: falha DESLIGADA", () => {
    const aceite = { em: AGORA.toISOString(), por: ATOR };
    for (const torto of [
      { resposta_em_audio: "ligado" },
      { resposta_em_audio: { ligado: "sim" } },
      { resposta_em_audio: { ligado: true, provedor: "outro", aceite } },
      { resposta_em_audio: { ligado: true, aceite: { em: "ontem", por: "x" } } },
      { resposta_em_audio: { ligado: true, aceite, limite_de_caracteres: 999999 } },
    ]) {
      expect(lerConfigDeAudio(torto).ligado).toBe(false);
    }
  });

  it("ligado SEM aceite do administrador vale como desligado", () => {
    expect(lerConfigDeAudio({ resposta_em_audio: { ligado: true } }).ligado).toBe(false);
  });

  it("ligado com aceite é lido como veio", () => {
    const c = lerConfigDeAudio({
      resposta_em_audio: {
        ligado: true,
        provedor: "elevenlabs",
        aceite: { em: AGORA.toISOString(), por: ATOR },
        limite_de_caracteres: 600,
      },
    });
    expect(c).toMatchObject({ ligado: true, provedor: "elevenlabs", limite_de_caracteres: 600 });
  });

  it("endereço do provedor precisa ser http(s)", () => {
    expect(configDeAudioSchema.safeParse({ endereco: "https://voz.exemplo.com/v1" }).success).toBe(true);
    expect(configDeAudioSchema.safeParse({ endereco: "file:///etc/passwd" }).success).toBe(false);
    expect(configDeAudioSchema.safeParse({ endereco: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("mesclarConfigDeAudio", () => {
  it("carimba o aceite com quem e quando só quando o administrador aceitou agora", () => {
    const atual = lerConfigDeAudio({});
    const sem = mesclarConfigDeAudio(atual, { ligado: false }, CARIMBO) as { aceite: unknown };
    expect(sem.aceite).toBeNull();
    const com = mesclarConfigDeAudio(atual, { ligado: true, aceitar: true }, CARIMBO) as {
      aceite: unknown;
    };
    expect(com.aceite).toEqual({ em: AGORA.toISOString(), por: ATOR });
  });

  it("desligar preserva o aceite já dado", () => {
    const ligada = lerConfigDeAudio({
      resposta_em_audio: { ligado: true, aceite: { em: AGORA.toISOString(), por: ATOR } },
    });
    const depois = configDeAudioSchema.parse(mesclarConfigDeAudio(ligada, { ligado: false }, CARIMBO));
    expect(depois.ligado).toBe(false);
    expect(depois.aceite).not.toBeNull();
  });
});

function adminFalso(settingsIniciais: Record<string, unknown> | null) {
  const estado = { settings: settingsIniciais, filtros: [] as Array<[string, unknown]> };
  const consulta = {
    select: () => consulta,
    update: (v: { settings: Record<string, unknown> }) => {
      estado.settings = v.settings;
      return consulta;
    },
    eq: (col: string, val: unknown) => {
      estado.filtros.push([col, val]);
      return consulta;
    },
    maybeSingle: async () => ({
      data: estado.settings === null ? null : { settings: estado.settings },
      error: null,
    }),
  };
  return { admin: { from: () => consulta } as never, estado };
}

describe("gravarConfigDeAudio", () => {
  it("mescla SEM apagar o resto de settings (marca, Jev…) e filtra pela organização", async () => {
    const { admin, estado } = adminFalso({ jev: { ligado: false }, branding: { nome: "Acme" } });
    const r = await gravarConfigDeAudio({
      admin,
      orgId: "org-1",
      actorUserId: ATOR,
      mudanca: { ligado: true, aceitar: true, provedor: "elevenlabs" },
      agora: AGORA,
    });
    expect(r.ok).toBe(true);
    expect(estado.settings).toMatchObject({
      jev: { ligado: false },
      branding: { nome: "Acme" },
      resposta_em_audio: { ligado: true, provedor: "elevenlabs", aceite: { por: ATOR } },
    });
    expect(estado.filtros).toContainEqual(["id", "org-1"]);
  });

  it("ligar sem aceite é recusado e não grava", async () => {
    const { admin, estado } = adminFalso({});
    const r = await gravarConfigDeAudio({
      admin,
      orgId: "org-1",
      actorUserId: ATOR,
      mudanca: { ligado: true },
    });
    expect(r).toEqual({ ok: false, motivo: "config_invalida" });
    expect(estado.settings).toEqual({});
  });

  it("organização que não existe: leitura_falhou", async () => {
    const { admin } = adminFalso(null);
    const r = await gravarConfigDeAudio({ admin, orgId: "org-x", actorUserId: ATOR, mudanca: {} });
    expect(r).toEqual({ ok: false, motivo: "leitura_falhou" });
  });
});
