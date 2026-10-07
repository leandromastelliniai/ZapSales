/**
 * Grava a preferência "menu EXPANDIDO" antes do login.
 *
 * Desde 07/10/2026 (direção "Linha do Funil") o padrão do app é o TRILHO
 * recolhido: 64px, só ícones, o nome de cada destino no `title`, sem título de
 * grupo, logo trocado pela inicial e contadores reduzidos a um ponto. Quem nunca
 * mexeu no menu o vê assim (`app/app/layout.tsx` lê `sidebar_collapsed !== "0"`).
 *
 * As specs que medem o menu LARGO — texto dos itens, `<h2>` dos grupos, o `<img>`
 * do logo, o número do contador, a largura que sobra para o conteúdo — chamam
 * isto antes do primeiro `goto`. É o mesmo cookie que `toggleSidebar`
 * (`app/actions/shell/toggleSidebar.ts`) grava quando a pessoa clica em
 * "Expandir sidebar": "0" = expandido, "1" = recolhido.
 *
 * Quem mede o PADRÃO (o trilho) não chama: é o caso "o menu nasce recolhido" de
 * `navegacao.spec.ts`.
 */
import type { BrowserContext } from "@playwright/test";

export async function menuExpandido(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  await context.addCookies([
    { name: "sidebar_collapsed", value: "0", url: baseURL ?? "http://localhost:3000" },
  ]);
}
