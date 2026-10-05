/**
 * O MODELO CRIADO NO ZAPSALES — do editor ao corpo que a Meta aceita (issues #6 e #7).
 *
 * O modelo continua VIVENDO NA META: depois de criado, quem manda no status, na
 * categoria e na qualidade é ela (webhook e sincronização). Este módulo só
 * traduz o que o operador digitou no editor para o corpo de
 * `POST /{waba}/message_templates`.
 *
 * Três tipos de modelo (`kind`):
 *
 * - `STANDARD` — cabeçalho de mídia opcional (imagem, vídeo ou documento),
 *   corpo com variáveis, rodapé e botões de resposta rápida, link, copiar código
 *   e flow.
 * - `CAROUSEL` — a mensagem (corpo) e de 2 a 10 cards, cada um com mídia, corpo
 *   e botões. A Meta exige que todos os cards tenham a mesma mídia e os mesmos
 *   botões, na mesma ordem.
 * - `LIMITED_TIME_OFFER` — oferta por tempo limitado: só marketing, um texto
 *   curto da oferta, prazo opcional (com prazo, o botão de copiar código é
 *   obrigatório) e um botão de link.
 *
 * Quatro funções, uma regra cada, todas puras:
 *
 * - `problemasDoModelo` diz ANTES do envio o que a Meta recusaria. A recusa da
 *   Meta chega depois de uma ida e volta, em inglês e com código; aqui ela chega
 *   no campo, enquanto o operador digita. É a MESMA função que o schema da rota
 *   aplica — a tela e o servidor não divergem sobre o que é um modelo válido.
 * - `montarPedidoDeModelo` monta o corpo. Os `components` que ele devolve são
 *   os que o espelho local guarda, e é deles que o envio deriva os parâmetros
 *   (`deriveTemplateContract`) — o mesmo formato que a sincronização traz.
 * - `midiasDoModelo` diz onde está a cópia de cada mídia no storage, pela chave
 *   do slot do envio (`slotKey`). A Meta guarda só a amostra da revisão; o
 *   arquivo de cada disparo sai daqui.
 * - `previewDoModelo` é o que a tela mostra: os exemplos aplicados no corpo.
 *
 * A mídia do cabeçalho chega aqui JÁ ENVIADA: a rota de upload
 * (`/api/v1/channels/templates/media`) manda o arquivo à API de upload da Meta,
 * guarda a cópia no storage e devolve o `handle` e o caminho, que o editor põe
 * no modelo. Cabeçalho de texto e de localização ficam fora do editor; e
 * autenticação também — a Meta exige para ela um formato próprio (botão de OTP),
 * e o schema a recusa em vez de montar um pedido que voltaria recusado.
 */
import { z } from "zod";

import { slotKey } from "./build-components";

/** Os formatos de variável que a Meta conhece. Mesmo vocabulário de `parameter_format`. */
export const FORMATOS_DE_VARIAVEL = ["POSITIONAL", "NAMED"] as const;

/** As categorias que o editor cria. */
export const CATEGORIAS_DO_EDITOR = ["MARKETING", "UTILITY"] as const;

/** Os tipos de modelo do editor. */
export const TIPOS_DE_MODELO = ["STANDARD", "CAROUSEL", "LIMITED_TIME_OFFER"] as const;
export type TipoDeModelo = (typeof TIPOS_DE_MODELO)[number];

/** Os formatos de cabeçalho de mídia — o `format` do componente `HEADER`. */
export const FORMATOS_DE_MIDIA = ["IMAGE", "VIDEO", "DOCUMENT"] as const;
export type FormatoDeMidia = (typeof FORMATOS_DE_MIDIA)[number];

/**
 * Os arquivos que o cabeçalho de modelo aceita, com o formato de cada um. É a
 * lista da API de upload da Meta para amostra de modelo (JPEG, PNG, MP4, PDF).
 */
