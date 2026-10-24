import { describe, expect, it } from "vitest";

import { IDS_DE_MODELO } from "../modelos";
import { IDIOMAS_DO_AGENTE } from "../perfil";
import { agentMcpCreateSchema } from "../validation";
import { comporAgente, respostasIniciais } from "./compor";
import { payloadDeCriacao } from "./payload";

const PADROES = { ok: true as const, provider: "anthropic" as const, model: "claude-modelo", credentialId: null };
const FUNIL = "6b0b7a52-0d0f-4c9a-9a39-2f1d3c5c8a11";

describe("payload de criação do assistente", () => {
  it.each(IDS_DE_MODELO.flatMap((m) => IDIOMAS_DO_AGENTE.map((i) => [m, i] as const)))(
    "%s em %s passa pelo MESMO contrato que o editor completo usa",
    (modeloId, idioma) => {
      const composto = comporAgente({ ...respostasIniciais(idioma), modeloId });
      const payload = payloadDeCriacao(composto, PADROES, { nome: "", funilPadraoId: FUNIL });
      const r = agentMcpCreateSchema.safeParse(payload);
      expect(r.success, JSON.stringify(r.success ? "" : r.error.issues)).toBe(true);
      if (r.success) {
        expect(r.data.version.tool_ids).toEqual(composto.tool_ids);
        expect(r.data.version.restrict_topics).toBe(false);
        expect(r.data.version.channel_session_id).toBeNull();
      }
    },
  );

  it("o funil padrão entra no escopo só de quem mexe no funil, e só se existir", () => {
    for (const modeloId of IDS_DE_MODELO) {
      const composto = comporAgente({ ...respostasIniciais("pt-BR"), modeloId });
      const comFunil = payloadDeCriacao(composto, PADROES, { nome: "", funilPadraoId: FUNIL });
      const semFunil = payloadDeCriacao(composto, PADROES, { nome: "", funilPadraoId: null });
      expect(comFunil.version.pipeline_ids).toEqual(composto.usa_funil ? [FUNIL] : []);
      expect(semFunil.version.pipeline_ids).toEqual([]);
    }
  });

  it("Suporte e Atendimento nunca recebem funil", () => {
    for (const modeloId of ["suporte", "atendimento"] as const) {
      const composto = comporAgente({ ...respostasIniciais("pt-BR"), modeloId });
      expect(payloadDeCriacao(composto, PADROES, { nome: "", funilPadraoId: FUNIL }).version.pipeline_ids).toEqual([]);
    }
  });

  it("o nome digitado vence; sem nome, vale o do modelo", () => {
    const composto = comporAgente({ ...respostasIniciais("pt-BR"), modeloId: "vendas" });
    expect(payloadDeCriacao(composto, PADROES, { nome: "  Marina  ", funilPadraoId: null }).name).toBe("Marina");
    expect(payloadDeCriacao(composto, PADROES, { nome: "", funilPadraoId: null }).name).toBe(composto.name);
  });
});
