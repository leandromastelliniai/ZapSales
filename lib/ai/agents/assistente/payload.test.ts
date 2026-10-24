import { describe, expect, it } from "vitest";

import { capacidadesPorModelo } from "../capacidades-do-modelo";
import { IDS_DE_MODELO } from "../modelos";
import { IDIOMAS_DO_AGENTE } from "../perfil";
import { agentMcpCreateSchema } from "../validation";
import { comporAgente, respostasIniciais } from "./compor";
import { payloadDeCriacao } from "./payload";

const PADROES = {
  ok: true as const,
  provider: "anthropic" as const,
  model: "claude-modelo",
  credentialId: null,
};
const FUNIL = "6b0b7a52-0d0f-4c9a-9a39-2f1d3c5c8a11";
const CAPACIDADES = capacidadesPorModelo();

describe("payload de criação do assistente", () => {
  it.each(IDS_DE_MODELO.flatMap((m) => IDIOMAS_DO_AGENTE.map((i) => [m, i] as const)))(
    "%s em %s passa pelo MESMO contrato que o editor completo usa",
    (modeloId, idioma) => {
      const composto = comporAgente({ ...respostasIniciais(idioma), modeloId });
      const payload = payloadDeCriacao(composto, CAPACIDADES[modeloId], PADROES, {
        nome: "",
        funilPadraoId: FUNIL,
      });
      const r = agentMcpCreateSchema.safeParse(payload);
      expect(r.success, JSON.stringify(r.success ? "" : r.error.issues)).toBe(true);
      if (r.success) {
        expect(r.data.version.tool_ids).toEqual(CAPACIDADES[modeloId].tool_ids);
        expect(r.data.version.restrict_topics).toBe(false);
        expect(r.data.version.channel_session_id).toBeNull();
      }
    },
  );

  it("o funil padrão entra no escopo só de quem mexe no funil, e só se existir", () => {
    for (const modeloId of IDS_DE_MODELO) {
      const composto = comporAgente({ ...respostasIniciais("pt-BR"), modeloId });
      const comFunil = payloadDeCriacao(composto, CAPACIDADES[modeloId], PADROES, {
        nome: "",
        funilPadraoId: FUNIL,
      });
      const semFunil = payloadDeCriacao(composto, CAPACIDADES[modeloId], PADROES, {
        nome: "",
        funilPadraoId: null,
      });
      expect(comFunil.version.pipeline_ids).toEqual(CAPACIDADES[modeloId].usa_funil ? [FUNIL] : []);
      expect(semFunil.version.pipeline_ids).toEqual([]);
    }
  });

  it("Suporte e Atendimento nunca recebem funil", () => {
    for (const modeloId of ["suporte", "atendimento"] as const) {
      const composto = comporAgente({ ...respostasIniciais("pt-BR"), modeloId });
      expect(
        payloadDeCriacao(composto, CAPACIDADES[modeloId], PADROES, {
          nome: "",
          funilPadraoId: FUNIL,
        }).version.pipeline_ids,
      ).toEqual([]);
    }
  });

  it("o nome digitado vence; sem nome, vale o do modelo", () => {
    const composto = comporAgente({ ...respostasIniciais("pt-BR"), modeloId: "vendas" });
    const opcoes = (nome: string) => ({ nome, funilPadraoId: null });
    expect(payloadDeCriacao(composto, CAPACIDADES.vendas, PADROES, opcoes("  Marina  ")).name).toBe(
      "Marina",
    );
    expect(payloadDeCriacao(composto, CAPACIDADES.vendas, PADROES, opcoes("")).name).toBe(
      composto.name,
    );
  });
});
