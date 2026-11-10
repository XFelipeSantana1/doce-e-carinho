import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clienteAutorizado} from '../src/remetente.mjs';
test('LID só é autorizado quando o WAHA confirma o número do cliente',async()=>{
 const phone='5515999998888',lid='123456789@lid';
 assert.equal(await clienteAutorizado(lid,phone,async()=>({lid,pn:phone+'@c.us'})),true);
 assert.equal(await clienteAutorizado(lid,phone,async()=>({lid,pn:'5515888887777@c.us'})),false);
 assert.equal(await clienteAutorizado(lid,phone,async()=>({lid,pn:null})),false);
 assert.equal(await clienteAutorizado('123@g.us',phone,async()=>{throw Error('Grupo não deve ser consultado');}),false);
 assert.equal(await clienteAutorizado('5515999998888@c.us',phone,async()=>null),true);
});
