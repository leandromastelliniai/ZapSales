import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * DE ONDE VÊM AS DEFINIÇÕES APROVADAS, E O QUE ELAS DIZEM.
 *
 * Que a tela não decida a fonte com o nome do provider na mão; que o seletor do
 * inbox leia a fonte pelo rótulo neutro; e que a lista de uma conta não vaze
 * para a conversa da outra.
 */
import { fonteDeTemplates, rotaDeTemplates } from "@/lib/channels/templates-fonte";
import { lerConteudo } from "@/lib/channels/template-conteudo";

describe("de onde vêm as definições", () => {
  it("canal oficial busca na rota de sempre", () => {
    expect(fonteDeTemplates("meta_cloud")).toBe("oficial");
    expect(rotaDeTemplates("oficial")).toBe("/api/v1/channels/templates");
  });

  it("número por QR não tem definição a listar", () => {
    // Ele manda texto livre a qualquer hora: um seletor ali ofereceria uma
    // solução para um problema que aquele canal não tem.
    expect(fonteDeTemplates("waha")).toBeNull();
  });

  it("sem canal resolvido, ou canal desconhecido, não busca nada", () => {
    expect(fonteDeTemplates(null)).toBeNull();
    expect(fonteDeTemplates(undefined)).toBeNull();
    expect(fonteDeTemplates("canal_que_nao_existe")).toBeNull();
  });
});

describe("os elos que somem sem barulho", () => {
  it("a tela do inbox NÃO decide pelo nome do provider", () => {
    const fonte = readFileSync("components/inbox/JanelaFechadaAviso.tsx", "utf8");
    expect(fonte).toMatch(/fonteDeTemplates/);
    expect(fonte, "a tela está nomeando provider").not.toMatch(/"meta_cloud"|"waha"/);
  });

  it("o cache é POR FONTE — senão a lista de uma conta vaza para a outra", () => {
    // Trocar de conversa entre canais com a mesma chave serviria o cache do
    // anterior, e o operador mandaria um modelo que não existe nesta conta.
    const fonte = readFileSync("components/inbox/JanelaFechadaAviso.tsx", "utf8");
    expect(fonte).toMatch(/queryKey: \["templates-da-conversa", fonte\]/);
  });
});

describe("o conteúdo da definição", () => {
  it("lê corpo, cabeçalho, rodapé e botões do payload cru", () => {
    const c = lerConteudo([
      { type: "HEADER", format: "TEXT", text: "Olá" },
      { type: "BODY", text: "Seu pedido {{1}} chega dia {{2}}." },
      { type: "FOOTER", text: "Equipe" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Rastrear" }] },
    ]);
    expect(c.body).toContain("Seu pedido");
    expect(c.header).toMatchObject({ formato: "TEXT", texto: "Olá" });
    expect(c.footer).toBe("Equipe");
    expect(c.botoes).toEqual([{ tipo: "URL", texto: "Rastrear" }]);
  });

  it("tolera caixa minúscula — leitura e escrita usam formatos diferentes", () => {
    // A leitura vem da plataforma em maiúsculas; o payload de escrita, em
    // minúsculas. Um lado só faria metade das definições parecer vazia.
    const c = lerConteudo([{ type: "body", text: "oi" }]);
    expect(c.body).toBe("oi");
  });

  it("definição sem rodapé não é erro", () => {
    const c = lerConteudo([{ type: "BODY", text: "oi" }]);
    expect(c.footer).toBeNull();
    expect(c.botoes).toEqual([]);
  });

  it("conta as variáveis pelo MAIOR índice, não pelas ocorrências", () => {
    // `{{1}}` repetido pede UM valor; `{{1}}` e `{{3}}` pedem TRÊS, porque a
    // plataforma numera por posição e recusa lista com buracos.
    const variaveis = (text: string) => lerConteudo([{ type: "BODY", text }]).variaveis;
    expect(variaveis("oi {{1}}, tudo bem {{1}}?")).toBe(1);
    expect(variaveis("{{1}} e {{3}}")).toBe(3);
    expect(variaveis("sem variável")).toBe(0);
  });
});
