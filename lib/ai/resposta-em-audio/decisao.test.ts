import { describe, expect, it } from "vitest";

import { configDeAudioSchema, type ConfigDeAudio } from "./config";
import { MOTIVOS_DE_TEXTO, decidirRespostaEmAudio, type EntradaDaDecisao } from "./decisao";

const ligada: ConfigDeAudio = configDeAudioSchema.parse({
  ligado: true,
  aceite: { em: "2026-10-15T12:00:00.000Z", por: "11111111-1111-4111-8111-111111111111" },
});

const TEXTO = "Claro! O horário de amanhã às 10h está livre.";

function entrada(sobre: Partial<EntradaDaDecisao> = {}): EntradaDaDecisao {
  return {
    config: ligada,
    chavePresente: true,
    agente: { ativado: true, voz: null },
    clienteMandouAudio: true,
    canalAceitaNotaDeVoz: true,
    texto: TEXTO,
    ...sobre,
  };
}

describe("decidirRespostaEmAudio", () => {
  it("responde em áudio quando tudo está ligado e o cliente mandou áudio", () => {
    expect(decidirRespostaEmAudio(entrada())).toEqual({ vai: true, caracteres: TEXTO.length });
  });

  it("organização desligada (o padrão) nunca responde em áudio", () => {
    const padrao = configDeAudioSchema.parse({});
    expect(padrao.ligado).toBe(false);
    expect(decidirRespostaEmAudio(entrada({ config: padrao }))).toEqual({
      vai: false,
      motivo: "desligado_na_organizacao",
    });
  });

  it("ligado SEM o aceite do administrador vale como desligado", () => {
    const semAceite = { ...ligada, aceite: null } as ConfigDeAudio;
    expect(decidirRespostaEmAudio(entrada({ config: semAceite }))).toEqual({
      vai: false,
      motivo: "desligado_na_organizacao",
    });
  });

  it("agente com a opção desligada (o padrão) responde em texto", () => {
    expect(decidirRespostaEmAudio(entrada({ agente: { ativado: false, voz: null } }))).toEqual({
      vai: false,
      motivo: "desligado_no_agente",
    });
  });

  it("sem chave gravada, texto", () => {
    expect(decidirRespostaEmAudio(entrada({ chavePresente: false }))).toEqual({
      vai: false,
      motivo: "sem_chave",
    });
  });

  it("cliente que escreveu recebe texto: o agente espelha o formato do cliente", () => {
    expect(decidirRespostaEmAudio(entrada({ clienteMandouAudio: false }))).toEqual({
      vai: false,
      motivo: "cliente_nao_mandou_audio",
    });
  });

  it("canal que não declara nota de voz recebe texto", () => {
    expect(decidirRespostaEmAudio(entrada({ canalAceitaNotaDeVoz: false }))).toEqual({
      vai: false,
      motivo: "canal_sem_nota_de_voz",
    });
  });

  it("texto vazio não vira áudio", () => {
    expect(decidirRespostaEmAudio(entrada({ texto: "   " }))).toEqual({
      vai: false,
      motivo: "texto_vazio",
    });
  });

  it("texto acima do limite da organização sai como texto (nunca é cortado)", () => {
    const limite = ligada.limite_de_caracteres;
    expect(decidirRespostaEmAudio(entrada({ texto: "a".repeat(limite) })).vai).toBe(true);
    expect(decidirRespostaEmAudio(entrada({ texto: "a".repeat(limite + 1) }))).toEqual({
      vai: false,
      motivo: "texto_longo_demais",
    });
  });

  it("ElevenLabs sem voz escolhida (no agente ou na organização) cai em texto", () => {
    const eleven = { ...ligada, provedor: "elevenlabs" } as ConfigDeAudio;
    expect(decidirRespostaEmAudio(entrada({ config: eleven }))).toEqual({
      vai: false,
      motivo: "sem_voz_escolhida",
    });
    expect(
      decidirRespostaEmAudio(entrada({ config: eleven, agente: { ativado: true, voz: "abc" } })).vai,
    ).toBe(true);
    expect(decidirRespostaEmAudio(entrada({ config: { ...eleven, voz: "padrao" } })).vai).toBe(true);
  });

  it("todo motivo do vocabulário é alcançável, e nenhum fora dele aparece", () => {
    const vistos = new Set<string>();
    const casos: Array<Partial<EntradaDaDecisao>> = [
      { config: configDeAudioSchema.parse({}) },
      { agente: { ativado: false, voz: null } },
      { chavePresente: false },
      { clienteMandouAudio: false },
      { canalAceitaNotaDeVoz: false },
      { texto: "" },
      { texto: "a".repeat(5000) },
      { config: { ...ligada, provedor: "elevenlabs" } as ConfigDeAudio },
    ];
    for (const c of casos) {
      const d = decidirRespostaEmAudio(entrada(c));
      if (!d.vai) vistos.add(d.motivo);
    }
    expect([...vistos].sort()).toEqual([...MOTIVOS_DE_TEXTO].sort());
  });
});
