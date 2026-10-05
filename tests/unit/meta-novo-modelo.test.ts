/**
 * O MODELO CRIADO NO ZAPSALES, NO FORMATO QUE A META ACEITA (issue #6).
 *
 * `montarPedidoDeModelo` é a única peça que traduz o que o operador digitou no
 * editor para o corpo de `POST /{waba}/message_templates`. `problemasDoModelo`
 * diz ANTES do envio o que a Meta recusaria — variável sem exemplo, variável na
 * ponta do corpo, sequência posicional furada —, porque a recusa da Meta chega
 * como código e frase em inglês, depois de uma ida e volta.
 *
 * `previewDoModelo` é o que a tela mostra: o corpo com os exemplos aplicados,
 * o rodapé e os botões. A tela não remonta nada disso por conta própria.
 *
 * Medir: `pnpm vitest run tests/unit/meta-novo-modelo.test.ts`
 */
import { describe, expect, it } from "vitest";

import {
  montarPedidoDeModelo,
  novoModeloSchema,
  previewDoModelo,
  problemasDoModelo,
  variaveisDoTexto,
  type NovoModelo,
} from "@/lib/channels/meta/novo-modelo";
import { deriveTemplateContract } from "@/lib/channels/meta/template-contract";

function modelo(parcial: Partial<NovoModelo> = {}): NovoModelo {
  return {
    kind: "STANDARD",
    name: "oferta_de_outubro",
    language: "pt_BR",
    category: "MARKETING",
    parameter_format: "POSITIONAL",
    body: "Olá {{1}}, sua oferta de {{2}} chegou.",
    examples: { "1": "Ana", "2": "outubro" },
    header: null,
    offer: null,
    footer: null,
    buttons: [],
    cards: [],
    ...parcial,
  };
}

describe("variaveisDoTexto", () => {
  it("devolve cada variável uma vez, na ordem em que aparece", () => {
    expect(variaveisDoTexto("{{2}} e {{1}} e {{2}}")).toEqual(["2", "1"]);
    expect(variaveisDoTexto("Oi {{nome}}, pedido {{pedido}}")).toEqual(["nome", "pedido"]);
    expect(variaveisDoTexto("sem variável")).toEqual([]);
  });
});

describe("montarPedidoDeModelo — posicional", () => {
  it("leva o corpo com os exemplos em `body_text`, na ordem 1..n", () => {
    const pedido = montarPedidoDeModelo(modelo({ examples: { "2": "outubro", "1": "Ana" } }));
    expect(pedido).toEqual({
      name: "oferta_de_outubro",
      language: "pt_BR",
      category: "MARKETING",
      parameter_format: "POSITIONAL",
      components: [
        {
          type: "BODY",
          text: "Olá {{1}}, sua oferta de {{2}} chegou.",
          example: { body_text: [["Ana", "outubro"]] },
        },
      ],
    });
  });

  it("corpo sem variável não leva `example`", () => {
    const pedido = montarPedidoDeModelo(modelo({ body: "Sua oferta chegou.", examples: {} }));
    expect(pedido.components).toEqual([{ type: "BODY", text: "Sua oferta chegou." }]);
  });
});

describe("montarPedidoDeModelo — nomeado", () => {
  it("leva `body_text_named_params` com o nome e o exemplo de cada variável", () => {
    const pedido = montarPedidoDeModelo(
      modelo({
        parameter_format: "NAMED",
        body: "Olá {{nome}}, seu pedido {{pedido}} saiu.",
        examples: { nome: "Ana", pedido: "ZAP-1" },
      }),
    );
    expect(pedido.parameter_format).toBe("NAMED");
    expect(pedido.components[0]).toEqual({
      type: "BODY",
      text: "Olá {{nome}}, seu pedido {{pedido}} saiu.",
      example: {
        body_text_named_params: [
          { param_name: "nome", example: "Ana" },
          { param_name: "pedido", example: "ZAP-1" },
        ],
      },
    });
  });
});

