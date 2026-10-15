import type { Locator, Page } from "@playwright/test";

import { expect } from "./test";

/**
 * A FICHA DO CONTATO, que deixou de ser coluna e virou gaveta.
 *
 * Desde a direção "Linha do Funil" (07/10/2026) o Inbox não tem mais a coluna da
 * direita (`hidden xl:block` com o `CRMSidePanel`). O mesmo `CRMSidePanel` mora
 * numa gaveta (`Sheet`) que se abre por dois botões, um por largura:
 *
 *  - "Ficha completa" — ícone dentro da faixa da jornada (`max-md:hidden`);
 *  - "Ficha" — botão da barra do celular (`md:hidden`).
 *
 * O `getByRole` só enxerga o que está renderizado e visível ao leitor de tela, e
 * os dois botões nunca coexistem na mesma largura — por isso uma regex só serve às
 * duas. O título da gaveta ("Ficha do contato"/"Ficha del contacto") é o nome do
 * diálogo, e a spec deve LER a ficha por dentro dele: com a gaveta aberta, o
 * Radix esconde o resto da página do leitor de tela e bloqueia o clique fora.
 *
 * Abrir duas vezes não faz nada: a função devolve a gaveta já aberta.
 */
export function gavetaDaFicha(page: Page): Locator {
  return page.getByRole("dialog", { name: /^Ficha d(o|el) cont/ });
}

export async function abrirFichaDaConversa(page: Page): Promise<Locator> {
  const gaveta = gavetaDaFicha(page);
  if (await gaveta.isVisible()) return gaveta;
  await page.getByRole("button", { name: /^Ficha( completa)?$/ }).click();
  await expect(gaveta).toBeVisible({ timeout: 15_000 });
  return gaveta;
}

/**
 * Fecha a gaveta antes de voltar a agir na conversa (cabeçalho, composer): com
 * ela aberta, o fundo não recebe clique e some da árvore de acessibilidade.
 */
export async function fecharFichaDaConversa(page: Page): Promise<void> {
  const gaveta = gavetaDaFicha(page);
  if (!(await gaveta.isVisible())) return;
  await page.keyboard.press("Escape");
  await expect(gaveta).toBeHidden({ timeout: 15_000 });
}
