/**
 * A EDIÇÃO da ferramenta (issue #95): trocar o EFEITO sem decidir a chave de aprovação devolve a
 * chave ao padrão do efeito. Sem isto, uma consulta que alguém desligou de propósito
 * («executa direto») virava «altera dados» herdando a decisão antiga — e passava a ALTERAR o outro
 * sistema sem aprovação, sem ninguém ter decidido isso para uma ação que altera.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { editarFerramenta } from "./repositorio";

function admin() {
  const gravado: Array<Record<string, unknown>> = [];
  const cadeia = {
    update: (mudanca: Record<string, unknown>) => {
      gravado.push(mudanca);
      return cadeia;
    },
    eq: () => cadeia,
    select: () => cadeia,
    maybeSingle: async () => ({
      data: {
        id: "i",
        name: "n",
        slug: "s",
        when_to_use: "w",
        url: "https://x.example.com",
        parameters: [],
        effect: "altera",
        require_approval: null,
        approval_ttl_hours: 24,
        active: true,
        signing_secret_last4: "abcd",
        created_at: "",
        updated_at: "",
      },
      error: null,
    }),
  };
  return { cliente: { from: () => cadeia } as unknown as SupabaseClient, gravado };
}

const base = { organizationId: "o", id: "i", atorId: "u" };

describe("editarFerramenta — a chave de aprovação ao trocar o efeito", () => {
  it("trocar o efeito SEM decidir a chave devolve a chave ao padrão do efeito (NULA)", async () => {
    const { cliente, gravado } = admin();
    await editarFerramenta(cliente, { ...base, patch: { efeito: "altera" } });
    expect(gravado[0]).toMatchObject({ effect: "altera", require_approval: null });
  });

  it("trocar o efeito E decidir a chave grava a decisão", async () => {
    const { cliente, gravado } = admin();
    await editarFerramenta(cliente, { ...base, patch: { efeito: "altera", pedir_aprovacao: false } });
    expect(gravado[0]).toMatchObject({ effect: "altera", require_approval: false });
  });

  it("editar outra coisa não mexe na chave", async () => {
    const { cliente, gravado } = admin();
    await editarFerramenta(cliente, { ...base, patch: { nome: "Outro nome" } });
    expect(gravado[0]).not.toHaveProperty("require_approval");
  });
});
