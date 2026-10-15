import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de campo e de botão aqui são os que a tela mostra em cada idioma
 * (`Conta de anúncios` / `Cuenta publicitaria` / `Ad account`, `Atualizar` / `Actualizar` / `Refresh`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você vê o que os anúncios do Meta (Facebook e Instagram) estão entregando: quanto gastaram e quanta gente trouxeram. Os números vêm do Meta na hora em que você clica em Atualizar, e nada fica guardado no sistema. Só gerentes e administradores abrem esta tela.",
    passos: [
      "Se aparecer \"Nenhuma conta de anúncios conectada\", peça a quem administra para conectar a conta em Configurações › Meta Ads.",
      "Escolha a Conta de anúncios que quer ver.",
      "Escolha o Período: 7, 14, 30 ou 90 dias, ou Personalizado, que pede a data de início e a de fim.",
      "Clique em Atualizar para buscar os números no Meta. A tela mostra o intervalo lido e a hora da leitura.",
      "Leia a tabela de campanhas. Se o Meta recusar a consulta, a tela explica o motivo e o que fazer, como gerar um token novo ou esperar alguns minutos.",
    ],
    termos: [
      { termo: "Conta de anúncios", significa: "A conta no Meta onde os seus anúncios são criados e pagos." },
      { termo: "Token de acesso", significa: "Uma chave que autoriza o sistema a ler os números dos anúncios. Ele só precisa de permissão de leitura." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí ves lo que los anuncios de Meta (Facebook e Instagram) están entregando: cuánto gastaron y cuánta gente trajeron. Los números vienen de Meta en el momento en que haces clic en Actualizar, y nada queda guardado en el sistema. Solo gerentes y administradores abren esta pantalla.",
    passos: [
      "Si aparece \"Ninguna cuenta publicitaria conectada\", pide a quien administra que conecte la cuenta en Configuración › Meta Ads.",
      "Elige la Cuenta publicitaria que quieres ver.",
      "Elige el Período: 7, 14, 30 o 90 días, o Personalizado, que pide la fecha de inicio y la de fin.",
      "Haz clic en Actualizar para buscar los números en Meta. La pantalla muestra el intervalo leído y la hora de la lectura.",
      "Lee la tabla de campañas. Si Meta rechaza la consulta, la pantalla explica el motivo y qué hacer, como generar un token nuevo o esperar unos minutos.",
    ],
    termos: [
      { termo: "Cuenta publicitaria", significa: "La cuenta en Meta donde se crean y se pagan tus anuncios." },
      { termo: "Token de acceso", significa: "Una llave que autoriza al sistema a leer los números de los anuncios. Solo necesita permiso de lectura." },
    ],
  },
  en: {
    oQueMostra:
      "Here you see what your Meta ads (Facebook and Instagram) are delivering: how much they spent and how many people they brought in. The numbers come from Meta the moment you click Refresh, and nothing is stored in the system. Only managers and administrators can open this screen.",
    passos: [
      "If you see \"No ad account connected\", ask whoever administers the system to connect the account under Settings › Meta Ads.",
      "Choose the Ad account you want to see.",
      "Choose the Period: 7, 14, 30 or 90 days, or Custom, which asks for the start and end dates.",
      "Click Refresh to fetch the numbers from Meta. The screen shows the range read and the time of the reading.",
      "Read the campaign table. If Meta refuses the request, the screen explains why and what to do, such as generating a new token or waiting a few minutes.",
    ],
    termos: [
      { termo: "Ad account", significa: "The account on Meta where your ads are created and paid for." },
      { termo: "Access token", significa: "A key that lets the system read your ad numbers. It only needs read permission." },
    ],
  },
};

export default ajuda;
