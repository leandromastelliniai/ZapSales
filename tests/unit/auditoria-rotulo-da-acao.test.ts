import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import {
  ACOES_COM_FRASE,
  RECURSOS_DA_AUDITORIA,
  VERBOS_DA_AUDITORIA,
  atorDaAuditoria,
  rotuloDaAcao,
  rotuloDoRecurso,
} from "@/lib/audit/rotulo-da-acao";
import { traduzir } from "@/lib/i18n/dicionario";

/**
 * A Auditoria conta o que aconteceu em frases, e guarda o código ao lado.
 *
 * O que se protege aqui:
 *   - o código vira frase quando há uma honesta, e vira `null` (a tela mostra o código) quando não há;
 *   - nenhuma frase fica sem es/en — a tela é lida em três idiomas;
 *   - uma frase escrita à mão para um código que saiu do vocabulário não sobrevive (o tipo já barra no
 *     typecheck; este caso barra em runtime, onde o tipo não alcança).
 */

const igual = (texto: string) => texto;

describe("rotuloDaAcao", () => {
  it("usa a frase escrita à mão quando existe", () => {
    expect(rotuloDaAcao("contact.merged", igual)).toBe("Uniu contatos duplicados");
    expect(rotuloDaAcao("conversation.claimed", igual)).toBe("Assumiu uma conversa");
  });

  it("compõe verbo + recurso quando não há frase inteira", () => {
    expect(rotuloDaAcao("contact.created", igual)).toBe("Criou contato");
    expect(rotuloDaAcao("pipeline.deleted", igual)).toBe("Apagou funil");
    expect(rotuloDaAcao("ai_agent.published", igual)).toBe("Publicou agente de IA");
  });

  it("devolve null quando não há frase honesta — nunca inventa", () => {
    expect(rotuloDaAcao("ai.jev.modo_alterado", igual)).toBeNull();
    expect(rotuloDaAcao("retention.sweep_run", igual)).toBeNull();
    expect(rotuloDaAcao("recurso_que_nao_existe.created", igual)).toBeNull();
    expect(rotuloDaAcao("contact.verbo_que_nao_existe", igual)).toBeNull();
    expect(rotuloDaAcao("", igual)).toBeNull();
  });

  it("traduz peça por peça na composição, e inteira na frase pronta", () => {
    const marca = (texto: string) => `«${texto}»`;
    expect(rotuloDaAcao("contact.created", marca)).toBe("«Criou» «contato»");
    expect(rotuloDaAcao("contact.merged", marca)).toBe("«Uniu contatos duplicados»");
  });

  it("toda frase pronta é de um código que existe no vocabulário", () => {
    const vocabulario = new Set<string>(AUDIT_ACTIONS);
    const fora = Object.keys(ACOES_COM_FRASE).filter((codigo) => !vocabulario.has(codigo));
    expect(fora, `códigos fora do vocabulário: ${fora.join(", ")}`).toEqual([]);
  });

  it("guarda de vacuidade: há frases, recursos e verbos", () => {
    expect(Object.keys(ACOES_COM_FRASE).length).toBeGreaterThan(20);
    expect(Object.keys(RECURSOS_DA_AUDITORIA).length).toBeGreaterThan(15);
    expect(Object.keys(VERBOS_DA_AUDITORIA).length).toBeGreaterThan(10);
  });
});

describe("tradução", () => {
  // Palavras que são iguais nos três idiomas: a tradução existe e é a própria palavra.
  const IGUAIS_EM_ES = new Set(["lead", "webhook", "agente de IA", "comanda", "canal", "empresa", "Sistema"]);
  const IGUAIS_EM_EN = new Set(["lead", "webhook", "template"]);

  const textos = [
    ...Object.values(ACOES_COM_FRASE),
    ...Object.values(RECURSOS_DA_AUDITORIA),
    ...Object.values(VERBOS_DA_AUDITORIA),
    "Suporte da plataforma",
    "Pessoa",
    "Chave de acesso",
    "Sistema",
  ].filter((t): t is string => typeof t === "string");

  it("toda peça tem espanhol", () => {
    const sem = [...new Set(textos)].filter((t) => !IGUAIS_EM_ES.has(t) && traduzir(t, "es") === t);
    expect(sem, `sem espanhol: ${sem.join(" | ")}`).toEqual([]);
  });

  it("toda peça tem inglês", () => {
    const sem = [...new Set(textos)].filter((t) => !IGUAIS_EM_EN.has(t) && traduzir(t, "en") === t);
    expect(sem, `sem inglês: ${sem.join(" | ")}`).toEqual([]);
  });
});

describe("rotuloDoRecurso e atorDaAuditoria", () => {
  it("nomeia o recurso conhecido e deixa o desconhecido para a tela", () => {
    expect(rotuloDoRecurso("contact", igual)).toBe("contato");
    expect(rotuloDoRecurso("coisa_nova", igual)).toBeNull();
    expect(rotuloDoRecurso(null, igual)).toBeNull();
  });

  const base = { acting_as_platform_admin: false, actor_user_id: null, actor_api_token_id: null };

  it("quem fez: suporte, pessoa com nome, pessoa sem nome, chave, sistema", () => {
    expect(atorDaAuditoria({ ...base, acting_as_platform_admin: true }, () => undefined, igual).nome).toBe(
      "Suporte da plataforma",
    );
    expect(atorDaAuditoria({ ...base, actor_user_id: "abcdef12-0000" }, () => "Ana", igual).nome).toBe("Ana");
    expect(atorDaAuditoria({ ...base, actor_user_id: "abcdef12-0000" }, () => undefined, igual).nome).toBe(
      "Pessoa abcdef12",
    );
    const chave = atorDaAuditoria({ ...base, actor_api_token_id: "99887766-1" }, () => undefined, igual);
    expect(chave).toEqual({ nome: "Chave de acesso", detalhe: "99887766" });
    expect(atorDaAuditoria(base, () => undefined, igual).nome).toBe("Sistema");
  });
});
