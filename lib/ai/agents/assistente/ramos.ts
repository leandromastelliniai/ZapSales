/**
 * O CATÁLOGO DE RAMOS do assistente de criação de agente.
 *
 * O ramo NÃO reescreve o modelo (Vendas, Suporte, Agendamento, Atendimento): ele só
 * troca o vocabulário (paciente ou cliente, consulta ou visita), dá uma frase de
 * abertura, diz o que o agente nunca deve prometer e quando chamar uma pessoa. A
 * lista é grande de propósito, e o texto próprio existe só para os ramos do
 * primeiro corte — o resto aparece na lista e se comporta como "Outro" (vocabulário
 * neutro), nunca quebrado.
 *
 * Tudo aqui é SUGESTÃO: a pessoa edita o que quiser, e o assistente tem "Voltar à
 * sugestão". Por isso o texto é cuidadoso, mas não precisa ser jurídico. Ainda assim
 * ele nunca inventa fato do negócio (preço, horário, endereço, convênio): isso vem do
 * material do cliente. Os ramos `regulado` mostram um aviso curto, sem bloquear nada.
 *
 * Conteúdo versionado no repositório e traduzido por inteiro (`IDIOMAS_DO_AGENTE`),
 * como `modelos.ts`. Módulo puro: client-safe, sem React nem Supabase.
 */
import type { IdDoModelo } from "../modelos";
import type { IdiomaDoAgente } from "../perfil";

type PorIdioma<T> = Record<IdiomaDoAgente, T>;

export type IdDoGrupo =
  | "saude"
  | "comercio"
  | "imoveis"
  | "educacao"
  | "servicos"
  | "beleza"
  | "automotivo"
  | "turismo"
  | "financeiro";

/** O vocabulário e as frases de um ramo num idioma. */
export interface TextoDoRamo {
  /** Como o agente chama quem fala com ele (paciente, cliente, aluno). */
  pessoa: string;
  /** O compromisso que o agente conduz (consulta, visita, aula experimental). */
  compromisso: string;
  /** A primeira frase, sem o nome do negócio. */
  abertura: string;
  /** A primeira frase com `{negocio}` no lugar do nome do negócio. */
  aberturaComNegocio: string;
  /** O que o agente nunca deve prometer neste ramo. */
  nuncaPrometer: string[];
  /** Quando passar para uma pessoa da equipe. */
  chamarPessoaQuando: string;
  /** Perguntas típicas do ramo, para testar o agente. */
  perguntasDeTeste: string[];
  /** Por que o modelo recomendado serve a este ramo. */
  motivoDoModelo: string;
}

export interface Ramo {
  id: string;
  grupo: IdDoGrupo;
  nome: PorIdioma<string>;
  modeloRecomendado: IdDoModelo;
  /** Ramo com regra de publicidade ou de conselho profissional: mostra um aviso. */
  regulado: boolean;
  /** Só os ramos do primeiro corte; sem texto próprio, o ramo se comporta como "Outro". */
  texto?: PorIdioma<TextoDoRamo>;
}

export const GRUPOS_DE_RAMO: readonly { id: IdDoGrupo; nome: PorIdioma<string> }[] = [
  { id: "saude", nome: { "pt-BR": "Saúde e bem-estar", es: "Salud y bienestar", en: "Health and wellness" } },
  { id: "comercio", nome: { "pt-BR": "Comércio", es: "Comercio", en: "Retail" } },
  { id: "imoveis", nome: { "pt-BR": "Imóveis e construção", es: "Inmuebles y construcción", en: "Real estate and construction" } },
  { id: "educacao", nome: { "pt-BR": "Educação e digital", es: "Educación y digital", en: "Education and digital" } },
  { id: "servicos", nome: { "pt-BR": "Serviços profissionais", es: "Servicios profesionales", en: "Professional services" } },
  { id: "beleza", nome: { "pt-BR": "Beleza", es: "Belleza", en: "Beauty" } },
  { id: "automotivo", nome: { "pt-BR": "Automotivo", es: "Automotriz", en: "Automotive" } },
  { id: "turismo", nome: { "pt-BR": "Turismo e eventos", es: "Turismo y eventos", en: "Travel and events" } },
  { id: "financeiro", nome: { "pt-BR": "Financeiro", es: "Financiero", en: "Finance" } },
];

/** O aviso curto, não bloqueante, dos ramos regulados. Nenhum juízo legal. */
export const AVISO_DE_RAMO_REGULADO: PorIdioma<string> = {
  "pt-BR": "Confira as regras de publicidade e de atendimento do seu conselho profissional antes de publicar. Estas frases são só um ponto de partida.",
  es: "Revisa las reglas de publicidad y atención de tu colegio profesional antes de publicar. Estas frases son solo un punto de partida.",
  en: "Check the advertising and service rules of your professional body before publishing. These phrases are only a starting point.",
};

/** Os ramos que saem com texto próprio na primeira versão. */
export const RAMOS_COM_TEXTO_NO_PRIMEIRO_CORTE = [
  "clinica-medica",
  "clinica-odontologica",
  "estetica",
  "psicologia",
  "loja-fisica",
  "ecommerce",
  "imobiliaria",
  "infoprodutor",
  "advocacia",
  "salao",
  "restaurante",
  "contabilidade",
] as const;

function n(ptBR: string, es: string, en: string): PorIdioma<string> {
  return { "pt-BR": ptBR, es, en };
}

