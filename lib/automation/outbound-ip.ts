/**
 * Faixas de IP que uma saída de rede nunca deve alcançar — fachada da rede
 * segura única (`lib/net/rede-segura`, issue #88). A régua de verdade mora em
 * `lib/net/rede-segura/ip.ts`; aqui ficam os dois nomes que o resto do código
 * já importa.
 *
 * `assertDestinoResolvidoSeguro` resolve o nome e recusa se QUALQUER endereço
 * for especial, mas só JULGA: quem vai conectar depois ainda resolve por conta
 * própria, então esta função sozinha deixa a janela de rebinding aberta. Onde
 * for possível abrir a conexão aqui dentro, use `buscarSeguro`, que prende o
 * endereço julgado ao socket e não tem janela nenhuma.
 */
import { resolverEJulgar } from "@/lib/net/rede-segura";

export { ipEhEspecial } from "@/lib/net/rede-segura";

export async function assertDestinoResolvidoSeguro(hostname: string): Promise<void> {
  await resolverEJulgar(hostname);
}
