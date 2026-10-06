import { notFound } from "next/navigation";

import { loadAuthUser } from "@/lib/auth/server";
import { carregarCotacao, COTACAO_DE_REFERENCIA } from "@/lib/custo/cotacao";
import { carregarTabela } from "@/lib/custo/tabela-de-precos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDePrecosDaMeta } from "./_form";

export const metadata = { title: "Preços da Meta" };
export const dynamic = "force-dynamic";

/**
 * A tabela de preços da Meta da INSTALAÇÃO (issue #10) e a cotação do dólar.
 *
 * ── Por que `/admin`, e não Campanhas › Configuração ────────────────────────
 *
 * O preço da Meta é o mesmo para todas as empresas desta instalação, e é ele que
 * move a estimativa e o teto de gasto de cada uma. Deixar o administrador de uma
 * empresa editá-lo faria o teto das outras valer outra coisa. Irmã de
 * `/admin/destinos-internos`: mesmo gate, mesma forma.
 *
 * O gate `notFound()` é redundante com o layout de `(protected)` HOJE, e fica
 * pela mesma razão de lá: a garantia precisa ser local.
 */
export default async function Page() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();

  const admin = createAdminClient();
  const [tabela, cotacao] = await Promise.all([carregarTabela(admin), carregarCotacao(admin)]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Preços da Meta", usuario.idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Quanto a Meta cobra por mensagem, por país de quem recebe e categoria. É a base da estimativa antes do disparo, do custo de cada mensagem e do teto de gasto das campanhas.",
            usuario.idioma,
          )}
        </p>
      </div>
      <FormularioDePrecosDaMeta
        linhasIniciais={tabela}
        cotacaoInicial={cotacao.referencia ? null : cotacao.valor}
        cotacaoDeReferencia={COTACAO_DE_REFERENCIA}
      />
    </div>
  );
}
