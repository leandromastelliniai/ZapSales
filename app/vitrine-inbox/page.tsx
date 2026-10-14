import type { Metadata } from "next";

import { VitrineDaInbox } from "./_client";

/**
 * Vitrine da Inbox (direção "Linha do Funil") — componentes do produto com
 * dados de exemplo e a rede interceptada no navegador (`./_rede.ts`).
 *
 * Mesmo lugar e mesmas razões de `app/vitrine-agenda`: fora de `/design` (que
 * troca paleta e fonte em runtime e mediria a variante, não o produto) e fora de
 * `app/app/**` (que exige porta no menu do cliente). Pública só em
 * desenvolvimento (`lib/auth/public-paths.ts`); em produção, atrás do login como
 * a da Agenda.
 */
export const metadata: Metadata = {
  title: "Vitrine da Inbox",
  robots: { index: false, follow: false },
};

export default function VitrineDaInboxPage() {
  return <VitrineDaInbox />;
}
