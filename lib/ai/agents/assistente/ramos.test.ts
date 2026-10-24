import { describe, expect, it } from "vitest";

import { IDIOMAS_DO_AGENTE } from "../perfil";
import { IDS_DE_MODELO } from "../modelos";
import {
  AVISO_DE_RAMO_REGULADO,
  GRUPOS_DE_RAMO,
  RAMOS,
  RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE,
  buscarRamos,
  motivoDoModelo,
  ramoPorId,
} from "./ramos";

describe("catálogo de ramos do assistente", () => {
  it("tem ids únicos em kebab-case e todos num grupo que existe", () => {
    const ids = RAMOS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const grupos = new Set(GRUPOS_DE_RAMO.map((g) => g.id));
    for (const r of RAMOS) {
      expect(r.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(grupos.has(r.grupo), `${r.id}: grupo ${r.grupo}`).toBe(true);
    }
    expect(RAMOS.length).toBeGreaterThanOrEqual(35);
  });

  it("todo grupo tem ao menos um ramo e nome nos três idiomas", () => {
    for (const g of GRUPOS_DE_RAMO) {
      expect(RAMOS.some((r) => r.grupo === g.id), g.id).toBe(true);
      for (const idioma of IDIOMAS_DO_AGENTE) expect(g.nome[idioma].trim(), `${g.id}/${idioma}`).not.toBe("");
    }
  });

  it("todo ramo tem nome nos três idiomas e um modelo recomendado que existe", () => {
    for (const r of RAMOS) {
      for (const idioma of IDIOMAS_DO_AGENTE) expect(r.nome[idioma].trim(), `${r.id}/${idioma}`).not.toBe("");
      expect(IDS_DE_MODELO as readonly string[]).toContain(r.modeloRecomendado);
    }
  });

  it("saúde, advocacia, contabilidade, crédito, seguros, farmácia e veterinária são regulados", () => {
    for (const id of [
      "clinica-medica",
      "clinica-odontologica",
      "estetica",
      "psicologia",
      "fisioterapia",
      "nutricao",
      "veterinaria",
      "farmacia",
      "advocacia",
      "contabilidade",
      "consorcio",
      "credito",
      "seguros",
    ]) {
      expect(ramoPorId(id)?.regulado, id).toBe(true);
    }
    expect(ramoPorId("ecommerce")?.regulado).toBe(false);
    for (const idioma of IDIOMAS_DO_AGENTE) expect(AVISO_DE_RAMO_REGULADO[idioma].trim()).not.toBe("");
  });

  it("só os ramos do primeiro corte carregam texto próprio, e o texto está nos três idiomas", () => {
    const comTexto = RAMOS.filter((r) => r.texto).map((r) => r.id);
    expect([...comTexto].sort()).toEqual([...RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE].sort());
    for (const id of RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE) {
      const r = ramoPorId(id)!;
      for (const idioma of IDIOMAS_DO_AGENTE) {
        const t = r.texto![idioma];
        expect(t.pessoa.trim(), `${id}/${idioma}`).not.toBe("");
        expect(t.compromisso.trim()).not.toBe("");
        expect(t.abertura.trim()).not.toBe("");
        expect(t.aberturaComNegocio).toContain("{negocio}");
        expect(t.abertura).not.toContain("{negocio}");
        expect(t.nuncaPrometer.length).toBeGreaterThanOrEqual(1);
        expect(t.chamarPessoaQuando.trim()).not.toBe("");
        expect(t.perguntasDeTeste.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("o texto de cada idioma é diferente (tradução de verdade, não cópia)", () => {
    for (const id of RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE) {
      const t = ramoPorId(id)!.texto!;
      expect(new Set(IDIOMAS_DO_AGENTE.map((i) => t[i].abertura)).size, id).toBe(IDIOMAS_DO_AGENTE.length);
    }
  });

  it("o texto não inventa fato do negócio: sem preço, telefone, endereço nem horário", () => {
    for (const id of RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE) {
      const t = ramoPorId(id)!.texto!;
      for (const idioma of IDIOMAS_DO_AGENTE) {
        const tudo = [
          t[idioma].abertura,
          t[idioma].aberturaComNegocio,
          t[idioma].chamarPessoaQuando,
          ...t[idioma].perguntasDeTeste,
        ].join(" ");
        expect(tudo, `${id}/${idioma}`).not.toMatch(/R\$|\$\s?\d|\d{2}[ -]?\d{4,5}-?\d{4}|\b\d{1,2}h\b/);
      }
    }
  });

  it("ramo regulado com texto nomeia o que nunca prometer", () => {
    for (const id of ["clinica-medica", "clinica-odontologica", "estetica", "psicologia", "advocacia", "contabilidade"]) {
      const t = ramoPorId(id)!.texto!["pt-BR"];
      expect(t.nuncaPrometer.join(" ").toLowerCase(), id).toMatch(/resultado|diagnóstico|prazo|valor/);
    }
  });

  it("o motivo da recomendação existe para todo ramo, com ou sem texto próprio", () => {
    for (const r of RAMOS) for (const idioma of IDIOMAS_DO_AGENTE) expect(motivoDoModelo(r, idioma).trim(), r.id).not.toBe("");
  });
});

describe("busca de ramos", () => {
  it("acha por pedaço do nome, sem ligar para acento nem caixa", () => {
    expect(buscarRamos("odonto", "pt-BR").map((r) => r.id)).toContain("clinica-odontologica");
    expect(buscarRamos("CLINICA", "pt-BR").map((r) => r.id)).toEqual(
      expect.arrayContaining(["clinica-medica", "clinica-odontologica"]),
    );
    expect(buscarRamos("abogacia", "es").map((r) => r.id)).toContain("advocacia");
    expect(buscarRamos("law", "en").map((r) => r.id)).toContain("advocacia");
  });

  it("consulta vazia devolve tudo, e consulta sem resultado devolve nada", () => {
    expect(buscarRamos("", "pt-BR")).toHaveLength(RAMOS.length);
    expect(buscarRamos("   ", "pt-BR")).toHaveLength(RAMOS.length);
    expect(buscarRamos("zzzzzz", "en")).toEqual([]);
  });
});
