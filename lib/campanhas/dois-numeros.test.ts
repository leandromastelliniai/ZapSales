import { describe, expect, it } from "vitest";

import { botaoWaMe, mapaComNumeroDeAtendimento, recusaDoBotaoWaMe } from "./dois-numeros";

const comBotoes = (...urls: string[]) => [
  { type: "BODY", text: "Oi {{1}}, temos novidade." },
  {
    type: "BUTTONS",
    buttons: [{ type: "QUICK_REPLY", text: "Parar" }, ...urls.map((url) => ({ type: "URL", text: "Falar com a gente", url }))],
  },
];

const NUMERO = "+55 31 99999-0000";

describe("botaoWaMe — o botão do modelo que abre conversa no WhatsApp", () => {
  it("URL fixa para wa.me: o número vem da URL, sem variável nossa", () => {
    expect(botaoWaMe(comBotoes("https://wa.me/5531999990000"))).toEqual({
      index: 1,
      url: "https://wa.me/5531999990000",
      numeroFixo: "5531999990000",
      slot: null,
    });
  });

  it("URL dinâmica com a variável logo depois de wa.me/: a variável é o número", () => {
    const b = botaoWaMe(comBotoes("https://wa.me/{{1}}"));
    expect(b?.slot).toBe("button1:1");
    expect(b?.numeroFixo).toBeNull();
  });

  it("número fixo com texto dinâmico: o número é o da URL, a variável é do operador", () => {
    const b = botaoWaMe(comBotoes("https://wa.me/5531999990000?text={{1}}"));
    expect(b?.numeroFixo).toBe("5531999990000");
    expect(b?.slot).toBeNull();
  });

  it("api.whatsapp.com/send?phone= também abre conversa", () => {
    expect(botaoWaMe(comBotoes("https://api.whatsapp.com/send?phone=5531999990000"))?.numeroFixo).toBe(
      "5531999990000",
    );
  });

  it("botão de link para outro site não é wa.me", () => {
    expect(botaoWaMe(comBotoes("https://loja.example/promo"))).toBeNull();
    expect(botaoWaMe(comBotoes("https://wa.me.example.com/5531999990000"))).toBeNull();
    expect(botaoWaMe([{ type: "BODY", text: "sem botão" }])).toBeNull();
    expect(botaoWaMe(null)).toBeNull();
  });
});

describe("recusaDoBotaoWaMe — o modelo serve para o modo dois números com ESTE número?", () => {
  it("sem botão wa.me, recusa dizendo o que falta", () => {
    expect(recusaDoBotaoWaMe(comBotoes("https://loja.example"), NUMERO)).toMatch(/botão de link/);
  });

  it("URL fixa para OUTRO número recusa, nomeando os dois", () => {
    const r = recusaDoBotaoWaMe(comBotoes("https://wa.me/5531988880000"), NUMERO);
    expect(r).toContain("5531988880000");
  });

  it("URL fixa para o mesmo número aceita, inclusive sem o nono dígito", () => {
    expect(recusaDoBotaoWaMe(comBotoes("https://wa.me/5531999990000"), NUMERO)).toBeNull();
    expect(recusaDoBotaoWaMe(comBotoes("https://wa.me/553199990000"), NUMERO)).toBeNull();
  });

  it("URL dinâmica aceita — o sistema preenche", () => {
    expect(recusaDoBotaoWaMe(comBotoes("https://wa.me/{{1}}"), NUMERO)).toBeNull();
  });

  it("número de atendimento sem telefone conhecido recusa", () => {
    expect(recusaDoBotaoWaMe(comBotoes("https://wa.me/{{1}}"), null)).toMatch(/telefone/);
  });
});

describe("mapaComNumeroDeAtendimento — a variável do botão sai do número, não do operador", () => {
  it("preenche o slot dinâmico com os dígitos do número", () => {
    const mapa = mapaComNumeroDeAtendimento(comBotoes("https://wa.me/{{1}}"), { "1": { tipo: "contato", campo: "nome" } }, NUMERO);
    expect(mapa).toEqual({
      "1": { tipo: "contato", campo: "nome" },
      "button1:1": { tipo: "fixo", valor: "5531999990000" },
    });
  });

  it("URL fixa não muda o mapa", () => {
    const original = { "1": { tipo: "contato" as const, campo: "nome" as const } };
    expect(mapaComNumeroDeAtendimento(comBotoes("https://wa.me/5531999990000"), original, NUMERO)).toEqual(original);
  });
});
