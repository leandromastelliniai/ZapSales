import { describe, expect, it } from "vitest";

import { caminhoDaNotaDeVoz, gerarNotaDeVozDaResposta, type DependenciasDaEntrega, type PedidoDaEntrega } from "./entrega";
import { ErroDeVoz, type ProvedorDeVoz } from "./tipos";
import type { UsoDaVoz } from "./uso";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const CONVERSA = "00000000-0000-4000-8000-0000000000c1";

const pedido: PedidoDaEntrega = {
  organizationId: ORG,
  conversationId: CONVERSA,
  contactId: "00000000-0000-4000-8000-0000000000d1",
  jobId: "00000000-0000-4000-8000-0000000000e1",
  agentId: "00000000-0000-4000-8000-0000000000f1",
  seq: 1,
  texto: "O horário das 10h está livre.",
  voz: null,
  modelo: null,
  provedor: "openai_compativel",
  modeloEmVigor: "tts-1",
  endereco: null,
  custoDeclaradoPorMil: null,
};

function montar(sobre: { provedor?: ProvedorDeVoz; converter?: DependenciasDaEntrega["converter"]; guardar?: DependenciasDaEntrega["guardar"] } = {}) {
  const chamadas: string[] = [];
  const usos: UsoDaVoz[] = [];
  const guardados: Array<{ caminho: string; mime: string }> = [];
  let relogio = 1000;
  const deps: DependenciasDaEntrega = {
    provedor: sobre.provedor ?? {
      id: "openai_compativel",
      async sintetizar() {
        chamadas.push("sintetizar");
        return { bytes: Buffer.from("mp3"), mime: "audio/mpeg" };
      },
    },
    converter:
      sobre.converter ??
      (async () => {
        chamadas.push("converter");
        return { buffer: Buffer.from("ogg"), mime: "audio/ogg;codecs=opus" };
      }),
    guardar:
      sobre.guardar ??
      (async (caminho, nota) => {
        chamadas.push("guardar");
        guardados.push({ caminho, mime: nota.mime });
      }),
    registrarUso: async (u) => {
      chamadas.push("registrar");
      usos.push(u);
    },
    agora: () => (relogio += 250),
  };
  return { deps, chamadas, usos, guardados };
}

describe("gerarNotaDeVozDaResposta", () => {
  it("sintetiza, converte, guarda e registra o uso — nessa ordem", async () => {
    const { deps, chamadas, usos, guardados } = montar();
    const r = await gerarNotaDeVozDaResposta(deps, pedido);
    expect(chamadas).toEqual(["sintetizar", "converter", "guardar", "registrar"]);
    expect(r).toMatchObject({ ok: true, mime: "audio/ogg;codecs=opus", caracteres: pedido.texto.length });
    expect(guardados).toHaveLength(1);
    expect(usos).toHaveLength(1);
    expect(usos[0]).toMatchObject({
      organizationId: ORG,
      provedor: "openai_compativel",
      modelo: "tts-1",
      caracteres: pedido.texto.length,
    });
    expect(usos[0]!.falha).toBeUndefined();
    // preço público da OpenAI para tts-1: 1,5¢ por mil caracteres
    expect(usos[0]!.custoCents).toBeCloseTo((pedido.texto.length / 1000) * 1.5);
  });

  it("o arquivo mora DENTRO da pasta da conversa (a única que o envio aceita e a LGPD apaga)", async () => {
    const { deps, guardados } = montar();
    const r = await gerarNotaDeVozDaResposta(deps, pedido);
    if (!r.ok) throw new Error("deveria ter gerado");
    expect(r.storagePath).toBe(guardados[0]!.caminho);
    expect(r.storagePath.startsWith(`${ORG}/${CONVERSA}/`)).toBe(true);
    expect(r.storagePath).not.toContain("..");
    expect(r.storagePath.endsWith(".ogg")).toBe(true);
  });

  it("o caminho é determinístico por (job, seq): replay reaproveita o arquivo", () => {
    expect(caminhoDaNotaDeVoz(pedido)).toBe(caminhoDaNotaDeVoz({ ...pedido }));
    expect(caminhoDaNotaDeVoz(pedido)).not.toBe(caminhoDaNotaDeVoz({ ...pedido, seq: 2 }));
  });

  it("o id do job não escapa da pasta nem injeta segmento", () => {
    const c = caminhoDaNotaDeVoz({ ...pedido, jobId: "../../outra/org" });
    expect(c.startsWith(`${ORG}/${CONVERSA}/`)).toBe(true);
    expect(c.slice(`${ORG}/${CONVERSA}/`.length)).not.toContain("/");
  });

  it("falha do provedor vira { ok:false } com o motivo, registra o uso como erro e NÃO converte nem guarda", async () => {
    const { deps, chamadas, usos } = montar({
      provedor: {
        id: "openai_compativel",
        async sintetizar() {
          throw new ErroDeVoz("sem_creditos", { status: 402 });
        },
      },
    });
    const r = await gerarNotaDeVozDaResposta(deps, pedido);
    expect(r).toMatchObject({ ok: false, motivo: "sem_creditos" });
    expect(chamadas).toEqual(["registrar"]);
    expect(usos[0]).toMatchObject({ falha: "sem_creditos", custoCents: null });
  });

  it("erro que não é de voz também vira texto (indisponivel), nunca exceção", async () => {
    const { deps } = montar({
      provedor: {
        id: "elevenlabs",
        async sintetizar() {
          throw new TypeError("fetch failed");
        },
      },
    });
    expect(await gerarNotaDeVozDaResposta(deps, pedido)).toMatchObject({ ok: false, motivo: "indisponivel" });
  });

  it("conversão que falha: motivo conversao_falhou, nada guardado", async () => {
    const { deps, chamadas } = montar({
      converter: async () => {
        throw new ErroDeVoz("conversao_falhou", { detalhe: "ffmpeg_exit_1" });
      },
    });
    expect(await gerarNotaDeVozDaResposta(deps, pedido)).toMatchObject({ ok: false, motivo: "conversao_falhou" });
    // sintetizou (e pagou), converteu e falhou: não guarda nada, registra o erro
    expect(chamadas).toEqual(["sintetizar", "registrar"]);
  });

  it("Storage que falha: armazenamento_falhou, e o uso registrado é de falha (o arquivo não existe)", async () => {
    const { deps, usos } = montar({
      guardar: async () => {
        throw new Error("bucket indisponível");
      },
    });
    const r = await gerarNotaDeVozDaResposta(deps, pedido);
    expect(r).toMatchObject({ ok: false, motivo: "armazenamento_falhou" });
    expect(usos[0]).toMatchObject({ falha: "armazenamento_falhou" });
  });

  it("modelo sem preço conhecido: sucesso com custo null, nunca 0", async () => {
    const { deps, usos } = montar();
    const r = await gerarNotaDeVozDaResposta(deps, { ...pedido, provedor: "elevenlabs", modeloEmVigor: "eleven_multilingual_v2" });
    expect(r).toMatchObject({ ok: true, custoCents: null });
    expect(usos[0]!.custoCents).toBeNull();
    expect(usos[0]!.falha).toBeUndefined();
  });

  it("preço declarado pelo administrador entra no custo", async () => {
    const { deps } = montar();
    const r = await gerarNotaDeVozDaResposta(deps, {
      ...pedido,
      provedor: "elevenlabs",
      modeloEmVigor: "eleven_multilingual_v2",
      custoDeclaradoPorMil: 30,
      texto: "a".repeat(200),
    });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.custoCents).toBeCloseTo(6);
  });
});
