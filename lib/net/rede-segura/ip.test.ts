import { describe, expect, it } from "vitest";

import { ipEhEspecial, ipEhPrivadoDeRede } from "./ip";

describe("ipEhEspecial — o que nenhuma saída de rede alcança", () => {
  it.each([
    ["loopback", "127.0.0.1"],
    ["loopback fora do .1", "127.99.88.77"],
    ["privada 10/8", "10.1.2.3"],
    ["privada 172.16/12 (rede do Docker)", "172.17.0.2"],
    ["privada 192.168/16", "192.168.0.10"],
    ["metadata de nuvem", "169.254.169.254"],
    ["CGNAT", "100.64.1.1"],
    ["este host", "0.0.0.0"],
    ["broadcast", "255.255.255.255"],
    ["multicast", "224.0.0.1"],
    ["TEST-NET-1", "192.0.2.10"],
    ["benchmark", "198.18.0.1"],
    ["reservada 240/4", "240.0.0.1"],
    ["IPv6 loopback", "::1"],
    ["IPv6 loopback por extenso", "0:0:0:0:0:0:0:1"],
    ["IPv6 não especificado", "::"],
    ["IPv6 ULA", "fc00::1"],
    ["IPv6 ULA fd", "fd12:3456::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 multicast", "ff02::1"],
    ["IPv6 documentação", "2001:db8::1"],
    ["IPv4-mapped (pontuado) escondendo loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped (hex) escondendo loopback", "::ffff:7f00:1"],
    ["IPv4-mapped escondendo o metadata", "::ffff:a9fe:a9fe"],
    ["IPv4-compatível (legado) escondendo loopback", "::7f00:1"],
    ["NAT64 alcançando IPv4 privado", "64:ff9b::a00:1"],
    ["6to4 embutindo loopback", "2002:7f00:1::"],
    ["Teredo", "2001:0:4136:e378:8000:63bf:3fff:fdd2"],
    ["descarte 100::/64", "100::1"],
    ["lixo", "não-é-ip"],
    ["vazio", ""],
  ])("recusa %s", (_rotulo, ip) => {
    expect(ipEhEspecial(ip)).toBe(true);
  });

  it.each([
    ["IPv4 público", "8.8.8.8"],
    ["IPv4 logo abaixo da 172.16/12", "172.15.255.255"],
    ["IPv4 logo acima da 172.16/12", "172.32.0.1"],
    ["IPv4 logo abaixo do CGNAT", "100.63.255.255"],
    ["IPv6 público", "2606:4700::1111"],
    ["IPv6 do DNS do Google", "2001:4860:4860::8888"],
    ["IPv4-mapped de endereço público", "::ffff:8.8.8.8"],
  ])("aceita %s", (_rotulo, ip) => {
    expect(ipEhEspecial(ip)).toBe(false);
  });
});

describe("ipEhPrivadoDeRede — as três faixas RFC 1918", () => {
  it.each(["10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.1.1", "::ffff:10.0.0.5"])("%s é de rede privada", (ip) => {
    expect(ipEhPrivadoDeRede(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "172.15.0.1", "172.32.0.1", "169.254.169.254", "127.0.0.1", "100.64.0.1", "fc00::1"])(
    "%s não é de rede privada",
    (ip) => {
      expect(ipEhPrivadoDeRede(ip)).toBe(false);
    },
  );
});
