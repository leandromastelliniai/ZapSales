/** Display identity belongs to the network, never to the transport vendor. */
export function channelBrand(session?: { provider?: string | null } | null) {
  switch (session?.provider) {
    case "waha":
    case "meta_cloud":
    case "wacalls":
      return "whatsapp";
    default:
      return "unknown";
  }
}
