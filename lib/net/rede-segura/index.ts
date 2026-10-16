/** A rede de saída segura. Ver `cliente.ts` para a política inteira. */
export {
  buscarSeguro,
  lookupJulgado,
  ErroDeRedeSegura,
  resolverEJulgar,
  validarUrl,
  type OpcoesDeBusca,
  type PoliticaDeDestino,
  type ResolvedorDeNomes,
  type RespostaSegura,
} from "./cliente";
export { ipEhEspecial, ipEhPrivadoDeRede } from "./ip";
