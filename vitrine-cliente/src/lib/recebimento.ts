export interface DadosRecebimento {
    tipo: 'retirada' | 'entrega';
    pagamento: 'pix' | 'dinheiro' | 'cartao';
    endereco: string;
}
export function validarRecebimento(dados: DadosRecebimento): string | null {
    if (dados.tipo === 'entrega' && dados.pagamento !== 'pix')
        return 'Para entrega, escolha Pix.';
    if (dados.tipo === 'entrega' && dados.endereco.trim().length < 8)
        return 'Informe o endereço completo para entrega.';
    return null;
}
export function textoRecebimento(dados: DadosRecebimento): string {
    return '\nRecebimento: ' + (dados.tipo === 'entrega' ? 'Entrega em casa' : 'Retirada na loja') + (dados.tipo === 'entrega' ? '\nEndereço: ' + dados.endereco.trim() : '') + '\nPagamento: ' + ({ pix: 'Pix', dinheiro: 'Dinheiro na retirada', cartao: 'Cartão na retirada' }[dados.pagamento]) + '\nPagamento e disponibilidade sujeitos à confirmação da loja.';
}
