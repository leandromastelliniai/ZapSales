import { describe, expect, it } from "vitest";

import { IDIOMAS } from "@/lib/i18n/idiomas";

import {
  IDS_DE_MODELO_DO_ONBOARDING,
  MODELOS_DE_AGENTE,
  aplicarModelo,
  modeloPorId,
} from "./modelos";
import { LIMITES_DO_PERFIL, LIMITES_DOS_TEMAS, comporInstrucoes } from "./perfil";
import { versionCreateSchema } from "./validation";

/** Os três pedidos em 15/10/2026 (#86) mais o Atendimento, pedido em 24/10/2026. */
const RAMOS = ["vendas", "suporte", "agendamento", "atendimento"] as const;

describe("galeria de modelos por ramo (#92)", () => {
  it("o onboarding não oferece o Atendimento: ele sempre nasce com o pacote vender", () => {
    expect(IDS_DE_MODELO_DO_ONBOARDING).toEqual(["vendas", "suporte", "agendamento"]);
    for (const id of IDS_DE_MODELO_DO_ONBOARDING) expect(modeloPorId(id)).toBeDefined();
  });

  it("tem os quatro modelos, nessa ordem", () => {
    expect(MODELOS_DE_AGENTE.map((m) => m.id)).toEqual(RAMOS);
  });

  it.each(RAMOS)("%s: existe em TODOS os idiomas do produto", (id) => {
    const modelo = modeloPorId(id);
    expect(modelo).toBeDefined();
    for (const idioma of IDIOMAS) {
      const c = modelo!.conteudo[idioma];
      expect(c, `${id} sem ${idioma}`).toBeDefined();
      expect(c.titulo.length).toBeGreaterThan(0);
      expect(c.descricao.length).toBeGreaterThan(0);
    }
  });

  it.each(RAMOS.flatMap((id) => IDIOMAS.map((idioma) => [id, idioma] as const)))(
    "%s em %s: o que preenche passa pelo MESMO contrato da API (limites incluídos)",
    (id, idioma) => {
      const campos = aplicarModelo(id, idioma);
      const r = versionCreateSchema.safeParse({
        system_prompt: campos.system_prompt,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        credential_id: "6b0b7a52-0d0f-4c9a-9a39-2f1d3c5c8a11",
        channel_session_id: "0f4f4f0e-3c53-4b64-a1d6-8d7c5f0f9a22",
        profile_persona: campos.profile_persona,
        profile_tone: campos.profile_tone,
        profile_objective: campos.profile_objective,
        profile_welcome: campos.profile_welcome,
        profile_language: campos.profile_language,
        restrict_topics: campos.restrict_topics,
        allowed_topics: campos.allowed_topics,
        off_topic_reply: campos.off_topic_reply,
      });
      expect(r.success, JSON.stringify(r.success ? "" : r.error.issues)).toBe(true);
      // E nenhum campo nasce no teto "por acidente" do contrato:
      expect(campos.profile_persona.length).toBeLessThanOrEqual(LIMITES_DO_PERFIL.persona);
      expect(campos.allowed_topics.length).toBeLessThanOrEqual(LIMITES_DOS_TEMAS.assuntos);
    },
  );

  it.each(RAMOS)("%s: o perfil vem preenchido, no idioma pedido, e dá pra criar sem escrever prompt", (id) => {
    for (const idioma of IDIOMAS) {
      const c = aplicarModelo(id, idioma);
      expect(c.profile_language).toBe(idioma);
      expect(c.profile_persona.trim()).not.toBe("");
      expect(c.profile_objective.trim()).not.toBe("");
      expect(c.profile_welcome.trim()).not.toBe("");
      expect(["formal", "normal", "descontraido"]).toContain(c.profile_tone);
      // As instruções já vêm escritas: o leigo não precisa abrir o modo avançado.
      expect(c.system_prompt.trim().length).toBeGreaterThanOrEqual(10);
      expect(c.name.trim()).not.toBe("");
    }
  });

  it("os idiomas têm textos DIFERENTES (tradução de verdade, não cópia)", () => {
    for (const id of RAMOS) {
      const textos = IDIOMAS.map((i) => aplicarModelo(id, i).profile_welcome);
      expect(new Set(textos).size, `${id}: boas-vindas iguais entre idiomas`).toBe(IDIOMAS.length);
    }
  });

  it("o modelo NÃO liga a restrição sozinho (o dono liga), mas já sugere os assuntos", () => {
    for (const id of RAMOS) {
      const c = aplicarModelo(id, "pt-BR");
      expect(c.restrict_topics).toBe(false);
      expect(c.allowed_topics.length).toBeGreaterThan(0);
      expect(c.off_topic_reply.trim()).not.toBe("");
    }
  });

  it("restrição desligada: o modelo compõe só perfil + instruções, sem seção de assuntos", () => {
    const c = aplicarModelo("vendas", "pt-BR");
    const composto = comporInstrucoes(c.system_prompt, {
      persona: c.profile_persona,
      tom: c.profile_tone,
      objetivo: c.profile_objective,
      boasVindas: c.profile_welcome,
      idioma: c.profile_language,
      restringirTemas: c.restrict_topics,
      temasPermitidos: c.allowed_topics,
      respostaForaDoTema: c.off_topic_reply,
    });
    expect(composto).toContain("## Perfil do agente");
    expect(composto).not.toContain("## Assuntos permitidos");
  });

  it("id desconhecido não inventa modelo", () => {
    expect(modeloPorId("astrologia")).toBeUndefined();
  });
});
