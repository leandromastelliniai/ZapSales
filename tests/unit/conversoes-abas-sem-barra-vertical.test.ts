/**
 * A barra de abas de Conversões rola de lado no celular — e NÃO ganha barra de rolagem vertical.
 *
 * `overflow-x-auto` faz o navegador tratar o eixo vertical como `auto` também, e a aba ativa leva
 * `-mb-px` para sobrepor a borda da barra: esse 1 px a mais fazia aparecer uma barra de rolagem
 * vertical minúscula no canto (medido em produção em 27/10/2026: `scrollHeight` 38 contra
 * `clientHeight` 37). O par `overflow-y-hidden` + `pb-px` tira a barra sem cortar o sublinhado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(join(process.cwd(), "app/app/settings/conversoes/page.tsx"), "utf8");

function classesDaBarraDeAbas(): string {
  const i = fonte.indexOf('aria-label={t("Seções de conversões")}');
  expect(i, "a barra de abas sumiu da página").toBeGreaterThan(0);
  const inicio = fonte.lastIndexOf("<nav", i);
  const classe = /className="([^"]+)"/.exec(fonte.slice(inicio, i));
  expect(classe, "a barra de abas perdeu o className").not.toBeNull();
  return classe![1]!;
}

describe("barra de abas de Conversões", () => {
  it("rola de lado quando não cabe (celular)", () => {
    expect(classesDaBarraDeAbas()).toContain("overflow-x-auto");
  });

  it("e fecha o eixo vertical, para a aba ativa (-mb-px) não criar uma barra minúscula", () => {
    const classes = classesDaBarraDeAbas().split(/\s+/);
    expect(classes).toContain("overflow-y-hidden");
    expect(classes).toContain("pb-px");
  });

  it("as abas não quebram linha nem encolhem: rolam em vez de ficar cortadas", () => {
    const abas = fonte.slice(fonte.indexOf('aria-label={t("Seções de conversões")}'));
    expect(abas).toContain("shrink-0 whitespace-nowrap");
  });
});