export const MIDIAS_DO_CABECALHO = {
  "image/jpeg": { formato: "IMAGE", extensao: "jpg" },
  "image/png": { formato: "IMAGE", extensao: "png" },
  "video/mp4": { formato: "VIDEO", extensao: "mp4" },
  "application/pdf": { formato: "DOCUMENT", extensao: "pdf" },
} as const satisfies Record<string, { formato: FormatoDeMidia; extensao: string }>;
export type TipoDeArquivoDoCabecalho = keyof typeof MIDIAS_DO_CABECALHO;
const TIPOS_DE_ARQUIVO = Object.keys(MIDIAS_DO_CABECALHO) as [
  TipoDeArquivoDoCabecalho,
  ...TipoDeArquivoDoCabecalho[],
];

/**
 * Onde a cópia mora no bucket `whatsapp-media`: `<org>/templates/<uuid>.<ext>`.
 * A pasta `templates/` é a que a retenção de mídia NUNCA poda
 * (`fn_enfileirar_midia_vencida`, passo 2) — o cabeçalho é reusado a cada
 * disparo, por meses. O caminho é gerado pela rota de upload; aqui só a forma.
 */
export const CAMINHO_DA_MIDIA =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/templates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|mp4|pdf)$/;

// Limites da Meta para modelos (documentação de criação de modelos da Cloud API).
const LIMITE_DO_CORPO = 1024;
const LIMITE_DO_CORPO_DA_OFERTA = 600;
const LIMITE_DO_CORPO_DO_CARD = 160;
const LIMITE_DO_TEXTO_DA_OFERTA = 16;
const LIMITE_DO_RODAPE = 60;
const LIMITE_DO_TEXTO_DO_BOTAO = 25;
const LIMITE_DO_CODIGO = 15;
const LIMITE_DE_BOTOES = 10;
const LIMITE_DE_BOTOES_DE_URL = 2;
const LIMITE_DE_BOTOES_DO_CARD = 2;
const MINIMO_DE_CARDS = 2;
const MAXIMO_DE_CARDS = 10;
/**
 * Teto de FORMA, acima do da Meta: só barra corpo abusivo. Entre 11 e este
 * número quem recusa é `problemasDoModelo`, com a frase do campo ("de 2 a 10").
 */
const TETO_DE_CARDS_NO_CORPO = 30;

const VARIAVEL = /\{\{\s*(\w+)\s*\}\}/g;
const NOME_DE_VARIAVEL = /^[a-z][a-z0-9_]*$/;

const textoDoBotao = z.string().trim().min(1).max(LIMITE_DO_TEXTO_DO_BOTAO);

const botaoSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("QUICK_REPLY"),
    text: textoDoBotao,
  }),
  z.object({
    type: z.literal("URL"),
    text: textoDoBotao,
    url: z.string().trim().min(1).max(2000),
    /** O valor de exemplo do `{{1}}` do fim da URL. Só existe quando a URL tem variável. */
    example: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal("COPY_CODE"),
    /** O código de exemplo. O código de verdade vai em cada envio. */
    example: z.string().trim().min(1).max(LIMITE_DO_CODIGO),
  }),
  z.object({
    type: z.literal("FLOW"),
    text: textoDoBotao,
    /** O id do flow PUBLICADO na conta (WhatsApp Manager › Flows). */
    flow_id: z
      .string()
      .trim()
      .regex(/^\d{1,30}$/, "flow_id_invalido" satisfies MotivoDeRecusa),
    /** `navigate` abre numa tela fixa; `data_exchange` pergunta ao endpoint do flow. */
    flow_action: z.enum(["navigate", "data_exchange"]).default("navigate"),
    /** A tela de entrada, quando `navigate`. */
    navigate_screen: z.string().trim().max(200).optional(),
  }),
]);

export type BotaoDoModelo = z.infer<typeof botaoSchema>;

/** A mídia já enviada: o `handle` da Meta e a cópia no storage. */
const midiaSchema = z.object({
  /** O `h` da API de upload retomável — vai em `example.header_handle`. */
  handle: z.string().trim().min(1).max(2000),
  path: z.string().trim().regex(CAMINHO_DA_MIDIA),
  mime_type: z.enum(TIPOS_DE_ARQUIVO),
  /** O nome original, para a tela. */
  file_name: z.string().trim().max(255).default(""),
});

export type MidiaDoCabecalho = z.output<typeof midiaSchema>;

const cabecalhoSchema = z.object({
  format: z.enum(FORMATOS_DE_MIDIA),
  /** `null` enquanto o operador ainda não escolheu o arquivo. */
  media: midiaSchema.nullable().default(null),
});