export const RAMOS: readonly Ramo[] = [
  // ───────────────────────────── Saúde e bem-estar
  {
    id: "clinica-medica",
    grupo: "saude",
    nome: n("Clínica médica", "Clínica médica", "Medical clinic"),
    modeloRecomendado: "agendamento",
    regulado: true,
    texto: {
      "pt-BR": {
        pessoa: "paciente",
        compromisso: "consulta",
        abertura: "Olá! Sou o assistente virtual da clínica. Como posso ajudar?",
        aberturaComNegocio: "Olá! Sou o assistente virtual da {negocio}. Como posso ajudar?",
        nuncaPrometer: ["diagnóstico, receita ou orientação médica", "resultado de tratamento", "valor de consulta ou exame sem conferir com a clínica"],
        chamarPessoaQuando: "o paciente relatar sintoma forte, urgência ou pedir orientação médica",
        perguntasDeTeste: ["Vocês atendem por convênio?", "Quero marcar uma consulta", "Estou com muita dor, o que eu faço?"],
        motivoDoModelo: "A maior parte das conversas de uma clínica termina em uma consulta marcada.",
      },
      es: {
        pessoa: "paciente",
        compromisso: "consulta",
        abertura: "¡Hola! Soy el asistente virtual de la clínica. ¿En qué puedo ayudarte?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿En qué puedo ayudarte?",
        nuncaPrometer: ["diagnóstico, receta u orientación médica", "resultado de tratamiento", "precio de consulta o examen sin confirmarlo con la clínica"],
        chamarPessoaQuando: "el paciente describa un síntoma fuerte, una urgencia o pida orientación médica",
        perguntasDeTeste: ["¿Atienden con seguro médico?", "Quiero agendar una consulta", "Tengo mucho dolor, ¿qué hago?"],
        motivoDoModelo: "La mayoría de las conversaciones de una clínica terminan en una consulta agendada.",
      },
      en: {
        pessoa: "patient",
        compromisso: "appointment",
        abertura: "Hello! I'm the clinic's virtual assistant. How can I help?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. How can I help?",
        nuncaPrometer: ["a diagnosis, prescription or medical advice", "treatment results", "the price of an appointment or exam without checking with the clinic"],
        chamarPessoaQuando: "the patient describes a strong symptom, an emergency or asks for medical advice",
        perguntasDeTeste: ["Do you accept health insurance?", "I'd like to book an appointment", "I'm in a lot of pain, what should I do?"],
        motivoDoModelo: "Most conversations at a clinic end in a booked appointment.",
      },
    },
  },
  {
    id: "clinica-odontologica",
    grupo: "saude",
    nome: n("Clínica odontológica", "Clínica odontológica", "Dental clinic"),
    modeloRecomendado: "agendamento",
    regulado: true,
    texto: {
      "pt-BR": {
        pessoa: "paciente",
        compromisso: "avaliação",
        abertura: "Olá! Sou o assistente virtual da clínica. Em que posso ajudar?",
        aberturaComNegocio: "Olá! Sou o assistente virtual da {negocio}. Em que posso ajudar?",
        nuncaPrometer: ["diagnóstico ou indicação de tratamento", "resultado estético ou clínico", "valor de procedimento sem avaliação"],
        chamarPessoaQuando: "o paciente relatar dor forte, inchaço, sangramento ou urgência",
        perguntasDeTeste: ["Quanto custa uma limpeza?", "Quero marcar uma avaliação", "Estou com dor de dente, vocês atendem hoje?"],
        motivoDoModelo: "Quem procura um dentista quer, quase sempre, um horário: a avaliação é o primeiro passo.",
      },
      es: {
        pessoa: "paciente",
        compromisso: "evaluación",
        abertura: "¡Hola! Soy el asistente virtual de la clínica. ¿En qué puedo ayudarte?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿En qué puedo ayudarte?",
        nuncaPrometer: ["diagnóstico o indicación de tratamiento", "resultado estético o clínico", "precio de un procedimiento sin evaluación"],
        chamarPessoaQuando: "el paciente describa dolor fuerte, hinchazón, sangrado o una urgencia",
        perguntasDeTeste: ["¿Cuánto cuesta una limpieza?", "Quiero agendar una evaluación", "Me duele una muela, ¿atienden hoy?"],
        motivoDoModelo: "Quien busca un dentista casi siempre quiere un horario: la evaluación es el primer paso.",
      },
      en: {
        pessoa: "patient",
        compromisso: "evaluation",
        abertura: "Hello! I'm the clinic's virtual assistant. How can I help?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. How can I help?",
        nuncaPrometer: ["a diagnosis or treatment recommendation", "aesthetic or clinical results", "the price of a procedure without an evaluation"],
        chamarPessoaQuando: "the patient describes strong pain, swelling, bleeding or an emergency",
        perguntasDeTeste: ["How much is a cleaning?", "I'd like to book an evaluation", "I have a toothache, can you see me today?"],
        motivoDoModelo: "People looking for a dentist almost always want a time slot: the evaluation is the first step.",
      },
    },
  },
  {
    id: "estetica",
    grupo: "saude",
    nome: n("Clínica de estética", "Clínica de estética", "Aesthetics clinic"),
    modeloRecomendado: "agendamento",
    regulado: true,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "avaliação",
        abertura: "Olá! Sou a assistente virtual da clínica. Como posso ajudar?",
        aberturaComNegocio: "Olá! Sou a assistente virtual da {negocio}. Como posso ajudar?",
        nuncaPrometer: ["resultado de procedimento", "indicação de tratamento sem avaliação", "valor sem conferir com a clínica"],
        chamarPessoaQuando: "a cliente tiver dúvida clínica, reação após um procedimento ou pedir indicação de tratamento",
        perguntasDeTeste: ["Como funciona a avaliação?", "Quero marcar um horário", "Esse procedimento dói?"],
        motivoDoModelo: "A avaliação é a porta de entrada de quase todo procedimento de estética.",
      },
      es: {
        pessoa: "clienta",
        compromisso: "evaluación",
        abertura: "¡Hola! Soy la asistente virtual de la clínica. ¿En qué puedo ayudarte?",
        aberturaComNegocio: "¡Hola! Soy la asistente virtual de {negocio}. ¿En qué puedo ayudarte?",
        nuncaPrometer: ["resultado de un procedimiento", "indicación de tratamiento sin evaluación", "precio sin confirmarlo con la clínica"],
        chamarPessoaQuando: "la clienta tenga una duda clínica, una reacción tras un procedimiento o pida una indicación de tratamiento",
        perguntasDeTeste: ["¿Cómo funciona la evaluación?", "Quiero agendar un horario", "¿Ese procedimiento duele?"],
        motivoDoModelo: "La evaluación es la puerta de entrada de casi todo procedimiento de estética.",
      },
      en: {
        pessoa: "client",
        compromisso: "evaluation",
        abertura: "Hello! I'm the clinic's virtual assistant. How can I help?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. How can I help?",
        nuncaPrometer: ["the result of a procedure", "a treatment recommendation without an evaluation", "a price without checking with the clinic"],
        chamarPessoaQuando: "the client has a clinical question, a reaction after a procedure or asks for a treatment recommendation",
        perguntasDeTeste: ["How does the evaluation work?", "I'd like to book a time", "Does this procedure hurt?"],
        motivoDoModelo: "The evaluation is the entry point of almost every aesthetic procedure.",
      },
    },
  },
  {
    id: "psicologia",
    grupo: "saude",
    nome: n("Psicologia e terapia", "Psicología y terapia", "Psychology and therapy"),
    modeloRecomendado: "agendamento",
    regulado: true,
    texto: {
      "pt-BR": {
        pessoa: "paciente",
        compromisso: "sessão",
        abertura: "Olá! Sou o assistente virtual do consultório. Posso ajudar a encontrar um horário?",
        aberturaComNegocio: "Olá! Sou o assistente virtual de {negocio}. Posso ajudar a encontrar um horário?",
        nuncaPrometer: ["resultado ou prazo de tratamento", "orientação clínica ou diagnóstico", "valor sem conferir com o consultório"],
        chamarPessoaQuando: "a pessoa relatar sofrimento intenso, risco para si ou para outros, ou pedir orientação clínica",
        perguntasDeTeste: ["Como funciona a primeira sessão?", "Quero marcar um horário", "Vocês atendem online?"],
        motivoDoModelo: "O contato de quem procura terapia costuma terminar em marcar a primeira sessão.",
      },
      es: {
        pessoa: "paciente",
        compromisso: "sesión",
        abertura: "¡Hola! Soy el asistente virtual del consultorio. ¿Te ayudo a encontrar un horario?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿Te ayudo a encontrar un horario?",
        nuncaPrometer: ["resultado o plazo de tratamiento", "orientación clínica o diagnóstico", "precio sin confirmarlo con el consultorio"],
        chamarPessoaQuando: "la persona describa un sufrimiento intenso, riesgo para sí misma o para otros, o pida orientación clínica",
        perguntasDeTeste: ["¿Cómo es la primera sesión?", "Quiero agendar un horario", "¿Atienden en línea?"],
        motivoDoModelo: "El contacto de quien busca terapia suele terminar en agendar la primera sesión.",
      },
      en: {
        pessoa: "patient",
        compromisso: "session",
        abertura: "Hello! I'm the practice's virtual assistant. Can I help you find a time?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. Can I help you find a time?",
        nuncaPrometer: ["treatment results or timelines", "clinical advice or a diagnosis", "a price without checking with the practice"],
        chamarPessoaQuando: "the person describes intense distress, a risk to themselves or others, or asks for clinical advice",
        perguntasDeTeste: ["How does the first session work?", "I'd like to book a time", "Do you offer online sessions?"],
        motivoDoModelo: "Contact from someone looking for therapy usually ends in booking the first session.",
      },
    },
  },
  { id: "fisioterapia", grupo: "saude", nome: n("Fisioterapia", "Fisioterapia", "Physiotherapy"), modeloRecomendado: "agendamento", regulado: true },
  { id: "nutricao", grupo: "saude", nome: n("Nutrição", "Nutrición", "Nutrition"), modeloRecomendado: "agendamento", regulado: true },
  { id: "veterinaria", grupo: "saude", nome: n("Veterinária", "Veterinaria", "Veterinary clinic"), modeloRecomendado: "agendamento", regulado: true },
  { id: "academia", grupo: "saude", nome: n("Academia e estúdio", "Gimnasio y estudio", "Gym and studio"), modeloRecomendado: "agendamento", regulado: false },

  // ───────────────────────────── Comércio
  {
    id: "loja-fisica",
    grupo: "comercio",
    nome: n("Loja física", "Tienda física", "Physical store"),
    modeloRecomendado: "vendas",
    regulado: false,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "compra",
        abertura: "Olá! Que bom ter você por aqui. O que você está procurando?",
        aberturaComNegocio: "Olá! Bem-vindo(a) à {negocio}. O que você está procurando?",
        nuncaPrometer: ["preço, desconto ou prazo que não esteja nos materiais da loja", "estoque sem conferir"],
        chamarPessoaQuando: "o cliente pedir troca, devolução, reclamação ou quiser negociar valor",
        perguntasDeTeste: ["Vocês têm esse produto?", "Qual o horário de funcionamento?", "Posso trocar uma compra?"],
        motivoDoModelo: "Quem escreve para uma loja quer saber se tem o produto e como comprar.",
      },
      es: {
        pessoa: "cliente",
        compromisso: "compra",
        abertura: "¡Hola! Qué bueno tenerte por aquí. ¿Qué estás buscando?",
        aberturaComNegocio: "¡Hola! Bienvenido/a a {negocio}. ¿Qué estás buscando?",
        nuncaPrometer: ["precio, descuento o plazo que no esté en los materiales de la tienda", "stock sin confirmarlo"],
        chamarPessoaQuando: "el cliente pida un cambio, una devolución, haga un reclamo o quiera negociar el precio",
        perguntasDeTeste: ["¿Tienen este producto?", "¿Cuál es el horario de atención?", "¿Puedo cambiar una compra?"],
        motivoDoModelo: "Quien escribe a una tienda quiere saber si tiene el producto y cómo comprarlo.",
      },
      en: {
        pessoa: "customer",
        compromisso: "purchase",
        abertura: "Hello! Great to have you here. What are you looking for?",
        aberturaComNegocio: "Hello! Welcome to {negocio}. What are you looking for?",
        nuncaPrometer: ["a price, discount or deadline that isn't in the store's materials", "stock without checking"],
        chamarPessoaQuando: "the customer asks for an exchange, a return, complains or wants to negotiate the price",
        perguntasDeTeste: ["Do you have this product?", "What are your opening hours?", "Can I exchange a purchase?"],
        motivoDoModelo: "People who message a store want to know if it has the product and how to buy it.",
      },
    },
  },
  {
    id: "ecommerce",
    grupo: "comercio",
    nome: n("E-commerce", "E-commerce", "E-commerce"),
    modeloRecomendado: "vendas",
    regulado: false,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "pedido",
        abertura: "Olá! Sou o assistente virtual da loja. Posso ajudar com produtos, pedidos ou entregas?",
        aberturaComNegocio: "Olá! Sou o assistente virtual da {negocio}. Posso ajudar com produtos, pedidos ou entregas?",
        nuncaPrometer: ["prazo de entrega que não esteja nos materiais da loja", "estoque ou desconto sem conferir", "reembolso fora da política da loja"],
        chamarPessoaQuando: "o cliente reclamar de pedido atrasado ou com defeito, pedir reembolso ou cancelamento",
        perguntasDeTeste: ["Cadê o meu pedido?", "Vocês têm esse produto em outra cor?", "Quero trocar um item"],
        motivoDoModelo: "No e-commerce a conversa gira em torno de escolher o produto e fechar o pedido.",
      },
      es: {
        pessoa: "cliente",
        compromisso: "pedido",
        abertura: "¡Hola! Soy el asistente virtual de la tienda. ¿Te ayudo con productos, pedidos o envíos?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿Te ayudo con productos, pedidos o envíos?",
        nuncaPrometer: ["plazo de entrega que no esté en los materiales de la tienda", "stock o descuento sin confirmarlo", "reembolso fuera de la política de la tienda"],
        chamarPessoaQuando: "el cliente reclame por un pedido atrasado o defectuoso, o pida un reembolso o la cancelación",
        perguntasDeTeste: ["¿Dónde está mi pedido?", "¿Tienen este producto en otro color?", "Quiero cambiar un artículo"],
        motivoDoModelo: "En el e-commerce la conversación gira en torno a elegir el producto y cerrar el pedido.",
      },
      en: {
        pessoa: "customer",
        compromisso: "order",
        abertura: "Hello! I'm the store's virtual assistant. Can I help with products, orders or shipping?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. Can I help with products, orders or shipping?",
        nuncaPrometer: ["a delivery date that isn't in the store's materials", "stock or a discount without checking", "a refund outside the store's policy"],
        chamarPessoaQuando: "the customer complains about a late or defective order, or asks for a refund or cancellation",
        perguntasDeTeste: ["Where is my order?", "Do you have this product in another color?", "I want to exchange an item"],
        motivoDoModelo: "In e-commerce the conversation is about choosing the product and closing the order.",
      },
    },
  },
  { id: "moda", grupo: "comercio", nome: n("Moda e vestuário", "Moda y ropa", "Fashion and apparel"), modeloRecomendado: "vendas", regulado: false },
  {
    id: "restaurante",
    grupo: "comercio",
    nome: n("Restaurante e delivery", "Restaurante y delivery", "Restaurant and delivery"),
    modeloRecomendado: "suporte",
    regulado: false,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "pedido",
        abertura: "Olá! Sou o assistente virtual do restaurante. Posso ajudar com o cardápio, pedidos ou reservas?",
        aberturaComNegocio: "Olá! Sou o assistente virtual do {negocio}. Posso ajudar com o cardápio, pedidos ou reservas?",
        nuncaPrometer: ["tempo de entrega que não esteja nos materiais", "ingrediente ou item sem conferir (alergias exigem confirmação da cozinha)", "desconto ou promoção não informados"],
        chamarPessoaQuando: "o cliente falar de alergia, reclamar de um pedido ou pedir reserva para um grupo grande",
        perguntasDeTeste: ["Vocês entregam no meu bairro?", "O prato tem glúten?", "Quero reservar uma mesa"],
        motivoDoModelo: "Em restaurante a maioria das mensagens são dúvidas rápidas sobre cardápio, pedido e entrega.",
      },
      es: {
        pessoa: "cliente",
        compromisso: "pedido",
        abertura: "¡Hola! Soy el asistente virtual del restaurante. ¿Te ayudo con el menú, pedidos o reservas?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿Te ayudo con el menú, pedidos o reservas?",
        nuncaPrometer: ["tiempo de entrega que no esté en los materiales", "ingredientes o platos sin confirmarlos (las alergias requieren confirmación de la cocina)", "descuentos o promociones no informados"],
        chamarPessoaQuando: "el cliente hable de una alergia, reclame por un pedido o pida una reserva para un grupo grande",
        perguntasDeTeste: ["¿Entregan en mi barrio?", "¿El plato tiene gluten?", "Quiero reservar una mesa"],
        motivoDoModelo: "En un restaurante la mayoría de los mensajes son dudas rápidas sobre menú, pedido y entrega.",
      },
      en: {
        pessoa: "customer",
        compromisso: "order",
        abertura: "Hello! I'm the restaurant's virtual assistant. Can I help with the menu, orders or reservations?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. Can I help with the menu, orders or reservations?",
        nuncaPrometer: ["a delivery time that isn't in the materials", "ingredients or dishes without checking (allergies need kitchen confirmation)", "discounts or promotions that weren't announced"],
        chamarPessoaQuando: "the customer mentions an allergy, complains about an order or asks for a large-group reservation",
        perguntasDeTeste: ["Do you deliver to my neighborhood?", "Does this dish contain gluten?", "I'd like to book a table"],
        motivoDoModelo: "At a restaurant most messages are quick questions about the menu, orders and delivery.",
      },
    },
  },
  { id: "farmacia", grupo: "comercio", nome: n("Farmácia", "Farmacia", "Pharmacy"), modeloRecomendado: "vendas", regulado: true },
  { id: "pet-shop", grupo: "comercio", nome: n("Pet shop", "Pet shop", "Pet shop"), modeloRecomendado: "vendas", regulado: false },

  // ───────────────────────────── Imóveis e construção
  {
    id: "imobiliaria",
    grupo: "imoveis",
    nome: n("Imobiliária", "Inmobiliaria", "Real estate agency"),
    modeloRecomendado: "vendas",
    regulado: false,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "visita",
        abertura: "Olá! Sou o assistente virtual da imobiliária. Está procurando comprar ou alugar?",
        aberturaComNegocio: "Olá! Sou o assistente virtual da {negocio}. Está procurando comprar ou alugar?",
        nuncaPrometer: ["valor, condição de pagamento ou financiamento sem conferir", "disponibilidade do imóvel sem confirmar com a equipe", "valorização ou retorno do investimento"],
        chamarPessoaQuando: "o cliente quiser negociar valor, visitar um imóvel ou falar de financiamento",
        perguntasDeTeste: ["Vocês têm apartamento de dois quartos?", "Quero agendar uma visita", "Aceita financiamento?"],
        motivoDoModelo: "Na imobiliária a conversa conduz o interessado até uma visita ou proposta.",
      },
      es: {
        pessoa: "cliente",
        compromisso: "visita",
        abertura: "¡Hola! Soy el asistente virtual de la inmobiliaria. ¿Buscas comprar o alquilar?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿Buscas comprar o alquilar?",
        nuncaPrometer: ["precio, condiciones de pago o financiamiento sin confirmarlos", "disponibilidad del inmueble sin confirmarla con el equipo", "valorización o retorno de la inversión"],
        chamarPessoaQuando: "el cliente quiera negociar el precio, visitar un inmueble o hablar de financiamiento",
        perguntasDeTeste: ["¿Tienen un departamento de dos dormitorios?", "Quiero agendar una visita", "¿Aceptan financiamiento?"],
        motivoDoModelo: "En la inmobiliaria la conversación lleva al interesado hasta una visita o propuesta.",
      },
      en: {
        pessoa: "client",
        compromisso: "viewing",
        abertura: "Hello! I'm the agency's virtual assistant. Are you looking to buy or rent?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. Are you looking to buy or rent?",
        nuncaPrometer: ["a price, payment terms or financing without checking", "a property's availability without confirming with the team", "appreciation or investment returns"],
        chamarPessoaQuando: "the client wants to negotiate the price, view a property or talk about financing",
        perguntasDeTeste: ["Do you have a two-bedroom apartment?", "I'd like to schedule a viewing", "Do you accept financing?"],
        motivoDoModelo: "At a real estate agency the conversation leads the prospect to a viewing or an offer.",
      },
    },
  },
  { id: "corretor", grupo: "imoveis", nome: n("Corretor de imóveis", "Corredor inmobiliario", "Real estate agent"), modeloRecomendado: "vendas", regulado: false },
  { id: "construtora", grupo: "imoveis", nome: n("Construtora e incorporadora", "Constructora e inmobiliaria", "Construction and development"), modeloRecomendado: "vendas", regulado: false },
  { id: "arquitetura", grupo: "imoveis", nome: n("Arquitetura e design de interiores", "Arquitectura y diseño de interiores", "Architecture and interior design"), modeloRecomendado: "atendimento", regulado: false },

  // ───────────────────────────── Educação e digital
  {
    id: "infoprodutor",
    grupo: "educacao",
    nome: n("Infoprodutor", "Infoproductor", "Digital course creator"),
    modeloRecomendado: "vendas",
    regulado: false,
    texto: {
      "pt-BR": {
        pessoa: "aluno",
        compromisso: "matrícula",
        abertura: "Olá! Que bom ter você por aqui. Como posso te ajudar a conhecer o curso?",
        aberturaComNegocio: "Olá! Sou o assistente virtual da {negocio}. Como posso te ajudar a conhecer o curso?",
        nuncaPrometer: ["resultado financeiro ou de carreira", "prazo para ver resultado", "bônus, desconto ou garantia que não esteja nos materiais"],
        chamarPessoaQuando: "o aluno pedir reembolso, tiver problema de acesso ao curso ou quiser negociar condição",
        perguntasDeTeste: ["Para quem é esse curso?", "Tem garantia?", "Como faço para acessar depois de comprar?"],
        motivoDoModelo: "Quem pergunta sobre um curso quer entender se serve e decidir comprar.",
      },
      es: {
        pessoa: "alumno",
        compromisso: "inscripción",
        abertura: "¡Hola! Qué bueno tenerte por aquí. ¿Cómo te ayudo a conocer el curso?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿Cómo te ayudo a conocer el curso?",
        nuncaPrometer: ["resultados financieros o de carrera", "plazos para ver resultados", "bonos, descuentos o garantías que no estén en los materiales"],
        chamarPessoaQuando: "el alumno pida un reembolso, tenga un problema de acceso al curso o quiera negociar condiciones",
        perguntasDeTeste: ["¿Para quién es este curso?", "¿Tiene garantía?", "¿Cómo accedo después de comprar?"],
        motivoDoModelo: "Quien pregunta por un curso quiere entender si le sirve y decidir comprar.",
      },
      en: {
        pessoa: "student",
        compromisso: "enrollment",
        abertura: "Hello! Great to have you here. How can I help you get to know the course?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. How can I help you get to know the course?",
        nuncaPrometer: ["financial or career results", "timelines to see results", "bonuses, discounts or guarantees that aren't in the materials"],
        chamarPessoaQuando: "the student asks for a refund, has trouble accessing the course or wants to negotiate terms",
        perguntasDeTeste: ["Who is this course for?", "Is there a guarantee?", "How do I get access after buying?"],
        motivoDoModelo: "People asking about a course want to understand if it fits them and decide to buy.",
      },
    },
  },
  { id: "escola-cursos", grupo: "educacao", nome: n("Escola e cursos", "Escuela y cursos", "School and courses"), modeloRecomendado: "vendas", regulado: false },
  { id: "idiomas", grupo: "educacao", nome: n("Escola de idiomas", "Escuela de idiomas", "Language school"), modeloRecomendado: "vendas", regulado: false },
  { id: "mentoria", grupo: "educacao", nome: n("Mentoria", "Mentoría", "Mentoring"), modeloRecomendado: "vendas", regulado: false },

  // ───────────────────────────── Serviços profissionais
  {
    id: "advocacia",
    grupo: "servicos",
    nome: n("Advocacia", "Abogacía", "Law firm"),
    modeloRecomendado: "atendimento",
    regulado: true,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "conversa com o advogado",
        abertura: "Olá! Sou o assistente virtual do escritório. Me conta, de forma breve, o assunto que você gostaria de tratar?",
        aberturaComNegocio: "Olá! Sou o assistente virtual do {negocio}. Me conta, de forma breve, o assunto que você gostaria de tratar?",
        nuncaPrometer: ["resultado de causa ou chance de ganhar", "prazo de processo", "honorários sem análise do caso"],
        chamarPessoaQuando: "o cliente tiver prazo correndo, audiência marcada ou quiser orientação jurídica",
        perguntasDeTeste: ["Preciso de um advogado trabalhista", "Quanto vocês cobram?", "Tenho uma audiência na semana que vem"],
        motivoDoModelo: "No escritório a primeira conversa é triagem: entender o assunto e passar para o advogado certo.",
      },
      es: {
        pessoa: "cliente",
        compromisso: "conversación con el abogado",
        abertura: "¡Hola! Soy el asistente virtual del despacho. ¿Me cuentas brevemente el asunto que quieres tratar?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿Me cuentas brevemente el asunto que quieres tratar?",
        nuncaPrometer: ["resultado de una causa o probabilidad de ganar", "plazos de un proceso", "honorarios sin analizar el caso"],
        chamarPessoaQuando: "el cliente tenga un plazo corriendo, una audiencia programada o quiera orientación jurídica",
        perguntasDeTeste: ["Necesito un abogado laboral", "¿Cuánto cobran?", "Tengo una audiencia la semana que viene"],
        motivoDoModelo: "En el despacho la primera conversación es un triaje: entender el asunto y pasarlo al abogado adecuado.",
      },
      en: {
        pessoa: "client",
        compromisso: "conversation with the lawyer",
        abertura: "Hello! I'm the firm's virtual assistant. Could you briefly tell me what you'd like to discuss?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. Could you briefly tell me what you'd like to discuss?",
        nuncaPrometer: ["the outcome of a case or the chance of winning", "timelines of a lawsuit", "fees without reviewing the case"],
        chamarPessoaQuando: "the client has a deadline running, a scheduled hearing or wants legal advice",
        perguntasDeTeste: ["I need an employment lawyer", "How much do you charge?", "I have a hearing next week"],
        motivoDoModelo: "At a law firm the first conversation is triage: understanding the matter and passing it to the right lawyer.",
      },
    },
  },
  {
    id: "contabilidade",
    grupo: "servicos",
    nome: n("Contabilidade", "Contabilidad", "Accounting"),
    modeloRecomendado: "atendimento",
    regulado: true,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "atendimento",
        abertura: "Olá! Sou o assistente virtual do escritório de contabilidade. Como posso ajudar?",
        aberturaComNegocio: "Olá! Sou o assistente virtual da {negocio}. Como posso ajudar?",
        nuncaPrometer: ["valor de imposto ou economia tributária sem análise", "prazo de obrigação sem conferir com a equipe", "orientação fiscal específica"],
        chamarPessoaQuando: "o cliente tiver prazo de obrigação próximo, intimação ou dúvida fiscal específica",
        perguntasDeTeste: ["Quero abrir uma empresa", "Quanto custa a contabilidade mensal?", "Recebi uma notificação da Receita"],
        motivoDoModelo: "No escritório de contabilidade o primeiro contato é entender a necessidade e passar para o contador.",
      },
      es: {
        pessoa: "cliente",
        compromisso: "atención",
        abertura: "¡Hola! Soy el asistente virtual del estudio contable. ¿En qué puedo ayudarte?",
        aberturaComNegocio: "¡Hola! Soy el asistente virtual de {negocio}. ¿En qué puedo ayudarte?",
        nuncaPrometer: ["monto de impuestos o ahorro tributario sin análisis", "plazos de obligaciones sin confirmarlos con el equipo", "orientación fiscal específica"],
        chamarPessoaQuando: "el cliente tenga un plazo de obligación cercano, una intimación o una duda fiscal específica",
        perguntasDeTeste: ["Quiero abrir una empresa", "¿Cuánto cuesta la contabilidad mensual?", "Recibí una notificación de la autoridad tributaria"],
        motivoDoModelo: "En el estudio contable el primer contacto es entender la necesidad y pasarla al contador.",
      },
      en: {
        pessoa: "client",
        compromisso: "service",
        abertura: "Hello! I'm the accounting firm's virtual assistant. How can I help?",
        aberturaComNegocio: "Hello! I'm the virtual assistant of {negocio}. How can I help?",
        nuncaPrometer: ["the amount of tax or tax savings without an analysis", "filing deadlines without checking with the team", "specific tax advice"],
        chamarPessoaQuando: "the client has a filing deadline coming up, a notice or a specific tax question",
        perguntasDeTeste: ["I want to open a company", "How much is monthly accounting?", "I received a notice from the tax authority"],
        motivoDoModelo: "At an accounting firm the first contact is understanding the need and passing it to the accountant.",
      },
    },
  },
  { id: "consultoria", grupo: "servicos", nome: n("Consultoria", "Consultoría", "Consulting"), modeloRecomendado: "atendimento", regulado: false },
  { id: "agencia-marketing", grupo: "servicos", nome: n("Agência de marketing", "Agencia de marketing", "Marketing agency"), modeloRecomendado: "vendas", regulado: false },
  { id: "seguros", grupo: "servicos", nome: n("Seguros", "Seguros", "Insurance"), modeloRecomendado: "vendas", regulado: true },

  // ───────────────────────────── Beleza
  {
    id: "salao",
    grupo: "beleza",
    nome: n("Salão de beleza", "Salón de belleza", "Beauty salon"),
    modeloRecomendado: "agendamento",
    regulado: false,
    texto: {
      "pt-BR": {
        pessoa: "cliente",
        compromisso: "horário",
        abertura: "Oi! Sou a assistente virtual do salão. Quer marcar um horário?",
        aberturaComNegocio: "Oi! Sou a assistente virtual do {negocio}. Quer marcar um horário?",
        nuncaPrometer: ["preço ou duração de serviço que não esteja nos materiais", "disponibilidade de um profissional sem conferir a agenda", "resultado de química ou procedimento"],
        chamarPessoaQuando: "a cliente tiver reação alérgica, quiser reclamar de um serviço ou pedir um serviço fora da lista",
        perguntasDeTeste: ["Quero marcar um corte", "Quanto custa uma coloração?", "Tem horário no sábado?"],
        motivoDoModelo: "No salão quase toda conversa termina em horário marcado.",
      },
      es: {
        pessoa: "clienta",
        compromisso: "cita",
        abertura: "¡Hola! Soy la asistente virtual del salón. ¿Quieres agendar una cita?",
        aberturaComNegocio: "¡Hola! Soy la asistente virtual de {negocio}. ¿Quieres agendar una cita?",
        nuncaPrometer: ["precio o duración de un servicio que no esté en los materiales", "disponibilidad de un profesional sin revisar la agenda", "resultado de un tratamiento químico o procedimiento"],
        chamarPessoaQuando: "la clienta tenga una reacción alérgica, quiera reclamar por un servicio o pida un servicio fuera de la lista",
        perguntasDeTeste: ["Quiero agendar un corte", "¿Cuánto cuesta una coloración?", "¿Hay horario el sábado?"],
        motivoDoModelo: "En el salón casi toda conversación termina en una cita agendada.",
      },
      en: {
        pessoa: "client",
        compromisso: "appointment",
        abertura: "Hi! I'm the salon's virtual assistant. Would you like to book a time?",
        aberturaComNegocio: "Hi! I'm the virtual assistant of {negocio}. Would you like to book a time?",
        nuncaPrometer: ["a price or duration that isn't in the materials", "a stylist's availability without checking the calendar", "the result of a chemical treatment or procedure"],
        chamarPessoaQuando: "the client has an allergic reaction, wants to complain about a service or asks for a service that isn't listed",
        perguntasDeTeste: ["I'd like to book a haircut", "How much is a hair coloring?", "Do you have a slot on Saturday?"],
        motivoDoModelo: "At a salon almost every conversation ends in a booked appointment.",
      },
    },
  },
  { id: "barbearia", grupo: "beleza", nome: n("Barbearia", "Barbería", "Barbershop"), modeloRecomendado: "agendamento", regulado: false },

  // ───────────────────────────── Automotivo
  { id: "concessionaria", grupo: "automotivo", nome: n("Concessionária e revenda", "Concesionaria y reventa", "Car dealership"), modeloRecomendado: "vendas", regulado: false },
  { id: "oficina", grupo: "automotivo", nome: n("Oficina mecânica", "Taller mecánico", "Auto repair shop"), modeloRecomendado: "agendamento", regulado: false },

  // ───────────────────────────── Turismo e eventos
  { id: "agencia-viagens", grupo: "turismo", nome: n("Agência de viagens", "Agencia de viajes", "Travel agency"), modeloRecomendado: "vendas", regulado: false },
  { id: "hotel-pousada", grupo: "turismo", nome: n("Hotel e pousada", "Hotel y posada", "Hotel and inn"), modeloRecomendado: "vendas", regulado: false },
  { id: "eventos", grupo: "turismo", nome: n("Eventos e festas", "Eventos y fiestas", "Events and parties"), modeloRecomendado: "vendas", regulado: false },

  // ───────────────────────────── Financeiro
  { id: "consorcio", grupo: "financeiro", nome: n("Consórcio", "Consorcio", "Consortium plans"), modeloRecomendado: "vendas", regulado: true },
  { id: "credito", grupo: "financeiro", nome: n("Crédito e financiamento", "Crédito y financiamiento", "Credit and financing"), modeloRecomendado: "vendas", regulado: true },
];

