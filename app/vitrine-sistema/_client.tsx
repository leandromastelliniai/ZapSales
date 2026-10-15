"use client";

import { AuthProvider } from "@/hooks/auth/AuthProvider";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { Sidebar } from "@/components/shell/Sidebar";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { ComoFunciona } from "@/components/shell/ComoFunciona";
import { Button } from "@/components/ui/button";
import { ICONE_DO_HUB, NAV_DESTINATIONS, NAV_GROUPS } from "@/lib/navigation/registry";

const ORG_ID = "00000000-0000-4000-8000-000000000001";

const USUARIO = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "ana.paula@exemplo.invalid",
  full_name: "Ana Paula",
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR",
  organizations: [{ organization_id: ORG_ID, organization_name: "Clínica Sorriso Vivo", role: "admin" }],
} as unknown as AuthUser;

const ORGANIZACAO = {
  orgId: ORG_ID,
  name: "Clínica Sorriso Vivo",
  role: "admin",
  visibility_mode: "all",
  modulos_ligados: [],
  capacidades_ligadas: [],
} as unknown as ActiveOrg;

function Quadro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * A VITRINE DO SISTEMA.
 *
 * O menu desenhado aqui é o REAL (`components/shell/Sidebar`), com o catálogo real de destinos; só a
 * sessão é de mentira. Os contadores e a saúde da conexão buscam na rede e, sem servidor, não
 * desenham nada — o que se mede aqui é a casca, não o dado.
 */
export function VitrineDoSistema() {
  const grupos = NAV_GROUPS.map((g) => ({
    grupo: g,
    destinos: NAV_DESTINATIONS.filter((d) => d.group === g.id),
  }));
  return (
    <AuthProvider user={USUARIO} activeOrg={ORGANIZACAO}>
      <main className="mx-auto max-w-[1400px] space-y-10 p-6 text-foreground">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Vitrine do sistema</h1>
          <p className="text-sm text-muted-foreground">
            Peças reais da casca com dados de exemplo. Cada peça nova entra aqui antes de entrar numa tela.
          </p>
        </header>

        <Quadro titulo="Menu lateral: expandido (o padrão) e recolhido (escolha da pessoa)">
          <div className="flex items-start gap-6" data-vitrine="menus">
            <div className="h-[820px] overflow-hidden rounded-lg border" data-vitrine="menu-expandido">
              <div className="h-full [&>aside]:h-full">
                <Sidebar collapsed={false} />
              </div>
            </div>
            <div className="h-[820px] overflow-hidden rounded-lg border" data-vitrine="menu-recolhido">
              <div className="h-full [&>aside]:h-full">
                <Sidebar collapsed />
              </div>
            </div>
          </div>
        </Quadro>

        <Quadro titulo="Cabeçalho de página, com o botão Como funciona">
          <div className="rounded-lg border bg-card p-6" data-vitrine="cabecalho">
            <CabecalhoDePagina
              titulo="Funis"
              descricao="Os funis pelos quais seus clientes passam, da primeira conversa até fechar negócio."
              ajuda={<ComoFunciona chave="funis" pagina="Funis" />}
              acoes={<Button size="sm">Novo funil</Button>}
            />
          </div>
        </Quadro>

        <Quadro titulo="Folha de ícones: um por destino">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" data-vitrine="folha-de-icones">
            {grupos.map(({ grupo, destinos }) => {
              const IconeDoHub = ICONE_DO_HUB[grupo.id];
              return (
                <div key={grupo.id} className="space-y-2 rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-semibold">{grupo.label}</h3>
                  <ul className="space-y-1.5">
                    {IconeDoHub && grupo.hub ? (
                      <li className="flex items-center gap-3 text-sm text-muted-foreground">
                        <IconeDoHub size={20} aria-hidden />
                        {grupo.hub.label}
                      </li>
                    ) : null}
                    {destinos.map((d) => {
                      const Icone = d.icon;
                      return (
                        <li key={d.href} className="flex items-center gap-3 text-sm" data-icone={d.icon.displayName ?? ""}>
                          <Icone size={20} aria-hidden />
                          {d.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Quadro>
      </main>
    </AuthProvider>
  );
}
