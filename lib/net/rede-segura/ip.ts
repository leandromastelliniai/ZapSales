/**
 * Quais endereços IP nenhuma saída de rede do servidor alcança — a régua ÚNICA.
 *
 * Antes havia três: `outbound-ip.ts` (webhook), `extensions/download.ts` (que
 * perguntava ao `ipaddr.js`) e `external-db/guardas.ts`. Cada uma errava num
 * canto diferente: a do webhook decidia IPv6 por prefixo de texto, e por isso
 * `::ffff:7f00:1` (loopback, em hexadecimal) passava; a do `ipaddr.js` deixa
 * `::7f00:1` e `100::/64` como "unicast". Aqui o endereço é primeiro
 * NORMALIZADO (`ipaddr.process` desembrulha IPv4-mapped), depois julgado pela
 * classe do `ipaddr.js` — só `unicast` passa —, e os dois buracos conhecidos
 * dele são fechados à mão.
 *
 * Quem não parseia é especial: falhar fechado custa uma chamada; falhar aberto
 * custa a rede interna do servidor.
 */
import ipaddr from "ipaddr.js";

/** Tira os colchetes de um literal IPv6 (`[::1]` → `::1`) e a zona (`%eth0`). */
export function semColchetes(host: string): string {
  const sem = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const zona = sem.indexOf("%");
  return zona === -1 ? sem : sem.slice(0, zona);
}

function parsear(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  const texto = semColchetes(ip.trim());
  if (!ipaddr.isValid(texto)) return null;
  try {
    return ipaddr.process(texto);
  } catch {
    return null;
  }
}

/** `::a.b.c.d` (IPv4-compatível, obsoleto): os 96 bits de cima zerados. */
function ehIpv4Compativel(v6: ipaddr.IPv6): boolean {
  const g = v6.parts;
  return g.slice(0, 6).every((p) => p === 0) && !(g[6] === 0 && g[7] === 0);
}

/** `100::/64` (RFC 6666, prefixo de descarte): o `ipaddr.js` o chama de unicast. */
function ehPrefixoDeDescarte(v6: ipaddr.IPv6): boolean {
  const g = v6.parts;
  return g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0;
}

/** O endereço NÃO é um destino público roteável? Lixo conta como especial. */
export function ipEhEspecial(ip: string): boolean {
  const endereco = parsear(ip);
  if (endereco === null) return true;
  if (endereco.range() !== "unicast") return true;
  if (endereco.kind() === "ipv6") {
    const v6 = endereco as ipaddr.IPv6;
    return ehIpv4Compativel(v6) || ehPrefixoDeDescarte(v6);
  }
  return false;
}

/**
 * Uma das três faixas RFC 1918 (10/8, 172.16/12, 192.168/16). Existe para o
 * perfil do banco externo, cujo dono pode legitimamente apontar para um Postgres
 * na LAN — o único perfil que enxerga a rede privada, e só ela.
 */
export function ipEhPrivadoDeRede(ip: string): boolean {
  const endereco = parsear(ip);
  return endereco !== null && endereco.kind() === "ipv4" && endereco.range() === "private";
}

/**
 * Endereço da rede LOCAL (este host, loopback, privada ou link-local) — o
 * subconjunto que o texto da URL já denuncia sem DNS, e que ganha o código
 * `unsafe_url:private_host`. O resto do que é especial (CGNAT, multicast,
 * reservado…) só é pego depois, no julgamento do IP resolvido.
 */
export function ipEhDeRedeLocal(ip: string): boolean {
  const endereco = parsear(ip);
  if (endereco === null) return false;
  return ["unspecified", "loopback", "private", "linkLocal"].includes(endereco.range());
}
