/**
 * A TABELA DE PREÇOS DA META (issue #10): quanto custa UMA mensagem, por país do
 * destinatário e categoria.
 *
 * ═══ Por que o prefixo de discagem mora na própria linha ═══
 *
 * O preço é do país de QUEM RECEBE, e o que a campanha tem de cada pessoa é o
 * telefone. Guardar o prefixo junto do país deixa a tabela responder sozinha
 * "de que país é +55…" — sem um segundo mapa de DDI para manter em paralelo, que
 * divergiria do primeiro no dia em que alguém acrescentasse um país só num deles.
 * O prefixo mais LONGO vence: +1 876 (Jamaica) não é +1 (EUA).
 *
 * ═══ Por que centavos com casas decimais ═══
 *
 * Dinheiro anda em `_cents` (doutrina da API), e o marketing no Brasil custa
 * R$ 0,3217 — 32,17 centavos. Inteiro arredondaria cada mensagem, e o erro de
 * arredondamento de 10 mil mensagens é a diferença entre a estimativa e a fatura.
 * No banco a coluna é `numeric(12,4)`, exata.
 *
 * O banco (`meta_pricing_rates`) é a fonte; `TABELA_INICIAL` é só a semente com
 * que a instalação nasce e o que a migration grava — e o painel da instalação a
 * edita depois (`app/app/platform/precos-da-meta`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** As categorias de cobrança da Meta, no vocabulário do campo `pricing.category` do webhook. */
export const CATEGORIAS_DE_PRECO = ["marketing", "utility", "authentication", "service"] as const;
export type CategoriaDePreco = (typeof CATEGORIAS_DE_PRECO)[number];

export const ROTULO_DA_CATEGORIA: Record<CategoriaDePreco, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
  service: "Atendimento",
};

export interface LinhaDePreco {
  /** ISO 3166-1 alfa-2 (`BR`). */
  country: string;
  /** Só dígitos, sem `+` (`55`). */
  dial_prefix: string;
  category: CategoriaDePreco;
  unit_price_cents: number;
  /** ISO-4217. */
  currency: string;
}

/** A tabela do Brasil vigente em 01/10/2026 — a semente da instalação. */
export const TABELA_INICIAL: readonly LinhaDePreco[] = [
  { country: "BR", dial_prefix: "55", category: "marketing", unit_price_cents: 32.17, currency: "BRL" },
  { country: "BR", dial_prefix: "55", category: "utility", unit_price_cents: 3.5, currency: "BRL" },
  { country: "BR", dial_prefix: "55", category: "authentication", unit_price_cents: 3.5, currency: "BRL" },
  { country: "BR", dial_prefix: "55", category: "service", unit_price_cents: 3.5, currency: "BRL" },
];

export function ehCategoriaDePreco(v: unknown): v is CategoriaDePreco {
  return typeof v === "string" && (CATEGORIAS_DE_PRECO as readonly string[]).includes(v);
}

/**
 * A categoria de cobrança de um MODELO: a `category` da Meta vem em maiúsculas
 * (`MARKETING`). Modelo sem categoria conhecida é tratado como marketing — a mais
 * cara: na dúvida, a estimativa erra para cima, nunca para baixo.
 */
export function categoriaDoModelo(categoria: string | null | undefined): CategoriaDePreco {
  const c = (categoria ?? "").toLowerCase();
  return ehCategoriaDePreco(c) ? c : "marketing";
}

/** Só os dígitos do telefone (`+55 31 9…` → `5531…`). */
function digitos(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/** A linha que vale para este telefone e esta categoria — o prefixo mais longo vence. */
export function precoPara(
  telefone: string,
  categoria: CategoriaDePreco,
  tabela: readonly LinhaDePreco[],
): LinhaDePreco | null {
  const d = digitos(telefone);
  let melhor: LinhaDePreco | null = null;
  for (const l of tabela) {
    if (l.category !== categoria || !d.startsWith(l.dial_prefix)) continue;
    if (!melhor || l.dial_prefix.length > melhor.dial_prefix.length) melhor = l;
  }
  return melhor;
}

/**
 * O MAIOR preço da categoria na tabela — a régua conservadora do teto: quem
 * ainda não tem custo registrado é contado por ela, para o teto nunca ser
 * ultrapassado por um destinatário de país mais caro.
 */
export function maiorPreco(categoria: CategoriaDePreco, tabela: readonly LinhaDePreco[]): number {
  return tabela.filter((l) => l.category === categoria).reduce((m, l) => Math.max(m, l.unit_price_cents), 0);
}

/** A tabela como o banco a guarda. Nunca lança: tabela ilegível é tabela vazia. */
export async function carregarTabela(admin: SupabaseClient): Promise<LinhaDePreco[]> {
  const { data } = await admin
    .from("meta_pricing_rates")
    .select("country, dial_prefix, category, unit_price_cents, currency")
    .order("country", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>)
    .filter((l) => ehCategoriaDePreco(l.category))
    .map((l) => ({
      country: String(l.country),
      dial_prefix: String(l.dial_prefix),
      category: l.category as CategoriaDePreco,
      unit_price_cents: Number(l.unit_price_cents),
      currency: String(l.currency),
    }));
}

/** Uma linha como o painel da instalação a manda. Zod em todo input externo. */
export const linhaDePrecoSchema = z.object({
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  dial_prefix: z.string().trim().regex(/^[0-9]{1,4}$/),
  category: z.enum(CATEGORIAS_DE_PRECO),
  unit_price_cents: z.number().min(0).max(100_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BRL"),
});

/**
 * Grava a tabela INTEIRA como o painel a mostra: o que veio é upsert por país e
 * categoria, e o que sumiu da tela sai do banco. Devolve `false` se o banco
 * recusou — a tela não pode dizer "salvo" sobre o que não foi.
 */
export async function gravarTabela(
  admin: SupabaseClient,
  linhas: readonly LinhaDePreco[],
  autorId: string,
): Promise<boolean> {
  const chave = (l: { country: string; category: string }) => `${l.country}:${l.category}`;
  const novas = new Set(linhas.map(chave));
  const { data: atuais, error: erroLeitura } = await admin.from("meta_pricing_rates").select("id, country, category");
  if (erroLeitura) return false;
  for (const a of (atuais ?? []) as Array<{ id: string; country: string; category: string }>) {
    if (!novas.has(chave(a))) {
      const { error } = await admin.from("meta_pricing_rates").delete().eq("id", a.id);
      if (error) return false;
    }
  }
  if (linhas.length === 0) return true;
  const { error } = await admin
    .from("meta_pricing_rates")
    .upsert(
      linhas.map((l) => ({ ...l, updated_by: autorId })),
      { onConflict: "country,category" },
    );
  return !error;
}
