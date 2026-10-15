import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de coluna, de categoria e de botão aqui são os que a tela mostra em cada idioma
 * (`Nova mensagem` / `Mensaje nuevo` / `New message`, `Trocar som` / `Cambiar sonido` / `Change sound`).
 * As colunas Email, In-app e Push têm o mesmo nome nos três idiomas. Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você escolhe como quer ser avisado de cada tipo de acontecimento, como uma nova mensagem ou um lead ganho. Todo mundo vê esta tela, e cada pessoa escolhe os seus avisos.",
    passos: [
      "Na tabela, cada linha é um tipo de aviso (Nova mensagem, Lead atribuído a você, Ligação recebida e outros).",
      "Ligue ou desligue In-app para ver o aviso na tela enquanto usa o sistema.",
      "Ligue Push para receber o aviso na bandeja do computador ou do celular. Na primeira vez, o navegador pede a sua permissão.",
      "A coluna Email aparece desligada: avisos por e-mail ainda não estão disponíveis.",
      "Em Sons dos avisos, Ouvir toca o som atual. Gestores e administradores podem usar Trocar som ou Usar o do sistema.",
    ],
    termos: [
      { termo: "In-app", significa: "O aviso que aparece dentro do próprio sistema, com a página aberta." },
      { termo: "Push", significa: "O aviso na bandeja do computador ou do celular. Com a página aberta funciona sempre; para chegar com ela fechada, quem cuida do servidor precisa fazer uma configuração única, que a tela explica quando falta." },
      { termo: "Central", significa: "A lista de avisos do sistema. Os sons tocam quando um aviso novo chega nela." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí eliges cómo quieres que te avisen de cada tipo de suceso, como un mensaje nuevo o un lead ganado. Todos ven esta pantalla, y cada persona elige sus propios avisos.",
    passos: [
      "En la tabla, cada fila es un tipo de aviso (Mensaje nuevo, Lead asignado a ti, Llamada recibida y otros).",
      "Activa o desactiva In-app para ver el aviso en la pantalla mientras usas el sistema.",
      "Activa Push para recibir el aviso en la bandeja del computador o del celular. La primera vez, el navegador te pide permiso.",
      "La columna Email aparece desactivada: los avisos por correo todavía no están disponibles.",
      "En Sonidos de los avisos, Escuchar reproduce el sonido actual. Los gestores y administradores pueden usar Cambiar sonido o Usar el del sistema.",
    ],
    termos: [
      { termo: "In-app", significa: "El aviso que aparece dentro del propio sistema, con la página abierta." },
      { termo: "Push", significa: "El aviso en la bandeja del computador o del celular. Con la página abierta funciona siempre; para que llegue con ella cerrada, quien cuida el servidor debe hacer una configuración única, que la pantalla explica cuando falta." },
      { termo: "Central", significa: "La lista de avisos del sistema. Los sonidos suenan cuando llega un aviso nuevo a ella." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you choose how you want to be notified about each kind of event, such as a new message or a won lead. Everyone sees this screen, and each person picks their own alerts.",
    passos: [
      "In the table, each row is a kind of alert (New message, Lead assigned to you, Incoming call and others).",
      "Turn In-app on or off to see the alert on screen while you use the system.",
      "Turn Push on to get the alert in your computer's or phone's tray. The first time, the browser asks for your permission.",
      "The Email column shows as off: email alerts are not available yet.",
      "Under Alert sounds, Listen plays the current sound. Managers and administrators can use Change sound or Use the system one.",
    ],
    termos: [
      { termo: "In-app", significa: "The alert that appears inside the system itself, while the page is open." },
      { termo: "Push", significa: "The alert in your computer's or phone's tray. It always works with the page open; to arrive with it closed, whoever looks after the server must do a one-time setup, which the screen explains when it is missing." },
      { termo: "Notification center", significa: "The system's list of alerts. The sounds play when a new alert arrives in it." },
    ],
  },
};

export default ajuda;
