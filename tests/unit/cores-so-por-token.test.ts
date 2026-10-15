/**
 * Cor de tela sai de TOKEN, não da paleta crua do Tailwind.
 *
 * `bg-amber-50 dark:bg-amber-950/20` era escrito à mão em 69 arquivos (403 usos, medido em 14/10/2026), cada um
 * com a sua variante `dark:`. É o tipo de dívida que faz uma tela parecer "de outro produto" ao lado da Inbox e
 * que escapa do tema do revendedor: o token `warning`/`success`/`error`/`info` troca sozinho entre claro e escuro
 * (e acompanha a marca), a paleta crua não.
 *
 * A lista de exceções começa VAZIA e só pode encolher. `app/design` e as vitrines ficam de fora: lá a paleta crua
 * é o assunto.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const UTIL = "(?:bg|text|border|ring|from|to|fill|stroke|divide|outline|placeholder|accent|caret|decoration|shadow)";
const FAMILIAS = "(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)";
const CRUA = new RegExp(`(?<![\w-])(?:[a-z-]+:)*${UTIL}-${FAMILIAS}-\d{2,3}(?:/\d{1,3})?(?![\w-])`, "g");

const FORA = ["app/design", "app/vitrine-agenda", "app/vitrine-inbox", "app/vitrine-sistema"];

function arquivos(dir: string): string[] {
  const achados: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, e.name);
    const rel = relative(RAIZ, caminho).split(sep).join("/");
    if (e.isDirectory()) {
      if (e.name === "node_modules" || FORA.includes(rel)) continue;
      achados.push(...arquivos(caminho));
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}

describe("cores de tela", () => {
  const todos = [...arquivos(join(RAIZ, "app")), ...arquivos(join(RAIZ, "components"))];

  it("guarda de vacuidade: a varredura enxerga as telas", () => {
    expect(todos.length).toBeGreaterThan(300);
  });

  it("nenhum arquivo usa cor crua da paleta do Tailwind", () => {
    const sujos: string[] = [];
    for (const f of todos) {
      const achados = readFileSync(f, "utf-8").match(CRUA);
      if (achados) sujos.push(`${relative(RAIZ, f).split(sep).join("/")}: ${[...new Set(achados)].slice(0, 3).join(", ")}`);
    }
    expect(sujos, "troque por token: warning/success/error/info, text-muted-foreground, bg-surface-elevated…").toEqual([]);
  });
});