export type CabecalhoDoModelo = z.output<typeof cabecalhoSchema>;

const exemplosSchema = z.record(z.string(), z.string()).default({});

const cardSchema = z.object({
  header: cabecalhoSchema,
  body: z.string().trim().min(1).max(LIMITE_DO_CORPO_DO_CARD),
  examples: exemplosSchema,
  buttons: z.array(botaoSchema).max(LIMITE_DE_BOTOES).default([]),
});

export type CardDoModelo = z.output<typeof cardSchema>;

const ofertaSchema = z.object({
  text: z.string().trim().min(1).max(LIMITE_DO_TEXTO_DA_OFERTA),
  /** Com prazo, o WhatsApp mostra a contagem regressiva; o fim vai em cada envio. */
  has_expiration: z.boolean().default(true),
});

const formaDoModelo = z.object({
  /** Ausente = o editor básico do #6, que só criava o modelo padrão. */
  kind: z.enum(TIPOS_DE_MODELO).default("STANDARD"),
  /** A Meta só aceita minúsculas, números e `_`. */
  name: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, "nome_invalido" satisfies MotivoDeRecusa),
  /** `pt_BR`, `en_US`, `es` — o código de idioma da Meta. */
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "idioma_invalido" satisfies MotivoDeRecusa),
  category: z.enum(CATEGORIAS_DO_EDITOR),
  parameter_format: z.enum(FORMATOS_DE_VARIAVEL).default("POSITIONAL"),
  header: cabecalhoSchema.nullable().default(null),
  offer: ofertaSchema.nullable().default(null),
  body: z.string().trim().min(1).max(LIMITE_DO_CORPO),
  /** Exemplo de cada variável do corpo, pela chave (`"1"` ou `"nome"`). */
  examples: exemplosSchema,
  footer: z
    .string()
    .trim()
    .max(LIMITE_DO_RODAPE)
    .nullish()
    .transform((v) => (v ? v : null)),
  buttons: z.array(botaoSchema).max(LIMITE_DE_BOTOES).default([]),
  cards: z.array(cardSchema).max(TETO_DE_CARDS_NO_CORPO).default([]),
});

export type NovoModelo = z.output<typeof formaDoModelo>;

/**
 * Os códigos de recusa que este módulo emite — os de `problemasDoModelo` e os
 * de formato do schema. A tela os traduz por um mapa tipado por esta união:
 * um código novo aqui sem frase lá é erro de compilação, não "Valor inválido.".
 */
export const MOTIVOS_DE_RECUSA = [
  "exemplo_obrigatorio",
  "variaveis_fora_de_sequencia",
  "variavel_posicional_esperada",
  "variavel_nomeada_invalida",
  "variavel_na_ponta",
  "rodape_sem_variavel",
  "url_https",
  "variavel_de_url_no_fim",
  "respostas_rapidas_juntas",
  "botoes_de_url_demais",
  "copiar_codigo_demais",
  "nome_invalido",
  "idioma_invalido",
  // ─── issue #7 ───
  "midia_obrigatoria",
  "midia_de_outro_formato",
  "flow_id_invalido",
  "flow_demais",
  "tela_do_flow_obrigatoria",
  "nao_se_aplica_ao_tipo",
  "cards_de_2_a_10",
  "cards_com_a_mesma_midia",
  "cards_com_os_mesmos_botoes",
  "card_midia_imagem_ou_video",
  "card_sem_botao",
  "botao_fora_do_card",
  "oferta_so_marketing",
  "oferta_obrigatoria",
  "oferta_midia_imagem_ou_video",
  "corpo_da_oferta_longo",
  "oferta_precisa_de_link",
  "oferta_com_prazo_pede_codigo",
  "oferta_so_codigo_e_link",
] as const;

export type MotivoDeRecusa = (typeof MOTIVOS_DE_RECUSA)[number];

/** Um motivo de recusa, apontando o campo. `motivo` é código; a tela traduz. */
export interface ProblemaDoModelo {
  campo: string;
  motivo: Exclude<MotivoDeRecusa, "nome_invalido" | "idioma_invalido" | "flow_id_invalido">;
}

