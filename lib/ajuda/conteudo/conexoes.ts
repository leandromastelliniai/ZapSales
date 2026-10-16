import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de aba e de botão são os da tela em cada idioma (`Números por QR` / `Numbers via QR`,
 * `Conectar novo WhatsApp` / `Conectar un WhatsApp nuevo` / `Connect new WhatsApp`). Mudou o rótulo, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Conexões é por onde o seu negócio fala com o cliente. Aqui você liga os números de WhatsApp ao sistema e acompanha se cada um está funcionando.",
    passos: [
      "Em Números por QR, use Conectar novo WhatsApp e leia o código com o celular, como no WhatsApp Web. É o jeito mais simples de começar a atender.",
      "Na aba API Oficial (Meta), conecte o número oficial da Meta. É o caminho recomendado para campanhas em massa.",
      "Use Atualizar saúde para conferir se cada número está de pé. Um número desconectado deixa de receber e de enviar mensagens.",
      "Número novo começa em modo de teste: ele não responde sozinho até você autorizar números ou liberar o público.",
      "Em Configurar responsáveis por número, você define quem atende as conversas de cada número.",
    ],
    termos: [
      { termo: "QR", significa: "O código que você lê com o celular para ligar um número, igual ao WhatsApp Web." },
      { termo: "API Oficial", significa: "A conexão aprovada pela Meta, própria para disparos em massa, com regras e limites da Meta." },
      { termo: "Saúde", significa: "Se o número está conectado e respondendo. Quando cai, aparece aqui e num aviso no topo da tela." },
    ],
  },
  es: {
    oQueMostra:
      "Conexiones es por donde tu negocio habla con el cliente. Aquí conectas los números de WhatsApp al sistema y ves si cada uno está funcionando.",
    passos: [
      "En Números por QR, usa Conectar un WhatsApp nuevo y lee el código con el celular, como en WhatsApp Web. Es la forma más simple de empezar a atender.",
      "En la pestaña API Oficial (Meta), conecta el número oficial de Meta. Es el camino recomendado para campañas masivas.",
      "Usa Actualizar salud para comprobar que cada número está activo. Un número desconectado deja de recibir y enviar mensajes.",
      "Un número nuevo empieza en modo de prueba: no responde solo hasta que autorices números o abras al público.",
      "En Configurar responsables por número, defines quién atiende las conversaciones de cada número.",
    ],
    termos: [
      { termo: "QR", significa: "El código que lees con el celular para conectar un número, igual que en WhatsApp Web." },
      { termo: "API Oficial", significa: "La conexión aprobada por Meta, propia para envíos masivos, con las reglas y límites de Meta." },
      { termo: "Salud", significa: "Si el número está conectado y respondiendo. Cuando se cae, aparece aquí y en un aviso en la parte superior de la pantalla." },
    ],
  },
  en: {
    oQueMostra:
      "Connections is how your business talks to customers. Here you link WhatsApp numbers to the system and see whether each one is working.",
    passos: [
      "Under Numbers via QR, use Connect new WhatsApp and scan the code with your phone, like WhatsApp Web. It is the simplest way to start answering.",
      "On the Official API (Meta) tab, connect Meta's official number. It is the recommended route for mass campaigns.",
      "Use Refresh health to check each number is up. A disconnected number stops receiving and sending messages.",
      "A new number starts in test mode: it does not reply on its own until you authorize numbers or open it to the public.",
      "Under Configure owners by number, you set who handles each number's conversations.",
    ],
    termos: [
      { termo: "QR", significa: "The code you scan with your phone to link a number, just like WhatsApp Web." },
      { termo: "Official API", significa: "The Meta-approved connection, built for mass sending, with Meta's own rules and limits." },
      { termo: "Health", significa: "Whether the number is connected and responding. When it drops, it shows up here and in a banner at the top of the screen." },
    ],
  },
};

export default ajuda;
