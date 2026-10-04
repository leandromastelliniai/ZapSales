import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

/**
 * O PRÉ-VOO DO CANAL OFICIAL.
 *
 * ─── O pré-voo da definição ────────────────────────────────────────────────
 *
 * O envio de modelo confere a definição antes de gastar: um parâmetro a mais
 * vira "falta o valor {{2}}" em vez de `400` cru da plataforma.
 *
 * ─── O que estes casos vigiam de verdade ───────────────────────────────────
 *
 * Que o pré-voo não DERRUBE o que já funciona: severo demais, ele barraria
 * envio bom numa instalação cujo espelho nunca sincronizou. O modo de falhar
 * importa mais que o caminho feliz.
 */

let linhaTemplate: Record<string, unknown> | null = null;
let erroSelect: { message: string } | null = null;

const admin = {
  from() {
    return {
      select() {
        const cadeia: Record<string, unknown> = {
          eq: () => cadeia,
          is: () => cadeia,
          maybeSingle: async () =>
            erroSelect ? { data: null, error: erroSelect } : { data: linhaTemplate, error: null },
        };
        return cadeia;
      },
    };
  },
} as never;

beforeEach(() => {
  erroSelect = null;
  linhaTemplate = null;
});

describe("o pré-voo da definição", () => {
  async function conferir(values: Record<string, string> = {}) {
    const { conferirDefinicao } = await import("@/lib/channels/conferir-definicao");
    return conferirDefinicao(admin, {
      organizationId: "org-1",
      channelSessionId: "sessao-1",
      name: "boas_vindas",
      language: "pt_BR",
      values,
    });
  }

  it("recusa definição que NÃO está aprovada, dizendo em que estado está", async () => {
    linhaTemplate = {
      name: "boas_vindas",
      language: "pt_BR",
      status: "REJECTED",
      contract_hash: "h1",
      components: [],
    };
    await expect(conferir()).rejects.toThrow(/template_not_approved.*REJECTED/s);
  });

  it("recusa quando falta valor, e diz QUAL falta", async () => {
    // "faltam 2" não serve: o operador precisa saber qual preencher, e essa é a
    // diferença entre a frase ajudar e não ajudar.
    linhaTemplate = {
      name: "boas_vindas",
      language: "pt_BR",
      status: "APPROVED",
      contract_hash: "h1",
      components: [{ type: "BODY", text: "Olá {{1}}, seu pedido {{2}} saiu." }],
    };
    await expect(conferir({})).rejects.toThrow(/template_missing_values/);
  });

  it("deixa passar quando os valores estão completos", async () => {
    linhaTemplate = {
      name: "boas_vindas",
      language: "pt_BR",
      status: "APPROVED",
      contract_hash: "h1",
      components: [{ type: "BODY", text: "Olá {{1}}." }],
    };
    // A chave do corpo NÃO tem prefixo — `slotKey` só prefixa header, botão e
    // card. Errar isto do lado de quem envia faz o pré-voo recusar um envio
    // completo, então o formato exato importa e está fixado aqui.
    await expect(conferir({ "1": "Marcela" })).resolves.toBeUndefined();
  });

  it("definição NÃO espelhada passa — o provedor é a autoridade, não o espelho", async () => {
    // Um espelho vazio (sync nunca rodou) barraria todo envio de modelo numa
    // instalação que está com tudo certo do lado da plataforma.
    linhaTemplate = null;
    await expect(conferir()).resolves.toBeUndefined();
  });

  it("falha de LEITURA não vira recusa de envio", async () => {
    // Barrar aqui trocaria um envio que ia dar certo por um erro nosso.
    erroSelect = { message: "banco fora" };
    await expect(conferir()).resolves.toBeUndefined();
  });

  it("exige nome e idioma", async () => {
    const { conferirDefinicao } = await import("@/lib/channels/conferir-definicao");
    await expect(
      conferirDefinicao(admin, {
        organizationId: "org-1",
        channelSessionId: null,
        name: "",
        language: "pt_BR",
        values: {},
      }),
    ).rejects.toThrow(/template_incompleto/);
  });
});

describe("o pré-voo roda antes do transporte", () => {
  const HANDLER = readFileSync("app/api/v1/messages/_handler.ts", "utf8");

  it("confere a definição ANTES de enviar o modelo", () => {
    const preVoo = HANDLER.indexOf("await conferirDefinicao(");
    const envio = HANDLER.indexOf("externalId = await sendTemplateForSession(");
    expect(preVoo).toBeGreaterThan(-1);
    expect(envio).toBeGreaterThan(-1);
    expect(preVoo, "o pré-voo ficou depois do envio").toBeLessThan(envio);
  });

  it("confere a definição DESTA conexão", () => {
    // Dois números têm modelos diferentes; conferir o do número errado aprovaria
    // um envio que a plataforma recusa.
    expect(HANDLER).toMatch(/channelSessionId: c\.channel_session_id/);
  });
});

describe("o resgate de presas não toca canal que não alcança", () => {
  const WATCHDOG = readFileSync("lib/agent-engine/edge/crm/session-reconciler.ts", "utf8");

  it("filtra para as sessões que este transporte resolve", () => {
    // Sem o filtro, a consulta trazia mensagem de QUALQUER canal e postava com
    // a sessão nula.
    expect(WATCHDOG).toMatch(/and s\.waha_session_name is not null/);
  });

  it("mas CONTA as que ficaram de fora — silêncio é o que fez isso durar", () => {
    expect(WATCHDOG).toMatch(/mensagens presas em canal que este resgate não alcança/);
  });

  it("e não as reenvia daqui", () => {
    // Enviar em dobro é pior que não enviar, e este processo não tem como saber
    // se o outro caminho já mandou.
    const envios = [...WATCHDOG.matchAll(/\/api\/sendText/g)];
    expect(envios.length, "apareceu um segundo caminho de envio no watchdog").toBe(1);
  });
});
