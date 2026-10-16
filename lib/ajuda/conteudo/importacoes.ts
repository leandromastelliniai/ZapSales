import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de coluna aqui são os que a tela mostra em cada idioma (`Importar` / `Importar` /
 * `Import`, `Conflitos` / `Conflictos` / `Conflicts`, `Só conflitos` / `Solo conflictos` / `Conflicts only`).
 * Mudou o rótulo na tela, muda aqui. Os nomes de coluna da planilha vêm de `ALIASES` em
 * `lib/crm-b2b/spreadsheet.ts`.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você traz uma planilha com empresas, pessoas e telefones de uma vez só. A lista abaixo guarda cada importação já feita, com quantas linhas deram certo, tiveram conflito ou falharam.",
    passos: [
      "Prepare uma planilha .csv ou .xlsx com a primeira linha de títulos. O sistema reconhece as colunas pelo título, como Empresa, CNPJ, Pessoa, Cargo, Telefone e E-mail. O limite é de 2 MB e 2.000 linhas.",
      "Em Arquivo, escolha a planilha e use Importar. Só gestores e administradores conseguem importar.",
      "Quando terminar, a tela diz quantas linhas entraram, quantas tiveram conflito e quantas falharam. A importação aparece na lista com Status, Linhas, Sucesso, Conflitos, Falhas e Data.",
      "Clique no nome do arquivo para ver linha por linha, com o motivo do problema na coluna Erro. Marque Só conflitos para ver apenas essas linhas.",
      "O que entrou aparece em Empresas, Pessoas e Contatos.",
    ],
    termos: [
      { termo: "Lote", significa: "Cada planilha enviada. Fica registrado com o resultado, para você conferir depois." },
      { termo: "Conflitos", significa: "Linhas que o sistema não importou porque o telefone já está ligado a outra pessoa. Nada é sobrescrito." },
      { termo: "Falhas", significa: "Linhas com problema, como telefone inválido ou linha vazia. O motivo aparece na coluna Erro." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí traes una planilla con empresas, personas y teléfonos de una sola vez. La lista de abajo guarda cada importación ya hecha, con cuántas filas salieron bien, tuvieron conflicto o fallaron.",
    passos: [
      "Prepara una planilla .csv o .xlsx con la primera fila de títulos. El sistema reconoce las columnas por el título, como Empresa, CNPJ, Pessoa, Cargo, Telefone y E-mail (los títulos en portugués). El límite es de 2 MB y 2.000 filas.",
      "En Archivo, elige la planilla y usa Importar. Solo gestores y administradores pueden importar.",
      "Al terminar, la pantalla dice cuántas filas entraron, cuántas tuvieron conflicto y cuántas fallaron. La importación aparece en la lista con Estado, Filas, Éxito, Conflictos, Fallas y Fecha.",
      "Haz clic en el nombre del archivo para ver fila por fila, con el motivo del problema en la columna Error. Marca Solo conflictos para ver solo esas filas.",
      "Lo que entró aparece en Empresas, Personas y Contactos.",
    ],
    termos: [
      { termo: "Lote", significa: "Cada planilla enviada. Queda registrada con el resultado, para que la revises después." },
      { termo: "Conflictos", significa: "Filas que el sistema no importó porque el teléfono ya está vinculado a otra persona. No se sobrescribe nada." },
      { termo: "Fallas", significa: "Filas con problema, como un teléfono inválido o una fila vacía. El motivo aparece en la columna Error." },
    ],
  },
  en: {
    oQueMostra:
      "Here you bring in a spreadsheet with companies, people and phone numbers all at once. The list below keeps every import already done, with how many rows worked, had a conflict or failed.",
    passos: [
      "Prepare a .csv or .xlsx spreadsheet with a first row of titles. The system recognizes the columns by their title, such as company, cnpj, person, job_title, phone and email. The limit is 2 MB and 2,000 rows.",
      "Under File, choose the spreadsheet and use Import. Only managers and administrators can import.",
      "When it finishes, the screen says how many rows went in, how many had a conflict and how many failed. The import shows up in the list with Status, Rows, Success, Conflicts, Failures and Date.",
      "Click the file name to see it row by row, with the reason for the problem in the Error column. Tick Conflicts only to see just those rows.",
      "What came in shows up in Companies, People and Contacts.",
    ],
    termos: [
      { termo: "Batch", significa: "Each spreadsheet you send. It stays on record with its result, so you can check it later." },
      { termo: "Conflicts", significa: "Rows the system did not import because the phone number is already linked to another person. Nothing is overwritten." },
      { termo: "Failures", significa: "Rows with a problem, such as an invalid phone number or an empty row. The reason appears in the Error column." },
    ],
  },
};

export default ajuda;
