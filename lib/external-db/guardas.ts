/**
 * Guarda de destino do banco externo.
 *
 * O `pg` abre TCP cru — não passa pelo allowlist HTTP de
 * `lib/agent-engine/edge/egress.ts`. Sem uma guarda, cadastrar uma conexão vira
 * "posso fazer o servidor falar com qualquer coisa da rede dele".
 *
 * A régua de IP é a da rede segura única (`lib/net/rede-segura`, issue #88). O
 * que é deste perfil — e deliberadamente diferente do webhook — é UMA exceção:
 *
 * `buscarSeguro` bloqueia TODA faixa privada, porque um webhook é cadastrado por
 * `manager` e não deve alcançar a rede interna do compose. Aqui quem cadastra é
 * `admin` — na prática, o dono da VPS — e o caso de uso legítimo inclui um
 * Postgres na mesma rede local. Então:
 *
 *   - RFC1918 (10/8, 172.16/12, 192.168/16) é PERMITIDO: LAN é caso real.
 *   - link-local/metadata (169.254/16), loopback, CGNAT, multicast, reservadas
 *     e TEST-NET continuam BLOQUEADOS SEMPRE: nenhum deles é um banco de dados
 *     de cliente, e o 169.254.169.254 entrega credencial de instância de nuvem.
 *
 * A janela de DNS-rebinding que este arquivo declarava FECHOU: `validarHostDeBanco`
 * é só a checagem antecipada (para a tela distinguir "bloqueado" de "não
 * resolveu"); a garantia está no socket do pool (`conexao.ts`), cujo `lookup`
 * resolve e julga NO MOMENTO de conectar com `politicaDoBanco`. O nome continua
 * sendo o do SNI e o da verificação do certificado, então o TLS não muda.
 */
import {
  ErroDeRedeSegura,
  ipEhEspecial,
  ipEhPrivadoDeRede,
  resolverEJulgar,
  type PoliticaDeDestino,
} from "@/lib/net/rede-segura";

export type MotivoHostBloqueado =
  | "host_invalido"
  | "ip_especial"
  | "dns_falhou"
  | "dns_vazio";

export type ResultadoDeHost = { ok: true; enderecos: string[] } | { ok: false; motivo: MotivoHostBloqueado };

/** A política deste perfil: a da rede segura, mais a LAN privada do dono. */
export const politicaDoBanco: PoliticaDeDestino = {
  julgarLiteralIpv6: true,
  ipPermitido: ipEhPrivadoDeRede,
};

/** Um literal de IP é proibido? Exportado para teste direto da política. */
export function ipDeBancoProibido(ip: string): boolean {
  return ipEhEspecial(ip) && !ipEhPrivadoDeRede(ip);
}

/** Tira colchetes de IPv6 literal e recusa host com espaço, barra ou vazio. */
function normalizarHost(host: string): string | null {
  const h = host.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (h === "" || h.length > 255) return null;
  if (/[\s/\\]/.test(h)) return null;
  return h;
}

/**
 * Valida o destino: literal de IP é julgado direto; hostname é resolvido e
 * recusado se QUALQUER endereço cair em faixa proibida (rebinding devolve um
 * público e um privado; o `pg` pode escolher o privado, então recusa tudo).
 */
export async function validarHostDeBanco(host: string): Promise<ResultadoDeHost> {
  const h = normalizarHost(host);
  if (h === null) return { ok: false, motivo: "host_invalido" };
  try {
    const enderecos = await resolverEJulgar(h, politicaDoBanco);
    return { ok: true, enderecos: enderecos.map((e) => e.address) };
  } catch (erro) {
    if (!(erro instanceof ErroDeRedeSegura)) throw erro;
    // Falha fechado: recusar custa um cadastro; falhar aberto custa a rede interna.
    if (erro.codigo === "unsafe_url:dns_failed") return { ok: false, motivo: "dns_falhou" };
    if (erro.codigo === "unsafe_url:dns_empty") return { ok: false, motivo: "dns_vazio" };
    return { ok: false, motivo: "ip_especial" };
  }
}
