import { describe, expect, it } from "vitest";

import { descreverFerramentasDescobertas, prepararSelecao } from "./selecao";
import type { FerramentaDoServidor } from "./tipos";
import { impressaoDaDefinicao } from "./esquema";

const estoque: FerramentaDoServidor = {
  nome: "consultar_estoque",
  titulo: "Consultar estoque",
  descricao: "Consulta quantas unidades de um produto existem em estoque.",
  esquema: { type: "object", properties: { produto: { type: "string", description: "Nome do produto" } }, required: ["produto"] },
  somenteLeituraDeclarado: true,
};
const pedido: FerramentaDoServidor = {
  nome: "criar_pedido",
  titulo: null,
  descricao: "Cria um pedido.",
  esquema: { type: "object", properties: { produto: { type: "string", description: "Produto" }, quantidade: { type: "integer", description: "Quantidade" } }, required: ["produto"] },
  somenteLeituraDeclarado: null,
};
const complexa: FerramentaDoServidor = {
  nome: "com_lista",
  titulo: null,
  descricao: "Pede uma lista.",
  esquema: { type: "object", properties: { itens: { type: "array", items: { type: "string" } } }, required: ["itens"] },
  somenteLeituraDeclarado: null,
};

describe("prepararSelecao — do que o servidor oferece ao que o administrador escolhe", () => {
  it("o padrão do risco é «altera dados», mesmo quando o servidor jura que só lê", () => {
    const r = prepararSelecao({ servidorNome: "ERP", oferecidas: [estoque], escolhidas: [{ ferramenta: "consultar_estoque" }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0]).toMatchObject({
      nomeNoServidor: "consultar_estoque",
      efeito: "altera",
      pedirAprovacao: null,
      dicaSomenteLeitura: true,
    });
  });

  it("o administrador marca «só consulta» — e só ele", () => {
    const r = prepararSelecao({
      servidorNome: "ERP",
      oferecidas: [estoque, pedido],
      escolhidas: [{ ferramenta: "consultar_estoque", efeito: "consulta" }, { ferramenta: "criar_pedido" }],
    });
    expect(r.ok && r.itens.map((i) => [i.nomeNoServidor, i.efeito])).toEqual([
      ["consultar_estoque", "consulta"],
      ["criar_pedido", "altera"],
    ]);
  });

  it("monta os campos, o nome, o «quando usar» e a impressão da definição que o administrador viu", () => {
    const r = prepararSelecao({ servidorNome: "ERP", oferecidas: [estoque], escolhidas: [{ ferramenta: "consultar_estoque" }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const item = r.itens[0]!;
    expect(item.nome).toBe("Consultar estoque");
    expect(item.quandoUsar).toBe(estoque.descricao);
    expect(item.parametros).toEqual([{ nome: "produto", tipo: "texto", descricao: "Nome do produto", obrigatorio: true }]);
    expect(item.impressao).toBe(impressaoDaDefinicao({ descricao: estoque.descricao, esquema: estoque.esquema }));
  });

  it("o texto que o administrador escreveu em «quando usar» vence o do servidor", () => {
    const r = prepararSelecao({
      servidorNome: "ERP",
      oferecidas: [estoque],
      escolhidas: [{ ferramenta: "consultar_estoque", quando_usar: "Use quando o cliente perguntar se tem o produto." }],
    });
    expect(r.ok && r.itens[0]?.quandoUsar).toBe("Use quando o cliente perguntar se tem o produto.");
  });

  it("descrição curta demais do servidor ganha uma frase que diz onde a ferramenta está", () => {
    const curta: FerramentaDoServidor = { ...pedido, descricao: "Cria." };
    const r = prepararSelecao({ servidorNome: "ERP", oferecidas: [curta], escolhidas: [{ ferramenta: "criar_pedido" }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens[0]!.quandoUsar.length).toBeGreaterThanOrEqual(10);
    expect(r.itens[0]!.quandoUsar).toContain("criar_pedido");
    // E sem título, o nome da ferramenta no servidor vira o nome (3 a 60 caracteres).
    expect(r.itens[0]!.nome).toBe("criar_pedido");
  });

  it("nome curto demais do servidor é completado para caber nos 3 caracteres mínimos", () => {
    const curta: FerramentaDoServidor = { ...estoque, nome: "ls", titulo: null };
    const r = prepararSelecao({ servidorNome: "ERP", oferecidas: [curta], escolhidas: [{ ferramenta: "ls" }] });
    expect(r.ok && r.itens[0]?.nome.length).toBeGreaterThanOrEqual(3);
  });

  it("recusa ferramenta que o servidor não oferece agora", () => {
    const r = prepararSelecao({ servidorNome: "ERP", oferecidas: [estoque], escolhidas: [{ ferramenta: "apagar_tudo" }] });
    expect(r).toEqual({ ok: false, erros: [{ ferramenta: "apagar_tudo", motivo: "nao_existe_no_servidor" }] });
  });

  it("recusa ferramenta que o agente não sabe preencher, dizendo por quê", () => {
    const r = prepararSelecao({ servidorNome: "ERP", oferecidas: [complexa], escolhidas: [{ ferramenta: "com_lista" }] });
    expect(r).toEqual({ ok: false, erros: [{ ferramenta: "com_lista", motivo: "campo_obrigatorio_complexo" }] });
  });

  it("seleção vazia é válida (o administrador tirou tudo)", () => {
    expect(prepararSelecao({ servidorNome: "ERP", oferecidas: [estoque], escolhidas: [] })).toEqual({ ok: true, itens: [] });
  });
});

describe("descreverFerramentasDescobertas — o que a tela mostra para o administrador escolher", () => {
  it("diz o que cada ferramenta é, se o agente consegue usá-la, a dica do servidor e se já foi escolhida", () => {
    const lista = descreverFerramentasDescobertas({
      oferecidas: [estoque, pedido, complexa],
      escolhidas: [
        {
          id: "t1",
          nomeNoServidor: "consultar_estoque",
          efeito: "consulta",
          pedirAprovacao: null,
          validadeHoras: 24,
          ativa: true,
          quandoUsar: "Use para ver estoque.",
          impressao: impressaoDaDefinicao({ descricao: estoque.descricao, esquema: estoque.esquema }),
        },
      ],
    });
    expect(lista.map((l) => l.ferramenta)).toEqual(["consultar_estoque", "criar_pedido", "com_lista"]);
    expect(lista[0]).toMatchObject({ suportada: true, escolhida: true, efeito: "consulta", mudou_no_servidor: false, quando_usar: "Use para ver estoque.", dica_somente_leitura: true });
    expect(lista[1]).toMatchObject({ suportada: true, escolhida: false, efeito: "altera", mudou_no_servidor: false });
    expect(lista[2]).toMatchObject({ suportada: false, motivo_nao_suportada: "campo_obrigatorio_complexo", escolhida: false });
  });

  it("avisa quando o servidor mudou a ferramenta depois de o administrador escolhê-la", () => {
    const lista = descreverFerramentasDescobertas({
      oferecidas: [{ ...estoque, descricao: "Consulta o estoque E apaga o histórico." }],
      escolhidas: [
        {
          id: "t1",
          nomeNoServidor: "consultar_estoque",
          efeito: "consulta",
          pedirAprovacao: null,
          validadeHoras: 24,
          ativa: true,
          quandoUsar: "Use para ver estoque.",
          impressao: impressaoDaDefinicao({ descricao: estoque.descricao, esquema: estoque.esquema }),
        },
      ],
    });
    expect(lista[0]).toMatchObject({ escolhida: true, mudou_no_servidor: true });
  });

  it("ferramenta escolhida que o servidor já não oferece aparece como sumida, para o administrador poder tirá-la", () => {
    const lista = descreverFerramentasDescobertas({
      oferecidas: [],
      escolhidas: [
        { id: "t9", nomeNoServidor: "antiga", efeito: "altera", pedirAprovacao: null, validadeHoras: 24, ativa: true, quandoUsar: "Texto qualquer aqui.", impressao: "x" },
      ],
    });
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ ferramenta: "antiga", escolhida: true, sumiu_do_servidor: true });
  });
});
