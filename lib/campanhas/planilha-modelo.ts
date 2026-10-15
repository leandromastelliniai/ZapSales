/**
 * A planilha modelo que o operador baixa dentro da campanha — e os formatos de
 * telefone que a tela ensina ao lado dela.
 *
 * Fica em `lib/` (e não dentro do componente) por um motivo: o que a tela
 * PROMETE aceitar tem de ser o que a importação ACEITA. O teste ao lado passa
 * cada linha desta planilha e cada exemplo de telefone pelo mesmo parser da
 * rota (`lib/contacts/csv.ts`). Se alguém trocar o modelo por um formato que a
 * importação recusa, o teste reprova antes de o operador baixar um arquivo que
 * não funciona.
 *
 * Delimitador ";" e BOM de propósito: é o que o Excel em português abre já em
 * colunas, sem assistente de importação. A importação detecta "," e ";" sozinha.
 */

export const NOME_DA_PLANILHA_MODELO = "lista-para-disparo.csv";

const CABECALHO = ["nome", "telefone", "email", "cpf", "nascimento", "tags"];

/** Dados inventados (reservados para exemplo): nenhum CPF ou telefone de pessoa de verdade. */
const LINHAS = [
  ["Maria Souza", "+5511999998888", "maria@exemplo.com", "", "15/03/1990", "cliente|vip"],
  ["João Lima", "(21) 98888-7777", "", "", "", ""],
  ["Ana Costa", "5531977776666", "", "", "", "lead"],
];

/** O conteúdo do arquivo: BOM + cabeçalho + exemplos, separados por ";". */
const BOM = String.fromCharCode(0xfeff);

export const PLANILHA_MODELO_CSV = `${BOM}${[CABECALHO, ...LINHAS].map((l) => l.join(";")).join("\r\n")}\r\n`;

/**
 * As formas de escrever o telefone que a importação lê. A frase que explica cada
 * uma mora no componente (precisa estar em `t("…")` literal para ser traduzida).
 */
export const FORMATOS_DE_TELEFONE: ReadonlyArray<{
  exemplo: string;
  /** Como o número fica guardado (E.164). */
  vira: string;
}> = [
  {
    exemplo: "+5511999998888",
    vira: "+5511999998888",
  },
  {
    exemplo: "(11) 99999-8888",
    vira: "+5511999998888",
  },
  {
    exemplo: "5511999998888",
    vira: "+5511999998888",
  },
  {
    exemplo: "+351912345678",
    vira: "+351912345678",
  },
];
