import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O filtro de status da lista de agentes só oferece opção que a lista consegue devolver.
 *
 * `deriveAgentStatus` (o que decide o selo de cada agente) devolve `published`, `draft`, `paused` ou
 * `archived`. Houve um tempo em que `paused` ficou sem emissor e a opção "Pausado" do filtro devolvia
 * sempre a lista vazia; ela saiu, e voltou quando o selo passou a chamar de "Pausado" o agente publicado
 * que alguém pausou. Este teste reprova uma opção que o selo não sabe produzir — nos dois sentidos.
 */
const RAIZ = join(__dirname, "..", "..");
const DEVOLVIVEIS = new Set(["all", "published", "draft", "paused", "archived"]);

describe("filtro de status dos agentes", () => {
  it("toda opção do filtro é um status que o selo pode produzir", () => {
    const fonte = readFileSync(join(RAIZ, "app/app/ai/agents/_components/AgentsListFilters.tsx"), "utf-8");
    const valores = [...fonte.matchAll(/<SelectItem value="([^"]+)"/g)].map((m) => m[1]!);
    expect(valores.length, "guarda de vacuidade: o filtro tem opções").toBeGreaterThanOrEqual(3);
    const fora = valores.filter((v) => !DEVOLVIVEIS.has(v));
    expect(fora, `opções que nenhum agente satisfaz: ${fora.join(", ")}`).toEqual([]);
  });

  it("o filtro só oferece `paused` porque o selo o produz", () => {
    const fonte = readFileSync(join(RAIZ, "app/app/ai/agents/_components/AgentStatusBadge.tsx"), "utf-8");
    const corpo = fonte.slice(fonte.indexOf("export function deriveAgentStatus"), fonte.indexOf("const LABEL"));
    expect(corpo).toContain('"paused"');
  });
});
