import { describe, expect, it } from "vitest";

import { sql } from "./psql-transporte";
import { CANAIS_DE_CONVERSA } from "@/lib/channels/canais-de-conversa";

/**
 * O QUE O BANCO ACEITA EM `conversations.channel` É O QUE O CÓDIGO OFERECE.
 *
 * Duas listas precisam concordar: `CANAIS_DE_CONVERSA` (TypeScript) decide o
 * que a ingestão pode gravar, e `conversations_channel_check` (banco) decide o
 * que a coluna aceita. Um canal novo que entra só numa delas morre no INSERT
 * com `23514` — e, como o provedor REENTREGA o webhook, vira 500 eterno.
 *
 * Este arquivo **importa o módulo** e compara o VALOR com o CHECK real do
 * Postgres: mede o que o código faz, não o que o arquivo diz.
 */

/** Os literais do CHECK de `conversations.channel`, lidos do catálogo do Postgres. */
function vocabularioNoBanco(): string[] {
  const saida = sql(`
    select pg_get_constraintdef(oid)
      from pg_constraint
     where conrelid = 'public.conversations'::regclass
       and conname = 'conversations_channel_check';
  `).trim();
  const literais = saida.match(/'([^']+)'::text/g) ?? [];
  return [...new Set(literais.map((l) => l.replace(/'|::text/g, "")))].sort();
}

describe("conversations.channel: banco × catálogo", () => {
  it("a sonda LÊ a constraint de verdade — sem isto, um vazio passaria por acordo", () => {
    // Controle da própria sonda. Se a constraint sumir ou mudar de nome, a
    // comparação abaixo viraria "[] === []" e ficaria verde sobre nada.
    expect(vocabularioNoBanco().length).toBeGreaterThan(0);
  });

  it("aceita exatamente os canais que o catálogo oferece", () => {
    const noBanco = vocabularioNoBanco();
    const noCodigo = [...CANAIS_DE_CONVERSA].sort();

    expect(
      noBanco,
      "divergência entre o CHECK e o catálogo.\n" +
        `  banco aceita: ${noBanco.join(", ")}\n` +
        `  catálogo oferece: ${noCodigo.join(", ")}\n` +
        "Canal no código que o banco não conhece = 23514 num webhook que o " +
        "provedor reentrega, ou seja 500 eterno. Canal no banco que o código não " +
        "oferece = valor morto que ninguém consegue gravar.",
    ).toEqual(noCodigo);
  });
});