describe("montarPedidoDeModelo — rodapé e botões", () => {
  it("rodapé vira FOOTER e os botões vão num BUTTONS só, na ordem do editor", () => {
    const pedido = montarPedidoDeModelo(
      modelo({
        footer: "Loja de Teste",
        buttons: [
          { type: "QUICK_REPLY", text: "Quero" },
          { type: "QUICK_REPLY", text: "Não quero" },
          {
            type: "URL",
            text: "Ver pedido",
            url: "https://loja.exemplo/pedido/{{1}}",
            example: "ZAP-1",
          },
          { type: "COPY_CODE", example: "OUTUBRO10" },
        ],
      }),
    );
    expect(pedido.components.slice(1)).toEqual([
      { type: "FOOTER", text: "Loja de Teste" },
      {
        type: "BUTTONS",
        buttons: [
          { type: "QUICK_REPLY", text: "Quero" },
          { type: "QUICK_REPLY", text: "Não quero" },
          {
            type: "URL",
            text: "Ver pedido",
            url: "https://loja.exemplo/pedido/{{1}}",
            example: ["https://loja.exemplo/pedido/ZAP-1"],
          },
          { type: "COPY_CODE", example: "OUTUBRO10" },
        ],
      },
    ]);
  });

  it("botão de URL fixa não leva `example`", () => {
    const pedido = montarPedidoDeModelo(
      modelo({ buttons: [{ type: "URL", text: "Site", url: "https://loja.exemplo" }] }),
    );
    expect(pedido.components[1]).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "URL", text: "Site", url: "https://loja.exemplo" }],
    });
  });

  it("o contrato derivado do que foi enviado enxerga as variáveis do corpo, do URL e do cupom", () => {
    // O espelho local guarda os `components` enviados; o envio do modelo deriva
    // dali os parâmetros. Se o montador escrevesse algo que o contrato não lê,
    // o modelo criado aqui nasceria impossível de disparar.
    const pedido = montarPedidoDeModelo(
      modelo({
        buttons: [
          { type: "URL", text: "Ver", url: "https://loja.exemplo/p/{{1}}", example: "1" },
          { type: "COPY_CODE", example: "CUPOM" },
        ],
      }),
    );
    const contrato = deriveTemplateContract({
      name: pedido.name,
      language: pedido.language,
      parameter_format: pedido.parameter_format,
      components: pedido.components as never,
    });
    expect(contrato.slots.map((s) => s.expects).sort()).toEqual(
      ["coupon_code", "text", "text", "url_suffix"].sort(),
    );
  });
});

describe("problemasDoModelo — o que a Meta recusaria", () => {
  it("modelo bem formado não tem problema", () => {
    expect(problemasDoModelo(modelo())).toEqual([]);
  });

  it("variável sem exemplo", () => {
    expect(problemasDoModelo(modelo({ examples: { "1": "Ana" } }))).toContainEqual({
      campo: "examples.2",
      motivo: "exemplo_obrigatorio",
    });
  });

  it("sequência posicional furada ({{1}} e {{3}} sem {{2}})", () => {
    const p = problemasDoModelo(
      modelo({ body: "Olá {{1}}, código {{3}} pronto.", examples: { "1": "a", "3": "b" } }),
    );
    expect(p).toContainEqual({ campo: "body", motivo: "variaveis_fora_de_sequencia" });
  });

  it("variável nomeada num modelo posicional, e número num modelo nomeado", () => {
    expect(
      problemasDoModelo(modelo({ body: "Olá {{nome}} hoje.", examples: { nome: "Ana" } })),
    ).toContainEqual({ campo: "body", motivo: "variavel_posicional_esperada" });
    expect(
      problemasDoModelo(
        modelo({ parameter_format: "NAMED", body: "Olá {{1}} hoje.", examples: { "1": "Ana" } }),
      ),
    ).toContainEqual({ campo: "body", motivo: "variavel_nomeada_invalida" });
  });

  it("variável no começo ou no fim do corpo", () => {
    expect(
      problemasDoModelo(
        modelo({ body: "{{1}}, sua oferta de {{2}}", examples: { "1": "a", "2": "b" } }),
      ),
    ).toContainEqual({ campo: "body", motivo: "variavel_na_ponta" });
  });

  it("rodapé com variável", () => {
    expect(problemasDoModelo(modelo({ footer: "Oi {{1}}" }))).toContainEqual({
      campo: "footer",
      motivo: "rodape_sem_variavel",
    });
  });

  it("URL que não é https, e variável de URL fora do fim ou sem exemplo", () => {
    expect(
      problemasDoModelo(
        modelo({ buttons: [{ type: "URL", text: "Ver", url: "http://loja.exemplo" }] }),
      ),
    ).toContainEqual({ campo: "buttons.0.url", motivo: "url_https" });
    expect(
      problemasDoModelo(
        modelo({
          buttons: [
            { type: "URL", text: "Ver", url: "https://loja.exemplo/{{1}}/x", example: "a" },
          ],
        }),
      ),
    ).toContainEqual({ campo: "buttons.0.url", motivo: "variavel_de_url_no_fim" });
    expect(
      problemasDoModelo(
        modelo({ buttons: [{ type: "URL", text: "Ver", url: "https://loja.exemplo/{{1}}" }] }),
      ),
    ).toContainEqual({ campo: "buttons.0.example", motivo: "exemplo_obrigatorio" });
  });

  it("respostas rápidas separadas por um botão de ação", () => {
    expect(
      problemasDoModelo(
        modelo({
          buttons: [
            { type: "QUICK_REPLY", text: "A" },
            { type: "URL", text: "Site", url: "https://loja.exemplo" },
            { type: "QUICK_REPLY", text: "B" },
          ],
        }),
      ),
    ).toContainEqual({ campo: "buttons", motivo: "respostas_rapidas_juntas" });
  });

  it("mais de dois botões de URL, ou mais de um de copiar código", () => {
    const url = { type: "URL" as const, text: "Site", url: "https://loja.exemplo" };
    expect(problemasDoModelo(modelo({ buttons: [url, url, url] }))).toContainEqual({
      campo: "buttons",
      motivo: "botoes_de_url_demais",
    });
    const cupom = { type: "COPY_CODE" as const, example: "A" };
    expect(problemasDoModelo(modelo({ buttons: [cupom, cupom] }))).toContainEqual({
      campo: "buttons",
      motivo: "copiar_codigo_demais",
    });
  });
});

