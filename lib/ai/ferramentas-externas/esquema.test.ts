import { describe, expect, it } from "vitest";

import {
  criarFerramentaSchema,
  esquemaDeEntrada,
  nomeNoAgente,
  slugDaFerramenta,
  validarArgumentos,
} from "./esquema";
import type { ParametroDaFerramenta } from "./tipos";

const PARAMETROS: ParametroDaFerramenta[] = [
  { nome: "produto", tipo: "texto", descricao: "Nome ou código do produto", obrigatorio: true },
  { nome: "quantidade", tipo: "inteiro", descricao: "Quantas unidades o cliente quer", obrigatorio: false },
];

describe("slugDaFerramenta", () => {
  it("tira acento, caixa e pontuação e termina em identificador seguro", () => {
    expect(slugDaFerramenta("Consultar Estoque (Loja 1)!", new Set())).toBe("consultar_estoque_loja_1");
  });

  it("nunca começa por número e nunca fica vazio", () => {
    expect(slugDaFerramenta("123 preços", new Set())).toBe("f_123_precos");
    expect(slugDaFerramenta("!!!", new Set())).toBe("ferramenta");
  });

  it("não repete um slug que a organização já usa", () => {
    const usados = new Set(["consultar_estoque", "consultar_estoque_2"]);
    expect(slugDaFerramenta("Consultar estoque", usados)).toBe("consultar_estoque_3");
  });

  it("corta nomes longos sem estourar o nome que o modelo recebe", () => {
    const slug = slugDaFerramenta("a".repeat(200), new Set());
    expect(nomeNoAgente(slug).length).toBeLessThanOrEqual(40);
  });
});

describe("criarFerramentaSchema", () => {
  const base = {
    nome: "Consultar estoque",
    quando_usar: "Quando o cliente perguntar se um produto está disponível.",
    url: "https://erp.exemplo.com.br/hooks/estoque",
    parametros: PARAMETROS,
  };

  it("aceita o cadastro completo e assume 'só consulta'", () => {
    const r = criarFerramentaSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.efeito).toBe("consulta");
  });

  it("recusa 'altera dados' com o motivo escrito, não com erro genérico", () => {
    const r = criarFerramentaSchema.safeParse({ ...base, efeito: "altera" });
    expect(r.success).toBe(false);
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain("etapa de aprovação");
  });

  it("recusa endereço sem protocolo, com outro protocolo ou com usuário e senha embutidos", () => {
    for (const url of ["erp.exemplo.com.br/x", "ftp://erp.exemplo.com.br/x", "https://u:p@erp.exemplo.com.br/x"]) {
      expect(criarFerramentaSchema.safeParse({ ...base, url }).success, url).toBe(false);
    }
  });

  it("recusa nomes de campo repetidos e fora do padrão", () => {
    const repetido = criarFerramentaSchema.safeParse({
      ...base,
      parametros: [PARAMETROS[0], { ...PARAMETROS[0], descricao: "outro" }],
    });
    expect(repetido.success).toBe(false);
    const feio = criarFerramentaSchema.safeParse({
      ...base,
      parametros: [{ ...PARAMETROS[0], nome: "Código do Produto" }],
    });
    expect(feio.success).toBe(false);
  });

  it("limita a quantidade de campos", () => {
    const muitos = Array.from({ length: 11 }, (_, i) => ({ ...PARAMETROS[0], nome: `campo_${i}` }));
    expect(criarFerramentaSchema.safeParse({ ...base, parametros: muitos }).success).toBe(false);
  });

  it("recusa chave desconhecida (o corpo não escolhe organização nem segredo)", () => {
    expect(criarFerramentaSchema.safeParse({ ...base, organization_id: "x" }).success).toBe(false);
    expect(criarFerramentaSchema.safeParse({ ...base, signing_secret: "x" }).success).toBe(false);
  });
});

describe("validarArgumentos — o agente só chama com dados válidos", () => {
  it("aceita o que cumpre o esquema declarado", () => {
    const r = validarArgumentos(PARAMETROS, { produto: "camiseta azul", quantidade: 2 });
    expect(r).toEqual({ ok: true, valor: { produto: "camiseta azul", quantidade: 2 } });
  });

  it("aceita omitir o campo opcional, mas não o obrigatório", () => {
    expect(validarArgumentos(PARAMETROS, { produto: "camiseta" }).ok).toBe(true);
    const sem = validarArgumentos(PARAMETROS, { quantidade: 2 });
    expect(sem.ok).toBe(false);
    if (!sem.ok) expect(sem.mensagem).toContain("produto");
  });

  it("recusa tipo errado, campo que não foi declarado e texto gigante", () => {
    expect(validarArgumentos(PARAMETROS, { produto: "x", quantidade: "dois" }).ok).toBe(false);
    expect(validarArgumentos(PARAMETROS, { produto: "x", quantidade: 1.5 }).ok).toBe(false);
    expect(validarArgumentos(PARAMETROS, { produto: "x", extra: "campo de fora" }).ok).toBe(false);
    expect(validarArgumentos(PARAMETROS, { produto: "x".repeat(501) }).ok).toBe(false);
  });

  it("devolve uma mensagem que ENSINA o modelo, sem vocabulário de biblioteca", () => {
    const r = validarArgumentos(PARAMETROS, { quantidade: "dois" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.mensagem).toMatch(/preencha/i);
      expect(r.mensagem).not.toMatch(/zod|invalid_type|expected/i);
    }
  });

  it("uma ferramenta sem campos aceita só o objeto vazio", () => {
    expect(validarArgumentos([], {}).ok).toBe(true);
    expect(validarArgumentos([], { a: 1 }).ok).toBe(false);
  });
});

describe("esquemaDeEntrada", () => {
  it("é o objeto que o modelo recebe: um campo por parâmetro declarado", () => {
    const esquema = esquemaDeEntrada(PARAMETROS);
    expect(Object.keys(esquema.shape).sort()).toEqual(["produto", "quantidade"]);
  });
});
