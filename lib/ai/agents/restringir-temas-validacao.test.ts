import { describe, expect, it } from "vitest";

import { versionCreateSchema, versionPatchSchema } from "./validation";

/** O corpo mínimo que a API já aceita hoje (sem nada de temas). */
const BASE = {
  system_prompt: "Você atende os clientes da clínica.",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  credential_id: "6b0b7a52-0d0f-4c9a-9a39-2f1d3c5c8a11",
  channel_session_id: "0f4f4f0e-3c53-4b64-a1d6-8d7c5f0f9a22",
};

const criar = (extra: Record<string, unknown>) => versionCreateSchema.safeParse({ ...BASE, ...extra });

describe("restringir temas: o que a API aceita (#92)", () => {
  it("corpo sem os campos novos segue válido e lê a restrição como DESLIGADA", () => {
    const r = criar({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.restrict_topics).toBe(false);
      expect(r.data.allowed_topics).toEqual([]);
      expect(r.data.off_topic_reply).toBeNull();
    }
  });

  it("aceita chave + assuntos + resposta; apara os assuntos e a resposta", () => {
    const r = criar({
      restrict_topics: true,
      allowed_topics: ["  Horários  ", "Valores"],
      off_topic_reply: "  Só posso ajudar com horários e valores.  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.allowed_topics).toEqual(["Horários", "Valores"]);
      expect(r.data.off_topic_reply).toBe("Só posso ajudar com horários e valores.");
    }
  });

  it("resposta em branco vira null (formulário vazio não 'preenche')", () => {
    const r = criar({ off_topic_reply: "   " });
    expect(r.success && r.data.off_topic_reply).toBeNull();
  });

  it.each([
    ["assunto vazio", { allowed_topics: [""] }],
    ["assunto maior que 120", { allowed_topics: ["x".repeat(121)] }],
    ["mais de 20 assuntos", { allowed_topics: Array.from({ length: 21 }, (_, i) => `assunto ${i}`) }],
    ["resposta maior que 500", { off_topic_reply: "x".repeat(501) }],
    ["chave que não é booleana", { restrict_topics: "sim" }],
  ])("recusa %s", (_nome, extra) => {
    expect(criar(extra).success).toBe(false);
  });

  it("PATCH só carrega o que veio: sem os campos novos, nada é gravado por cima", () => {
    const r = versionPatchSchema.safeParse({ system_prompt: "Outro prompt livre para o agente." });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.restrict_topics).toBeUndefined();
      expect(r.data.allowed_topics).toBeUndefined();
      expect(r.data.off_topic_reply).toBeUndefined();
    }
  });
});
