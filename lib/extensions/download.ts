import ipaddr from "ipaddr.js";

import { buscarSeguro, ErroDeRedeSegura, ipEhEspecial, type PoliticaDeDestino } from "@/lib/net/rede-segura";

import { ExtensionError, isExtensionError } from "./errors";
import { EXTENSION_LIMITS, type CatalogEntry } from "./manifest";

export interface DownloadPolicy {
  localCatalogOrigin: string | null;
  appUrl: string;
}

const DOWNLOAD_TIMEOUT_MS = 15_000;

function unsafe(cause?: unknown): never {
  throw new ExtensionError("extension_unsafe_origin", cause === undefined ? undefined : { cause });
}

function hostnameWithoutBrackets(hostname: string) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function parseExactOrigin(origin: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch (error) {
    unsafe(error);
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.origin !== origin
  ) {
    unsafe();
  }
  return url;
}

function isLoopbackAppUrl(appUrl: string) {
  try {
    const url = new URL(appUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = hostnameWithoutBrackets(url.hostname).toLowerCase();
    if (hostname === "localhost") return true;
    return ipaddr.isValid(hostname) && ipaddr.process(hostname).range() === "loopback";
  } catch {
    return false;
  }
}

function isAllowedLocalOrigin(url: URL, origin: string, policy: DownloadPolicy) {
  return (
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    policy.localCatalogOrigin === origin &&
    isLoopbackAppUrl(policy.appUrl)
  );
}

function validateCatalogOrigin(origin: string, policy: DownloadPolicy) {
  const url = parseExactOrigin(origin);
  const isLocal = isAllowedLocalOrigin(url, origin, policy);
  if (!isLocal && url.protocol !== "https:") unsafe();
  if (!isLocal && /(^|\.)localhost$/i.test(hostnameWithoutBrackets(url.hostname))) unsafe();
  if (
    !isLocal &&
    ipaddr.isValid(hostnameWithoutBrackets(url.hostname)) &&
    !isPublicAddress(hostnameWithoutBrackets(url.hostname))
  ) {
    unsafe();
  }
  return { url, isLocal };
}

/** Validação síncrona para a admissão; DNS continua vinculado ao socket no download. */
export function assertCatalogOrigin(origin: string, policy: DownloadPolicy): void {
  validateCatalogOrigin(origin, policy);
}

function isPublicAddress(address: string) {
  return !ipEhEspecial(address);
}

/**
 * O download é a rede segura única (`lib/net/rede-segura`, issue #88) com a
 * política deste catálogo: HTTPS, sem redirect, sem cookie nem credencial, DNS
 * preso à conexão, prazo total. A única exceção é a origem local de ensaio,
 * que só vale em loopback com o app também em loopback.
 */
function politicaDoCatalogo(isLocal: boolean): PoliticaDeDestino {
  return isLocal
    ? { permitirHttp: true, ipPermitido: (ip) => ip === "127.0.0.1" }
    : { julgarLiteralIpv6: true };
}

export async function downloadArtifact(
  origin: string,
  entry: CatalogEntry,
  policy: DownloadPolicy,
): Promise<Uint8Array> {
  try {
    if (
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.byte_length) ||
      entry.byte_length < 1 ||
      entry.byte_length > EXTENSION_LIMITS.packageBytes
    ) {
      throw new ExtensionError("extension_invalid_package");
    }
    const { url: originUrl, isLocal } = validateCatalogOrigin(origin, policy);
    const url = new URL(`/packages/${entry.sha256}.json`, originUrl);

    let response;
    try {
      response = await buscarSeguro(url.toString(), {
        ...politicaDoCatalogo(isLocal),
        headers: { accept: "application/json" },
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        maxBytes: EXTENSION_LIMITS.packageBytes,
      });
    } catch (error) {
      if (error instanceof ErroDeRedeSegura) {
        if (error.codigo === "net:response_too_large") throw new ExtensionError("extension_payload_too_large");
        if (error.codigo.startsWith("unsafe_url:") && error.codigo !== "unsafe_url:dns_failed") unsafe(error);
        throw new ExtensionError("extension_download_failed", { cause: error });
      }
      throw error;
    }

    if (response.status !== 200) {
      throw new ExtensionError("extension_download_failed", {
        cause: { code: "http_status", status: response.status },
      });
    }
    const encoding = response.headers["content-encoding"];
    if (encoding !== undefined && encoding.trim().toLowerCase() !== "identity") {
      throw new ExtensionError("extension_download_failed", { cause: { code: "content_encoding" } });
    }
    if (response.corpo.byteLength > entry.byte_length) {
      throw new ExtensionError("extension_invalid_package");
    }
    return new Uint8Array(response.corpo);
  } catch (error) {
    if (isExtensionError(error)) throw error;
    throw new ExtensionError("extension_download_failed", { cause: error });
  }
}
