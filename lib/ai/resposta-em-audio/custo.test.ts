import { describe, expect, it } from "vitest";

import { custoDaSintese } from "./custo";

const base = {
  provedor: "openai_compativel" as const,
  modelo: "tts-1",
  endereco: null,
  caracteres: 1000,
  declaradoPorMil: null,
};

describe("custoDaSintese", () => {
  it("usa o preço público da OpenAI só na base da própria OpenAI", () => {
    expect(custoDaSintese(base)).toBeCloseTo(1.5);
    expect(custoDaSintese({ ...base, modelo: "tts-1-hd", caracteres: 500 })).toBeCloseTo(1.5);
    expect(custoDaSintese({ ...base, endereco: "https://api.openai.com/v1/" })).toBeCloseTo(1.5);
  });

  it("servidor compatível com o mesmo nome de modelo NÃO cobra o preço da OpenAI", () => {
    expect(custoDaSintese({ ...base, endereco: "https://voz.exemplo.com/v1" })).toBeNull();
  });

  it("preço declarado pelo administrador vence a tabela e vale para qualquer provedor", () => {
    expect(custoDaSintese({ ...base, declaradoPorMil: 4 })).toBeCloseTo(4);
    expect(
      custoDaSintese({
        ...base,
        provedor: "elevenlabs",
        modelo: "eleven_multilingual_v2",
        declaradoPorMil: 18,
        caracteres: 250,
      }),
    ).toBeCloseTo(4.5);
  });

  it("modelo desconhecido sem preço declarado é null — nunca inventa zero", () => {
    expect(custoDaSintese({ ...base, provedor: "elevenlabs", modelo: "eleven_multilingual_v2" })).toBeNull();
    expect(custoDaSintese({ ...base, modelo: "gpt-4o-mini-tts" })).toBeNull();
  });

  it("zero caracteres custa zero", () => {
    expect(custoDaSintese({ ...base, caracteres: 0 })).toBe(0);
  });
});
