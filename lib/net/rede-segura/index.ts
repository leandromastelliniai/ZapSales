/** A rede de saída segura. Ver `cliente.ts` para a política inteira. */
export {
  buscarSeguro,
  buscarSeguroEmFluxo,
  lookupJulgado,
  ErroDeRedeSegura,
  resolverEJulgar,
  validarUrl,
  type OpcoesDeBusca,
  type OpcoesDeFluxo,
  type PoliticaDeDestino,
  type ResolvedorDeNomes,
  type RespostaEmFluxo,
  type RespostaSegura,
} from "./cliente";
export { fetchSeguro, type OpcoesDoFetchSeguro } from "./fetch";
export { ipEhEspecial, ipEhPrivadoDeRede } from "./ip";
