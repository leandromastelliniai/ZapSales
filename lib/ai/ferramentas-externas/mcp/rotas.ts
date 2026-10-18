/**
 * Pedaços que as rotas dos servidores MCP repetem. Server-side only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "@/lib/api/wrappers";

import { lerConfigDeMcpDaOrganizacao } from "./config";

/** O 409 de «os servidores MCP estão desligados» — o MESMO em toda rota que sairia para um servidor de terceiro. */
export async function recusaSeMcpDesligado(
  admin: SupabaseClient,
  organizationId: string,
  t: (texto: string) => string,
  requestId: string,
) {
  const config = await lerConfigDeMcpDaOrganizacao(admin as never, organizationId);
  // Falha de leitura do interruptor = desligado (falha fechada).
  if (config?.ligado) return null;
  return fail(
    "mcp_disabled",
    t("Os servidores MCP estão desligados nesta organização. Ligue o recurso em Ferramentas externas › Servidores MCP."),
    409,
    { requestId },
  );
}
