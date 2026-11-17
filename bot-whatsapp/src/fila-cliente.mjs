// Ordena toda a decisão (leitura, IA, API, persistência e envio), não só a gravação.
// Clientes diferentes não compartilham a mesma cadeia de promessas.
export function criarFilaCliente() {
  const filas = new Map();
  return function executar(cliente, tarefa) {
    const anterior=filas.get(cliente) || Promise.resolve();
    const atual=anterior.catch(()=>{}).then(tarefa);
    filas.set(cliente,atual);
    return atual.finally(()=>{if(filas.get(cliente)===atual)filas.delete(cliente);});
  };
}
