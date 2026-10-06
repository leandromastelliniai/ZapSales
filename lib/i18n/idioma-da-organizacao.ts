import { idiomaPeloCliente } from "./aviso-no-idioma";
import { IDIOMA_PADRAO, type Idioma } from "./idiomas";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O idioma de uma organização, para o que sai SEM tela: e-mail, documento,
 * aviso gravado.
 *
 * Quem recebe essas saídas muitas vezes não tem conta (o convidado, o titular
 * de um pedido LGPD) ou não está olhando (o DPO que recebe um alarme). A
 * organização é a única preferência que existe para eles — é a mesma que um
 * convidado herda ao entrar (`lib/auth/server.ts`).
 *
 * É `idiomaPeloCliente` (`./aviso-no-idioma`) com o cliente admin, para quem
 * não tem um cliente à mão. Nunca lança: uma leitura que falha devolve o padrão
 * do produto — um e-mail em português é pior que um em inglês para quem lê
 * inglês, e muito melhor que um e-mail que não saiu.
 */
export async function idiomaDaOrganizacao(organizationId: string): Promise<Idioma> {
  try {
    return await idiomaPeloCliente(createAdminClient(), organizationId);
  } catch {
    // `createAdminClient` lança sem as variáveis do Supabase.
    return IDIOMA_PADRAO;
  }
}
