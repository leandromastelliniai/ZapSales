/**
 * Os ícones próprios e o selo cumprem o contrato que as telas assumem.
 *
 * Ícone próprio entra na mesma lista que o Phosphor (o menu passa `size`, `weight` e `aria-hidden` a
 * todos igual), então precisa responder às mesmas propriedades — senão o item ativo do menu, que
 * pede `weight="fill"`, ficaria igual ao inativo só nos ícones nossos. E a cor do selo é regra de
 * produto: cada significado tem a sua, e só `ia` é violeta.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ICONES_DO_PRODUTO } from "@/components/icons/produto";
import { Selo, type SignificadoDoSelo } from "@/components/ui/selo";

afterEach(cleanup);

const nomes = Object.keys(ICONES_DO_PRODUTO) as (keyof typeof ICONES_DO_PRODUTO)[];

describe("ícones próprios do produto", () => {
  it("guarda de vacuidade: há ícones próprios", () => {
    expect(nomes.length).toBeGreaterThanOrEqual(5);
  });

  it.each(nomes)("%s desenha um SVG de grade 256 que aceita tamanho e fica oculto quando pedido", (nome) => {
    const Icone = ICONES_DO_PRODUTO[nome];
    const { container } = render(<Icone size={20} aria-hidden />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 256 256");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("height")).toBe("20");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // Todo desenho tem forma: nenhum ícone entrega um SVG vazio.
    expect(svg.querySelectorAll("path, circle, rect").length).toBeGreaterThan(0);
  });

  it.each(nomes)("%s muda de traço com o peso e ganha a segunda tonalidade em duotone e fill", (nome) => {
    const Icone = ICONES_DO_PRODUTO[nome];
    const traco = (peso: "thin" | "regular" | "bold" | "duotone" | "fill") =>
      render(<Icone weight={peso} />).container.querySelector("svg")!;
    expect(Number(traco("thin").getAttribute("stroke-width"))).toBeLessThan(Number(traco("regular").getAttribute("stroke-width")));
    expect(Number(traco("bold").getAttribute("stroke-width"))).toBeGreaterThan(Number(traco("regular").getAttribute("stroke-width")));
    cleanup();

    const camadasDeFundo = (peso: "regular" | "duotone" | "fill") => {
      const svg = render(<Icone weight={peso} />).container.querySelector("svg")!;
      const n = svg.querySelectorAll("g[opacity]").length;
      cleanup();
      return n;
    };
    expect(camadasDeFundo("regular"), "peso regular não tem segunda tonalidade").toBe(0);
    expect(camadasDeFundo("duotone"), "duotone tem").toBe(1);
    expect(camadasDeFundo("fill"), "fill tem").toBe(1);
  });

  it("a cor pedida vale para o desenho inteiro, e o espelhamento inverte o eixo", () => {
    const Icone = ICONES_DO_PRODUTO.PassagemParaHumano;
    const { container } = render(<Icone color="#ff0000" mirrored />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("color")).toBe("#ff0000");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("transform")).toBe("scale(-1, 1)");
  });

  it("o nome acessível, quando dado, vira <title>", () => {
    const Icone = ICONES_DO_PRODUTO.JanelaDe24h;
    const { container } = render(<Icone alt="Janela de 24 horas" />);
    expect(container.querySelector("title")?.textContent).toBe("Janela de 24 horas");
  });
});

describe("selo", () => {
  const significados: SignificadoDoSelo[] = ["ia", "humano", "funil", "concluido", "falha", "neutro"];

  it.each(significados)("%s declara o próprio significado, para quem mede e para quem testa", (significado) => {
    const { container } = render(<Selo significado={significado}>texto</Selo>);
    expect(container.querySelector("[data-selo]")?.getAttribute("data-selo")).toBe(significado);
  });

  it("cada significado tem uma cor só dele, e só a IA usa o violeta", () => {
    const classes = significados.map((s) => {
      const { container } = render(<Selo significado={s}>x</Selo>);
      const c = container.querySelector("[data-selo]")!.className;
      cleanup();
      return [s, c] as const;
    });
    const cores = classes.map(([, c]) => c.split(" ").filter((k) => k.startsWith("text-") && !k.startsWith("text-xs")).join(" "));
    expect(new Set(cores).size, "dois significados com a mesma cor de texto").toBe(significados.length);
    for (const [s, c] of classes) {
      if (s === "ia") expect(c).toContain("text-ia");
      else expect(c, `${s} não pode usar a cor da IA`).not.toMatch(/\b(text|bg)-ia\b/);
    }
  });

  it("sem significado, o selo é neutro (cor nunca é ênfase por acidente)", () => {
    const { container } = render(<Selo>x</Selo>);
    expect(container.querySelector("[data-selo]")?.getAttribute("data-selo")).toBe("neutro");
  });
});
