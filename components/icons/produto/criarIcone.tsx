import { forwardRef, type ReactNode } from "react";
import type { Icon, IconProps, IconWeight } from "@phosphor-icons/react";

/**
 * A FÁBRICA DOS ÍCONES PRÓPRIOS DO PRODUTO.
 *
 * O Phosphor cobre o genérico (caixa de entrada, calendário, robô). O que ele não tem são os
 * conceitos que são do ZapSales: a linha do funil com as etapas, o agente de IA numa conversa, a
 * passagem da IA para uma pessoa. Estes ícones desenham esses conceitos no MESMO sistema do
 * Phosphor — grade de 256, traço de 16, pontas e junções redondas — para conviver com ele na mesma
 * lista sem destoar, e aceitam as mesmas propriedades (`size`, `weight`, `color`, `mirrored`).
 *
 * Como cada peso é desenhado, sem biblioteca nenhuma:
 *   - `thin`, `light`, `regular`, `bold`: o mesmo desenho, com o traço mais fino ou mais grosso.
 *   - `duotone`: o desenho mais a camada `fundo`, preenchida a 20% — a segunda tonalidade.
 *   - `fill`: o desenho mais a camada `fundo` a 35%. É o peso do item ATIVO do menu.
 *
 * Peso: cada ícone é um SVG inline de cerca de 1 KB. Nada de arquivo, de rede ou de fonte.
 */
const TRACO: Record<IconWeight, number> = {
  thin: 8,
  light: 12,
  regular: 16,
  bold: 24,
  fill: 16,
  duotone: 16,
};

const OPACIDADE_DO_FUNDO: Partial<Record<IconWeight, number>> = { duotone: 0.2, fill: 0.35 };

export interface CamadasDoIcone {
  /** A segunda tonalidade: formas PREENCHIDAS que aparecem nos pesos `duotone` e `fill`. */
  readonly fundo?: ReactNode;
  /** Formas preenchidas que valem em todos os pesos (o ponto de uma etapa, a estrela da IA). */
  readonly cheios?: ReactNode;
  /** O desenho em traço, o que dá o contorno do ícone. */
  readonly tracos: ReactNode;
}

export function criarIcone(nome: string, camadas: CamadasDoIcone): Icon {
  const IconeDoProduto = forwardRef<SVGSVGElement, IconProps>(function IconeDoProduto(
    { size = "1em", weight = "regular", color = "currentColor", mirrored = false, alt, children, ...resto },
    ref,
  ) {
    const opacidadeDoFundo = OPACIDADE_DO_FUNDO[weight];
    return (
      <svg
        ref={ref}
        viewBox="0 0 256 256"
        width={size}
        height={size}
        color={color}
        fill="none"
        stroke="currentColor"
        strokeWidth={TRACO[weight]}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={mirrored ? "scale(-1, 1)" : undefined}
        {...resto}
      >
        {alt ? <title>{alt}</title> : null}
        {children}
        {opacidadeDoFundo && camadas.fundo ? (
          <g fill="currentColor" stroke="none" opacity={opacidadeDoFundo}>
            {camadas.fundo}
          </g>
        ) : null}
        {camadas.cheios ? (
          <g fill="currentColor" stroke="none">
            {camadas.cheios}
          </g>
        ) : null}
        {camadas.tracos}
      </svg>
    );
  });
  IconeDoProduto.displayName = nome;
  return IconeDoProduto;
}