/** As variáveis de um texto, uma vez cada, na ordem em que aparecem. */
export function variaveisDoTexto(texto: string): string[] {
  const vistas: string[] = [];
  for (const m of texto.matchAll(VARIAVEL)) {
    const nome = m[1]!;
    if (!vistas.includes(nome)) vistas.push(nome);
  }
  return vistas;
}

/** A variável do fim da URL, se houver. A Meta aceita só uma, e só no fim. */
function variavelDaUrl(url: string): { tem: boolean; noFim: boolean } {
  const achadas = [...url.matchAll(VARIAVEL)];
  if (achadas.length === 0) return { tem: false, noFim: true };
  return { tem: true, noFim: achadas.length === 1 && /\{\{\s*1\s*\}\}$/.test(url.trim()) };
}

/**
 * As regras de um texto com variáveis — o corpo do modelo e o de cada card.
 * `prefixo` é o caminho do dono (`""` ou `"cards.0."`).
 */
function problemasDoTexto(
  texto: string,
  exemplos: Record<string, string>,
  formato: NovoModelo["parameter_format"],
  prefixo: string,
): ProblemaDoModelo[] {
  const out: ProblemaDoModelo[] = [];
  const variaveis = variaveisDoTexto(texto);
  const campo = `${prefixo}body`;

  if (formato === "POSITIONAL") {
    if (variaveis.some((v) => !/^\d+$/.test(v))) {
      out.push({ campo, motivo: "variavel_posicional_esperada" });
    } else {
      const numeros = variaveis.map(Number).sort((a, b) => a - b);
      if (numeros.some((n, i) => n !== i + 1)) {
        out.push({ campo, motivo: "variaveis_fora_de_sequencia" });
      }
    }
  } else if (variaveis.some((v) => !NOME_DE_VARIAVEL.test(v))) {
    out.push({ campo, motivo: "variavel_nomeada_invalida" });
  }

  const limpo = texto.trim();
  if (/^\{\{\s*\w+\s*\}\}/.test(limpo) || /\{\{\s*\w+\s*\}\}$/.test(limpo)) {
    out.push({ campo, motivo: "variavel_na_ponta" });
  }

  for (const v of variaveis) {
    if (!(exemplos[v] ?? "").trim())
      out.push({ campo: `${prefixo}examples.${v}`, motivo: "exemplo_obrigatorio" });
  }
  return out;
}

/** As regras de cada botão sozinho: link https com variável só no fim, flow com tela. */
function problemasDosBotoes(botoes: BotaoDoModelo[], prefixo: string): ProblemaDoModelo[] {
  const out: ProblemaDoModelo[] = [];
  botoes.forEach((b, i) => {
    const campo = `${prefixo}buttons.${i}`;
    if (b.type === "FLOW") {
      if (b.flow_action === "navigate" && !b.navigate_screen?.trim())
        out.push({ campo: `${campo}.navigate_screen`, motivo: "tela_do_flow_obrigatoria" });
      return;
    }
    if (b.type !== "URL") return;
    if (!/^https:\/\/[^\s/]+/i.test(b.url))
      out.push({ campo: `${campo}.url`, motivo: "url_https" });
    const variavel = variavelDaUrl(b.url);
    if (variavel.tem && !variavel.noFim) {
      out.push({ campo: `${campo}.url`, motivo: "variavel_de_url_no_fim" });
    } else if (variavel.tem && !b.example?.trim()) {
      out.push({ campo: `${campo}.example`, motivo: "exemplo_obrigatorio" });
    }
  });
  return out;
}

/** O arquivo escolhido existe e é do formato do cabeçalho. */
function problemasDaMidia(c: CabecalhoDoModelo, campo: string): ProblemaDoModelo[] {
  if (!c.media) return [{ campo: `${campo}.media`, motivo: "midia_obrigatoria" }];
  if (MIDIAS_DO_CABECALHO[c.media.mime_type].formato !== c.format)
    return [{ campo: `${campo}.media`, motivo: "midia_de_outro_formato" }];
  return [];
}

const naoSeAplica = (campo: string): ProblemaDoModelo => ({
  campo,
  motivo: "nao_se_aplica_ao_tipo",
});

