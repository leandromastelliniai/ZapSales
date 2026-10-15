import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, seção e opção aqui são os que a tela mostra em cada idioma
 * (`Verificação em duas etapas` / `Verificación en dos pasos` / `Two-step verification`, `Desligar` / `Desactivar` / `Turn off`).
 * Mudou o rótulo na tela, muda aqui. A ajuda descreve o que cada botão faz e não sugere enfraquecer a proteção.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui você cuida da proteção da sua conta: a verificação em duas etapas, os códigos de recuperação e os aparelhos em que você está conectado. Qualquer pessoa da equipe abre esta tela e vê as suas próprias opções.",
    passos: [
      "Em Verificação em duas etapas, veja se está Ativada ou Desativada. Se estiver Desativada, use Ativar e siga os passos que aparecem.",
      "Desligar pede uma confirmação. Se a sua empresa exige a verificação de você, o botão não aparece: a tela avisa que não dá para desligar aqui.",
      "Em Códigos de recuperação, Regenerar códigos de recuperação cria uma lista nova e os códigos antigos deixam de valer na hora. O botão só funciona com a verificação ativada.",
      "Administradores também veem Exigir da equipe: escolha o Nível mínimo (Não exigir de ninguém, Administrador, Gerente, Atendente ou Somente leitura), os Dias de carência e clique em Salvar.",
      "Em Sessões ativas, Sair de todos os dispositivos encerra o seu acesso em todos os aparelhos. Você entra de novo em cada um deles.",
    ],
    termos: [
      { termo: "Verificação em duas etapas", significa: "Além da senha, o sistema pede um código de 6 dígitos que só existe no seu celular. Segura o acesso mesmo se alguém descobrir a sua senha." },
      { termo: "Códigos de recuperação", significa: "Códigos de uso único para entrar se você perder o acesso ao aplicativo do celular. Guarde-os em lugar seguro." },
      { termo: "Dias de carência", significa: "De 0 a 30 dias. Durante o prazo ninguém é bloqueado; depois dele, a pessoa só usa o sistema depois de cadastrar a verificação." },
      { termo: "Chamada de voz pelo WhatsApp", significa: "Cartão que, quando aparece, tem um aviso de risco: o WhatsApp pode bloquear a conta inteira. Só administradores mudam, e é preciso marcar que leu o aviso antes de ligar." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí cuidas la protección de tu cuenta: la verificación en dos pasos, los códigos de recuperación y los dispositivos en los que estás conectado. Cualquier persona del equipo abre esta pantalla y ve sus propias opciones.",
    passos: [
      "En Verificación en dos pasos, mira si está Activada o Desactivada. Si está Desactivada, usa Activar y sigue los pasos que aparecen.",
      "Desactivar pide una confirmación. Si tu empresa te exige la verificación, el botón no aparece: la pantalla avisa que no se puede desactivar aquí.",
      "En Códigos de recuperación, Regenerar códigos de recuperación crea una lista nueva y los códigos anteriores dejan de valer al instante. El botón solo funciona con la verificación activada.",
      "Los administradores también ven Exigir al equipo: elige el Nivel mínimo (No exigir a nadie, Administrador, Gerente, Asesor o Solo lectura), los Días de gracia y haz clic en Guardar.",
      "En Sesiones activas, Cerrar sesión en todos los dispositivos termina tu acceso en todos los aparatos. Vuelves a entrar en cada uno.",
    ],
    termos: [
      { termo: "Verificación en dos pasos", significa: "Además de la contraseña, el sistema pide un código de 6 dígitos que solo existe en tu celular. Protege el acceso aunque alguien descubra tu contraseña." },
      { termo: "Códigos de recuperación", significa: "Códigos de un solo uso para entrar si pierdes el acceso a la aplicación del celular. Guárdalos en un lugar seguro." },
      { termo: "Días de gracia", significa: "De 0 a 30 días. Durante el plazo nadie queda bloqueado; después, la persona solo usa el sistema cuando registra la verificación." },
      { termo: "Llamadas de voz por WhatsApp", significa: "Tarjeta que, cuando aparece, trae un aviso de riesgo: WhatsApp puede bloquear toda la cuenta. Solo los administradores la cambian, y hay que marcar que leíste el aviso antes de activar." },
    ],
  },
  en: {
    oQueMostra:
      "This is where you look after your account's protection: two-step verification, recovery codes and the devices you are signed in on. Anyone on the team can open this screen and sees their own options.",
    passos: [
      "Under Two-step verification, see whether it is Enabled or Disabled. If it is Disabled, use Enable and follow the steps that appear.",
      "Turn off asks for confirmation. If your company requires the verification from you, the button does not appear: the screen says it cannot be turned off here.",
      "Under Recovery codes, Regenerate recovery codes creates a new list and the old codes stop working immediately. The button only works with the verification enabled.",
      "Administrators also see Require from the team: choose the Minimum level (Don't require it from anyone, Administrator, Manager, Agent or Read only), the Grace days, and click Save.",
      "Under Active sessions, Sign out of all devices ends your access on every device. You sign in again on each one.",
    ],
    termos: [
      { termo: "Two-step verification", significa: "On top of the password, the system asks for a 6-digit code that only exists on your phone. It keeps access safe even if someone finds out your password." },
      { termo: "Recovery codes", significa: "Single-use codes to get in if you lose access to the phone app. Keep them somewhere safe." },
      { termo: "Grace days", significa: "From 0 to 30 days. During this time nobody is blocked; afterwards, the person can only use the system once they set up the verification." },
      { termo: "WhatsApp voice calling", significa: "A card that, when it appears, carries a risk warning: WhatsApp may block the whole account. Only administrators change it, and you must tick that you read the warning before turning it on." },
    ],
  },
};

export default ajuda;