export function ramoPorId(id: string): Ramo | undefined {
  return RAMOS.find((r) => r.id === id);
}

const MOTIVO_GENERICO: Record<IdDoModelo, PorIdioma<string>> = {
  vendas: {
    "pt-BR": "Neste tipo de negócio a conversa costuma levar a pessoa até a compra ou a uma proposta.",
    es: "En este tipo de negocio la conversación suele llevar a la persona hasta la compra o una propuesta.",
    en: "In this kind of business the conversation usually leads the person to a purchase or a proposal.",
  },
  suporte: {
    "pt-BR": "Neste tipo de negócio a maioria das mensagens são dúvidas e pedidos de quem já é cliente.",
    es: "En este tipo de negocio la mayoría de los mensajes son dudas y pedidos de quien ya es cliente.",
    en: "In this kind of business most messages are questions and requests from existing customers.",
  },
  agendamento: {
    "pt-BR": "Neste tipo de negócio a conversa costuma terminar em um horário marcado.",
    es: "En este tipo de negocio la conversación suele terminar en una cita agendada.",
    en: "In this kind of business the conversation usually ends in a booked time.",
  },
  atendimento: {
    "pt-BR": "Neste tipo de negócio o primeiro contato é triagem: entender o assunto e passar para a pessoa certa.",
    es: "En este tipo de negocio el primer contacto es un triaje: entender el asunto y pasarlo a la persona adecuada.",
    en: "In this kind of business the first contact is triage: understanding the topic and passing it to the right person.",
  },
};

/** Por que o modelo recomendado serve ao ramo (o texto do ramo, ou um motivo geral do modelo). */
export function motivoDoModelo(ramo: Ramo, idioma: IdiomaDoAgente): string {
  return ramo.texto?.[idioma].motivoDoModelo ?? MOTIVO_GENERICO[ramo.modeloRecomendado][idioma];
}

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Busca por pedaço do nome nos três idiomas, ignorando acento e caixa. A pessoa
 * pode digitar no idioma que quiser ("law", "abogacia", "advocacia" acham o mesmo
 * ramo). Consulta vazia devolve todos, na ordem do catálogo.
 */
export function buscarRamos(consulta: string, idioma: IdiomaDoAgente): Ramo[] {
  const q = semAcento(consulta.trim());
  if (q === "") return [...RAMOS];
  return RAMOS.filter((r) => {
    const nomes = [r.nome[idioma], r.nome["pt-BR"], r.nome.es, r.nome.en, r.id.replace(/-/g, " ")];
    return nomes.some((nome) => semAcento(nome).includes(q));
  });
}
