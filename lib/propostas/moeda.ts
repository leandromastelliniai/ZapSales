// lib/propostas/moeda.ts
/**
 * `tag` é a etiqueta BCP-47 de quem LÊ (`tagDeIdioma`): o PDF da proposta sai no
 * idioma da organização, e "R$ 8.000,00" lido em inglês é oito reais. Ausente,
 * o português de sempre.
 */
export function formatarMoeda(cents: number, iso: string, tag = "pt-BR"): string {
  return (cents / 100).toLocaleString(tag, { style: "currency", currency: iso });
}
