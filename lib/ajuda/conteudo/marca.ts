import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de campo e de botão aqui são os que a tela mostra em cada idioma
 * (`Nome da sua empresa` / `Nombre de tu empresa` / `Your company's name`, `Salvar` / `Guardar` / `Save`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você escolhe o nome, a cor e o logo que a sua empresa mostra para quem trabalha dentro do sistema. Só administradores abrem esta tela.",
    passos: [
      "Escreva o Nome da sua empresa. Ele aparece no menu lateral; em branco, vale o nome que o sistema já usa.",
      "Em Cor da sua marca, digite um código de cor, como #7a5cd6, ou escolha a cor pelo quadradinho. Em branco volta à cor que o sistema já usa. Logo abaixo a tela mostra a escala de tons e a cor dos botões nos modos claro e escuro.",
      "Em Logo, envie uma imagem PNG ou JPG de até 512 KB. O logo sobe na hora, sem passar pelo Salvar. Se quiser, envie também um Logo para o tema escuro (opcional). Remover volta ao logo anterior.",
      "Em De onde vem cada coisa, confira se o nome, a cor e o logo vêm do que você definiu, do padrão do sistema ou de quem instalou o sistema.",
      "Clique em Salvar para gravar o nome e a cor. Leia O que isto ainda não muda para saber onde o nome do sistema continua aparecendo.",
    ],
    termos: [
      { termo: "Código de cor", significa: "Um código que começa com # e tem 6 letras ou números, como #7a5cd6. Ele diz ao sistema qual é a cor exata." },
      { termo: "Logo para o tema escuro", significa: "Uma versão do logo que se lê bem sobre fundo escuro. Sem ela, o sistema usa o logo comum." },
      { termo: "Modo claro e modo escuro", significa: "As duas aparências do sistema: fundo claro ou fundo escuro. A tela mostra a cor dos botões em cada uma." },
      { termo: "De onde vem cada coisa", significa: "Mostra se o nome, a cor e o logo foram definidos por você, são o padrão do sistema ou vieram de quem instalou." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí eliges el nombre, el color y el logo que tu empresa muestra a quienes trabajan dentro del sistema. Solo los administradores abren esta pantalla.",
    passos: [
      "Escribe el Nombre de tu empresa. Aparece en el menú lateral; en blanco, vale el nombre que el sistema ya usa.",
      "En Color de tu marca, escribe un código de color, como #7a5cd6, o elige el color con el cuadradito. En blanco vuelve al color que el sistema ya usa. Justo debajo la pantalla muestra la escala de tonos y el color de los botones en los modos claro y oscuro.",
      "En Logo, envía una imagen PNG o JPG de hasta 512 KB. El logo se sube al instante, sin pasar por Guardar. Si quieres, envía también un Logo para el tema oscuro (opcional). Quitar vuelve al logo anterior.",
      "En De dónde viene cada cosa, revisa si el nombre, el color y el logo vienen de lo que definiste, del estándar del sistema o de quien instaló el sistema.",
      "Haz clic en Guardar para grabar el nombre y el color. Lee Lo que esto todavía no cambia para saber dónde sigue apareciendo el nombre del sistema.",
    ],
    termos: [
      { termo: "Código de color", significa: "Un código que empieza con # y tiene 6 letras o números, como #7a5cd6. Le dice al sistema cuál es el color exacto." },
      { termo: "Logo para el tema oscuro", significa: "Una versión del logo que se lee bien sobre fondo oscuro. Sin ella, el sistema usa el logo común." },
      { termo: "Modo claro y modo oscuro", significa: "Las dos apariencias del sistema: fondo claro o fondo oscuro. La pantalla muestra el color de los botones en cada una." },
      { termo: "De dónde viene cada cosa", significa: "Muestra si el nombre, el color y el logo los definiste tú, son el estándar del sistema o vinieron de quien instaló." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you choose the name, color and logo your company shows to the people who work inside the system. Only administrators can open this screen.",
    passos: [
      "Type Your company's name. It appears in the sidebar menu; if left blank, the name the system already uses applies.",
      "Under Your brand color, type a color code, such as #7a5cd6, or pick the color with the small square. Blank goes back to the color the system already uses. Right below, the screen shows the color scale and the button color in light and dark mode.",
      "Under Logo, upload a PNG or JPG image of up to 512 KB. The logo uploads right away, without going through Save. If you want, also upload a Logo for dark theme (optional). Remove goes back to the previous logo.",
      "Under Where each thing comes from, check whether the name, color and logo come from what you set, from the system default or from whoever installed the system.",
      "Click Save to store the name and color. Read What this doesn't change yet to see where the system's name still appears.",
    ],
    termos: [
      { termo: "Color code", significa: "A code that starts with # and has 6 letters or numbers, such as #7a5cd6. It tells the system the exact color." },
      { termo: "Logo for dark theme", significa: "A version of the logo that reads well on a dark background. Without it, the system uses the regular logo." },
      { termo: "Light and dark mode", significa: "The system's two looks: light background or dark background. The screen shows the button color in each." },
      { termo: "Where each thing comes from", significa: "Shows whether the name, color and logo were set by you, are the system default, or came from whoever installed it." },
    ],
  },
};

export default ajuda;
