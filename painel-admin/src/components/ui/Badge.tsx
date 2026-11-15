import type { ReactNode } from 'react';
type TomEstado='ok'|'alerta'|'perigo'|'suave'|'acao';
export function Estado({tom='suave',className='',children}:{tom?:TomEstado;className?:string;children:ReactNode}):JSX.Element {
 return <span className={'admin-status admin-status-'+tom+' '+className}>{children}</span>;
}
