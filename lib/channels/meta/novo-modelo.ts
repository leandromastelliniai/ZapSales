/**
 * O MODELO CRIADO NO ZAPSALES — do editor ao corpo que a Meta aceita (issue #6).
 *
 * O modelo continua VIVENDO NA META: depois de criado, quem manda no status, na
 * categoria e na qualidade é ela (webhook e sincronização). Este módulo só
 * traduz o que o operador digitou no editor básico — corpo com variáveis,
 * rodapé e botões de resposta rápida, URL e copiar código — para o corpo de
 * `POST /{waba}/message_templates`.
 *
 * Três funções, uma regra cada, todas puras:
 *
 * - `problemasDoModelo` diz ANTES do envio o que a Meta recusaria. A recusa da
 *   Meta chega depois de uma ida e volta, em inglês e com código; aqui ela chega
 *   no campo, enquanto o operador digita. É a MESMA função que o schema da rota
 *   aplica — a tela e o servidor não divergem sobre o que é um modelo válido.
 * - `montarPedidoDeModelo` monta o corpo. Os `components` que ele devolve são
 *   os que o espelho local guarda, e é deles que o envio deriva os parâmetros
 *   (`deriveTemplateContract`) — o mesmo formato que a sincronização traz.
 * - `previewDoModelo` é o que a tela mostra: os exemplos aplicados no corpo.
 *
 * Fora do editor básico (issue #7): cabeçalho de mídia, carrossel, oferta por
 * tempo limitado e botão de flow. Autenticação também fica fora — a Meta exige
 * para ela um formato próprio (botão de OTP), e o schema a recusa em vez de
 * montar um pedido que voltaria recusado.
 */
import { z } from "zod";

/** Os formatos de variável que a Meta conhece. Mesmo vocabulário de `parameter_format`. */
export const FORMATOS_DE_VARIAVEL = ["POSITIONAL", "NAMED"] as const;

/** As categorias que o editor básico cria. */
export const CATEGORIAS_DO_EDITOR = ["MARKETING", "UTILITY"] as const;

// Limites da Meta para modelos (documentação de criação de modelos da Cloud API).
const LIMITE_DO_CORPO = 1024;
const LIMITE_DO_RODAPE = 60;
const LIMITE_DO_TEXTO_DO_BOTAO = 25;
const LIMITE_DO_CODIGO = 15;
const LIMITE_DE_BOTOES = 10;
const LIMITE_DE_BOTOES_DE_URL = 2;

const VARIAVEL = /\{\{\s*(\w+)\s*\}\}/g;
const NOME_DE_VARIAVEL = /^[a-z][a-z0-9_]*$/;

const botaoSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("QUICK_REPLY"),
    text: z.string().trim().min(1).max(LIMITE_DO_TEXTO_DO_BOTAO),
  }),
  z.object({
    type: z.literal("URL"),
    text: z.string().trim().min(1).max(LIMITE_DO_TEXTO_DO_BOTAO),
    url: z.string().trim().min(1).max(2000),
    /** O valor de exemplo do `{{1}}` do fim da URL. Só existe quando a URL tem variável. */
    example: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal("COPY_CODE"),
    /** O código de exemplo. O código de verdade vai em cada envio. */
    example: z.string().trim().min(1).max(LIMITE_DO_CODIGO),
  }),
]);

export type BotaoDoModelo = z.infer<typeof botaoSchema>;

const formaDoModelo = z.object({
  /** A Meta só aceita minúsculas, números e `_`. */
  name: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, "nome_invalido"),
  /** `pt_BR`, `en_US`, `es` — o código de idioma da Meta. */
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "idioma_invalido"),
  category: z.enum(CATEGORIAS_DO_EDITOR),
  parameter_format: z.enum(FORMATOS_DE_VARIAVEL).default("POSITIONAL"),
  body: z.string().trim().min(1).max(LIMITE_DO_CORPO),
  /** Exemplo de cada variável do corpo, pela chave (`"1"` ou `"nome"`). */
  examples: z.record(z.string(), z.string()).default({}),
  footer: z
    .string()
    .trim()
    .max(LIMITE_DO_RODAPE)
    .nullish()
    .transform((v) => (v ? v : null)),
  buttons: z.array(botaoSchema).max(LIMITE_DE_BOTOES).default([]),
});

export type NovoModelo = z.output<typeof formaDoModelo>;

