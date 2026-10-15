import type { AjudaDaPagina } from "../tipos";

/**
 * Os nomes de botão, campo e selo aqui são os que a tela mostra em cada idioma (`Adicionar credencial` /
 * `Agregar credencial` / `Add credential`, `Salvar e validar` / `Guardar y validar` / `Save and validate`,
 * `Validada` / `Validada` / `Validated`). Mudou o rótulo na tela, muda aqui.
 */
const ajuda: AjudaDaPagina = {
  "pt-BR": {
    oQueMostra:
      "Aqui ficam as chaves que ligam o sistema à sua conta de inteligência artificial. Você contrata o provedor direto e cola a chave aqui. Ela fica guardada criptografada e, depois de salva, só os quatro últimos caracteres aparecem. A tela é para Gerente ou acima; só o Administrador adiciona, troca ou remove chaves.",
    passos: [
      "Use Adicionar credencial. Em Provedor, escolha a empresa de IA que você contratou.",
      "Em Nome, dê um apelido opcional. Em Chave, cole a chave. O link Onde pegar a chave abre a página do provedor onde ela é criada.",
      "Use Salvar e validar. O sistema testa a chave e o selo do cartão passa para Validada ou Inválida.",
      "Em cada cartão há três ícones: o lápis (Editar credencial) troca o nome ou a chave; as setas (Revalidar credencial) testam de novo; a lixeira (Excluir credencial) remove.",
      "Uma chave em uso por versões de agentes não pode ser excluída. Para trocá-la, use o lápis: os agentes passam a usar a chave nova no próximo atendimento.",
    ],
    termos: [
      { termo: "Provedor", significa: "A empresa de IA que cobra pelo uso, como Anthropic, OpenAI ou Google. A cobrança vai direto para a sua conta nela." },
      { termo: "Validada / Inválida", significa: "Validada quer dizer que o provedor aceitou a chave. Inválida quer dizer que foi recusada; o cartão explica o motivo, e você pode colar uma chave nova em Editar credencial." },
      { termo: "Em uso por", significa: "Quantas versões de agentes usam aquela chave. Enquanto houver alguma, a chave não pode ser excluída." },
      { termo: "Jev", significa: "Uma peça do sistema que toma decisões rápidas, mas não conversa com o cliente. A chave dele serve só para isso; para atender, é preciso a chave da IA principal." },
    ],
  },
  es: {
    oQueMostra:
      "Aquí están las claves que conectan el sistema con tu cuenta de inteligencia artificial. Contratas al proveedor directamente y pegas la clave aquí. Queda guardada cifrada y, después de guardarla, solo aparecen los cuatro últimos caracteres. La pantalla es para Gerente o superior; solo el Administrador agrega, cambia o quita claves.",
    passos: [
      "Usa Agregar credencial. En Proveedor, elige la empresa de IA que contrataste.",
      "En Nombre, pon un apodo opcional. En Clave, pega la clave. El enlace Dónde obtener la clave abre la página del proveedor donde se crea.",
      "Usa Guardar y validar. El sistema prueba la clave y la etiqueta de la tarjeta pasa a Validada o Inválida.",
      "En cada tarjeta hay tres íconos: el lápiz (Editar credencial) cambia el nombre o la clave; las flechas (Revalidar credencial) vuelven a probar; el bote de basura (Eliminar credencial) la quita.",
      "Una clave en uso por versiones de agentes no se puede eliminar. Para cambiarla, usa el lápiz: los agentes pasan a usar la clave nueva en la próxima atención.",
    ],
    termos: [
      { termo: "Proveedor", significa: "La empresa de IA que cobra por el uso, como Anthropic, OpenAI o Google. El cobro va directo a tu cuenta en ella." },
      { termo: "Validada / Inválida", significa: "Validada significa que el proveedor aceptó la clave. Inválida significa que la rechazó; la tarjeta explica el motivo, y puedes pegar una clave nueva en Editar credencial." },
      { termo: "En uso por", significa: "Cuántas versiones de agentes usan esa clave. Mientras haya alguna, la clave no se puede eliminar." },
      { termo: "Jev", significa: "Una pieza del sistema que toma decisiones rápidas pero no conversa con el cliente. Su clave sirve solo para eso; para atender hace falta la clave de la IA principal." },
    ],
  },
  en: {
    oQueMostra:
      "This is where the keys that connect the system to your artificial intelligence account live. You hire the provider directly and paste the key here. It is stored encrypted and, once saved, only the last four characters show. The screen is for Manager or higher; only the Administrator adds, changes or removes keys.",
    passos: [
      "Use Add credential. Under Provider, pick the AI company you hired.",
      "Under Name, give it an optional nickname. Under Key, paste the key. The Where to get the key link opens the provider's page where it is created.",
      "Use Save and validate. The system tests the key and the card's tag changes to Validated or Invalid.",
      "Each card has three icons: the pencil (Edit credential) changes the name or the key; the arrows (Revalidate credential) test again; the trash can (Delete credential) removes it.",
      "A key that agent versions are using cannot be deleted. To swap it, use the pencil: the agents start using the new key on the next conversation.",
    ],
    termos: [
      { termo: "Provider", significa: "The AI company that charges for usage, such as Anthropic, OpenAI or Google. Billing goes straight to your account with them." },
      { termo: "Validated / Invalid", significa: "Validated means the provider accepted the key. Invalid means it was refused; the card explains why, and you can paste a new key under Edit credential." },
      { termo: "In use by", significa: "How many agent versions use that key. While there is any, the key cannot be deleted." },
      { termo: "Jev", significa: "A part of the system that makes quick decisions but does not talk to the customer. Its key serves only that; to serve customers you need the main AI key." },
    ],
  },
};

export default ajuda;