/** Os tipos de botão de um card, em ordem — a Meta exige o mesmo em todos. */
const assinaturaDosBotoes = (c: CardDoModelo) => c.buttons.map((b) => b.type).join(",");

function problemasDoPadrao(m: NovoModelo): ProblemaDoModelo[] {
  const out: ProblemaDoModelo[] = [];
  if (m.header) out.push(...problemasDaMidia(m.header, "header"));
  if (m.offer) out.push(naoSeAplica("offer"));
  if (m.cards.length > 0) out.push(naoSeAplica("cards"));

  // A Meta agrupa as respostas rápidas num bloco só; intercaladas com botão de
  // ação, o modelo volta recusado.
  const tipos = m.buttons.map((b) => b.type);
  const primeira = tipos.indexOf("QUICK_REPLY");
  const ultima = tipos.lastIndexOf("QUICK_REPLY");
  if (primeira >= 0 && tipos.slice(primeira, ultima + 1).some((t) => t !== "QUICK_REPLY")) {
    out.push({ campo: "buttons", motivo: "respostas_rapidas_juntas" });
  }
  if (tipos.filter((t) => t === "URL").length > LIMITE_DE_BOTOES_DE_URL) {
    out.push({ campo: "buttons", motivo: "botoes_de_url_demais" });
  }
  if (tipos.filter((t) => t === "COPY_CODE").length > 1) {
    out.push({ campo: "buttons", motivo: "copiar_codigo_demais" });
  }
  if (tipos.filter((t) => t === "FLOW").length > 1) {
    out.push({ campo: "buttons", motivo: "flow_demais" });
  }
  return out;
}

function problemasDoCarrossel(m: NovoModelo): ProblemaDoModelo[] {
  const out: ProblemaDoModelo[] = [];
  // A mensagem do carrossel é só o corpo; mídia e botões moram nos cards.
  if (m.header) out.push(naoSeAplica("header"));
  if (m.offer) out.push(naoSeAplica("offer"));
  if (m.footer) out.push(naoSeAplica("footer"));
  if (m.buttons.length > 0) out.push(naoSeAplica("buttons"));

  if (m.cards.length < MINIMO_DE_CARDS || m.cards.length > MAXIMO_DE_CARDS) {
    out.push({ campo: "cards", motivo: "cards_de_2_a_10" });
  }

  m.cards.forEach((c, i) => {
    const prefixo = `cards.${i}.`;
    if (c.header.format === "DOCUMENT") {
      out.push({ campo: `${prefixo}header`, motivo: "card_midia_imagem_ou_video" });
    } else {
      out.push(...problemasDaMidia(c.header, `${prefixo}header`));
    }
    out.push(...problemasDoTexto(c.body, c.examples, m.parameter_format, prefixo));
    if (c.buttons.length === 0) {
      out.push({ campo: `${prefixo}buttons`, motivo: "card_sem_botao" });
    } else if (
      c.buttons.length > LIMITE_DE_BOTOES_DO_CARD ||
      c.buttons.some((b) => b.type !== "QUICK_REPLY" && b.type !== "URL")
    ) {
      out.push({ campo: `${prefixo}buttons`, motivo: "botao_fora_do_card" });
    }
    out.push(...problemasDosBotoes(c.buttons, prefixo));
  });

  if (new Set(m.cards.map((c) => c.header.format)).size > 1) {
    out.push({ campo: "cards", motivo: "cards_com_a_mesma_midia" });
  }
  if (new Set(m.cards.map(assinaturaDosBotoes)).size > 1) {
    out.push({ campo: "cards", motivo: "cards_com_os_mesmos_botoes" });
  }
  return out;
}

