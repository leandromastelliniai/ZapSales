/**
 * Os consumidores do barramento que pertencem aos CANAIS — o ponto por onde
 * `lib/event-log/register-handlers.ts` os registra sem nomear provedor
 * (doutrina de restrição de canal: fora de `lib/channels/`, nenhum nome de
 * transporte). Quem acrescenta um consumidor de canal acrescenta aqui.
 *
 * Vazio hoje: nenhum canal ativo tem consumidor próprio no barramento.
 */
import type { EventHandler } from "@/lib/event-log/dispatcher";

export const CONSUMIDORES_DOS_CANAIS: readonly EventHandler[] = [];
