"use client";
import { AlertsBell } from "./AlertsBell";
import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";
import { MobileSidebar } from "./MobileSidebar";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";
import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { marcaEhADoProduto } from "@/lib/branding";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";

/**
 * O logotipo do PRODUTO na barra do topo — "ZapSales by Futuristas".
 *
 * Com o menu recolhido (o padrão desde 07/10/2026) a barra lateral só tem
 * espaço para o símbolo, e o nome do produto com a assinatura da Futuristas
 * sumiria da tela. Ele aparece aqui só nesse caso, e só quando a marca é a do
 * produto: com marca própria (da instalação ou da organização) quem aparece é
 * o ícone dela, no menu — a regra é a mesma de `Sidebar.tsx`.
 */
function LogotipoNoTopo() {
  const brand = useMarcaDaInstalacao();
  const { activeOrg } = useAuth();
  const nome = activeOrg?.marca?.nome ?? brand.name;
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;
  if (!marcaEhADoProduto({ name: nome, logoUrl: logo ?? null })) return null;
  return <LogotipoDoProduto nome={nome} className="hidden h-9 w-auto md:block" />;
}

export function TopBar({ mostrarLogotipo = false }: { mostrarLogotipo?: boolean }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur md:gap-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <MobileSidebar />
        {mostrarLogotipo ? <LogotipoNoTopo /> : null}
        <TenantSwitcher />
      </div>
      <div className="flex min-w-0 flex-1 justify-center md:max-w-md">
        <SearchTrigger />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AlertsBell />
        <AvisoDePropostaEmDestaque />
        <UserMenu />
      </div>
    </header>
  );
}