function problemasDaOferta(m: NovoModelo): ProblemaDoModelo[] {
  const out: ProblemaDoModelo[] = [];
  if (m.category !== "MARKETING") out.push({ campo: "category", motivo: "oferta_so_marketing" });
  if (!m.offer) out.push({ campo: "offer", motivo: "oferta_obrigatoria" });
  if (m.header) {
    if (m.header.format === "DOCUMENT") {
      out.push({ campo: "header", motivo: "oferta_midia_imagem_ou_video" });
    } else {
      out.push(...problemasDaMidia(m.header, "header"));
    }
  }
  if (m.footer) out.push(naoSeAplica("footer"));
  if (m.cards.length > 0) out.push(naoSeAplica("cards"));
  if (m.body.length > LIMITE_DO_CORPO_DA_OFERTA) {
    out.push({ campo: "body", motivo: "corpo_da_oferta_longo" });
  }

  const tipos = m.buttons.map((b) => b.type);
  if (
    tipos.some((t) => t !== "COPY_CODE" && t !== "URL") ||
    tipos.filter((t) => t === "COPY_CODE").length > 1
  ) {
    out.push({ campo: "buttons", motivo: "oferta_so_codigo_e_link" });
  } else if (tipos.filter((t) => t === "URL").length !== 1) {
    out.push({ campo: "buttons", motivo: "oferta_precisa_de_link" });
  } else if (m.offer?.has_expiration && !tipos.includes("COPY_CODE")) {
    out.push({ campo: "buttons", motivo: "oferta_com_prazo_pede_codigo" });
  }
  return out;
}

/**
 * O que a Meta recusaria neste modelo. Lista vazia = pode enviar.
 *
 * Cada regra aqui é uma recusa conhecida da Meta, não gosto: variável sem
 * exemplo, variável colada no começo ou no fim do corpo, posicionais fora da
 * sequência 1..n, mistura de formatos, rodapé com variável, URL que não é https,
 * variável de URL fora do fim, respostas rápidas separadas por botão de ação, os
 * tetos de botão por tipo, cabeçalho de mídia sem arquivo, e as regras próprias
 * do carrossel e da oferta.
 */
export function problemasDoModelo(m: NovoModelo): ProblemaDoModelo[] {
  const out = problemasDoTexto(m.body, m.examples, m.parameter_format, "");

  if (m.footer && variaveisDoTexto(m.footer).length > 0) {
    out.push({ campo: "footer", motivo: "rodape_sem_variavel" });
  }
  out.push(...problemasDosBotoes(m.buttons, ""));

  if (m.kind === "CAROUSEL") out.push(...problemasDoCarrossel(m));
  else if (m.kind === "LIMITED_TIME_OFFER") out.push(...problemasDaOferta(m));
  else out.push(...problemasDoPadrao(m));
  return out;
}

/** O corpo da rota de criação: a forma, e por cima as recusas conhecidas da Meta. */
export const novoModeloSchema = formaDoModelo.superRefine((m, ctx) => {
  for (const p of problemasDoModelo(m)) {
    ctx.addIssue({ code: "custom", message: p.motivo, path: p.campo.split(".") });
  }
});

/** Um componente no formato da Graph. Aberto de propósito: é JSON que vai pelo fio. */
export type ComponenteDoPedido = Record<string, unknown> & { type: string };

export interface PedidoDeModelo {
  name: string;
  language: string;
  category: string;
  parameter_format: (typeof FORMATOS_DE_VARIAVEL)[number];
  components: ComponenteDoPedido[];
}

function componenteDoCorpo(
  texto: string,
  exemplos: Record<string, string>,
  formato: NovoModelo["parameter_format"],
): ComponenteDoPedido {
  const variaveis = variaveisDoTexto(texto);
  if (variaveis.length === 0) return { type: "BODY", text: texto };
  if (formato === "NAMED") {
    return {
      type: "BODY",
      text: texto,
      example: {
        body_text_named_params: variaveis.map((v) => ({
          param_name: v,
          example: exemplos[v] ?? "",
        })),
      },
    };
  }
  // Posicional: a Meta lê o exemplo pela POSIÇÃO na lista, então a lista vai em
  // ordem numérica — não na ordem em que as variáveis aparecem no texto.
  const ordem = [...variaveis].sort((a, b) => Number(a) - Number(b));
  return {
    type: "BODY",
    text: texto,
    example: { body_text: [ordem.map((v) => exemplos[v] ?? "")] },
  };
}

/** O cabeçalho de mídia: a amostra da revisão é o `handle` da API de upload. */
function componenteDoCabecalho(c: CabecalhoDoModelo): ComponenteDoPedido {
  return { type: "HEADER", format: c.format, example: { header_handle: [c.media?.handle ?? ""] } };
}

