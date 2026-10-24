import { describe, expect, it } from "vitest";

import { capacidadesDoModelo, modeloMexeNoFunil } from "../capacidades-do-modelo";
import { IDS_DE_MODELO, aplicarModelo, instrucoesComNegocio } from "../modelos";
import { IDIOMAS_DO_AGENTE, LIMITES_DO_PERFIL } from "../perfil";
import { versionCreateSchema } from "../validation";
import {
  acrescentarAvisoDeIa,
  comporAgente,
  respostasIniciais,
  sugestaoDe,
  type RespostasDoAssistente,
} from "./compor";
import { RAMOS, RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE, ramoPorId } from "./ramos";

function base(sobre: Partial<RespostasDoAssistente> = {}): RespostasDoAssistente {
  return { ...respostasIniciais("pt-BR"), ...sobre };
}

describe("composição do agente do assistente", () => {
  it.each(IDS_DE_MODELO.flatMap((m) => IDIOMAS_DO_AGENTE.map((i) => [m, i] as const)))(
    "sem ramo, %s em %s compõe exatamente o modelo da galeria mais as capacidades do modelo",
    (modeloId, idioma) => {
      const modelo = aplicarModelo(modeloId, idioma);
      const composto = comporAgente(base({ idioma, modeloId, ramoId: null, tom: modelo.profile_tone }));
      expect(composto).toEqual({
        ...modelo,
        tool_ids: capacidadesDoModelo(modeloId),
        usa_funil: modeloMexeNoFunil(modeloId),
      });
    },
  );

  it("ramo da lista sem texto próprio compõe como ramo nenhum", () => {
    const semTexto = RAMOS.find((r) => !r.texto)!;
    const a = comporAgente(base({ ramoId: semTexto.id, modeloId: semTexto.modeloRecomendado }));
    const b = comporAgente(base({ ramoId: null, modeloId: semTexto.modeloRecomendado }));
    expect(a).toEqual(b);
  });

  it("ramo com texto acrescenta o bloco 'Neste negócio' e usa a abertura do ramo", () => {
    const composto = comporAgente(base({ ramoId: "clinica-odontologica", modeloId: "agendamento" }));
    const texto = ramoPorId("clinica-odontologica")!.texto!["pt-BR"];
    expect(composto.system_prompt).toContain("Neste negócio");
    expect(composto.system_prompt).toContain(texto.pessoa);
    expect(composto.system_prompt).toContain(texto.nuncaPrometer[0]);
    expect(composto.system_prompt).toContain(texto.chamarPessoaQuando);
    expect(composto.profile_welcome).toBe(texto.abertura);
  });

  it("o nome do negócio entra na abertura do ramo e nas instruções", () => {
    const composto = comporAgente(
      base({ ramoId: "clinica-odontologica", modeloId: "agendamento", negocio: "Clínica Sorriso" }),
    );
    expect(composto.profile_welcome).toContain("Clínica Sorriso");
    expect(composto.profile_welcome).not.toContain("{negocio}");
    expect(composto.system_prompt).toContain(
      instrucoesComNegocio("", "pt-BR", "Clínica Sorriso").trim(),
    );
  });

  it("sem ramo com texto, o nome do negócio entra só nas instruções, como no onboarding", () => {
    const composto = comporAgente(base({ ramoId: null, modeloId: "vendas", negocio: "Loja Azul" }));
    expect(composto.system_prompt).toContain("Loja Azul");
    expect(composto.profile_welcome).toBe(aplicarModelo("vendas", "pt-BR").profile_welcome);
  });

  it("a sugestão editada pela pessoa vence, e sugestaoDe devolve o que 'Voltar à sugestão' restaura", () => {
    const r = base({ ramoId: "advocacia", modeloId: "atendimento", negocio: "Silva Advogados" });
    expect(comporAgente({ ...r, abertura: "Oi, tudo bem?" }).profile_welcome).toBe("Oi, tudo bem?");
    expect(comporAgente({ ...r, abertura: sugestaoDe(r, "abertura") }).profile_welcome).toBe(
      comporAgente(r).profile_welcome,
    );
    const nova = comporAgente({ ...r, chamarPessoaQuando: "o cliente estiver nervoso" });
    expect(nova.system_prompt).toContain("o cliente estiver nervoso");
    expect(nova.system_prompt).not.toContain(ramoPorId("advocacia")!.texto!["pt-BR"].chamarPessoaQuando);
    expect(comporAgente({ ...r, chamarPessoaQuando: sugestaoDe(r, "chamarPessoaQuando") }).system_prompt).toBe(
      comporAgente(r).system_prompt,
    );
  });

  it("os atalhos acrescentam uma frase no idioma certo", () => {
    for (const idioma of IDIOMAS_DO_AGENTE) {
      const frase = acrescentarAvisoDeIa("Hola.", idioma);
      expect(frase.startsWith("Hola.")).toBe(true);
      expect(frase.length).toBeGreaterThan("Hola.".length + 10);
    }
    expect(acrescentarAvisoDeIa("Olá.", "pt-BR")).not.toBe(acrescentarAvisoDeIa("Olá.", "en"));
    const comNome = comporAgente(base({ usarNomeDoCliente: true }));
    const semNome = comporAgente(base({ usarNomeDoCliente: false }));
    expect(comNome.system_prompt).not.toBe(semNome.system_prompt);
  });

  it("restrict_topics nasce sempre desligado", () => {
    for (const r of RAMOS) {
      expect(comporAgente(base({ ramoId: r.id, modeloId: r.modeloRecomendado })).restrict_topics).toBe(false);
    }
  });

  it("nome de negócio absurdo é cortado e o agente continua dentro dos limites do contrato", () => {
    const negocio = "N".repeat(500);
    for (const id of RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE) {
      const ramo = ramoPorId(id)!;
      for (const idioma of IDIOMAS_DO_AGENTE) {
        const c = comporAgente(
          base({ idioma, ramoId: id, modeloId: ramo.modeloRecomendado, negocio, tom: "formal" }),
        );
        expect(c.profile_welcome.length, `${id}/${idioma}`).toBeLessThanOrEqual(LIMITES_DO_PERFIL.boasVindas);
        expect(c.system_prompt.trim().length).toBeLessThanOrEqual(20000);
        const r = versionCreateSchema.safeParse({
          system_prompt: c.system_prompt,
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          credential_id: "6b0b7a52-0d0f-4c9a-9a39-2f1d3c5c8a11",
          channel_session_id: "0f4f4f0e-3c53-4b64-a1d6-8d7c5f0f9a22",
          profile_persona: c.profile_persona,
          profile_tone: c.profile_tone,
          profile_objective: c.profile_objective,
          profile_welcome: c.profile_welcome,
          profile_language: c.profile_language,
          restrict_topics: c.restrict_topics,
          allowed_topics: c.allowed_topics,
          off_topic_reply: c.off_topic_reply,
          tool_ids: c.tool_ids,
        });
        expect(r.success, JSON.stringify(r.success ? "" : r.error.issues)).toBe(true);
      }
    }
  });

  it("o tom escolhido substitui o tom do modelo", () => {
    expect(comporAgente(base({ modeloId: "vendas", tom: "formal" })).profile_tone).toBe("formal");
  });
});
