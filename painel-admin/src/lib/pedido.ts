// Regras de apresentação dos status (pura, sem JSX): rótulo, cor do selo e
// para onde o botão "avançar" leva. O cancelado é final — sem próximo.

const ROTULOS: Record<string, string> = {
  pendente: "Pendente",
  em_preparo: "Em preparo",
  pronto: "Pronto",
  saiu_para_entrega: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

// Tom do ESTADO (marcador + texto) por status — mapa da spec 3.1:
// Pendente=alerta · Em preparo=carameloForte(acao) · Pronto=ok ·
// Entregue=suave · Cancelado=perigo. Cor é reforço; o texto é o recado.
export const TOM_ESTADO: Record<string, "ok" | "alerta" | "perigo" | "suave" | "acao"> = {
  pendente: "alerta",
  em_preparo: "acao",
  pronto: "ok",
  saiu_para_entrega: "acao",
  entregue: "suave",
  cancelado: "perigo",
};

const FLUXO: Record<string, string> = {
  pendente: "em_preparo",
  em_preparo: "pronto",
  pronto: "entregue",
};

export function rotuloStatus(status: string): string {
  return ROTULOS[status] ?? status;
}

/** Próximo passo do fluxo (undefined em entregue/cancelado: sem botão). */
export function proximoStatus(status: string, tipo = 'retirada'): string | undefined {
  if (status === 'pronto' && tipo === 'entrega') return 'saiu_para_entrega';
  if (status === 'saiu_para_entrega') return 'entregue';
  return FLUXO[status];
}

export function rotuloPagamento(status: string): string {
  if (status === "pago") return "Pago";
  if (status === "estornado") return "Estornado";
  return "A receber";
}
