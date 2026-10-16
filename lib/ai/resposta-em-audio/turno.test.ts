/**
 * A resposta em áudio DENTRO de um turno, contra um endpoint de voz de verdade
 * (servidor HTTP efêmero em 127.0.0.1). O que se mede é o comportamento externo:
 * em que formato a resposta sai, o que fica gravado, o que o provedor recebeu e
 * o que acontece quando qualquer peça falha — sempre terminando em TEXTO, nunca
 * em silêncio.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PROVIDERS_DE_MENSAGEM } from "@/lib/channels/capabilities";

import {
  criarAudioDoTurno,
  ultimaMensagemDoClienteFoiAudio,
  type DependenciasDoAudioDoTurno,
  type EntradaDoAudioDoTurno,
} from "./turno";
import type { UsoDaVoz } from "./uso";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const CONVERSA = "00000000-0000-4000-8000-0000000000c1";
const ATOR = "11111111-1111-4111-8111-111111111111";
const CHAVE = "chave-de-voz-do-cliente-0001";
const MP3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0x21, 0xff, 0xfb, 0x90, 0x00]);
const OGG = Buffer.from("OggS-de-mentira");

let servidor: http.Server;
let base: string;
const recebidos: Array<{ url: string; chave: string | undefined; corpo: string }> = [];
let resposta: { status: number; tipo: string; corpo: Buffer | string } = {
  status: 200,
  tipo: "audio/mpeg",
  corpo: MP3,
};

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (c: Buffer) => partes.push(c));
    req.on("end", () => {
      recebidos.push({
        url: req.url ?? "",
        chave: (req.headers.authorization ?? "").replace("Bearer ", "") || (req.headers["xi-api-key"] as string | undefined),
        corpo: Buffer.concat(partes).toString("utf8"),
      });
      res.writeHead(resposta.status, { "content-type": resposta.tipo });
      res.end(resposta.corpo);
    });
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((ok) => servidor.close(() => ok()));
});

beforeEach(() => {
  recebidos.length = 0;
  resposta = { status: 200, tipo: "audio/mpeg", corpo: MP3 };
});

function settingsLigadas(extra: Record<string, unknown> = {}) {
  return {
    resposta_em_audio: {
      ligado: true,
      provedor: "openai_compativel",
      endereco: `${base}/v1`,
      aceite: { em: "2026-10-15T12:00:00.000Z", por: ATOR },
      ...extra,
    },
  };
}

function montar(
  sobre: {
    entrada?: Partial<EntradaDoAudioDoTurno>;
    settings?: unknown;
    canal?: string | null;
    chave?: string | null;
    guardar?: DependenciasDoAudioDoTurno["guardar"];
  } = {},
) {
  const usos: UsoDaVoz[] = [];
  const guardados: Array<{ caminho: string; mime: string; bytes: string }> = [];
  const motivosDeTexto: string[] = [];
  const entrada: EntradaDoAudioDoTurno = {
    organizationId: ORG,
    conversationId: CONVERSA,
    contactId: "00000000-0000-4000-8000-0000000000d1",
    jobId: "00000000-0000-4000-8000-0000000000e1",
    agentId: "00000000-0000-4000-8000-0000000000f1",
    agente: { ativado: true, voz: null, modelo: null },
    clienteMandouAudio: true,
    ...sobre.entrada,
  };
  const leituras = { settings: 0, chaveConfigurada: 0, lerChave: 0, canal: 0 };
  const turno = criarAudioDoTurno(entrada, {
    lerSettings: async () => {
      leituras.settings += 1;
      return sobre.settings === undefined ? settingsLigadas() : sobre.settings;
    },
    provedorDoCanal: async () => {
      leituras.canal += 1;
      return sobre.canal === undefined ? PROVIDERS_DE_MENSAGEM[0] : sobre.canal;
    },
    chaveConfigurada: async () => {
      leituras.chaveConfigurada += 1;
      return sobre.chave !== null;
    },
    lerChave: async () => {
      leituras.lerChave += 1;
      return sobre.chave === undefined ? CHAVE : sobre.chave;
    },
    guardar:
      sobre.guardar ??
      (async (caminho, nota) => {
        guardados.push({ caminho, mime: nota.mime, bytes: nota.buffer.toString() });
      }),
    registrarUso: async (u) => {
      usos.push(u);
    },
    converter: async () => ({ buffer: OGG, mime: "audio/ogg;codecs=opus" }),
    fetch,
    aoCairEmTexto: (m) => motivosDeTexto.push(m),
  });
  return { turno, usos, guardados, motivosDeTexto, leituras };
}

describe("criarAudioDoTurno", () => {
  it("agente que não pediu áudio (todo agente existente) não paga nem uma leitura", () => {
    const { turno, leituras } = montar({ entrada: { agente: { ativado: false, voz: null, modelo: null } } });
    expect(turno).toBeNull();
    expect(leituras).toEqual({ settings: 0, chaveConfigurada: 0, lerChave: 0, canal: 0 });
    expect(recebidos).toHaveLength(0);
  });

  it("caminho feliz: o texto aprovado vai ao provedor e volta como nota de voz guardada na pasta da conversa", async () => {
    const { turno, usos, guardados } = montar();
    const texto = "Perfeito! Seu horário está confirmado para amanhã às 10h.";
    const e = await turno!.entregar(texto, 1);

    expect(e).toMatchObject({ formato: "audio", mime: "audio/ogg;codecs=opus", caracteres: texto.length });
    if (e.formato !== "audio") throw new Error("esperava áudio");
    expect(e.storagePath.startsWith(`${ORG}/${CONVERSA}/`)).toBe(true);

    // o provedor recebeu EXATAMENTE o texto aprovado, com a chave do cliente
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]!.url).toBe("/v1/audio/speech");
    expect(recebidos[0]!.chave).toBe(CHAVE);
    expect(JSON.parse(recebidos[0]!.corpo).input).toBe(texto);

    expect(guardados).toEqual([{ caminho: e.storagePath, mime: "audio/ogg;codecs=opus", bytes: OGG.toString() }]);
    expect(usos).toHaveLength(1);
    expect(usos[0]).toMatchObject({ organizationId: ORG, caracteres: texto.length, provedor: "openai_compativel" });
    expect(usos[0]!.falha).toBeUndefined();
  });

  it("vale para todo canal de mensagem que o produto conhece (todos declaram nota de voz)", async () => {
    for (const canal of PROVIDERS_DE_MENSAGEM) {
      const { turno } = montar({ canal });
      expect((await turno!.entregar("Tudo certo por aqui.", 1)).formato).toBe("audio");
    }
  });

  it("organização com o recurso desligado (o padrão): texto, e o provedor nem é chamado", async () => {
    for (const settings of [{}, null, { resposta_em_audio: { ligado: false } }, { resposta_em_audio: { ligado: true } }]) {
      const { turno, motivosDeTexto } = montar({ settings });
      const e = await turno!.entregar("oi", 1);
      expect(e).toEqual({ formato: "texto", motivo: "desligado_na_organizacao" });
      expect(motivosDeTexto).toEqual(["desligado_na_organizacao"]);
    }
    expect(recebidos).toHaveLength(0);
  });

  it("cliente que escreveu: texto, sem tocar na chave nem no canal", async () => {
    const { turno, leituras } = montar({ entrada: { clienteMandouAudio: false } });
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "cliente_nao_mandou_audio" });
    expect(leituras.lerChave).toBe(0);
    expect(recebidos).toHaveLength(0);
  });

  it("canal que não declara nota de voz recebe texto", async () => {
    const { turno } = montar({ canal: "canal-sem-nota-de-voz" });
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "canal_sem_nota_de_voz" });
    expect(recebidos).toHaveLength(0);
  });

  it("sem chave gravada: texto", async () => {
    const { turno } = montar({ chave: null });
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "sem_chave" });
    expect(recebidos).toHaveLength(0);
  });

  it("texto acima do limite de caracteres da organização: texto, e o limite é o da configuração", async () => {
    const { turno } = montar({ settings: settingsLigadas({ limite_de_caracteres: 100 }) });
    expect((await turno!.entregar("a".repeat(100), 1)).formato).toBe("audio");
    expect(await turno!.entregar("a".repeat(101), 1)).toEqual({ formato: "texto", motivo: "texto_longo_demais" });
  });

  it("chave inválida no provedor: cai em texto e registra a falha no uso (aparece na configuração e no uso de IA)", async () => {
    resposta = { status: 401, tipo: "application/json", corpo: JSON.stringify({ error: { message: "Incorrect API key" } }) };
    const { turno, usos, guardados } = montar();
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "chave_invalida" });
    expect(guardados).toHaveLength(0);
    expect(usos).toHaveLength(1);
    expect(usos[0]).toMatchObject({ falha: "chave_invalida", custoCents: null });
  });

  it("conta sem créditos: texto com o motivo certo", async () => {
    resposta = { status: 429, tipo: "application/json", corpo: JSON.stringify({ error: { code: "insufficient_quota" } }) };
    const { turno } = montar();
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "sem_creditos" });
  });

  it("provedor devolvendo lixo (HTML): texto", async () => {
    resposta = { status: 200, tipo: "text/html", corpo: "<html>manutenção</html>" };
    const { turno } = montar();
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "resposta_invalida" });
  });

  it("Storage que falha: texto — a nota de voz que não foi guardada não pode ser enviada", async () => {
    const { turno } = montar({
      guardar: async () => {
        throw new Error("sem espaço");
      },
    });
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "armazenamento_falhou" });
  });

  it("leitura de settings que explode vira texto, nunca exceção para o motor", async () => {
    const turno = criarAudioDoTurno(
      {
        organizationId: ORG,
        conversationId: CONVERSA,
        contactId: null,
        jobId: null,
        agentId: null,
        agente: { ativado: true, voz: null, modelo: null },
        clienteMandouAudio: true,
      },
      {
        lerSettings: async () => {
          throw new Error("banco fora");
        },
        provedorDoCanal: async () => PROVIDERS_DE_MENSAGEM[0],
        chaveConfigurada: async () => true,
        lerChave: async () => CHAVE,
        guardar: async () => {},
        registrarUso: async () => {},
      },
    );
    await expect(turno!.entregar("oi", 1)).resolves.toEqual({ formato: "texto", motivo: "indisponivel" });
  });

  it("ElevenLabs: usa a voz e o modelo do agente na rota do provedor", async () => {
    const { turno } = montar({
      settings: settingsLigadas({ provedor: "elevenlabs", endereco: null }),
      entrada: { agente: { ativado: true, voz: "voz-da-sofia", modelo: "eleven_turbo_v2_5" } },
    });
    // O adaptador da ElevenLabs tem endereço fixo; aqui o servidor de mentira entra pelo gancho de teste.
    const comEndereco = criarAudioDoTurno(
      {
        organizationId: ORG,
        conversationId: CONVERSA,
        contactId: null,
        jobId: null,
        agentId: null,
        agente: { ativado: true, voz: "voz-da-sofia", modelo: "eleven_turbo_v2_5" },
        clienteMandouAudio: true,
      },
      {
        lerSettings: async () => settingsLigadas({ provedor: "elevenlabs", endereco: null }),
        provedorDoCanal: async () => PROVIDERS_DE_MENSAGEM[0],
        chaveConfigurada: async () => true,
        lerChave: async () => CHAVE,
        guardar: async () => {},
        registrarUso: async () => {},
        converter: async () => ({ buffer: OGG, mime: "audio/ogg;codecs=opus" }),
        enderecoDaElevenLabs: base,
        fetch,
      },
    );
    expect(turno).not.toBeNull();
    const e = await comEndereco!.entregar("Bom dia!", 1);
    expect(e.formato).toBe("audio");
    expect(recebidos[0]!.url).toBe("/v1/text-to-speech/voz-da-sofia?output_format=mp3_44100_64");
    expect(recebidos[0]!.chave).toBe(CHAVE);
    expect(JSON.parse(recebidos[0]!.corpo)).toEqual({ text: "Bom dia!", model_id: "eleven_turbo_v2_5" });
  });

  it("ElevenLabs sem voz escolhida: texto, sem chamar o provedor", async () => {
    const { turno } = montar({ settings: settingsLigadas({ provedor: "elevenlabs", endereco: null }) });
    expect(await turno!.entregar("oi", 1)).toEqual({ formato: "texto", motivo: "sem_voz_escolhida" });
    expect(recebidos).toHaveLength(0);
  });
});

describe("simular (a prévia do agente)", () => {
  it("diz o formato em que a resposta SAIRIA, sem chamar o provedor nem gravar nada", async () => {
    const { turno, usos, guardados } = montar();
    expect(await turno!.simular("Pode ser às 10h?")).toEqual({ formato: "audio" });
    expect(recebidos).toHaveLength(0);
    expect(usos).toHaveLength(0);
    expect(guardados).toHaveLength(0);
  });

  it("e diz por que cairia em texto", async () => {
    const { turno } = montar({ entrada: { clienteMandouAudio: false } });
    expect(await turno!.simular("oi")).toEqual({ formato: "texto", motivo: "cliente_nao_mandou_audio" });
    const { turno: semChave } = montar({ chave: null });
    expect(await semChave!.simular("oi")).toEqual({ formato: "texto", motivo: "sem_chave" });
  });
});

describe("ultimaMensagemDoClienteFoiAudio", () => {
  it("olha a última do CLIENTE: texto depois do áudio muda o formato da resposta", () => {
    expect(ultimaMensagemDoClienteFoiAudio([{ direction: "inbound", type: "audio" }])).toBe(true);
    expect(
      ultimaMensagemDoClienteFoiAudio([
        { direction: "inbound", type: "audio" },
        { direction: "inbound" },
      ]),
    ).toBe(false);
  });

  it("ignora o que o agente mandou depois (saída não conta)", () => {
    expect(
      ultimaMensagemDoClienteFoiAudio([
        { direction: "inbound", type: "audio" },
        { direction: "outbound", type: "audio" },
        { direction: "outbound" },
      ]),
    ).toBe(true);
  });

  it("sem mensagem do cliente (follow-up proativo): não é resposta a áudio", () => {
    expect(ultimaMensagemDoClienteFoiAudio([])).toBe(false);
    expect(ultimaMensagemDoClienteFoiAudio([{ direction: "outbound", type: "audio" }])).toBe(false);
  });
});
