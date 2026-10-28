/**
 * As contas da faixa "Seus recursos opcionais" e os blocos da lista da empresa.
 *
 * A regra que importa: a conta NÃO chuta. Item que varia por número/etapa/agente, item cujo estado
 * mora na tela dele e item que a leitura não alcançou entram em "você confere" — nunca em "ligados"
 * nem em "desligados" —, e as quatro contagens somam o total.
 */
import { describe, expect, it } from "vitest";

import { RECURSOS_OPCIONAIS, type EstadoDoRecurso } from "@/lib/recursos-opcionais/catalogo";
import {
  ASSUNTO_DO_RECURSO,
  ASSUNTOS_DA_EMPRESA,
  contarAtencaoDeRecursos,
  repartirPorAssunto,
  resumoDosRecursos,
  type ItemParaResumir,
} from "@/lib/recursos-opcionais/resumo-dos-recursos";

const item = (estado: EstadoDoRecurso, dependeDoServidor = false, id = "x"): ItemParaResumir => ({
  id,
  estado,
  dependeDoServidor,
});

describe("resumoDosRecursos", () => {
  it("cada item cai em UMA categoria, e as quatro contagens somam o total", () => {
    const r = resumoDosRecursos([
      item("ligado"),
      item("ligado"),
      item("desligado"),
      item("varia"),
      item("nao_verificado"),
      item("nao_lido"),
      item("desligado", true),
    ]);
    expect(r.total).toBe(7);
    expect(r.ligados).toBe(2);
    expect(r.desligados).toBe(1);
    expect(r.conferir).toBe(3);
    expect(r.dependemDoServidor).toBe(1);
    expect(r.ligados + r.desligados + r.conferir + r.dependemDoServidor).toBe(r.total);
  });

  it("não chuta: 'varia' e 'veja na tela dele' NÃO viram desligado nem ligado", () => {
    const r = resumoDosRecursos([item("varia"), item("nao_verificado")]);
    expect(r.ligados).toBe(0);
    expect(r.desligados).toBe(0);
    expect(r.conferir).toBe(2);
  });

  it("leitura que falhou nunca vira 'desligado': conta em 'você confere' e pede atenção", () => {
    const r = resumoDosRecursos([item("nao_lido"), item("nao_lido"), item("ligado")]);
    expect(r.desligados).toBe(0);
    expect(r.conferir).toBe(2);
    expect(r.naoLidos).toBe(2);
    const leitura = r.conferencias.find((c) => c.id === "leitura");
    expect(leitura).toMatchObject({ estado: "atencao", motivo: "nao_lidos", quantidade: 2 });
    expect(contarAtencaoDeRecursos(r.conferencias)).toBe(1);
  });

  it("item que depende de módulo do servidor é 'info' (a empresa só pode pedir), nunca 'atencao'", () => {
    const r = resumoDosRecursos([item("desligado", true), item("desligado", true), item("ligado")]);
    expect(r.dependemDoServidor).toBe(2);
    expect(r.desligados).toBe(0);
    const servidor = r.conferencias.find((c) => c.id === "servidor");
    expect(servidor).toMatchObject({ estado: "info", motivo: "dependem_do_servidor", quantidade: 2 });
    expect(contarAtencaoDeRecursos(r.conferencias)).toBe(0);
  });

  it("tudo lido e nada dependendo do servidor: as conferências ficam 'ok'", () => {
    const r = resumoDosRecursos([item("ligado"), item("desligado")]);
    expect(r.conferencias.find((c) => c.id === "leitura")?.estado).toBe("ok");
    expect(r.conferencias.find((c) => c.id === "servidor")).toMatchObject({
      estado: "ok",
      motivo: "nada_depende_do_servidor",
    });
  });

  it("'você confere na tela' só conta o que vale por item — não a falha de leitura, que tem conferência própria", () => {
    const r = resumoDosRecursos([item("varia"), item("nao_lido")]);
    const conferir = r.conferencias.find((c) => c.id === "conferir");
    expect(conferir).toMatchObject({ motivo: "conferir_na_tela", quantidade: 1 });
  });

  it("lista vazia não quebra", () => {
    const r = resumoDosRecursos([]);
    expect(r).toMatchObject({ total: 0, ligados: 0, desligados: 0, conferir: 0, dependemDoServidor: 0 });
  });
});

describe("os blocos da lista da empresa", () => {
  const daEmpresa = RECURSOS_OPCIONAIS.filter((r) => r.nivel === "organizacao");

  it("todo recurso da empresa tem um bloco declarado (item novo não some numa lista sem título)", () => {
    const sem = daEmpresa.filter((r) => !(r.id in ASSUNTO_DO_RECURSO)).map((r) => r.id);
    expect(sem, `Recurso da empresa sem bloco em lib/recursos-opcionais/resumo-dos-recursos.ts:\n  ${sem.join("\n  ")}`).toEqual([]);
  });

  it("nenhum bloco aponta para recurso que não existe mais", () => {
    const ids = new Set(daEmpresa.map((r) => r.id));
    const mortos = Object.keys(ASSUNTO_DO_RECURSO).filter((id) => !ids.has(id));
    expect(mortos).toEqual([]);
  });

  it("todo bloco declarado tem ao menos um recurso (não há título sem nada embaixo)", () => {
    const usados = new Set(Object.values(ASSUNTO_DO_RECURSO));
    expect(ASSUNTOS_DA_EMPRESA.filter((a) => !usados.has(a.id)).map((a) => a.id)).toEqual([]);
  });

  it("repartir não perde nem duplica nenhum recurso, e respeita a ordem dos blocos", () => {
    const grupos = repartirPorAssunto(daEmpresa);
    const ids = grupos.flatMap((g) => g.recursos.map((r) => r.id));
    expect([...ids].sort()).toEqual(daEmpresa.map((r) => r.id).sort());
    expect(grupos.map((g) => g.id)).toEqual(ASSUNTOS_DA_EMPRESA.map((a) => a.id));
  });

  it("recurso sem bloco cai em 'Outros recursos' em vez de sumir da tela", () => {
    const grupos = repartirPorAssunto([{ id: "recurso_novo_sem_bloco" }, { id: "jev" }]);
    expect(grupos.find((g) => g.id === "outros")?.recursos).toEqual([{ id: "recurso_novo_sem_bloco" }]);
    expect(grupos.find((g) => g.id === "ia_e_conhecimento")?.recursos).toEqual([{ id: "jev" }]);
  });
});
