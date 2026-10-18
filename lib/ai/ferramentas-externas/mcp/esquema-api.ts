/**
 * A entrada da API dos servidores MCP. Zod ESTRITO em tudo: o corpo nunca escolhe a organização,
 * o id, o nome interno de ferramenta nem a impressão da definição — quem decide isso é o servidor
 * (a sessão, o banco, a lista que o servidor MCP acabou de devolver).
 */
import { z } from "zod";

import { EFEITOS_DA_FERRAMENTA, LIMITES_DA_FERRAMENTA, VALIDADE_DO_PEDIDO_HORAS } from "../tipos";
import { urlDaFerramentaSchema } from "../esquema";
import { CABECALHO_PADRAO_DA_CREDENCIAL, LIMITES_DO_SERVIDOR, recusaDoCabecalho } from "./tipos";

const nomeSchema = z.string().trim().min(LIMITES_DO_SERVIDOR.nome.min).max(LIMITES_DO_SERVIDOR.nome.max);

/** A credencial como a pessoa a cola: sem espaço nas pontas, sem quebra de linha no meio. */
export const credencialSchema = z
  .string()
  .trim()
  .min(LIMITES_DO_SERVIDOR.credencial.min)
  .max(LIMITES_DO_SERVIDOR.credencial.max)
  .refine((v) => !/[\r\n\u0000]/.test(v), "A credencial não pode ter quebra de linha.");

export const cabecalhoSchema = z
  .string()
  .trim()
  .max(LIMITES_DO_SERVIDOR.cabecalho.max)
  .superRefine((valor, ctx) => {
    const recusa = recusaDoCabecalho(valor);
    if (recusa) ctx.addIssue({ code: "custom", message: recusa });
  });

export const criarServidorSchema = z
  .object({
    nome: nomeSchema,
    url: urlDaFerramentaSchema,
    credencial: credencialSchema.optional(),
    cabecalho: cabecalhoSchema.default(CABECALHO_PADRAO_DA_CREDENCIAL),
  })
  .strict();
export type CriarServidorInput = z.infer<typeof criarServidorSchema>;

export const editarServidorSchema = z
  .object({
    nome: nomeSchema.optional(),
    url: urlDaFerramentaSchema.optional(),
    /** Texto = troca a credencial. `null` = remove. Ausente = não mexe. */
    credencial: credencialSchema.nullable().optional(),
    cabecalho: cabecalhoSchema.optional(),
    ativo: z.boolean().optional(),
  })
  .strict()
  .refine((corpo) => Object.keys(corpo).length > 0, { message: "Nada para alterar." });
export type EditarServidorInput = z.infer<typeof editarServidorSchema>;

const uma = z
  .object({
    /** O nome da ferramenta NO servidor. Precisa existir na lista que o servidor devolve agora. */
    ferramenta: z.string().trim().min(1).max(128),
    /** O que o administrador marca. Ausente = «altera dados» (o padrão; a dica do servidor não conta). */
    efeito: z.enum(EFEITOS_DA_FERRAMENTA).optional(),
    /** Ausente = o padrão do efeito (altera pede). `true`/`false` = decisão de quem cadastra. */
    pedir_aprovacao: z.boolean().optional(),
    validade_horas: z.number().int().min(VALIDADE_DO_PEDIDO_HORAS.min).max(VALIDADE_DO_PEDIDO_HORAS.max).optional(),
    /** O texto que o agente lê para decidir quando usar a ferramenta. Ausente = o do servidor, já limpo. */
    quando_usar: z
      .string()
      .trim()
      .min(LIMITES_DA_FERRAMENTA.quandoUsar.min)
      .max(LIMITES_DA_FERRAMENTA.quandoUsar.max)
      .optional(),
  })
  .strict();

/** A seleção do administrador: exatamente as ferramentas que ficam disponíveis. As demais saem. */
export const selecionarFerramentasSchema = z
  .object({
    ferramentas: z
      .array(uma)
      .max(200)
      .refine((lista) => new Set(lista.map((i) => i.ferramenta)).size === lista.length, {
        message: "A mesma ferramenta aparece duas vezes.",
      }),
  })
  .strict();
export type SelecionarFerramentasInput = z.infer<typeof selecionarFerramentasSchema>;
export type FerramentaSelecionada = z.infer<typeof uma>;
