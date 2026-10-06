/**
 * Os modelos que a tela de CAMPANHA oferece (issue #8) — puro.
 *
 * Só os aprovados: o resto a Meta recusaria no primeiro envio. E cada um vem com
 * as variáveis já derivadas do contrato (a mesma derivação do envio), com a
 * chave do envio (`slotKey`) e o texto ao redor — é o que a tela usa para o
 * operador dizer de onde vem cada valor sem saber o que é `{{1}}`.
 */
import { slotKey } from "@/lib/channels/meta/build-components";
import { isStatusSendable } from "@/lib/channels/meta/template-binding";
import { describeAddress, type SlotExpects } from "@/lib/channels/meta/template-contract";
import { lerConteudo } from "@/lib/channels/template-conteudo";

import { contratoDoModelo, type ModeloDaCampanha } from "./modelo-da-campanha";

export interface VariavelDoModelo {
  /** A chave em `template_variables` e no envio. */
  chave: string;
  /** `{{1}}`, `{{nome}}` — como o operador a vê no texto. */
  rotulo: string;
  onde: string;
  antes: string;
  depois: string;
  tipo: SlotExpects;
}

export interface ModeloParaCampanha {
  id: string;
  name: string;
  language: string;
  category: string | null;
  /** O corpo aprovado, com os `{{…}}` — o operador escolhe pelo conteúdo, não pelo nome técnico. */
  texto: string;
  variaveis: VariavelDoModelo[];
}

export function modelosParaCampanha(
  linhas: Array<Omit<ModeloDaCampanha, "waba_id"> & { waba_id?: string }>,
): ModeloParaCampanha[] {
  const saida: ModeloParaCampanha[] = [];
  for (const l of linhas) {
    if (!isStatusSendable(l.status)) continue;
    const contrato = contratoDoModelo({ ...l, waba_id: l.waba_id ?? "" });
    const vistas = new Set<string>();
    const variaveis: VariavelDoModelo[] = [];
    for (const s of contrato.slots) {
      const chave = slotKey(s.address, s.key);
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      variaveis.push({
        chave,
        rotulo: `{{${s.key}}}`,
        onde: describeAddress(s.address),
        antes: s.contextBefore.trim(),
        depois: s.contextAfter.trim(),
        tipo: s.expects,
      });
    }
    saida.push({
      id: l.id,
      name: l.name,
      language: l.language,
      category: l.category,
      texto: lerConteudo(l.components).body?.trim() ?? "",
      variaveis,
    });
  }
  return saida;
}
