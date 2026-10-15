import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão e de campo aqui são os que a tela mostra em cada idioma (`Adicionar material` /
 * `Agregar material` / `Add material`, `Preparar de novo` / `Preparar de nuevo` / `Prepare again`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "É a biblioteca de materiais do seu negócio que os assistentes consultam antes de responder. Cada assistente escolhe, na tela dele, o que pode ler daqui.",
    passos: [
      "Olhe a faixa no topo: ela diz se há uma chave de embedding. Sem a chave, o material é guardado mas fica esperando. Se faltar, use Cadastrar a chave aqui ou veja todas em IA › Credenciais.",
      "Clique em Adicionar material, escolha Que tipo de material é (Perguntas e respostas ou Documento), dê um Nome do material e envie um arquivo ou cole o texto.",
      "Em Perguntas e respostas, escreva uma linha ## Pergunta: e uma ## Resposta: por item, separados por uma linha em branco. Depois clique em Adicionar ao acervo.",
      "Acompanhe no Estado da base de conhecimento quantos materiais estão prontos, preparando ou com erro. Se um deles falhar, o cartão mostra Por que não entrou.",
      "Em cada cartão há Preparar de novo, Ver o que ele aprendeu e Arquivar. Em perguntas e respostas também há Editar conteúdo. Consultado por mostra quais assistentes usam o material, e arquivar tira o material da consulta sem apagá-lo.",
    ],
    termos: [
      { termo: "Chave de embedding", significa: "Uma chave de um serviço de IA, usada para preparar a busca nos seus materiais. Sem ela, o agente não aprende o que você cadastrou." },
      { termo: "Preparar", significa: "Quando o material é lido e organizado para o agente conseguir buscá-lo na hora de responder. O cartão mostra quando foi Preparado." },
      { termo: "Trechos", significa: "Os pedaços do material que o agente pode encontrar. O cartão mostra a quantidade na linha Trechos que o agente encontra." },
    ],
  },
  es: {
    oQueMostra:
      "Es la biblioteca de materiales de tu negocio que los asistentes consultan antes de responder. Cada asistente elige, en su pantalla, qué puede leer de aquí.",
    passos: [
      "Mira la franja de arriba: dice si hay una clave de embeddings. Sin la clave, el material se guarda pero queda en espera. Si falta, usa Registrar la clave aquí o mira todas en IA › Credenciales.",
      "Haz clic en Agregar material, elige Qué tipo de material es (Preguntas y respuestas o Documento), escribe un Nombre del material y envía un archivo o pega el texto.",
      "En Preguntas y respuestas, escribe una línea ## Pergunta: y una ## Resposta: por elemento (esos marcadores se escriben en portugués), separados por una línea en blanco. Luego haz clic en Agregar al acervo.",
      "Sigue en Estado de la base de conocimiento cuántos materiales están listos, preparando o con error. Si uno falla, la tarjeta muestra Por qué no entró.",
      "En cada tarjeta hay Preparar de nuevo, Ver lo que aprendió y Archivar. En preguntas y respuestas también hay Editar contenido. Consultado por muestra qué asistentes usan el material, y archivar lo saca de la consulta sin borrarlo.",
    ],
    termos: [
      { termo: "Clave de embeddings", significa: "Una clave de un servicio de IA, usada para preparar la búsqueda en tus materiales. Sin ella, el agente no aprende lo que registraste." },
      { termo: "Preparar", significa: "Cuando el material se lee y se organiza para que el agente pueda buscarlo al responder. La tarjeta muestra cuándo fue Preparado." },
      { termo: "Fragmentos", significa: "Los pedazos del material que el agente puede encontrar. La tarjeta muestra la cantidad en la línea Fragmentos que el agente encuentra." },
    ],
  },
  en: {
    oQueMostra:
      "This is the library of your business materials that the assistants check before answering. Each assistant chooses, on its own screen, what it can read from here.",
    passos: [
      "Look at the strip at the top: it says whether there is an embedding key. Without the key, the material is saved but stays waiting. If it is missing, use Register the key here or see all of them in AI › Credentials.",
      "Click Add material, choose What type of material this is (Questions and answers or Document), enter a Material name and send a file or paste the text.",
      "In Questions and answers, write one line ## Pergunta: and one ## Resposta: per item (these markers are written in Portuguese), separated by a blank line. Then click Add to the library.",
      "Follow the Knowledge base status to see how many materials are ready, preparing or with error. If one fails, its card shows Why it wasn't included.",
      "Each card has Prepare again, See what it learned and Archive. Questions and answers also have Edit content. Looked up by shows which assistants use the material, and archiving takes the material out of use without deleting it.",
    ],
    termos: [
      { termo: "Embedding key", significa: "A key to an AI service, used to prepare the search over your materials. Without it, the agent does not learn what you registered." },
      { termo: "Prepare", significa: "When the material is read and organized so the agent can search it while answering. The card shows when it was Prepared." },
      { termo: "Snippets", significa: "The pieces of the material the agent can find. The card shows the amount on the Snippets the agent finds line." },
    ],
  },
};

export default ajuda;
