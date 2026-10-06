import { normalizarIdioma, IDIOMA_PADRAO, type Idioma } from "./idiomas";
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
 * Nunca lança: uma leitura que falha devolve o padrão do produto. Um e-mail em
 * português é pior que um em inglês para quem lê inglês, e muito melhor que um
 * e-mail que não saiu.
 */
export async function idiomaDaOrganizacao(organizationId: string): Promise<Idioma> {
  try {
    const { data } = await createAdminClient()
      .from("organizations")
      .select("locale")
      .eq("id", organizationId)
      .maybeSingle();
    return normalizarIdioma((data as { locale?: string | null } | null)?.locale ?? null);
  } catch {
    return IDIOMA_PADRAO;
  }
}
