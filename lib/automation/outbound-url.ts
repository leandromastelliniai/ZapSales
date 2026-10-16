/**
 * Validação anti-SSRF do TEXTO de uma URL outbound — fachada da rede segura
 * única (`lib/net/rede-segura`, issue #88), mantida para quem só precisa julgar
 * o endereço sem abrir conexão (a guarda da `media_url`, a imagem da proposta).
 *
 * A regra mora em `validarUrl`: esquema, `https` em produção (o `http` só fora
 * dela, o contrato de sempre deste guard), nome local e IPv4 especial. Literais
 * IPv6 são recusados por INTEIRO (`unsafe_url:ipv6_literal`): formas como
 * `[::ffff:127.0.0.1]` ou `[fc00::1]` contornariam uma regex parcial, e o alvo
 * real de um webhook usa hostname ou IPv4 público.
 *
 * Este guard é TEXTUAL e não resolve nome. Quem paga o DNS e prende o IP à
 * conexão é `buscarSeguro`; para julgar o nome sem conectar, `resolverEJulgar`
 * (`assertDestinoResolvidoSeguro`, em `outbound-ip.ts`).
 */
import { validarUrl } from "@/lib/net/rede-segura";

export function assertSafeOutboundUrl(url: string): void {
  validarUrl(url, { permitirHttp: process.env.NODE_ENV !== "production" });
}
