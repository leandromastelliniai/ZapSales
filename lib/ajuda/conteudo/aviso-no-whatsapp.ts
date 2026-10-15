import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de campo e de botão aqui são os que a tela mostra em cada idioma (`Conexão que envia os avisos` /
 * `Conexión que envía los avisos` / `Connection that sends alerts`, `Enviar aviso de teste` /
 * `Enviar aviso de prueba` / `Send test alert`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você escolhe um número da equipe para receber uma mensagem no WhatsApp toda vez que o assistente travar e precisar de uma pessoa. A tela é só para Administrador.",
    passos: [
      "Leia primeiro os recados no alto da página, se houver. Cada um explica uma situação em que o aviso não sairia, como nenhum número conectado.",
      "Em Conexão que envia os avisos, escolha um número já conectado. Só aparecem os que conseguem mandar mensagem a qualquer hora.",
      "Em Número que recebe os avisos, digite o telefone começando pelo código do país. Um celular do Brasil fica +55, DDD e número. Se quiser, dê um nome em Como chamar esse número (opcional).",
      "Ligue Receber avisos no WhatsApp e use Salvar. A chave só destrava com uma conexão e um número completo.",
      "Use Enviar aviso de teste para conferir. É uma mensagem de verdade e conta no limite diário do número. Em Últimos avisos enviados você vê o que saiu e o que falhou.",
    ],
    termos: [
      { termo: "Caso", significa: "O pedido em que o assistente travou e precisa de uma pessoa. O aviso sai quando ele abre o caso e não se repete quando o cliente responde." },
      { termo: "Conexão que envia os avisos", significa: "O número conectado do qual a mensagem sai. Pode ser o mesmo que atende clientes, mas um número só para avisos é mais seguro." },
      { termo: "Número que recebe os avisos", significa: "O celular da pessoa ou do plantão da equipe. O que esse número mandar deixa de virar atendimento." },
      { termo: "Aquecimento", significa: "Número novo começa mandando poucas mensagens por dia e vai aumentando por cerca de um mês, para o WhatsApp não bloqueá-lo." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí eliges un número del equipo para recibir un mensaje por WhatsApp cada vez que el asistente se trabe y necesite a una persona. La pantalla es solo para Administrador.",
    passos: [
      "Lee primero los avisos al inicio de la página, si los hay. Cada uno explica una situación en que el aviso no saldría, como no tener ningún número conectado.",
      "En Conexión que envía los avisos, elige un número ya conectado. Solo aparecen los que pueden mandar mensajes a cualquier hora.",
      "En Número que recibe los avisos, escribe el teléfono empezando por el código del país. Un celular de Brasil queda +55, código de área y número. Si quieres, ponle un nombre en Cómo llamar a ese número (opcional).",
      "Activa Recibir avisos por WhatsApp y usa Guardar. El interruptor solo se desbloquea con una conexión y un número completo.",
      "Usa Enviar aviso de prueba para comprobarlo. Es un mensaje de verdad y cuenta en el límite diario del número. En Últimos avisos enviados ves lo que salió y lo que falló.",
    ],
    termos: [
      { termo: "Caso", significa: "El pedido en que el asistente se trabó y necesita a una persona. El aviso sale cuando abre el caso y no se repite cuando el cliente responde." },
      { termo: "Conexión que envía los avisos", significa: "El número conectado desde el cual sale el mensaje. Puede ser el mismo que atiende a clientes, pero un número solo para avisos es más seguro." },
      { termo: "Número que recibe los avisos", significa: "El celular de la persona o de la guardia del equipo. Lo que ese número envíe deja de convertirse en atención." },
      { termo: "Calentamiento", significa: "Un número nuevo empieza mandando pocos mensajes por día y va aumentando durante cerca de un mes, para que WhatsApp no lo bloquee." },
    ],
  },
  en: {
    oQueMostra:
      "Here you pick a team number to receive a WhatsApp message every time the assistant gets stuck and needs a person. The screen is for Administrators only.",
    passos: [
      "First read the notes at the top of the page, if there are any. Each one explains a situation where the alert would not go out, such as having no connected number.",
      "Under Connection that sends alerts, pick a number that is already connected. Only the ones that can send a message at any hour appear.",
      "Under Number that receives alerts, type the phone starting with the country code. A Brazilian mobile looks like +55, area code and number. If you like, give it a name under What to call this number (optional).",
      "Turn on Receive alerts on WhatsApp and use Save. The switch only unlocks with a connection and a complete number.",
      "Use Send test alert to check. It is a real message and counts toward the number's daily limit. Under Latest alerts sent you see what went out and what failed.",
    ],
    termos: [
      { termo: "Case", significa: "The request where the assistant got stuck and needs a person. The alert goes out when it opens the case and is not repeated when the customer answers." },
      { termo: "Connection that sends alerts", significa: "The connected number the message goes out from. It can be the same one that serves customers, but a number just for alerts is safer." },
      { termo: "Number that receives alerts", significa: "The mobile phone of the person or on-call duty of the team. Whatever this number sends stops turning into a conversation." },
      { termo: "Warming up", significa: "A new number starts by sending few messages a day and grows over about a month, so WhatsApp does not block it." },
    ],
  },
};

export default ajuda;
