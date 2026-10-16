import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * O anonimizador (lista de nomes, perfis legais por país) é código de SERVIDOR.
 * A tela de "Corrigir esta resposta" só pode importar `evidencia-de-correcao`
 * (limite do texto e schema da evidência): importar `correcao-de-resposta` ou o
 * anonimizador leva a lista inteira para o bundle do navegador (issue #90).
 */
const TELAS = [
  "app/app/ai/agents/[id]/_components/CorrigirResposta.tsx",
  "app/app/ai/agents/[id]/_components/ProposalsPanel.tsx",
  "app/app/ai/agents/[id]/_components/TestPanel.tsx",
  "app/app/ai/agents/[id]/_components/RunDetailDrawer.tsx",
  "hooks/ai/useCorrecaoDeResposta.ts",
];

describe("a tela de correção não importa código de servidor", () => {
  it.each(TELAS)("%s", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    const importacoes = [...fonte.matchAll(/^import[^;]*?from\s+["']([^"']+)["']/gms)].map((m) => m[1]);
    expect(importacoes.filter((i) => /correcao-de-resposta$|\/anonymize|resposta-da-execucao/.test(i!))).toEqual([]);
  });
});
