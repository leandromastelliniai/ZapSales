/**
 * Grava a preferência de menu EXPANDIDO antes do login.
 *
 * Desde 14/10/2026 o padrão do app é o menu EXPANDIDO (ícone + nome): `app/app/layout.tsx` só recolhe
 * quando o cookie `sidebar_collapsed` vale "1". Esta função continua valendo — "0" = expandido é o
 * mesmo valor que `toggleSidebar` grava quando a pessoa clica em "Expandir sidebar" —, e as specs que
 * já a chamam seguem corretas: elas passam a pedir explicitamente o que agora é o padrão, o que as
 * protege de uma nova mudança de padrão.
 *
 * Quem mede o TRILHO recolhido usa `menuRecolhido` (abaixo).
 */
import type { BrowserContext } from "@playwright/test";

export async function menuExpandido(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  await context.addCookies([
    { name: "sidebar_collapsed", value: "0", url: baseURL ?? "http://localhost:3000" },
  ]);
}

/** Grava a preferência "menu RECOLHIDO" (trilho de 64px, só ícones) antes do login. */
export async function menuRecolhido(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  await context.addCookies([
    { name: "sidebar_collapsed", value: "1", url: baseURL ?? "http://localhost:3000" },
  ]);
}
