/**
 * Os ÍCONES do assistente de criação de agente e da galeria de modelos: um por modelo, por
 * tom, por grupo e por tipo de negócio, para a pessoa reconhecer o que escolhe de relance em
 * vez de ler tudo.
 *
 * Mapas puros, sobre o ponto único de ícones (`lib/ui/icons.ts`). Tipo de negócio sem
 * ícone próprio cai no do grupo — nunca fica sem nada.
 */
import type { ComponentType } from "react";

import { RAMOS } from "@/lib/ai/agents/assistente/ramos";

import { AgenteEmConversa, PassagemParaHumano } from "@/components/icons/produto";
import {
  Airplane,
  Bank,
  Barbell,
  Bed,
  Brain,
  Briefcase,
  CalendarCheck,
  Calculator,
  Car,
  ChatCircle,
  Chalkboard,
  Coins,
  Confetti,
  CreditCard,
  DotsThree,
  Dog,
  ForkKnife,
  GraduationCap,
  Handshake,
  HardHat,
  Headset,
  Heartbeat,
  House,
  Buildings,
  Lifebuoy,
  Lightbulb,
  Megaphone,
  PawPrint,
  PencilRuler,
  Pill,
  PlayCircle,
  Plant,
  Robot,
  Scales,
  Scissors,
  ShieldCheck,
  ShoppingCart,
  Smiley,
  Sparkle,
  Stethoscope,
  Storefront,
  Tooth,
  TrendUp,
  TShirt,
  Translate,
  Wrench,
  FirstAid,
} from "@/lib/ui/icons";

/** O que um ícone aceita aqui: tamanho, classe e `aria-hidden` (os do Phosphor e os do produto). */
export type IconeDoAssistente = ComponentType<{
  size?: number | string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export const ICONE_DO_MODELO: Record<string, IconeDoAssistente> = {
  vendas: TrendUp,
  suporte: Lifebuoy,
  agendamento: CalendarCheck,
  atendimento: Headset,
};

export const ICONE_DO_TOM: Record<string, IconeDoAssistente> = {
  formal: Briefcase,
  normal: ChatCircle,
  descontraido: Smiley,
};

/** As cinco estações do assistente, na ordem. */
export const ICONE_DA_ESTACAO: Record<number, IconeDoAssistente> = {
  1: Storefront,
  2: Robot,
  3: AgenteEmConversa,
  4: PassagemParaHumano,
  5: PlayCircle,
};

export const ICONE_DO_GRUPO: Record<string, IconeDoAssistente> = {
  saude: Heartbeat,
  comercio: Storefront,
  imoveis: Buildings,
  educacao: GraduationCap,
  servicos: Briefcase,
  beleza: Scissors,
  automotivo: Car,
  turismo: Airplane,
  financeiro: Coins,
};

const ICONE_DO_RAMO: Record<string, IconeDoAssistente> = {
  "clinica-medica": Stethoscope,
  "clinica-odontologica": Tooth,
  estetica: Sparkle,
  psicologia: Brain,
  fisioterapia: FirstAid,
  nutricao: Plant,
  veterinaria: PawPrint,
  academia: Barbell,
  "loja-fisica": Storefront,
  ecommerce: ShoppingCart,
  moda: TShirt,
  restaurante: ForkKnife,
  farmacia: Pill,
  "pet-shop": Dog,
  imobiliaria: House,
  corretor: Handshake,
  construtora: HardHat,
  arquitetura: PencilRuler,
  infoprodutor: PlayCircle,
  "escola-cursos": Chalkboard,
  idiomas: Translate,
  mentoria: Lightbulb,
  advocacia: Scales,
  contabilidade: Calculator,
  consultoria: Briefcase,
  "agencia-marketing": Megaphone,
  seguros: ShieldCheck,
  salao: Scissors,
  barbearia: Scissors,
  concessionaria: Car,
  oficina: Wrench,
  "agencia-viagens": Airplane,
  "hotel-pousada": Bed,
  eventos: Confetti,
  consorcio: Bank,
  credito: CreditCard,
};

/** O ícone de "Outro" (e de quem ainda não escolheu o tipo de negócio). */
export const ICONE_DE_OUTRO: IconeDoAssistente = DotsThree;

/**
 * O ícone de CADA tipo de negócio do catálogo, já resolvido: o próprio, ou o do grupo quando
 * o tipo não tem ícone próprio. Mapa pronto (e não função) para a tela só indexar: escolher o
 * componente em tempo de renderização por chamada de função o recria a cada passada.
 */
export const ICONE_POR_RAMO: Record<string, IconeDoAssistente> = Object.fromEntries(
  RAMOS.map((r) => [r.id, ICONE_DO_RAMO[r.id] ?? ICONE_DO_GRUPO[r.grupo] ?? ICONE_DE_OUTRO]),
);
