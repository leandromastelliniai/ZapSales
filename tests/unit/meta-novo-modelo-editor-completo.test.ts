/**
 * O EDITOR COMPLETO DE MODELOS — as regras que ele ganhou (cabeçalho de texto,
 * botão de ligar, idiomas), no corpo que a Meta aceita e na leitura que o ENVIO
 * faz do modelo depois de aprovado.
 *
 * O que está em jogo: um título de texto com variável só serve se, depois de
 * aprovado, o disparo da campanha souber que o título pede um valor. O contrato
 * (`deriveTemplateContract`) lê o `HEADER` de texto como slot — o último teste
 * prende essa ponta, porque é nela que um modelo "bonito na tela" viraria
 * 132012 na hora do envio.
 *
 * Medir: `pnpm vitest run tests/unit/meta-novo-modelo-editor-completo.test.ts`
 */
import { describe, expect, it } from "vitest";

import {
  IDIOMAS_DO_MODELO,
  montarPedidoDeModelo,
  novoModeloSchema,
  previewDoModelo,
  problemasDoModelo,
  type NovoModelo,
} from "@/lib/channels/meta/novo-modelo";
import { deriveTemplateContract } from "@/lib/channels/meta/template-contract";

function modelo(parcial: Partial<NovoModelo> = {}): NovoModelo {
  return {
    kind: "STANDARD",
    name: "aviso_de_entrega",
    language: "pt_BR",
    category: "UTILITY",
    parameter_format: "NAMED",
    body: "Olá {{nome}}, seu pedido saiu para entrega hoje.",
    examples: { nome: "Ana" },
    header: null,
    offer: null,
    footer: null,
    buttons: [],
    cards: [],
    ...parcial,
  };
}

const motivos = (m: NovoModelo) => problemasDoModelo(m).map((p) => `${p.campo}:${p.motivo}`);

describe("cabeçalho de texto", () => {
  it("sem variável, vai ao pedido só com o texto", () => {
    const pedido = montarPedidoDeModelo(
      modelo({ header: { format: "TEXT", text: "Seu pedido", examples: {} } }),
    );
    expect(pedido.components[0]).toEqual({ type: "HEADER", format: "TEXT", text: "Seu pedido" });
  });

  it("com variável com nome, leva o exemplo em `header_text_named_params`", () => {
    const pedido = montarPedidoDeModelo(
      modelo({ header: { format: "TEXT", text: "Pedido de {{cliente}}", examples: { cliente: "Ana" } } }),
    );
    expect(pedido.components[0]).toEqual({
      type: "HEADER",
      format: "TEXT",
      text: "Pedido de {{cliente}}",
      example: { header_text_named_params: [{ param_name: "cliente", example: "Ana" }] },
    });
  });

  it("com variável numerada, leva o exemplo em `header_text`", () => {
    const pedido = montarPedidoDeModelo(
      modelo({
        parameter_format: "POSITIONAL",
        body: "Olá {{1}}, seu pedido saiu para entrega hoje.",
        examples: { "1": "Ana" },
        header: { format: "TEXT", text: "Pedido {{1}}", examples: { "1": "A-10" } },
      }),
    );
    expect(pedido.components[0]).toEqual({
      type: "HEADER",
      format: "TEXT",
      text: "Pedido {{1}}",
      example: { header_text: ["A-10"] },
    });
  });

  it("aceita no máximo UMA variável e pede o exemplo dela", () => {
    expect(
      motivos(modelo({ header: { format: "TEXT", text: "{{a}} e {{b}}", examples: { a: "x", b: "y" } } })),
    ).toContain("header:cabecalho_com_variavel_demais");
    expect(
      motivos(modelo({ header: { format: "TEXT", text: "Pedido {{a}}", examples: {} } })),
    ).toContain("header.examples.a:exemplo_obrigatorio");
  });

  it("no formato numerado a variável do título é {{1}}; no com nome, um nome válido", () => {
    expect(
      motivos(
        modelo({
          parameter_format: "POSITIONAL",
          body: "Olá {{1}}, seu pedido saiu para entrega hoje.",
          examples: { "1": "Ana" },
          header: { format: "TEXT", text: "Pedido {{nome}}", examples: { nome: "A" } },
        }),
      ),
    ).toContain("header:variavel_posicional_esperada");
    expect(
      motivos(modelo({ header: { format: "TEXT", text: "Pedido {{Nome Ruim}}", examples: {} } })),
    ).not.toContain("header:variavel_nomeada_invalida"); // `{{Nome Ruim}}` nem é variável (espaço): texto puro
    expect(
      motivos(modelo({ header: { format: "TEXT", text: "Pedido {{1}}", examples: { "1": "A" } } })),
    ).toContain("header:variavel_nomeada_invalida");
  });

  it("o título tem até 60 caracteres", () => {
    const longo = "x".repeat(61);
    expect(
      novoModeloSchema.safeParse(modelo({ header: { format: "TEXT", text: longo, examples: {} } })).success,
    ).toBe(false);
  });

  it("não existe na oferta por tempo limitado, no carrossel nem como mídia guardada", () => {
    const oferta = modelo({
      kind: "LIMITED_TIME_OFFER",
      category: "MARKETING",
      header: { format: "TEXT", text: "Oferta", examples: {} },
      offer: { text: "Só hoje!", has_expiration: false },
      buttons: [{ type: "URL", text: "Ver", url: "https://loja.exemplo/p" }],
    });
    expect(motivos(oferta)).toContain("header:oferta_midia_imagem_ou_video");
  });

  it("o preview mostra o título com o exemplo no lugar da variável", () => {
    const p = previewDoModelo(
      modelo({ header: { format: "TEXT", text: "Pedido de {{cliente}}", examples: { cliente: "Ana" } } }),
    );
    expect(p.cabecalhoDeTexto).toBe("Pedido de Ana");
    expect(p.cabecalho).toBeNull();
  });

  it("depois de aprovado, o contrato do envio lê o título como um valor a preencher", () => {
    const pedido = montarPedidoDeModelo(
      modelo({ header: { format: "TEXT", text: "Pedido de {{cliente}}", examples: { cliente: "Ana" } } }),
    );
    const contrato = deriveTemplateContract({
      name: pedido.name,
      language: pedido.language,
      status: "APPROVED",
      category: pedido.category,
      parameter_format: pedido.parameter_format,
      components: pedido.components,
    } as never);
    const chaves = contrato.slots.map((s) => `${s.address.kind}:${s.key}`);
    expect(chaves).toContain("header:cliente");
    expect(chaves).toContain("body:nome");
  });
});

