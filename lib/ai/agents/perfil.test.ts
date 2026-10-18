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

describe("restringir temas (#92) — o que o agente recebe", () => {
  const restrito = perfil({
    restringirTemas: true,
    temasPermitidos: ["Horários e endereço da clínica", "Valores de consulta"],
    respostaForaDoTema: "Posso ajudar só com horários e valores. Quer falar com uma pessoa?",
  });

  it("chave desligada: o prompt sai INTACTO mesmo com a lista preenchida (controle)", () => {
    const desligado = perfil({ ...restrito, restringirTemas: false });
    expect(comporInstrucoes(PROMPT, desligado)).toBe(PROMPT);
  });

  it("chave ligada sem nenhum assunto: não há o que restringir, o prompt sai intacto", () => {
    const vazio = perfil({ restringirTemas: true, temasPermitidos: ["  ", ""] });
    expect(comporInstrucoes(PROMPT, vazio)).toBe(PROMPT);
  });

  it("chave ligada: lista os assuntos, dá a resposta padrão e vem ANTES das instruções livres", () => {
    const texto = comporInstrucoes(PROMPT, restrito);
    expect(texto).toContain("## Assuntos permitidos");
    expect(texto).toContain("- Horários e endereço da clínica");
    expect(texto).toContain("- Valores de consulta");
    expect(texto).toContain(
      "Posso ajudar só com horários e valores. Quer falar com uma pessoa?",
    );
    expect(texto.indexOf("## Assuntos permitidos")).toBeLessThan(texto.indexOf("## Instruções"));
    expect(texto.endsWith(`## Instruções
${PROMPT}`)).toBe(true);
    // Sem perfil, a seção do perfil não aparece só porque a restrição está ligada.
    expect(texto).not.toContain("## Perfil do agente");
  });

  it("pedido de atendente humano e opt-out são EXCEÇÕES declaradas, nunca 'fora do tema'", () => {
    const texto = comporInstrucoes(PROMPT, restrito);
    expect(texto).toMatch(/atendente humano|pessoa/i);
    expect(texto).toMatch(/parar de receber|sair da lista|opt-out/i);
    expect(texto).toMatch(/nunca (é|são|conta)[^.]*fora do tema/i);
  });

  it("sem resposta padrão escrita, o agente recebe uma instrução de recusa educada", () => {
    const texto = comporInstrucoes(PROMPT, perfil({ ...restrito, respostaForaDoTema: null }));
    expect(texto).toMatch(/educad/i);
    expect(texto).not.toContain("responda exatamente");
  });

  it("junto do perfil: perfil, depois assuntos, depois instruções", () => {
    const texto = comporInstrucoes(PROMPT, perfil({ ...restrito, tom: "formal" }));
    const i = (x: string) => texto.indexOf(x);
    expect(i("## Perfil do agente")).toBeGreaterThanOrEqual(0);
    expect(i("## Perfil do agente")).toBeLessThan(i("## Assuntos permitidos"));
    expect(i("## Assuntos permitidos")).toBeLessThan(i("## Instruções"));
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
