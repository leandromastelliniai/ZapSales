/**
 * A exceção do envio por `media_url`: a URL ASSINADA pelo próprio Storage desta
 * instalação (`<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/sign/…`).
 *
 * Toda outra `media_url` é baixada NESTE processo pela rede segura
 * (`baixar-midia-externa.ts`, issue #110) e entregue ao gateway já como URL
 * assinada nossa — o gateway nunca resolve nem busca um endereço que um usuário
 * escolheu. Esta é a única que segue direto ao gateway: assinar exige a service
 * role, então quem a tem recebeu-a do servidor; e ela é, por construção, o
 * endereço que o gateway já baixa no caminho de `media_storage_path`. É por ela
 * que sai o PDF da proposta — que num self-host em `http://` ou em rede local
 * nunca passaria na rede segura externa.
 */
import { env } from "@/lib/env";

export function ehUrlAssinadaDoProprioStorage(bruta: string): boolean {
  let url: URL;
  let base: URL;
  try {
    url = new URL(bruta);
    base = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    return false;
  }
  // `new URL` já normalizou `..`: `/storage/v1/object/sign/../../rest` não
  // chega aqui com o prefixo.
  return url.origin === base.origin && url.pathname.startsWith("/storage/v1/object/sign/");
}