describe("botão de ligar", () => {
  const ligar = { type: "PHONE_NUMBER" as const, text: "Ligar agora", phone_number: "+5511999998888" };

  it("vai ao pedido com o texto e o número", () => {
    const pedido = montarPedidoDeModelo(modelo({ buttons: [ligar] }));
    expect(pedido.components.at(-1)).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "PHONE_NUMBER", text: "Ligar agora", phone_number: "+5511999998888" }],
    });
  });

  it("o número precisa ter o código do país", () => {
    for (const ruim of ["11999998888", "5511999998888", "+55 11 99999-8888", "+12"]) {
      const r = novoModeloSchema.safeParse(modelo({ buttons: [{ ...ligar, phone_number: ruim }] }));
      expect(r.success, ruim).toBe(false);
    }
    expect(novoModeloSchema.safeParse(modelo({ buttons: [ligar] })).success).toBe(true);
  });

  it("no máximo um botão de ligar", () => {
    expect(motivos(modelo({ buttons: [ligar, { ...ligar, text: "Outro" }] }))).toContain(
      "buttons:ligar_demais",
    );
  });

  it("convive com link e resposta rápida, mas não entra na oferta nem no card", () => {
    expect(
      motivos(modelo({ buttons: [ligar, { type: "URL", text: "Site", url: "https://loja.exemplo" }] })),
    ).toEqual([]);

    const oferta = modelo({
      kind: "LIMITED_TIME_OFFER",
      category: "MARKETING",
      offer: { text: "Só hoje!", has_expiration: false },
      buttons: [ligar, { type: "URL", text: "Ver", url: "https://loja.exemplo/p" }],
    });
    expect(motivos(oferta)).toContain("buttons:oferta_so_codigo_e_link");
  });

  it("não pede parâmetro no envio: o contrato não ganha slot de botão", () => {
    const pedido = montarPedidoDeModelo(modelo({ buttons: [ligar] }));
    const contrato = deriveTemplateContract({
      name: pedido.name,
      language: pedido.language,
      status: "APPROVED",
      category: pedido.category,
      parameter_format: pedido.parameter_format,
      components: pedido.components,
    } as never);
    expect(contrato.slots.some((s) => s.address.kind === "button")).toBe(false);
  });
});

describe("idiomas", () => {
  it("todo idioma oferecido é um código que o schema aceita", () => {
    for (const idioma of IDIOMAS_DO_MODELO) {
      expect(novoModeloSchema.safeParse(modelo({ language: idioma })).success, idioma).toBe(true);
    }
  });

  it("o mesmo nome em idiomas diferentes monta pedidos distintos só no idioma", () => {
    const pt = montarPedidoDeModelo(modelo({ language: "pt_BR" }));
    const en = montarPedidoDeModelo(modelo({ language: "en_US", body: "Hello {{nome}}, your order is out today." }));
    expect(pt.name).toBe(en.name);
    expect(pt.language).toBe("pt_BR");
    expect(en.language).toBe("en_US");
  });
});
