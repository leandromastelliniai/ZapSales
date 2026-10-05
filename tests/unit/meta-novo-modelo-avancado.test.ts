/**
 * OS FORMATOS RICOS DO EDITOR DE MODELO, NO FORMATO QUE A META ACEITA (issue #7).
 *
 * Mesma seam do editor básico (`meta-novo-modelo.test.ts`): as três funções
 * puras de `lib/channels/meta/novo-modelo.ts`. O que muda é o modelo — agora
 * com cabeçalho de mídia, carrossel, oferta por tempo limitado e botão de flow.
 *
 * O formato de cada pedido segue a documentação de criação de modelos da Cloud
 * API: o cabeçalho de mídia leva o `header_handle` devolvido pela API de upload
 * retomável; o carrossel é `BODY` + `CAROUSEL` com os cards; a oferta é um
 * componente `LIMITED_TIME_OFFER` entre o cabeçalho e o corpo; o flow é um
 * botão `FLOW` com `flow_id` e `flow_action`.
 *
 * Medir: `pnpm vitest run tests/unit/meta-novo-modelo-avancado.test.ts`
 */
import { describe, expect, it } from "vitest";

import {
  lerMidiasGuardadas,
  midiasDoModelo,
  montarPedidoDeModelo,
  novoModeloSchema,
  previewDoModelo,
  problemasDoModelo,
  type CardDoModelo,
  type MidiaDoCabecalho,
  type NovoModelo,
} from "@/lib/channels/meta/novo-modelo";
import { deriveTemplateContract } from "@/lib/channels/meta/template-contract";

const ORG = "0d0e0007-0000-4000-8000-00000000000a";

function midia(n: number, mime: MidiaDoCabecalho["mime_type"] = "image/jpeg"): MidiaDoCabecalho {
  const ext = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
  }[mime];
  return {
    handle: `4::HANDLE_${n}`,
    path: `${ORG}/templates/0d0e0007-0000-4000-8000-00000000000${n}.${ext}`,
    mime_type: mime,
    file_name: `arquivo_${n}.${ext}`,
  };
}

function modelo(parcial: Partial<NovoModelo> = {}): NovoModelo {
  return {
    kind: "STANDARD",
    name: "oferta_de_outubro",
    language: "pt_BR",
    category: "MARKETING",
    parameter_format: "POSITIONAL",
    header: null,
    offer: null,
    body: "Olá {{1}}, sua oferta chegou.",
    examples: { "1": "Ana" },
    footer: null,
    buttons: [],
    cards: [],
    ...parcial,
  };
}

function card(n: number, parcial: Partial<CardDoModelo> = {}): CardDoModelo {
  return {
    header: { format: "IMAGE", media: midia(n) },
    body: `Produto ${n} por {{1}}.`,
    examples: { "1": `R$ ${n}0` },
    buttons: [
      { type: "QUICK_REPLY", text: "Quero" },
      { type: "URL", text: "Ver", url: "https://loja.exemplo/p/{{1}}", example: `p${n}` },
    ],
    ...parcial,
  };
}

const motivos = (m: NovoModelo) => problemasDoModelo(m).map((p) => `${p.campo}:${p.motivo}`);

