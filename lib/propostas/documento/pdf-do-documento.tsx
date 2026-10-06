// lib/propostas/documento/pdf-do-documento.tsx
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { traduzir } from "@/lib/i18n/dicionario";
import { preencher } from "@/lib/i18n/aviso-no-idioma";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { IDIOMA_PADRAO, type Idioma } from "@/lib/i18n/idiomas";

import { formatarMoeda } from "../moeda";
import type { SecaoRenderizada } from "./renderer";

const styles = StyleSheet.create({
  page: { padding: 32, paddingBottom: 48, fontSize: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  logo: { width: 96, height: 40, objectFit: "contain" },
  titulo: { fontSize: 16, fontWeight: 700 },
  secaoTitulo: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  secaoBody: { fontSize: 10, lineHeight: 1.4 },
  linhaItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5 },
  itemImagem: { width: 32, height: 32, objectFit: "cover", marginRight: 8 },
  itemTexto: { flexDirection: "row", alignItems: "center" },
  total: { marginTop: 8, fontSize: 12, fontWeight: 700, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#666" },
});

export interface ItemDoPdf {
  descricao: string;
  quantidade: number;
  precoUnitarioCents: number;
  descontoCents: number;
  imagemUrl?: string | null;
}

export interface DocumentoPdfInput {
  titulo: string;
  numero: number | null;
  ano: number | null;
  versao: number;
  destinatario: { nome: string };
  secoes: SecaoRenderizada[];
  itens: ItemDoPdf[];
  totalCents: number;
  moeda: string;
  validUntil: string | null;
  condicoes: string | null;
  /** SÓ a organização (D6 da spec-mãe) — quem monta é `marcaDaOrganizacaoParaPdf`. */
  marca: { app_name: string | null; accent_hex: string | null; logoUrl: string | null };
  /**
   * PRÉVIA DE TELA ("Ver como o cliente recebe"): o arquivo é o mesmo que o
   * envio faria, mas o número ainda não existe — e o lugar dele diz isso, em vez
   * de ficar em branco (quem lê não pode confundir "sem número" com "faltou
   * alguma coisa no PDF").
   */
  previa?: boolean;
  /**
   * O idioma da ORGANIZAÇÃO que envia (`montarPdfDaProposta` lê). É o mesmo na
   * prévia e no envio: a prévia promete o arquivo que o cliente vai receber, e
   * ele recebe no idioma da organização, não no de quem está olhando a tela.
   * Ausente: português, o texto de sempre.
   */
  idioma?: Idioma;
}

export type BlocoDoPdf = { tipo: "secao"; secao: SecaoRenderizada } | { tipo: "itens" };

const ID_DA_SECAO_DE_INVESTIMENTO = "investment";

/** A ordem de leitura da §6.2 da spec de 21/09: a tabela de itens mora dentro do investimento. */
export function blocosDoDocumento(secoes: SecaoRenderizada[]): BlocoDoPdf[] {
  const blocos: BlocoDoPdf[] = [];
  let itensColocados = false;
  for (const secao of secoes) {
    blocos.push({ tipo: "secao", secao });
    if (secao.id === ID_DA_SECAO_DE_INVESTIMENTO && !itensColocados) {
      blocos.push({ tipo: "itens" });
      itensColocados = true;
    }
  }
  if (!itensColocados) blocos.push({ tipo: "itens" });
  return blocos;
}

function Itens({ d, accent }: { d: DocumentoPdfInput; accent: string | undefined }): React.ReactElement {
  const idioma = d.idioma ?? IDIOMA_PADRAO;
  const tag = tagDeIdioma(idioma);
  return (
    <View style={{ marginTop: 8 }}>
      {d.itens.map((it, i) => (
        <View key={i} style={styles.linhaItem}>
          <View style={styles.itemTexto}>
            {it.imagemUrl ? <Image src={it.imagemUrl} style={styles.itemImagem} /> : null}
            <Text>
              {it.descricao} (x{it.quantidade})
            </Text>
          </View>
          <Text>{formatarMoeda(it.quantidade * it.precoUnitarioCents - it.descontoCents, d.moeda, tag)}</Text>
        </View>
      ))}
      <Text style={[styles.total, accent ? { color: accent } : {}]}>
        {preencher(traduzir("Total: {valor}", idioma), { valor: formatarMoeda(d.totalCents, d.moeda, tag) })}
      </Text>
    </View>
  );
}

function DocumentoPdfDoc({ d }: { d: DocumentoPdfInput }): React.ReactElement {
  const accent = d.marca.accent_hex ?? undefined;
  const idioma = d.idioma ?? IDIOMA_PADRAO;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.titulo, accent ? { color: accent } : {}]}>{d.titulo}</Text>
            {d.previa ? (
              <Text>{traduzir("Prévia — sem número", idioma)}</Text>
            ) : d.numero !== null && d.ano !== null ? (
              <Text>
                {preencher(traduzir("Proposta {numero}", idioma), { numero: `${String(d.numero).padStart(4, "0")}/${d.ano}` })}
                {d.versao > 1 ? ` — v${d.versao}` : ""}
              </Text>
            ) : null}
          </View>
          {d.marca.logoUrl ? (
            <Image src={d.marca.logoUrl} style={styles.logo} />
          ) : d.marca.app_name ? (
            <Text>{d.marca.app_name}</Text>
          ) : null}
        </View>

        <Text>{preencher(traduzir("Para: {nome}", idioma), { nome: d.destinatario.nome })}</Text>

        {blocosDoDocumento(d.secoes).map((bloco, i) =>
          bloco.tipo === "itens" ? (
            <Itens key={`itens-${i}`} d={d} accent={accent} />
          ) : (
            <View key={bloco.secao.id} wrap>
              <Text style={styles.secaoTitulo}>{bloco.secao.title}</Text>
              <Text style={styles.secaoBody}>{bloco.secao.body}</Text>
            </View>
          ),
        )}

        {d.validUntil ? (
          <Text style={{ marginTop: 12 }}>{preencher(traduzir("Válida até {data}", idioma), { data: d.validUntil })}</Text>
        ) : null}
        {d.condicoes ? <Text style={{ marginTop: 8 }}>{d.condicoes}</Text> : null}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${d.marca.app_name ?? traduzir("Proposta comercial", idioma)} — ${preencher(
              traduzir("página {pagina} de {total}", idioma),
              { pagina: pageNumber, total: totalPages },
            )}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderDocumentoPdf(input: DocumentoPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<DocumentoPdfDoc d={input} />);
  return buf as Buffer;
}