/** Um motivo de recusa, apontando o campo. `motivo` é código; a tela traduz. */
export interface ProblemaDoModelo {
  campo: string;
  motivo: string;
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
 * O que a Meta recusaria neste modelo. Lista vazia = pode enviar.
 *
 * Cada regra aqui é uma recusa conhecida da Meta, não gosto: variável sem
 * exemplo, variável colada no começo ou no fim do corpo, posicionais fora da
 * sequência 1..n, mistura de formatos, rodapé com variável, URL que não é https,
 * variável de URL fora do fim, respostas rápidas separadas por botão de ação, e
 * os tetos de botão por tipo.
 */
export function problemasDoModelo(m: NovoModelo): ProblemaDoModelo[] {
  const out: ProblemaDoModelo[] = [];
  const variaveis = variaveisDoTexto(m.body);

  if (m.parameter_format === "POSITIONAL") {
    if (variaveis.some((v) => !/^\d+$/.test(v))) {
      out.push({ campo: "body", motivo: "variavel_posicional_esperada" });
    } else {
      const numeros = variaveis.map(Number).sort((a, b) => a - b);
      if (numeros.some((n, i) => n !== i + 1)) {
        out.push({ campo: "body", motivo: "variaveis_fora_de_sequencia" });
      }
    }
  } else if (variaveis.some((v) => !NOME_DE_VARIAVEL.test(v))) {
    out.push({ campo: "body", motivo: "variavel_nomeada_invalida" });
  }

  const corpo = m.body.trim();
  if (/^\{\{\s*\w+\s*\}\}/.test(corpo) || /\{\{\s*\w+\s*\}\}$/.test(corpo)) {
    out.push({ campo: "body", motivo: "variavel_na_ponta" });
  }

  for (const v of variaveis) {
    if (!(m.examples[v] ?? "").trim())
      out.push({ campo: `examples.${v}`, motivo: "exemplo_obrigatorio" });
  }

  if (m.footer && variaveisDoTexto(m.footer).length > 0) {
    out.push({ campo: "footer", motivo: "rodape_sem_variavel" });
  }

  m.buttons.forEach((b, i) => {
    if (b.type !== "URL") return;
    if (!/^https:\/\/[^\s/]+/i.test(b.url))
      out.push({ campo: `buttons.${i}.url`, motivo: "url_https" });
    const variavel = variavelDaUrl(b.url);
    if (variavel.tem && !variavel.noFim) {
      out.push({ campo: `buttons.${i}.url`, motivo: "variavel_de_url_no_fim" });
    } else if (variavel.tem && !b.example?.trim()) {
      out.push({ campo: `buttons.${i}.example`, motivo: "exemplo_obrigatorio" });
    }
  });

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

function componenteDoCorpo(m: NovoModelo): ComponenteDoPedido {
  const variaveis = variaveisDoTexto(m.body);
  if (variaveis.length === 0) return { type: "BODY", text: m.body };
  if (m.parameter_format === "NAMED") {
    return {
      type: "BODY",
      text: m.body,
      example: {
        body_text_named_params: variaveis.map((v) => ({
          param_name: v,
          example: m.examples[v] ?? "",
        })),
      },
    };
  }
  // Posicional: a Meta lê o exemplo pela POSIÇÃO na lista, então a lista vai em
  // ordem numérica — não na ordem em que as variáveis aparecem no texto.
  const ordem = [...variaveis].sort((a, b) => Number(a) - Number(b));
  return {
    type: "BODY",
    text: m.body,
    example: { body_text: [ordem.map((v) => m.examples[v] ?? "")] },
  };
}

function botaoDoPedido(b: BotaoDoModelo): Record<string, unknown> {
  if (b.type === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.text };
  if (b.type === "COPY_CODE") return { type: "COPY_CODE", example: b.example };
  if (!variavelDaUrl(b.url).tem) return { type: "URL", text: b.text, url: b.url };
  // A Meta pede a URL INTEIRA de exemplo, com o valor no lugar do `{{1}}`.
  return {
    type: "URL",
    text: b.text,
    url: b.url,
    example: [b.url.replace(VARIAVEL, b.example ?? "")],
  };
}

/** O corpo de `POST /{waba}/message_templates`. Supõe um modelo sem `problemasDoModelo`. */
export function montarPedidoDeModelo(m: NovoModelo): PedidoDeModelo {
  const components: ComponenteDoPedido[] = [componenteDoCorpo(m)];
  if (m.footer) components.push({ type: "FOOTER", text: m.footer });
  if (m.buttons.length > 0)
    components.push({ type: "BUTTONS", buttons: m.buttons.map(botaoDoPedido) });
  return {
    name: m.name,
    language: m.language,
    category: m.category,
    parameter_format: m.parameter_format,
    components,
  };
}

export interface PreviewDoModelo {
  corpo: string;
  rodape: string | null;
  botoes: Array<{ tipo: BotaoDoModelo["type"]; texto: string }>;
}

/**
 * O que o cliente vai ler, com os exemplos no lugar das variáveis. Variável sem
 * exemplo continua à vista como `{{n}}`: o operador enxerga o que falta.
 *
 * O botão de copiar código não tem texto próprio na Meta — o WhatsApp mostra
 * "Copiar código" no idioma do aparelho; o preview usa o rótulo em português e
 * a tela o traduz.
 */
export function previewDoModelo(m: NovoModelo): PreviewDoModelo {
  return {
    corpo: m.body.replace(VARIAVEL, (inteiro, nome: string) => {
      const exemplo = (m.examples[nome] ?? "").trim();
      return exemplo ? exemplo : inteiro;
    }),
    rodape: m.footer ?? null,
    botoes: m.buttons.map((b) => ({
      tipo: b.type,
      texto: b.type === "COPY_CODE" ? "Copiar código" : b.text,
    })),
  };
}
