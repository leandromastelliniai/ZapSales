// @vitest-environment node
/**
 * O que a tela promete (modelo e formatos de telefone) tem de ser o que a
 * importação aceita — o teste passa os dois pelo mesmo parser da rota.
 */
import { describe, expect, it } from "vitest";

import { decodificarCsv, mapHeader, mapLinha, normalizaTelefone, parseCsv } from "@/lib/contacts/csv";
import { FORMATOS_DE_TELEFONE, PLANILHA_MODELO_CSV } from "./planilha-modelo";

describe("planilha modelo da campanha", () => {
  const bytes = new TextEncoder().encode(PLANILHA_MODELO_CSV);
  const decodificado = decodificarCsv(bytes);
  const linhas = "texto" in decodificado ? parseCsv(decodificado.texto) : [];

  it("é lida como texto, com o BOM do Excel removido do primeiro cabeçalho", () => {
    expect("texto" in decodificado).toBe(true);
    expect(linhas[0]?.[0]).toBe("nome");
  });

  it("o cabeçalho tem nome e telefone reconhecidos pela importação", () => {
    const { indices, motivo } = mapHeader(linhas[0]!);
    expect(motivo).toBeNull();
    expect(indices.name).toBeDefined();
    expect(indices.phone_number).toBeDefined();
    expect(Object.keys(indices).sort()).toEqual(["birthdate", "cpf", "email", "name", "phone_number", "tags"]);
  });

  it("toda linha de exemplo passa na importação, com telefone", () => {
    const { indices } = mapHeader(linhas[0]!);
    expect(linhas.length).toBeGreaterThan(1);
    for (const celulas of linhas.slice(1)) {
      const { contato, motivo } = mapLinha(celulas, indices);
      expect(motivo, celulas.join(";")).toBeNull();
      expect(contato.phone_number).toMatch(/^\+\d{10,15}$/);
    }
  });

  it("as etiquetas do exemplo viram duas etiquetas, e não uma", () => {
    const { indices } = mapHeader(linhas[0]!);
    const { contato } = mapLinha(linhas[1]!, indices);
    expect(contato.tags).toEqual(["cliente", "vip"]);
  });
});

describe("formatos de telefone ensinados na tela", () => {
  it.each(FORMATOS_DE_TELEFONE)("$exemplo vira $vira", ({ exemplo, vira }) => {
    expect(normalizaTelefone(exemplo)).toBe(vira);
  });
});
