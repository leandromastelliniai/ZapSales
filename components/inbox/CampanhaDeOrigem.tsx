"use client";

/**
 * "Respondendo à campanha X · modelo Y" no cabeçalho da conversa (issue #11).
 *
 * Fica junto do nome porque a pergunta que ele responde — "isto é resposta a
 * quê?" — se faz antes de ler a primeira mensagem. Some quando a conversa não
 * nasceu de campanha.
 */
import { Megaphone } from "lucide-react";
import Link from "next/link";

import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { useCampanhaDaConversa } from "@/hooks/inbox/useCampanhaDaConversa";
import { useT } from "@/hooks/i18n/useT";
import { ROLE_RANK } from "@/lib/auth/types";

export function CampanhaDeOrigem({ conversationId }: { conversationId: string }) {
  const t = useT();
  const origem = useCampanhaDaConversa(conversationId);
  const org = useActiveOrg();
  if (!origem) return null;
  // A tela da campanha é de `manager`+ (a mesma régua da API); para os outros, o nome basta.
  const podeAbrir = !!org && ROLE_RANK[org.role] >= ROLE_RANK.manager;
  const nome = podeAbrir ? (
    <Link
      href={`/app/campaigns/${origem.campanha.id}`}
      className="underline-offset-2 hover:underline"
    >
      {origem.campanha.nome}
    </Link>
  ) : (
    origem.campanha.nome
  );
  return (
    <p
      className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground"
      data-testid="campanha-de-origem"
    >
      <Megaphone aria-hidden className="size-3 shrink-0" />
      <span className="truncate">
        {t("Respondendo à campanha")} {nome}
        {origem.modelo ? ` · ${t("modelo")} ${origem.modelo.nome}` : null}
      </span>
    </p>
  );
}
