import { describe, expect, it } from "vitest";

import { IDIOMAS } from "@/lib/i18n/idiomas";

import {
  IDIOMAS_DO_AGENTE,
  PERFIL_VAZIO,
  TONS_DO_AGENTE,
  comporInstrucoes,
  perfilPreenchido,
  type PerfilDoAgente,
} from "./perfil";

const PROMPT = "Você é a atendente da Clínica Sorriso. Responda com objetividade.";

const perfil = (parte: Partial<PerfilDoAgente>): PerfilDoAgente => ({ ...PERFIL_VAZIO, ...parte });

describe("comporInstrucoes — o que o agente recebe", () => {
  it("agente sem perfil recebe EXATAMENTE o prompt de hoje, byte a byte", () => {
    expect(comporInstrucoes(PROMPT, PERFIL_VAZIO)).toBe(PROMPT);
  });

  it("campos só de espaço contam como vazios (formulário em branco não muda o agente)", () => {
    const quaseVazio = perfil({ persona: "   ", objetivo: "\n", boasVindas: "" });
    expect(perfilPreenchido(quaseVazio)).toBe(false);
    expect(comporInstrucoes(PROMPT, quaseVazio)).toBe(PROMPT);
  });

  it("perfil completo vira uma seção composta ANTES das instruções livres", () => {
    const texto = comporInstrucoes(
      PROMPT,
      perfil({
        persona: "Marina, recepcionista simpática da Clínica Sorriso",
        tom: "descontraido",
        objetivo: "Qualificar o interesse e marcar a avaliação gratuita",
        boasVindas: "Oi! Eu sou a Marina, da Clínica Sorriso 😊",
        idioma: "es",
      }),
    );
    expect(texto).toBe(
      [
        "## Perfil do agente",
        "- Persona: Marina, recepcionista simpática da Clínica Sorriso",
        "- Tom de voz: descontraído — fale de forma leve e próxima, como numa conversa entre conhecidos, sem perder o respeito.",
        "- Objetivo: Qualificar o interesse e marcar a avaliação gratuita",
        "- Boas-vindas: Ao iniciar a conversa com um contato novo, abra com esta mensagem (pode ajustar o nome do contato, sem mudar o sentido): Oi! Eu sou a Marina, da Clínica Sorriso 😊",
        "- Idioma: responda sempre em español.",
        "",
        "## Instruções",
        PROMPT,
      ].join("\n"),
    );
  });

  it("só o tom preenchido já compõe — e só ele aparece", () => {
    const texto = comporInstrucoes(PROMPT, perfil({ tom: "formal" }));
    expect(texto).toContain("- Tom de voz: formal");
    expect(texto).not.toContain("Persona");
    expect(texto).not.toContain("Objetivo");
    expect(texto).not.toContain("Boas-vindas");
    expect(texto).not.toContain("Idioma");
    expect(texto.endsWith(`## Instruções\n${PROMPT}`)).toBe(true);
  });

  it("aparam as bordas dos campos antes de compor", () => {
    const texto = comporInstrucoes(PROMPT, perfil({ persona: "  Marina  " }));
    expect(texto).toContain("- Persona: Marina\n");
  });
});

describe("vocabulário fechado", () => {
  it("tom: três níveis", () => {
    expect([...TONS_DO_AGENTE]).toEqual(["formal", "normal", "descontraido"]);
  });

  it("idioma: os mesmos idiomas que o produto serve", () => {
    expect([...IDIOMAS_DO_AGENTE].sort()).toEqual([...IDIOMAS].sort());
  });
});
