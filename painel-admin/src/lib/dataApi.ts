/** Preserva o instante de datas ISO e aceita o formato SQL legado como hora local. */
export function normalizarDataApi(valor: unknown): string {
  const texto = String(valor ?? '').trim().replace(' ', 'T');
  if (!texto) return '';
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? '' : data.toISOString();
}
