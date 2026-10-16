import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de aba, botão e campo aqui são os que a tela mostra em cada idioma (`Receber dados` /
 * `Recibir datos` / `Receive data`, `Leads recebidos` / `Leads recibidos` / `Leads received`,
 * `Automações` / `Automatizaciones` / `Automations`, `Atividade` / `Actividad` / `Activity`).
 * Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você recebe contatos que vêm de fora, como os de uma landing page ou de um formulário do seu site, e cria automações que agem sozinhas. Esta tela é para gestores e administradores.",
    passos: [
      "Em Receber dados, use Criar primeira fonte (ou Nova fonte). Dê um nome, escolha o Funil de entrada e o Estágio de entrada onde o contato novo vai cair.",
      "Abra a fonte e copie o Endereço da fonte ou o Formulário pronto para colar no seu site (Copiar formulário). Cole no site: cada envio vira um lead no funil.",
      "Ainda na fonte, Enviar lead de teste mostra se está funcionando (com a assinatura ligada, o teste precisa partir do sistema que envia os dados), e Últimos recebimentos lista o que já chegou.",
      "Em Leads recebidos, confira cada envio e o Resultado dele, com filtros por Fonte e por data.",
      "Em Automações, Nova automação cria uma regra do tipo \"quando acontecer isto, faça aquilo\". Em Atividade, veja o histórico do que rodou e use Reenviar se um aviso para outro sistema falhou.",
    ],
    termos: [
      { termo: "Fonte", significa: "Cada ponto de entrada de contatos, como uma landing page. Pausada, ela para de aceitar novos envios." },
      { termo: "Assinatura (HMAC)", significa: "Uma proteção opcional: o sistema que envia os dados os assina com um segredo, e a fonte recusa envios que não conferem. O segredo aparece uma vez só, então guarde-o na hora." },
      { termo: "Reenvio", significa: "O mesmo envio chegou de novo. O sistema reconhece e não cria um lead repetido." },
      { termo: "Automações", significa: "Regras que fazem algo sozinhas quando um evento acontece, como mandar uma mensagem quando entra um contato novo." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí recibes contactos que vienen de afuera, como los de una landing page o de un formulario de tu sitio, y creas automatizaciones que actúan solas. Esta pantalla es para gestores y administradores.",
    passos: [
      "En Recibir datos, usa Crear tu primera fuente (o Nueva fuente). Ponle un nombre, elige el Embudo de entrada y la Etapa de entrada donde caerá el contacto nuevo.",
      "Abre la fuente y copia la Dirección de la fuente o el Formulario listo para pegar en tu sitio (Copiar formulario). Pégalo en el sitio: cada envío se convierte en un lead en el embudo.",
      "Dentro de la fuente, Enviar lead de prueba muestra si está funcionando (con la firma activada, la prueba debe salir del sistema que envía los datos), y Últimos recibidos lista lo que ya llegó.",
      "En Leads recibidos, revisa cada envío y su Resultado, con filtros por Fuente y por fecha.",
      "En Automatizaciones, Nueva automatización crea una regla del tipo \"cuando pase esto, haz aquello\". En Actividad, mira el historial de lo que corrió y usa Reenviar si falló un aviso a otro sistema.",
    ],
    termos: [
      { termo: "Fuente", significa: "Cada punto de entrada de contactos, como una landing page. Pausada, deja de aceptar envíos nuevos." },
      { termo: "Firma (HMAC)", significa: "Una protección opcional: el sistema que envía los datos los firma con un secreto, y la fuente rechaza los envíos que no coinciden. El secreto aparece una sola vez, así que guárdalo en el momento." },
      { termo: "Reenvío", significa: "El mismo envío llegó de nuevo. El sistema lo reconoce y no crea un lead repetido." },
      { termo: "Automatizaciones", significa: "Reglas que hacen algo solas cuando ocurre un evento, como mandar un mensaje cuando entra un contacto nuevo." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you receive contacts that come from outside, like those from a landing page or a form on your site, and create automations that act on their own. This screen is for managers and administrators.",
    passos: [
      "Under Receive data, use Create first source (or New source). Give it a name and choose the Entry pipeline and the Entry stage where the new contact will land.",
      "Open the source and copy the Source address or the Form ready to paste into your site (Copy form). Paste it on the site: each submission becomes a lead in the pipeline.",
      "Still on the source, Send test lead shows whether it works (with the signature on, the test must come from the system that sends the data), and Latest received lists what has already arrived.",
      "Under Leads received, check each submission and its Result, with filters by Source and by date.",
      "Under Automations, New automation creates a rule of the kind \"when this happens, do that\". Under Activity, see the history of what ran and use Resend if a notice to another system failed.",
    ],
    termos: [
      { termo: "Source", significa: "Each entry point for contacts, like a landing page. Paused, it stops accepting new submissions." },
      { termo: "Signature (HMAC)", significa: "An optional protection: the system sending the data signs it with a secret, and the source rejects submissions that do not match. The secret shows up only once, so save it right away." },
      { termo: "Resend", significa: "The same submission arrived again. The system recognizes it and does not create a duplicate lead." },
      { termo: "Automations", significa: "Rules that do something on their own when an event happens, like sending a message when a new contact comes in." },
    ],
  },
};

export default ajuda;
