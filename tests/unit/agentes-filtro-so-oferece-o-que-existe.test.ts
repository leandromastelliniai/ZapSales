import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O filtro de status da lista de agentes só oferece opção que a lista consegue devolver.
 *
 * `deriveAgentStatus` (o que decide o selo de cada agente) devolve `published`, `draft` ou `archived`:
 * agente parado aparece como "Rascunho", e `paused` ficou sem emissor (ver o comentário em
 * `AgentStatusBadge.tsx`). Havia uma opção "Pausado" no filtro que nenhum agente jamais satisfazia, e
 * quem a escolhia via a lista vazia. Este teste reprova uma opção nova que o selo não sabe produzir.
 */
const RAIZ = join(__dirname, "..", "..");
const DEVOLVIVEIS = new Set(["all", "published", "draft", "archived"]);

describe("filtro de status dos agentes", () => {
  it("toda opção do filtro é um status que o selo pode produzir", () => {
    const fonte = readFileSync(join(RAIZ, "app/app/ai/agents/_components/AgentsListFilters.tsx"), "utf-8");
    const valores = [...fonte.matchAll(/<SelectItem value="([^"]+)"/g)].map((m) => m[1]!);
    expect(valores.length, "guarda de vacuidade: o filtro tem opções").toBeGreaterThanOrEqual(3);
    const fora = valores.filter((v) => !DEVOLVIVEIS.has(v));
    expect(fora, `opções que nenhum agente satisfaz: ${fora.join(", ")}`).toEqual([]);
  });

  it("o selo continua sem produzir `paused` (se voltar a produzir, a opção pode voltar ao filtro)", () => {
    const fonte = readFileSync(join(RAIZ, "app/app/ai/agents/_components/AgentStatusBadge.tsx"), "utf-8");
    const corpo = fonte.slice(fonte.indexOf("export function deriveAgentStatus"), fonte.indexOf("const LABEL"));
    expect(corpo).not.toContain('"paused"');
  });
});