describe("cabeçalho de mídia", () => {
  it.each([
    ["IMAGE", "image/jpeg"],
    ["VIDEO", "video/mp4"],
    ["DOCUMENT", "application/pdf"],
  ] as const)("%s vira HEADER com o `header_handle` do upload, antes do corpo", (format, mime) => {
    const m = modelo({ header: { format, media: midia(1, mime) } });
    expect(problemasDoModelo(m)).toEqual([]);
    expect(montarPedidoDeModelo(m).components).toEqual([
      { type: "HEADER", format, example: { header_handle: ["4::HANDLE_1"] } },
      { type: "BODY", text: "Olá {{1}}, sua oferta chegou.", example: { body_text: [["Ana"]] } },
    ]);
  });

  it("sem o arquivo enviado, a Meta recusaria: a mídia é obrigatória", () => {
    expect(motivos(modelo({ header: { format: "IMAGE", media: null } }))).toEqual([
      "header.media:midia_obrigatoria",
    ]);
  });

  it("arquivo de outro formato que o escolhido (PDF num cabeçalho de imagem)", () => {
    expect(
      motivos(modelo({ header: { format: "IMAGE", media: midia(1, "application/pdf") } })),
    ).toEqual(["header.media:midia_de_outro_formato"]);
  });

  it("o contrato derivado do pedido pede a mídia em cada envio (slot `header`)", () => {
    const pedido = montarPedidoDeModelo(
      modelo({ header: { format: "VIDEO", media: midia(1, "video/mp4") } }),
    );
    const contrato = deriveTemplateContract({ ...pedido, components: pedido.components as never });
    expect(contrato.slots.map((s) => [s.address.kind, s.expects])).toEqual([
      ["header", "video"],
      ["body", "text"],
    ]);
  });

  it("a cópia guardada no storage fica registrada pela chave do slot — a mesma do envio", () => {
    expect(midiasDoModelo(modelo({ header: { format: "IMAGE", media: midia(1) } }))).toEqual({
      "header:1": { path: midia(1).path, mime_type: "image/jpeg", file_name: "arquivo_1.jpg" },
    });
    expect(midiasDoModelo(modelo())).toEqual({});
  });

  it("lerMidiasGuardadas devolve o que foi gravado e ignora o que não tem a forma", () => {
    const gravado = midiasDoModelo(modelo({ header: { format: "IMAGE", media: midia(1) } }));
    expect(lerMidiasGuardadas(gravado)).toEqual(gravado);
    expect(
      lerMidiasGuardadas({
        ...gravado,
        "header:2": { path: "../../segredo.jpg", mime_type: "image/jpeg" },
        "header:3": "texto",
      }),
    ).toEqual(gravado);
    expect(lerMidiasGuardadas(null)).toEqual({});
    expect(lerMidiasGuardadas([])).toEqual({});
  });
});

