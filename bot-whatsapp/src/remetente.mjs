export function canonical(value) {
  const digits=value.split('@')[0].replace(/\D/g,'');
  return digits.startsWith('55')&&digits.length===13 ? digits.slice(0,4)+digits.slice(5) : digits;
}
export async function clienteAutorizado(from,phone,resolverLid) {
  if(typeof from!=='string')return false;
  if(/^[0-9]+@lid$/.test(from)) {
    const mapping=await resolverLid(from);
    return mapping.lid===from && typeof mapping.pn==='string' && /^[0-9]+@c\.us$/.test(mapping.pn) && canonical(mapping.pn)===canonical(phone);
  }
  return /^[0-9]+@(c\.us|s\.whatsapp\.net)$/.test(from)&&canonical(from)===canonical(phone);
}
