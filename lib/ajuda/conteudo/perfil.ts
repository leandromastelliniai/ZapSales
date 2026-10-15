import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de campo e de botão aqui são os que a tela mostra em cada idioma
 * (`Nome completo` / `Nombre completo` / `Full name`, `Fuso horário` / `Zona horaria` / `Time zone`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os seus dados pessoais no sistema: nome, idioma, fuso horário e foto. Cada pessoa vê e muda só o próprio perfil, e qualquer papel pode abrir esta tela.",
    passos: [
      "Confira o Email. Ele aparece cinza porque ainda não dá para trocá-lo por aqui.",
      "Escreva o seu Nome completo.",
      "Em Idioma, escolha o seu ou deixe Seguir o idioma da empresa. Em Fuso horário, escolha o da sua região.",
      "Em Avatar URL, cole o endereço público de uma imagem para usar de foto. Enviar arquivo ainda não está disponível.",
      "Clique em Salvar. A tela avisa quando o perfil foi atualizado.",
    ],
    termos: [
      { termo: "Avatar", significa: "A sua foto ou imagem de perfil, que as outras pessoas da equipe veem." },
      { termo: "URL pública", significa: "O endereço de uma imagem na internet que qualquer pessoa consegue abrir, sem precisar de senha." },
      { termo: "Fuso horário", significa: "A região do mundo cujo horário você usa. Quem trabalha em outra região escolhe outro." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están tus datos personales en el sistema: nombre, idioma, zona horaria y foto. Cada persona ve y cambia solo su propio perfil, y cualquier rol puede abrir esta pantalla.",
    passos: [
      "Revisa el Email. Aparece en gris porque todavía no se puede cambiar desde aquí.",
      "Escribe tu Nombre completo.",
      "En Idioma, elige el tuyo o deja Seguir el idioma de la empresa. En Zona horaria, elige la de tu región.",
      "En URL de avatar, pega la dirección pública de una imagen para usarla de foto. Subir un archivo todavía no está disponible.",
      "Haz clic en Guardar. La pantalla avisa cuando el perfil se actualizó.",
    ],
    termos: [
      { termo: "Avatar", significa: "Tu foto o imagen de perfil, que ven las demás personas del equipo." },
      { termo: "URL pública", significa: "La dirección de una imagen en internet que cualquiera puede abrir, sin necesitar contraseña." },
      { termo: "Zona horaria", significa: "La región del mundo cuyo horario usas. Quien trabaja en otra región elige otra." },
    ],
  },
  en: {
    oQueMostra:
      "This is where your personal details in the system live: name, language, time zone and photo. Each person sees and changes only their own profile, and any role can open this screen.",
    passos: [
      "Check the Email. It is grey because it cannot be changed from here yet.",
      "Type your Full name.",
      "Under Language, choose yours or leave Follow the company's language. Under Time zone, choose the one for your region.",
      "Under Avatar URL, paste the public address of an image to use as your photo. Uploading a file is not available yet.",
      "Click Save. The screen tells you when the profile has been updated.",
    ],
    termos: [
      { termo: "Avatar", significa: "Your photo or profile picture, which the rest of the team sees." },
      { termo: "Public URL", significa: "The address of an image on the internet that anyone can open, with no password needed." },
      { termo: "Time zone", significa: "The part of the world whose clock you use. Someone working in another region picks another one." },
    ],
  },
};

export default ajuda;
