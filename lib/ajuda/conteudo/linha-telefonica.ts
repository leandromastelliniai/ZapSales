import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de campo e de botão aqui são os que a tela mostra em cada idioma
 * (`Provedor SIP` / `Proveedor SIP` / `SIP provider`, `Senha` / `Contraseña` / `Password`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam os dados da operadora de telefonia que a IA usa para fazer e receber chamadas. Gestores veem a tela; só administradores podem mudar e salvar.",
    passos: [
      "Em Provedor SIP, preencha Host, Porta, Usuário e Senha com os dados que a sua operadora de telefonia deu.",
      "Se a operadora pedir, preencha From-domain (opcional). Deixe Ativo ligado para a linha ser usada e clique em Salvar.",
      "Logo depois de salvar aparece o bloco Cole em asterisk/pjsip.conf. Use Copiar e cole no arquivo indicado, no servidor onde o sistema está instalado.",
      "Aplicar o bloco no servidor é feito à mão: o sistema não faz isso sozinho.",
      "O bloco só aparece nesse momento, porque a senha não fica guardada em texto aberto. Para ver de novo, salve outra vez com a senha.",
    ],
    termos: [
      { termo: "SIP", significa: "O padrão que as operadoras usam para ligações pela internet. Os dados vêm da sua operadora." },
      { termo: "Host e Porta", significa: "O endereço do servidor da operadora e o número de entrada dele." },
      { termo: "From-domain", significa: "Endereço que alguns provedores exigem para aceitar a linha. A tela sugere o IP público do servidor." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están los datos del operador de telefonía que la IA usa para hacer y recibir llamadas. Los gestores ven la pantalla; solo los administradores pueden cambiar y guardar.",
    passos: [
      "En Proveedor SIP, completa Host, Puerto, Usuario y Contraseña con los datos que te dio tu operador de telefonía.",
      "Si el operador lo pide, completa From-domain (opcional). Deja Activo encendido para que la línea se use y haz clic en Guardar.",
      "Justo después de guardar aparece el bloque Pega esto en asterisk/pjsip.conf. Usa Copiar y pégalo en el archivo indicado, en el servidor donde está instalado el sistema.",
      "Aplicar el bloque en el servidor se hace a mano: el sistema no lo hace solo.",
      "El bloque solo aparece en ese momento, porque la contraseña no se guarda en texto abierto. Para verlo de nuevo, guarda otra vez con la contraseña.",
    ],
    termos: [
      { termo: "SIP", significa: "El estándar que usan los operadores para llamadas por internet. Los datos vienen de tu operador." },
      { termo: "Host y Puerto", significa: "La dirección del servidor del operador y su número de entrada." },
      { termo: "From-domain", significa: "Dirección que algunos proveedores exigen para aceptar la línea. La pantalla sugiere la IP pública del servidor." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the details of the phone provider the AI uses to make and receive calls are kept. Managers can see the screen; only administrators can change and save.",
    passos: [
      "Under SIP provider, fill in Host, Port, User and Password with the details your phone provider gave you.",
      "If the provider asks for it, fill in From-domain (optional). Leave Active on so the line is used, then click Save.",
      "Right after saving, the block Paste into asterisk/pjsip.conf appears. Use Copy and paste it into that file, on the server where the system is installed.",
      "Applying the block on the server is done by hand: the system does not do it by itself.",
      "The block only appears at that moment, because the password is not stored in plain text. To see it again, save once more with the password.",
    ],
    termos: [
      { termo: "SIP", significa: "The standard phone providers use for calls over the internet. The details come from your provider." },
      { termo: "Host and Port", significa: "The address of the provider's server and its entry number." },
      { termo: "From-domain", significa: "An address some providers require before accepting the line. The screen suggests the server's public IP." },
    ],
  },
};

export default ajuda;