describe("botão de flow", () => {
  it("vira FLOW com o id do flow, a ação e a tela de entrada", () => {
    const m = modelo({
      buttons: [
        {
          type: "FLOW",
          text: "Agendar",
          flow_id: "1234567890",
          flow_action: "navigate",
          navigate_screen: "AGENDA",
        },
      ],
    });
    expect(problemasDoModelo(m)).toEqual([]);
    expect(montarPedidoDeModelo(m).components[1]).toEqual({
      type: "BUTTONS",
      buttons: [
        {
          type: "FLOW",
          text: "Agendar",
          flow_id: "1234567890",
          flow_action: "navigate",
          navigate_screen: "AGENDA",
        },
      ],
    });
  });

  it("`data_exchange` não leva tela: quem decide a primeira tela é o endpoint do flow", () => {
    const m = modelo({
      buttons: [
        {
          type: "FLOW",
          text: "Cadastrar",
          flow_id: "99",
          flow_action: "data_exchange",
          navigate_screen: "X",
        },
      ],
    });
    expect(montarPedidoDeModelo(m).components[1]).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "FLOW", text: "Cadastrar", flow_id: "99", flow_action: "data_exchange" }],
    });
  });

  it("navegar sem dizer a tela, e mais de um botão de flow", () => {
    const sem = modelo({
      buttons: [{ type: "FLOW", text: "Abrir", flow_id: "1", flow_action: "navigate" }],
    });
    expect(motivos(sem)).toEqual(["buttons.0.navigate_screen:tela_do_flow_obrigatoria"]);

    const dois = modelo({
      buttons: [
        { type: "FLOW", text: "A", flow_id: "1", flow_action: "data_exchange" },
        { type: "FLOW", text: "B", flow_id: "2", flow_action: "data_exchange" },
      ],
    });
    expect(motivos(dois)).toEqual(["buttons:flow_demais"]);
  });

  it("o schema recusa id de flow que não é número", () => {
    const r = novoModeloSchema.safeParse({
      ...modelo(),
      buttons: [{ type: "FLOW", text: "Abrir", flow_id: "meu-flow", flow_action: "data_exchange" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("flow_id_invalido");
  });

  it("o flow não vira parâmetro do envio (o token do flow é opcional)", () => {
    const pedido = montarPedidoDeModelo(
      modelo({
        buttons: [{ type: "FLOW", text: "Abrir", flow_id: "1", flow_action: "data_exchange" }],
      }),
    );
    const contrato = deriveTemplateContract({ ...pedido, components: pedido.components as never });
    expect(contrato.slots.map((s) => s.address.kind)).toEqual(["body"]);
  });
});

describe("carrossel", () => {
  const carrossel = (parcial: Partial<NovoModelo> = {}) =>
    modelo({
      kind: "CAROUSEL",
      body: "Separei {{1}} ofertas para você.",
      examples: { "1": "duas" },
      cards: [card(1), card(2)],
      ...parcial,
    });

  it("vira BODY + CAROUSEL, e cada card leva cabeçalho, corpo e botões no formato da Meta", () => {
    const m = carrossel();
    expect(problemasDoModelo(m)).toEqual([]);
    expect(montarPedidoDeModelo(m).components).toEqual([
      {
        type: "BODY",
        text: "Separei {{1}} ofertas para você.",
        example: { body_text: [["duas"]] },
      },
      {
        type: "CAROUSEL",
        cards: [1, 2].map((n) => ({
          components: [
            { type: "HEADER", format: "IMAGE", example: { header_handle: [`4::HANDLE_${n}`] } },
            {
              type: "BODY",
              text: `Produto ${n} por {{1}}.`,
              example: { body_text: [[`R$ ${n}0`]] },
            },
            {
              type: "BUTTONS",
              buttons: [
                { type: "QUICK_REPLY", text: "Quero" },
                {
                  type: "URL",
                  text: "Ver",
                  url: "https://loja.exemplo/p/{{1}}",
                  example: [`https://loja.exemplo/p/p${n}`],
                },
              ],
            },
          ],
        })),
      },
    ]);
  });

  it("o contrato enxerga as variáveis de cada card no endereço do card", () => {
    const pedido = montarPedidoDeModelo(carrossel());
    const contrato = deriveTemplateContract({ ...pedido, components: pedido.components as never });
    const cartoes = contrato.slots.filter((s) => s.address.kind === "card");
    expect(cartoes).toHaveLength(6); // por card: cabeçalho, corpo e sufixo do link
  });

  it("guarda a mídia de cada card na chave do slot do card", () => {
    expect(Object.keys(midiasDoModelo(carrossel()))).toEqual(["card0:header:1", "card1:header:1"]);
  });

  it("de 2 a 10 cards", () => {
    expect(motivos(carrossel({ cards: [card(1)] }))).toEqual(["cards:cards_de_2_a_10"]);
    const onze = Array.from({ length: 11 }, (_, i) => card(i % 9));
    expect(motivos(carrossel({ cards: onze }))).toEqual(["cards:cards_de_2_a_10"]);
  });

  it("todos os cards com a mesma mídia (imagem ou vídeo) e os mesmos botões", () => {
    const video = card(2, { header: { format: "VIDEO", media: midia(2, "video/mp4") } });
    expect(motivos(carrossel({ cards: [card(1), video] }))).toEqual([
      "cards:cards_com_a_mesma_midia",
    ]);

    const outrosBotoes = card(2, { buttons: [{ type: "QUICK_REPLY", text: "Quero" }] });
    expect(motivos(carrossel({ cards: [card(1), outrosBotoes] }))).toEqual([
      "cards:cards_com_os_mesmos_botoes",
    ]);
  });

  it("card com documento, sem arquivo, sem botão ou com botão que não cabe no card", () => {
    const documento = card(1, {
      header: { format: "DOCUMENT", media: midia(1, "application/pdf") },
    });
    const doc2 = card(2, { header: { format: "DOCUMENT", media: midia(2, "application/pdf") } });
    expect(motivos(carrossel({ cards: [documento, doc2] }))).toEqual([
      "cards.0.header:card_midia_imagem_ou_video",
      "cards.1.header:card_midia_imagem_ou_video",
    ]);

    const semArquivo = card(1, { header: { format: "IMAGE", media: null } });
    expect(motivos(carrossel({ cards: [semArquivo, card(2)] }))).toEqual([
      "cards.0.header.media:midia_obrigatoria",
    ]);

    const semBotao = (n: number) => card(n, { buttons: [] });
    expect(motivos(carrossel({ cards: [semBotao(1), semBotao(2)] }))).toEqual([
      "cards.0.buttons:card_sem_botao",
      "cards.1.buttons:card_sem_botao",
    ]);

    const cupom = (n: number) => card(n, { buttons: [{ type: "COPY_CODE", example: "CUPOM" }] });
    expect(motivos(carrossel({ cards: [cupom(1), cupom(2)] }))).toEqual([
      "cards.0.buttons:botao_fora_do_card",
      "cards.1.buttons:botao_fora_do_card",
    ]);
  });

  it("variável do card segue as regras do corpo: exemplo obrigatório, sem ponta", () => {
    const furado = card(1, { body: "Produto por {{1}}", examples: {} });
    expect(motivos(carrossel({ cards: [furado, card(2)] }))).toEqual([
      "cards.0.body:variavel_na_ponta",
      "cards.0.examples.1:exemplo_obrigatorio",
    ]);
  });

  it("cabeçalho, rodapé e botões de fora não existem no carrossel", () => {
    expect(
      motivos(
        carrossel({
          header: { format: "IMAGE", media: midia(9) },
          footer: "Loja",
          buttons: [{ type: "QUICK_REPLY", text: "Oi" }],
        }),
      ),
    ).toEqual([
      "header:nao_se_aplica_ao_tipo",
      "footer:nao_se_aplica_ao_tipo",
      "buttons:nao_se_aplica_ao_tipo",
    ]);
  });

  it("o preview mostra a mensagem e cada card com a mídia, o corpo com exemplo e os botões", () => {
    const p = previewDoModelo(carrossel());
    expect(p.corpo).toBe("Separei duas ofertas para você.");
    expect(p.cards).toEqual(
      [1, 2].map((n) => ({
        cabecalho: { formato: "IMAGE", path: midia(n).path, nome: `arquivo_${n}.jpg` },
        corpo: `Produto ${n} por R$ ${n}0.`,
        botoes: [
          { tipo: "QUICK_REPLY", texto: "Quero" },
          { tipo: "URL", texto: "Ver" },
        ],
      })),
    );
  });
});

describe("oferta por tempo limitado", () => {
  const oferta = (parcial: Partial<NovoModelo> = {}) =>
    modelo({
      kind: "LIMITED_TIME_OFFER",
      header: { format: "IMAGE", media: midia(1) },
      offer: { text: "Só hoje!", has_expiration: true },
      body: "Use o código {{1}} e ganhe 20% de desconto.",
      examples: { "1": "OUTUBRO20" },
      buttons: [
        { type: "URL", text: "Comprar", url: "https://loja.exemplo/oferta" },
        { type: "COPY_CODE", example: "OUTUBRO20" },
      ],
      ...parcial,
    });

  it("vira HEADER + LIMITED_TIME_OFFER + BODY + BUTTONS, com o cupom antes do link", () => {
    const m = oferta();
    expect(problemasDoModelo(m)).toEqual([]);
    expect(montarPedidoDeModelo(m).components).toEqual([
      { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::HANDLE_1"] } },
      {
        type: "LIMITED_TIME_OFFER",
        limited_time_offer: { text: "Só hoje!", has_expiration: true },
      },
      {
        type: "BODY",
        text: "Use o código {{1}} e ganhe 20% de desconto.",
        example: { body_text: [["OUTUBRO20"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "COPY_CODE", example: "OUTUBRO20" },
          { type: "URL", text: "Comprar", url: "https://loja.exemplo/oferta" },
        ],
      },
    ]);
  });

  it("sem cabeçalho também vale — a Meta aceita oferta só com texto", () => {
    expect(problemasDoModelo(oferta({ header: null }))).toEqual([]);
  });

  it("só marketing, com o texto da oferta, sem rodapé e sem documento no cabeçalho", () => {
    expect(motivos(oferta({ category: "UTILITY" }))).toEqual(["category:oferta_so_marketing"]);
    expect(motivos(oferta({ offer: null }))).toEqual(["offer:oferta_obrigatoria"]);
    expect(motivos(oferta({ footer: "Loja" }))).toEqual(["footer:nao_se_aplica_ao_tipo"]);
    expect(
      motivos(oferta({ header: { format: "DOCUMENT", media: midia(1, "application/pdf") } })),
    ).toEqual(["header:oferta_midia_imagem_ou_video"]);
  });

  it("corpo de até 600 caracteres", () => {
    expect(motivos(oferta({ body: `Use o código {{1}} ${"a".repeat(600)} hoje.` }))).toEqual([
      "body:corpo_da_oferta_longo",
    ]);
  });

  it("um link obrigatório; com prazo, o botão de copiar código também", () => {
    expect(motivos(oferta({ buttons: [{ type: "COPY_CODE", example: "X" }] }))).toEqual([
      "buttons:oferta_precisa_de_link",
    ]);
    expect(
      motivos(oferta({ buttons: [{ type: "URL", text: "Comprar", url: "https://loja.exemplo" }] })),
    ).toEqual(["buttons:oferta_com_prazo_pede_codigo"]);
    expect(
      motivos(
        oferta({
          offer: { text: "Só hoje!", has_expiration: false },
          buttons: [{ type: "URL", text: "Comprar", url: "https://loja.exemplo" }],
        }),
      ),
    ).toEqual([]);
    expect(
      motivos(
        oferta({
          buttons: [
            { type: "COPY_CODE", example: "X" },
            { type: "URL", text: "Comprar", url: "https://loja.exemplo" },
            { type: "QUICK_REPLY", text: "Não quero" },
          ],
        }),
      ),
    ).toEqual(["buttons:oferta_so_codigo_e_link"]);
  });

  it("o schema recusa texto de oferta acima de 16 caracteres", () => {
    const r = novoModeloSchema.safeParse({
      ...oferta(),
      offer: { text: "Oferta relâmpago hoje", has_expiration: true },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path.join("."))).toContain("offer.text");
  });

  it("o preview mostra o texto da oferta, o prazo e o código de exemplo", () => {
    const p = previewDoModelo(oferta());
    expect(p.oferta).toEqual({ texto: "Só hoje!", temPrazo: true, codigo: "OUTUBRO20" });
    expect(p.cabecalho).toEqual({ formato: "IMAGE", path: midia(1).path, nome: "arquivo_1.jpg" });
    expect(p.botoes.map((b) => b.tipo)).toEqual(["COPY_CODE", "URL"]);
  });
});

describe("novoModeloSchema — compatível com o editor básico", () => {
  it("o corpo do #6, sem `kind`, continua valendo como modelo padrão", () => {
    const r = novoModeloSchema.safeParse({
      name: "oferta_de_outubro",
      language: "pt_BR",
      category: "UTILITY",
      body: "Seu pedido saiu.",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({ kind: "STANDARD", header: null, offer: null, cards: [] });
    }
  });

  it("caminho de mídia fora da pasta de modelos é recusado na forma", () => {
    const r = novoModeloSchema.safeParse({
      ...modelo(),
      header: { format: "IMAGE", media: { ...midia(1), path: `${ORG}/avatars/x.jpg` } },
    });
    expect(r.success).toBe(false);
  });
});
