import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TEMA_PADRAO } from "@/lib/theme";

/**
 * O TEMA DE QUEM NUNCA ESCOLHEU É O CLARO (decisão do dono, 23/10/2026).
 *
 * A regra mora em DOIS lugares, e precisa ser a mesma nos dois: `TEMA_PADRAO`
 * (`lib/theme.tsx`, o que o React usa) e o `THEME_INIT_SCRIPT` (`app/layout.tsx`,
 * uma string que roda no `<head>` antes do primeiro pixel). Se divergirem, a
 * página pinta um tema e troca para o outro na hidratação — o "pisca" que o
 * script existe para evitar. E o `<html>` do servidor já sai `data-theme="light"`:
 * com o padrão claro, quem nunca escolheu não vê troca nenhuma.
 */
const layout = readFileSync(join(__dirname, "..", "..", "app", "layout.tsx"), "utf-8");
const script = layout.match(/const THEME_INIT_SCRIPT = `([^`]+)`/)?.[1] ?? "";

describe("tema padrão", () => {
  it("é o claro", () => {
    expect(TEMA_PADRAO).toBe("light");
  });

  it("o script do <head> cai no mesmo tema quando não há escolha salva", () => {
    expect(script, "THEME_INIT_SCRIPT não encontrado em app/layout.tsx").not.toBe("");
    // Sem escolha salva (nem dark, nem light, nem system) → o último ramo do ternário.
    expect(script).toContain(`(s==='system'?(d?'dark':'light'):'${TEMA_PADRAO}')`);
    // localStorage indisponível (modo privado, sandbox) → o mesmo padrão.
    expect(script).toContain(`catch(e){document.documentElement.setAttribute('data-theme','${TEMA_PADRAO}');}`);
  });

  it("o HTML do servidor já sai no tema padrão (sem troca na hidratação)", () => {
    expect(layout).toMatch(new RegExp(`data-theme="${TEMA_PADRAO}"`));
  });

  it("quem escolheu escuro continua no escuro", () => {
    expect(script).toContain("(s==='dark'||s==='light')?s:");
  });
});
