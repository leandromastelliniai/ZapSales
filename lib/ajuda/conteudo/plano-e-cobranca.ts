import type { AjudaDaPagina } from "../tipos";

/**
 * Os títulos aqui são os que a tela mostra em cada idioma (`Em breve` / `Próximamente` / `Coming soon`).
 * A tela ainda não tem plano nem cobrança para operar: a ajuda diz isso, sem inventar botão. Se ela ganhar
 * funções, reescreva este texto.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Esta tela é o lugar do plano contratado e das cobranças da sua empresa. Hoje ela ainda não traz plano nem cobrança para mexer: mostra o aviso Em breve. Só administradores abrem.",
    passos: [
      "Leia o aviso Em breve: ele diz que planos e cobrança ainda não estão nesta tela.",
      "Para qualquer questão de pagamento, use o e-mail de contato mostrado no aviso, quando houver um.",
      "Se não aparecer nenhum e-mail, fale com quem administra este sistema.",
    ],
    termos: [
      { termo: "Em breve", significa: "Aviso de que esta parte ainda não está disponível. Não há nada para configurar aqui por enquanto." },
      { termo: "Quem administra este sistema", significa: "A pessoa ou empresa responsável por manter o sistema no ar e cuidar do pagamento dele." },
    ],
  },
  es: {
    oQueMostra:
      "Esta pantalla es el lugar del plan contratado y de los cobros de tu empresa. Hoy todavía no trae plan ni cobros para modificar: muestra el aviso Próximamente. Solo los administradores la abren.",
    passos: [
      "Lee el aviso Próximamente: dice que los planes y la facturación todavía no están en esta pantalla.",
      "Para cualquier tema de pago, usa el correo de contacto que muestra el aviso, cuando haya uno.",
      "Si no aparece ningún correo, habla con quien administra este sistema.",
    ],
    termos: [
      { termo: "Próximamente", significa: "Aviso de que esta parte todavía no está disponible. Por ahora no hay nada que configurar aquí." },
      { termo: "Quien administra este sistema", significa: "La persona o empresa responsable de mantener el sistema en funcionamiento y de ocuparse de su pago." },
    ],
  },
  en: {
    oQueMostra:
      "This screen is the place for your company's plan and charges. Today it has no plan or charges to change yet: it shows the Coming soon notice. Only administrators can open it.",
    passos: [
      "Read the Coming soon notice: it says plans and billing are not on this screen yet.",
      "For any payment question, use the contact email shown in the notice, when there is one.",
      "If no email appears, talk to whoever administers this system.",
    ],
    termos: [
      { termo: "Coming soon", significa: "A notice that this part is not available yet. There is nothing to set up here for now." },
      { termo: "Whoever administers this system", significa: "The person or company responsible for keeping the system running and handling its payment." },
    ],
  },
};

export default ajuda;
