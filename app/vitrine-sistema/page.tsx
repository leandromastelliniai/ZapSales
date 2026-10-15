import type { Metadata } from "next";

import { VitrineDoSistema } from "./_client";

/**
 * Vitrine do sistema — as peças da casca e do desenho comum ("ZapSales by Futuristas") com dados de
 * exemplo: menu expandido e recolhido, folha de ícones, e as peças que as fases seguintes do plano
 * (`docs/design/plano-de-implementacao-visual.md`) vão acrescentando.
 *
 * Mesmo lugar e mesmas razões de `app/vitrine-inbox`: fora de `/design` (que troca paleta e fonte em
 * runtime) e fora de `app/app/**` (que exige porta no menu do cliente). Pública só em desenvolvimento
 * (`lib/auth/public-paths.ts`); em produção, atrás do login. É a bancada onde cada peça é medida,
 * nos dois temas e em 390 px, antes de entrar numa tela real.
 */
export const metadata: Metadata = {
  title: "Vitrine do sistema",
  robots: { index: false, follow: false },
};

export default function VitrineDoSistemaPage() {
  return <VitrineDoSistema />;
}
