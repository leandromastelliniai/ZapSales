/**
 * O dicionário de tradução (~2 MB) não pode voltar para o pacote do navegador.
 *
 * Medido na produção em 15/10/2026: um único arquivo de 570 KB comprimidos, baixado por TODA tela, era
 * quase todo texto de tradução (espanhol + inglês) — e quem usa português não precisa de nada dele. A
 * correção tem duas metades, e este arquivo cobra as duas, porque cada uma sozinha deixa o peso voltar sem
 * que nenhum outro teste note:
 *
 *   1. `next.config.ts` troca `@/lib/i18n/dicionario` por `dicionario.cliente.ts` na compilação do
 *      NAVEGADOR (`turbopack.resolveAlias`, condição `browser`). Sem esta linha, as dezenas de arquivos de
 *      cliente que importam `traduzir` arrastam o dicionário inteiro de novo.
 *   2. O provedor de idioma e o módulo de navegador NUNCA importam `dicionario.ts` — nem direta nem
 *      indiretamente por `catalogos.ts` (só o `catalogos/es.ts`, carregado de forma dinâmica, pode).
 *
 * O que NÃO está coberto aqui, e só o build mostra: um módulo novo que importe o dicionário por caminho
 * relativo (o alias casa o texto do import, não o arquivo resolvido). Conferir com
 * `pnpm build` e procurar uma frase do dicionário nos pedaços de `.next/static/chunks` baixados por uma
 * página em português.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const ler = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf-8");

describe("o dicionário fica fora do pacote do navegador", () => {
  it("o alias do navegador está no next.config.ts e aponta para um arquivo que existe", () => {
    const config = ler("next.config.ts");
    const m = config.match(/"@\/lib\/i18n\/dicionario":\s*\{\s*browser:\s*"\.\/([^"]+)"\s*\}/);
    expect(m, "falta o alias turbopack.resolveAlias do dicionário na condição browser").not.toBeNull();
    expect(() => ler(m![1]!)).not.toThrow();
    expect(m![1]).toBe("lib/i18n/dicionario.cliente.ts");
  });

  it.each([
    "lib/i18n/IdiomaProvider.tsx",
    "lib/i18n/catalogos.ts",
    "lib/i18n/dicionario.cliente.ts",
  ])("%s não importa o dicionário", (arquivo) => {
    const fonte = ler(arquivo);
    const importaDicionario = /from\s+["'](?:@\/lib\/i18n\/dicionario|\.{1,2}\/dicionario)["']/.test(fonte);
    expect(importaDicionario, `${arquivo} importa dicionario.ts`).toBe(false);
  });

  it("só o catálogo em espanhol, carregado de forma dinâmica, importa o dicionário", () => {
    const catalogos = ler("lib/i18n/catalogos.ts");
    expect(catalogos).toContain('import("./catalogos/es")');
    expect(catalogos).toContain('import("./catalogos/en")');
    expect(ler("lib/i18n/catalogos/es.ts")).toMatch(/from\s+["']\.\.\/dicionario["']/);
  });

  it("o inglês também fica fora do pedaço em espanhol: só o servidor lê o JSON pelo módulo trocado no navegador", () => {
    const config = ler("next.config.ts");
    const m = config.match(/"@\/lib\/i18n\/traducoes\/en\.servidor":\s*\{\s*browser:\s*"\.\/([^"]+)"\s*\}/);
    expect(m, "falta o alias do inglês do servidor na condição browser").not.toBeNull();
    expect(() => ler(m![1]!)).not.toThrow();
    expect(m![1]).toBe("lib/i18n/traducoes/en.vazio.ts");
    // `dicionario.ts` importa o inglês PELO módulo trocável, nunca pelo JSON direto — senão o alias não vale.
    const dicionario = ler("lib/i18n/dicionario.ts");
    expect(dicionario).toContain('from "@/lib/i18n/traducoes/en.servidor"');
    expect(dicionario).not.toMatch(/from\s+["'][^"']*en\.json["']/);
    // O inglês do navegador segue vindo do JSON direto, pelo seu próprio pedaço.
    expect(ler("lib/i18n/catalogos/en.ts")).toMatch(/from\s+["']\.\.\/traducoes\/en\.json["']/);
  });

  it("a versão de navegador exporta o que os importadores usam, com a mesma assinatura", () => {
    const cliente = ler("lib/i18n/dicionario.cliente.ts");
    expect(cliente).toMatch(/export function traduzir\(texto: string, idioma: Idioma\): string/);
    expect(cliente).toMatch(/export function temTraducao\(texto: string, idioma: Idioma\): boolean/);
  });
});