function botaoDoPedido(b: BotaoDoModelo): Record<string, unknown> {
  if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
  if (b.type === "COPY_CODE") return { type: "COPY_CODE", example: b.example };
  if (b.type === "FLOW") {
    return {
      type: "FLOW",
      text: b.text,
      flow_id: b.flow_id,
      flow_action: b.flow_action,
      // A tela de entrada só existe para `navigate`: no `data_exchange` quem
      // escolhe é o endpoint do flow.
      ...(b.flow_action === "navigate" && b.navigate_screen
        ? { navigate_screen: b.navigate_screen }
        : {}),
    };
  }
  if (!variavelDaUrl(b.url).tem) return { type: "URL", text: b.text, url: b.url };
  // A Meta pede a URL INTEIRA de exemplo, com o valor no lugar do `{{1}}`.
  return {
    type: "URL",
    text: b.text,
    url: b.url,
    example: [b.url.replace(VARIAVEL, b.example ?? "")],
  };
}

/**
 * Os botões na ordem em que vão à Meta. Na oferta, o cupom vem antes do link —
 * é a ordem da documentação e a que o WhatsApp mostra; o operador não precisa
 * acertá-la. Nos outros tipos vale a ordem do editor.
 */
function botoesEmOrdem(m: NovoModelo): BotaoDoModelo[] {
  if (m.kind !== "LIMITED_TIME_OFFER") return m.buttons;
  return [
    ...m.buttons.filter((b) => b.type === "COPY_CODE"),
    ...m.buttons.filter((b) => b.type !== "COPY_CODE"),
  ];
}

function componentesDoCard(c: CardDoModelo, formato: NovoModelo["parameter_format"]) {
  return {
    components: [
      componenteDoCabecalho(c.header),
      componenteDoCorpo(c.body, c.examples, formato),
      { type: "BUTTONS", buttons: c.buttons.map(botaoDoPedido) },
    ],
  };
}

/** O corpo de `POST /{waba}/message_templates`. Supõe um modelo sem `problemasDoModelo`. */
export function montarPedidoDeModelo(m: NovoModelo): PedidoDeModelo {
  const components: ComponenteDoPedido[] = [];
  const corpo = componenteDoCorpo(m.body, m.examples, m.parameter_format);

  if (m.kind === "CAROUSEL") {
    components.push(corpo, {
      type: "CAROUSEL",
      cards: m.cards.map((c) => componentesDoCard(c, m.parameter_format)),
    });
  } else {
    if (m.header) components.push(componenteDoCabecalho(m.header));
    if (m.kind === "LIMITED_TIME_OFFER" && m.offer) {
      components.push({
        type: "LIMITED_TIME_OFFER",
        limited_time_offer: { text: m.offer.text, has_expiration: m.offer.has_expiration },
      });
    }
    components.push(corpo);
    if (m.footer) components.push({ type: "FOOTER", text: m.footer });
    const botoes = botoesEmOrdem(m);
    if (botoes.length > 0) components.push({ type: "BUTTONS", buttons: botoes.map(botaoDoPedido) });
  }

  return {
    name: m.name,
    language: m.language,
    category: m.category,
    parameter_format: m.parameter_format,
    components,
  };
}

/** A cópia de uma mídia no storage, como o espelho a guarda (`meta_templates.header_media`). */
export interface MidiaGuardada {
  path: string;
  mime_type: TipoDeArquivoDoCabecalho;
  file_name: string;
}

const midiaGuardadaSchema = z.object({
  path: z.string().regex(CAMINHO_DA_MIDIA),
  mime_type: z.enum(TIPOS_DE_ARQUIVO),
  file_name: z.string().default(""),
});

/**
 * Lê `meta_templates.header_media` — o schema central da coluna. Tolerante: um
 * valor que não tem a forma (gravado à mão, ou por versão futura) é ignorado,
 * nunca lança; a lista de modelos não pode cair por causa de uma linha.
 */
export function lerMidiasGuardadas(bruto: unknown): Record<string, MidiaGuardada> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const out: Record<string, MidiaGuardada> = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    const r = midiaGuardadaSchema.safeParse(valor);
    if (r.success) out[chave] = r.data;
  }
  return out;
}