describe("novoModeloSchema", () => {
  it("aceita o modelo bem formado e preenche os opcionais", () => {
    const r = novoModeloSchema.safeParse({
      name: "oferta_de_outubro",
      language: "pt_BR",
      category: "UTILITY",
      body: "Seu pedido saiu.",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({
        parameter_format: "POSITIONAL",
        examples: {},
        footer: null,
        buttons: [],
      });
    }
  });

  it("recusa nome fora do formato da Meta (minúsculas, números e _)", () => {
    expect(novoModeloSchema.safeParse({ ...modelo(), name: "Oferta Outubro" }).success).toBe(false);
  });

  it("recusa o que `problemasDoModelo` recusa, apontando o campo", () => {
    const r = novoModeloSchema.safeParse({ ...modelo(), examples: { "1": "Ana" } });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join("."))).toContain("examples.2");
    }
  });

  it("recusa categoria fora do editor básico (autenticação tem formato próprio)", () => {
    expect(novoModeloSchema.safeParse({ ...modelo(), category: "AUTHENTICATION" }).success).toBe(
      false,
    );
  });
});

describe("previewDoModelo", () => {
  it("mostra o corpo com os exemplos, o rodapé e os botões", () => {
    const p = previewDoModelo(
      modelo({
        footer: "Loja de Teste",
        buttons: [
          { type: "QUICK_REPLY", text: "Quero" },
          { type: "URL", text: "Ver pedido", url: "https://loja.exemplo/{{1}}", example: "1" },
          { type: "COPY_CODE", example: "OUTUBRO10" },
        ],
      }),
    );
    expect(p).toEqual({
      tipo: "STANDARD",
      cabecalho: null,
      oferta: null,
      cards: [],
      corpo: "Olá Ana, sua oferta de outubro chegou.",
      rodape: "Loja de Teste",
      botoes: [
        { tipo: "QUICK_REPLY", texto: "Quero" },
        { tipo: "URL", texto: "Ver pedido" },
        { tipo: "COPY_CODE", texto: "Copiar código" },
      ],
    });
  });

  it("variável ainda sem exemplo continua visível como {{n}} — o operador vê o que falta", () => {
    expect(previewDoModelo(modelo({ examples: { "1": "Ana" } })).corpo).toBe(
      "Olá Ana, sua oferta de {{2}} chegou.",
    );
  });
});
