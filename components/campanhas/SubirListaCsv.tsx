"use client";
/**
 * Subir uma lista de contatos (CSV) para esta campanha.
 *
 * O CSV não cria um "tipo novo" de público: as pessoas do arquivo viram contatos
 * (as novas são cadastradas, as que já existiam são reaproveitadas) e esta caixa
 * entrega à campanha a lista de ids deles — `audience_filter.incluir_contatos`.
 * Por isso a lista aparece em Contatos, entra na conta de "Ver quantas pessoas"
 * e passa pelos mesmos vetos de sempre (pediu para sair, sem telefone, já em
 * outra campanha…). Subir planilha não fura opt-out.
 *
 * Controlado: quem guarda a lista é a tela da campanha (nova ou edição).
 */
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImportContacts, type ImportContactsResult } from "@/hooks/contacts/useImportContacts";
import { useT } from "@/hooks/i18n/useT";
import {
  FORMATOS_DE_TELEFONE,
  NOME_DA_PLANILHA_MODELO,
  PLANILHA_MODELO_CSV,
} from "@/lib/campanhas/planilha-modelo";

/** O mesmo teto do filtro de público (`incluir_contatos`). */
const MAXIMO_DA_LISTA = 5000;

interface Props {
  /** Os contatos da lista subida (ids). */
  incluidos: string[];
  onIncluidos: (ids: string[]) => void;
}

function baixarModelo() {
  const blob = new Blob([PLANILHA_MODELO_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = NOME_DA_PLANILHA_MODELO;
  link.click();
  URL.revokeObjectURL(url);
}

export function SubirListaCsv({ incluidos, onIncluidos }: Props) {
  const t = useT();
  const importar = useImportContacts();
  const entrada = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resumo, setResumo] = useState<ImportContactsResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Na ordem de FORMATOS_DE_TELEFONE. Cada frase é literal em `t()` de propósito.
  const explicacoes = [
    t("Recomendado: o sinal de +, o código do país (55), o DDD (11) e o número."),
    t("Só DDD e número: o sistema assume Brasil e acrescenta o +55. Parênteses, espaço e traço são aceitos."),
    t("Com o código 55, sem o +."),
    t("Outro país: escreva sempre o + e o código do país."),
  ];

  async function enviar() {
    if (!arquivo || importar.isPending) return;
    setErro(null);
    try {
      const r = await importar.mutateAsync({ file: arquivo, exigirTelefone: true });
      setResumo(r);
      onIncluidos([...new Set([...incluidos, ...r.contact_ids])].slice(0, MAXIMO_DA_LISTA));
      setArquivo(null);
      if (entrada.current) entrada.current.value = "";
    } catch (err) {
      setResumo(null);
      setErro(
        err instanceof Error && err.message ? t(err.message) : t("Não foi possível ler o arquivo."),
      );
    }
  }

  function tirarALista() {
    onIncluidos([]);
    setResumo(null);
    setErro(null);
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3" data-testid="subir-lista-csv">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("Subir uma lista de contatos (CSV)")}</h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "Quem estiver na planilha entra em Contatos (se já existir, é reaproveitado) e recebe esta campanha.",
            )}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={baixarModelo}>
          {t("Baixar planilha modelo")}
        </Button>
      </div>

      <div className="space-y-2 text-sm">
        <p>
          <strong>{t("Colunas:")}</strong>{" "}
          {t(
            "nome e telefone são o que importa para o WhatsApp. Também aceitamos email, cpf, nascimento e tags (várias etiquetas separadas por |).",
          )}
        </p>
        <div>
          <strong>{t("Como escrever o telefone:")}</strong>
          <ul className="mt-1 space-y-1" data-testid="formatos-de-telefone">
            {FORMATOS_DE_TELEFONE.map((f, i) => (
              <li key={f.exemplo}>
                <code className="rounded-md bg-surface-elevated px-1 font-mono text-xs">{f.exemplo}</code>{" "}
                <span className="text-muted-foreground">— {explicacoes[i]}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground">
          {t(
            "Salve como “CSV UTF-8” (no Excel: Salvar como). Até 500 linhas por arquivo. No Excel, deixe a coluna telefone como Texto — senão ele troca o número por 5,51E+12.",
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="lista-csv">{t("Arquivo CSV")}</Label>
          <Input
            id="lista-csv"
            ref={entrada}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setErro(null);
            }}
          />
        </div>
        <Button type="button" disabled={!arquivo || importar.isPending} onClick={() => void enviar()}>
          {importar.isPending ? t("Lendo a lista…") : t("Enviar lista")}
        </Button>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-error-fg">
          {erro}
        </p>
      )}

      {resumo && (
        <div className="space-y-2 text-sm" data-testid="resumo-da-lista">
          <p>
            {resumo.total_linhas} {t("linha(s) lidas")} · <strong>{resumo.imported}</strong> {t("novo(s) em Contatos")} ·{" "}
            <strong>{resumo.skipped_duplicates}</strong> {t("já existiam")}
            {resumo.errors.length > 0 ? ` · ${resumo.errors.length} ${t("com erro (ficam de fora)")}` : ""}
          </p>
          {resumo.errors.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {resumo.errors.map((e) => (
                <li key={e.linha}>
                  {t("Linha")} {e.linha}: {e.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {incluidos.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-elevated px-3 py-2 text-sm">
          <span data-testid="total-da-lista">
            <strong>{incluidos.length}</strong> {t("pessoa(s) da lista subida neste público")}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={tirarALista}>
            {t("Tirar a lista")}
          </Button>
        </div>
      )}
    </div>
  );
}
