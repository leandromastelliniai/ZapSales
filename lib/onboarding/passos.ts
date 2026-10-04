/**
 * OS PASSOS DO WIZARD — uma definição só.
 *
 * Eram três listas que discordavam entre si: a ORDEM vivia numa cascata de
 * `if`s no roteador, os RÓTULOS numa lista fixa no indicador de progresso, e o
 * RESUMO final numa terceira lista — e elas divergiam: o indicador mostrava
 * passo que a instalação não oferecia, marcava CONCLUÍDO o que a pessoa ainda
 * não tinha feito ("feito" era só "índice menor que o atual"), e a tela final
 * acusava como "pulado" uma tela que nunca foi oferecida.
 *
 * Aqui, a mesma lista alimenta o roteador, o indicador e o resumo.
 */
import type { OnboardingState } from "@/lib/schemas/onboarding";

export interface PassoDoOnboarding {
  /** Segmento da rota em `app/onboarding/<segmento>`. */
  segmento: string;
  /** O nome da PEÇA que a pessoa está montando, não o nome do sistema. */
  rotulo: string;
  /** Já foi resolvido? (inclusive quando a pessoa escolheu pular) */
  cumprido: (state: OnboardingState) => boolean;
  /** Foi resolvido de verdade, ou a pessoa pulou? Alimenta o resumo final. */
  pulado: (state: OnboardingState) => boolean;
}

/** Um passo marcado no estado — com ou sem `skipped`. */
function marcado(valor: unknown): boolean {
  return Boolean(valor);
}

function foiPulado(valor: { skipped?: boolean } | undefined): boolean {
  return Boolean(valor?.skipped);
}

export const PASSOS: readonly PassoDoOnboarding[] = [
  {
    segmento: "welcome",
    rotulo: "Seu negócio",
    cumprido: (s) => marcado(s.welcome),
    pulado: () => false,
  },
  {
    segmento: "connect-whatsapp",
    // O telefone é a primeira peça concreta do funcionário, e é o passo que
    // pede o celular na mão — o instalador já avisa para deixá-lo aberto.
    rotulo: "O telefone dele",
    cumprido: (s) => marcado(s.whatsapp),
    pulado: (s) => foiPulado(s.whatsapp),
  },
  {
    segmento: "setup-ai",
    rotulo: "Treinar",
    cumprido: (s) => marcado(s.ai),
    pulado: (s) => foiPulado(s.ai),
  },
  {
    segmento: "funil",
    // O quadro vem DEPOIS de treinar de propósito: a sugestão sai da chave que a
    // pessoa acabou de confirmar funcionando, e é o mesmo cérebro que vai
    // atender. Pedir o quadro antes obrigaria a montá-lo no escuro.
    rotulo: "Onde ele organiza",
    cumprido: (s) => marcado(s.funil),
    pulado: (s) => foiPulado(s.funil),
  },
  {
    segmento: "testar",
    // O wizard terminava entregando a pessoa num inbox vazio. Ver o
    // funcionário responder ANTES de acabar é o que transforma "configurei um
    // sistema" em "contratei alguém" — e é onde o erro aparece antes do
    // primeiro cliente real, não depois.
    rotulo: "Ver ele atender",
    cumprido: (s) => marcado(s.teste),
    pulado: (s) => foiPulado(s.teste),
  },
  {
    segmento: "invite-team",
    rotulo: "Quem trabalha com ele",
    cumprido: (s) => marcado(s.team),
    pulado: (s) => foiPulado(s.team),
  },
] as const;

/** Os passos do wizard, na ordem. */
export function passosVisiveis(): PassoDoOnboarding[] {
  return [...PASSOS];
}

/**
 * O primeiro passo ainda não resolvido — ou `null` quando não falta nenhum.
 * É a única definição de ordem do wizard.
 */
export function proximoPasso(state: OnboardingState): PassoDoOnboarding | null {
  return passosVisiveis().find((p) => !p.cumprido(state)) ?? null;
}

export interface ItemDoResumo {
  segmento: string;
  rotulo: string;
  feito: boolean;
  pulado: boolean;
}

/** O resumo final: o que foi feito, o que foi pulado e o que ficou pendente. */
export function resumoDoOnboarding(state: OnboardingState): ItemDoResumo[] {
  return passosVisiveis().map((p) => ({
    segmento: p.segmento,
    rotulo: p.rotulo,
    feito: p.cumprido(state) && !p.pulado(state),
    pulado: p.pulado(state),
  }));
}