/**
 * Onde está a cópia de cada mídia do modelo, pela chave do slot do ENVIO
 * (`slotKey`, a mesma de `template_values` e de `saved_values`): `header:1`
 * para o cabeçalho, `card0:header:1` para o do primeiro card. Quem dispara o
 * modelo acha o arquivo pelo slot que o contrato pede, sem segunda convenção.
 */
export function midiasDoModelo(m: NovoModelo): Record<string, MidiaGuardada> {
  const out: Record<string, MidiaGuardada> = {};
  const guardar = (chave: string, c: CabecalhoDoModelo | null) => {
    if (!c?.media) return;
    out[chave] = { path: c.media.path, mime_type: c.media.mime_type, file_name: c.media.file_name };
  };
  if (m.kind === "CAROUSEL") {
    m.cards.forEach((c, i) =>
      guardar(slotKey({ kind: "card", cardIndex: i, inner: { kind: "header" } }, "1"), c.header),
    );
  } else {
    guardar(slotKey({ kind: "header" }, "1"), m.header);
  }
  return out;
}

export interface PreviewDoBotao {
  tipo: BotaoDoModelo["type"];
  texto: string;
}

export interface PreviewDoCabecalho {
  formato: FormatoDeMidia;
  /** O caminho da cópia no storage — a tela troca pelo link assinado que o upload devolveu. */
  path: string | null;
  nome: string | null;
}

export interface PreviewDoModelo {
  tipo: TipoDeModelo;
  cabecalho: PreviewDoCabecalho | null;
  oferta: { texto: string; temPrazo: boolean; codigo: string | null } | null;
  corpo: string;
  rodape: string | null;
  botoes: PreviewDoBotao[];
  cards: Array<{ cabecalho: PreviewDoCabecalho; corpo: string; botoes: PreviewDoBotao[] }>;
}

function comExemplos(texto: string, exemplos: Record<string, string>): string {
  return texto.replace(VARIAVEL, (inteiro, nome: string) => {
    const exemplo = (exemplos[nome] ?? "").trim();
    return exemplo ? exemplo : inteiro;
  });
}

function previewDoCabecalho(c: CabecalhoDoModelo): PreviewDoCabecalho {
  return { formato: c.format, path: c.media?.path ?? null, nome: c.media?.file_name || null };
}

/**
 * O botão de copiar código não tem texto próprio na Meta — o WhatsApp mostra
 * "Copiar código" no idioma do aparelho; o preview usa o rótulo em português e
 * a tela o traduz.
 */
const previewDosBotoes = (botoes: BotaoDoModelo[]): PreviewDoBotao[] =>
  botoes.map((b) => ({ tipo: b.type, texto: b.type === "COPY_CODE" ? "Copiar código" : b.text }));

/**
 * O que o cliente vai ler, com os exemplos no lugar das variáveis. Variável sem
 * exemplo continua à vista como `{{n}}`: o operador enxerga o que falta.
 *
 * Os botões saem na ordem em que vão à Meta (`botoesEmOrdem`), que é a ordem em
 * que o WhatsApp os mostra.
 */
export function previewDoModelo(m: NovoModelo): PreviewDoModelo {
  const carrossel = m.kind === "CAROUSEL";
  const oferta = m.kind === "LIMITED_TIME_OFFER" ? m.offer : null;
  const cupom = m.buttons.find((b) => b.type === "COPY_CODE");
  return {
    tipo: m.kind,
    cabecalho: !carrossel && m.header ? previewDoCabecalho(m.header) : null,
    oferta: oferta
      ? {
          texto: oferta.text,
          temPrazo: oferta.has_expiration,
          codigo: cupom?.type === "COPY_CODE" ? cupom.example || null : null,
        }
      : null,
    corpo: comExemplos(m.body, m.examples),
    rodape: carrossel ? null : (m.footer ?? null),
    botoes: carrossel ? [] : previewDosBotoes(botoesEmOrdem(m)),
    cards: carrossel
      ? m.cards.map((c) => ({
          cabecalho: previewDoCabecalho(c.header),
          corpo: comExemplos(c.body, c.examples),
          botoes: previewDosBotoes(c.buttons),
        }))
      : [],
  };
}
