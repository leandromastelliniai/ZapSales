/**
 * O MAPA DE ERROS DA META — código numérico vira categoria, natureza e motivo legível.
 *
 * O que este arquivo cobra é o contrato que o motor de campanhas (Fase 3) e o
 * inbox leem: a CATEGORIA decide o que fazer (voltar para a fila, marcar opt-out,
 * pausar por pagamento), `temporario` decide se tenta de novo, e o MOTIVO é o que
 * o operador lê na tela — nunca "(#131049) This message was not delivered…" cru.
 *
 * Os casos são a tabela da issue #4: limite de taxa, limite de marketing por
 * usuário (131049), opt-out (131050), destinatário inválido, template inválido e
 * pagamento — mais as categorias de borda que o envio real devolve (credencial,
 * janela de 24h, indisponibilidade).
 */
import { describe, expect, it } from "vitest";

import {
  ErroDaMeta,
  classificarErroMeta,
  erroDaRespostaDaGraph,
  type CategoriaDeErroMeta,
} from "@/lib/channels/meta/erros";

describe("classificarErroMeta — cada código na categoria certa", () => {
  it.each<[number, CategoriaDeErroMeta, boolean]>([
    [130429, "limite_de_taxa", true],
    [131048, "limite_de_taxa", true],
    [131056, "limite_de_taxa", true],
    [80007, "limite_de_taxa", true],
    [4, "limite_de_taxa", true],
    [131049, "limite_de_marketing_por_usuario", true],
    [131050, "opt_out_de_marketing", false],
    [131026, "destinatario_invalido", false],
    [131030, "destinatario_invalido", false],
    [131021, "destinatario_invalido", false],
    [132000, "template_invalido", false],
    [132001, "template_invalido", false],
    [132012, "template_invalido", false],
    [132015, "template_invalido", false],
    [132016, "template_invalido", false],
    [131042, "pagamento", false],
    [190, "credencial", false],
    [10, "credencial", false],
    [200, "credencial", false],
    [131047, "fora_da_janela", false],
    [131000, "indisponivel", true],
    [131016, "indisponivel", true],
    [131057, "indisponivel", true],
    [100, "parametro_invalido", false],
    [131009, "parametro_invalido", false],
  ])("%i → %s (temporário: %s)", (code, categoria, temporario) => {
    const erro = classificarErroMeta({ code });
    expect(erro.categoria).toBe(categoria);
    expect(erro.temporario).toBe(temporario);
    expect(erro.codigo).toBe(code);
  });

  it("todo motivo é frase em português, sem o texto cru da Graph nem o número", () => {
    const codigos = [130429, 131049, 131050, 131026, 132001, 131042, 190, 131047, 131000, 100, 999999];
    for (const code of codigos) {
      const { motivo } = classificarErroMeta({ code, message: "(#999) Raw english text from Graph" });
      expect(motivo.length).toBeGreaterThan(15);
      expect(motivo).not.toContain("Raw english");
      expect(motivo).not.toMatch(/#\d/);
    }
  });

  it("131049 carrega a espera mínima de 24h — marketing não volta ao mesmo contato antes disso", () => {
    expect(classificarErroMeta({ code: 131049 }).esperaMinimaSegundos).toBe(24 * 60 * 60);
  });

  it("limite de taxa espera pouco, e definitivo não espera nada", () => {
    const taxa = classificarErroMeta({ code: 130429 }).esperaMinimaSegundos;
    expect(taxa).toBeGreaterThan(0);
    expect(taxa).toBeLessThan(60 * 60);
    expect(classificarErroMeta({ code: 131050 }).esperaMinimaSegundos).toBeNull();
  });

  it("código desconhecido: `is_transient` da Graph decide; sem ele, definitivo", () => {
    expect(classificarErroMeta({ code: 999999 })).toMatchObject({
      categoria: "desconhecido",
      temporario: false,
    });
    expect(classificarErroMeta({ code: 999999, is_transient: true })).toMatchObject({
      categoria: "desconhecido",
      temporario: true,
    });
  });

  it("sem código, HTTP 5xx é indisponibilidade temporária", () => {
    expect(classificarErroMeta({ httpStatus: 503 })).toMatchObject({
      categoria: "indisponivel",
      temporario: true,
      codigo: null,
    });
  });

  it("o `details` da Meta sobrevive como detalhe — é ele que diz QUAL parâmetro divergiu", () => {
    const erro = classificarErroMeta({
      code: 132000,
      error_data: { details: "body: number of localizable_params (1) does not match the expected (2)" },
    });
    expect(erro.detalhe).toContain("localizable_params");
  });
});

describe("erroDaRespostaDaGraph — lê o corpo de erro como a Graph devolve", () => {
  it("corpo de erro com HTTP 400", () => {
    const erro = erroDaRespostaDaGraph(
      {
        error: {
          message: "(#131050) Unable to deliver message",
          type: "OAuthException",
          code: 131050,
          error_subcode: 2494010,
          fbtrace_id: "Abc",
        },
      },
      400,
    );
    expect(erro).toMatchObject({ categoria: "opt_out_de_marketing", codigo: 131050, subcodigo: 2494010 });
  });

  it("`error` com HTTP 200 também é erro — comportamento real da Graph", () => {
    expect(erroDaRespostaDaGraph({ error: { code: 131026 } }, 200)?.categoria).toBe("destinatario_invalido");
  });

  it("sucesso devolve null", () => {
    expect(erroDaRespostaDaGraph({ messages: [{ id: "wamid.X" }] }, 200)).toBeNull();
  });

  it("HTTP de erro sem corpo vira erro classificado pelo status", () => {
    expect(erroDaRespostaDaGraph(null, 502)).toMatchObject({ categoria: "indisponivel", temporario: true });
  });
});

describe("ErroDaMeta — a exceção que atravessa o adapter", () => {
  it("mensagem mantém o prefixo `meta_<código>:` que o resto do sistema já reconhece", () => {
    const erro = new ErroDaMeta(classificarErroMeta({ code: 131049 }));
    expect(erro.message).toMatch(/^meta_131049: /);
    expect(erro.falhaDoCanal).toMatchObject({
      codigo: "131049",
      categoria: "limite_de_marketing_por_usuario",
      temporario: true,
    });
    expect(erro.falhaDoCanal.motivo).toBe(erro.erro.motivo);
  });
});
