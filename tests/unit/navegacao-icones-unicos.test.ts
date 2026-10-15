/**
 * Cada destino do menu tem o SEU ícone.
 *
 * Com o menu recolhido (ou na cabeça de quem bate o olho), o ícone é o único sinal que distingue uma
 * linha da outra. Medido em 14/10/2026 no catálogo: `FileText` em cinco destinos (Respostas rápidas,
 * Importações, Propostas ×2, Modelos de proposta), `ChartBar` em quatro (Financeiro, Faturamento,
 * Honorários, Desempenho), `ListChecks` em quatro, e a mesma seta nos três "Ver tudo em …".
 *
 * A única repetição aceita é entre destinos que têm o MESMO rótulo (hoje, o Meta Ads de Análise e o
 * de Configurações): ali o ícone repetido diz que é a mesma coisa vista de dois lugares.
 */
import { describe, expect, it } from "vitest";

import { NAV_CATALOG } from "@/lib/navigation/catalogo";

describe("ícones do menu", () => {
  it("nenhum ícone serve a dois destinos de rótulos diferentes", () => {
    const rotulosPorIcone = new Map<string, Set<string>>();
    for (const d of NAV_CATALOG) {
      const rotulos = rotulosPorIcone.get(d.icon) ?? new Set<string>();
      rotulos.add(d.label);
      rotulosPorIcone.set(d.icon, rotulos);
    }
    const repetidos = [...rotulosPorIcone.entries()]
      .filter(([, rotulos]) => rotulos.size > 1)
      .map(([icone, rotulos]) => `${icone}: ${[...rotulos].join(" / ")}`);
    expect(repetidos).toEqual([]);
  });

  it("todo ícone do catálogo existe no mapa do registro, e o hub de cada grupo não repete o de uma tela", async () => {
    // O registro importa o barril de ícones inteiro: o transform frio passa dos 5 s padrão.
    const { NAV_DESTINATIONS, ICONE_DO_HUB } = await import("@/lib/navigation/registry");
    const semIcone = NAV_DESTINATIONS.filter((d) => !d.icon).map((d) => d.href);
    expect(semIcone).toEqual([]);

    const iconesDasTelas = new Set(NAV_DESTINATIONS.map((d) => d.icon));
    const hubs = Object.entries(ICONE_DO_HUB);
    expect(hubs.length, "guarda de vacuidade: há hubs com ícone próprio").toBeGreaterThanOrEqual(3);
    const colidem = hubs.filter(([, icone]) => iconesDasTelas.has(icone!)).map(([grupo]) => grupo);
    expect(colidem).toEqual([]);

    const unicos = new Set(hubs.map(([, icone]) => icone));
    expect(unicos.size, "cada hub tem um ícone diferente do outro").toBe(hubs.length);
  }, 30_000);
});
