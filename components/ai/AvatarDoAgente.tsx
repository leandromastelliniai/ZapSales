import type { Icon } from "@phosphor-icons/react";

import { AgenteEmConversa } from "@/components/icons/produto";
import {
  Barbell,
  CalendarCheck,
  Car,
  CurrencyCircleDollar,
  FirstAidKit,
  ForkKnife,
  GraduationCap,
  Headset,
  House,
  Lifebuoy,
  Megaphone,
  PawPrint,
  Robot,
  Scales,
  Scissors,
  ShoppingCart,
  Storefront,
  Truck,
} from "@/lib/ui/icons";
import type { IconeDoAgente } from "@/lib/ai/agents/icone-do-agente";
import { cn } from "@/lib/utils";

/** O desenho de cada ícone. A lista de ids (e a sugestão pelo nome) mora em `lib/ai/agents/icone-do-agente.ts`. */
export const DESENHO_DO_ICONE: Record<IconeDoAgente, Icon> = {
  assistente: AgenteEmConversa,
  atendente: Headset,
  vendas: ShoppingCart,
  loja: Storefront,
  agenda: CalendarCheck,
  suporte: Lifebuoy,
  saude: FirstAidKit,
  imoveis: House,
  educacao: GraduationCap,
  financeiro: CurrencyCircleDollar,
  entregas: Truck,
  restaurante: ForkKnife,
  beleza: Scissors,
  marketing: Megaphone,
  juridico: Scales,
  pet: PawPrint,
  automoveis: Car,
  academia: Barbell,
  robo: Robot,
};

/**
 * O estado do agente como um ponto no canto do ícone — a mesma ideia do selo de
 * canal no `AvatarDoContato`. A cor segue o significado do `Selo`: verde = está no
 * ar, âmbar = pausado/esperando, sem ponto = rascunho ou arquivado.
 */
export type PontoDoAvatar = "no_ar" | "pausado" | null;

const TAMANHO = {
  sm: { caixa: "size-8 rounded-lg", icone: 18, ponto: "size-2.5" },
  md: { caixa: "size-11 rounded-xl", icone: 24, ponto: "size-3" },
  lg: { caixa: "size-16 rounded-2xl", icone: 34, ponto: "size-3.5" },
} as const;

/**
 * O rosto de um agente de IA. Sempre violeta, porque violeta é a cor da IA no
 * produto inteiro (`DESIGN.md`) — o que distingue um agente do outro é o desenho,
 * não uma cor nova sem significado. A cor de destaque do revendedor substitui o
 * violeta sozinha, pelos tokens.
 */
export function AvatarDoAgente({
  icone,
  tamanho = "md",
  ponto = null,
  className,
}: {
  icone: IconeDoAgente;
  tamanho?: keyof typeof TAMANHO;
  ponto?: PontoDoAvatar;
  className?: string;
}) {
  // Id que um dia sair da lista (dado antigo) ainda desenha alguma coisa.
  const Desenho = DESENHO_DO_ICONE[icone] ?? AgenteEmConversa;
  const t = TAMANHO[tamanho];
  return (
    <span
      data-icone-do-agente={icone}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center bg-ia-fundo text-ia ring-1 ring-inset ring-ia/15",
        t.caixa,
        className,
      )}
    >
      <Desenho size={t.icone} weight="duotone" aria-hidden />
      {ponto ? (
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-surface",
            t.ponto,
            ponto === "no_ar" ? "bg-success" : "bg-funil",
          )}
        />
      ) : null}
    </span>
  );
}
