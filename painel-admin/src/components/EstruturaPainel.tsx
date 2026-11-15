import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAutenticacao } from "../hooks/useAutenticacao";
import { usePedidosPendentes } from "../hooks/usePedidosPendentes";
import { BarraSuperior } from "./BarraSuperior";
import { AbasRodape } from "./AbasRodape";
import { PopoverConta } from "./PopoverConta";
import { MarcaWordmark } from "./MarcaWordmark";
import { ITENS_MENU } from "../lib/menu";
import { JanelaPerfil } from "./JanelaPerfil";

// Moldura das telas logadas, contra o molde novo do redesign:
// DESKTOP = barra superior de textos (BarraSuperior), sem coluna fixa, com
// conteúdo centralizado em max-w-5xl. CELULAR = cabeçalho com wordmark +
// conta, conteúdo em px-4 e abas fixas embaixo (AbasRodape).
//
// A sidebar escura e a gaveta do cellular saíram: navegação por TEXTO, e a
// cor fica para ação e estado.
//
// A janela de perfil continua morando aqui — quem a abre agora é o popover
// de conta (que é único nos dois tamanhos de tela).
export function EstruturaPainel(): JSX.Element {
  const { sessao } = useAutenticacao();
  const { pathname } = useLocation();
  const area = ITENS_MENU.find(item => item.rota === pathname)?.rotulo ?? "Painel";
  const [perfilAberto, definirPerfilAberto] = useState(false);
  // Uma consulta só para os lugares que mostram o número (barra superior e
  // abas do rodapé). Buscar dentro de cada um faria a mesma requisição duas
  // vezes em toda tela.
  const pendentes = usePedidosPendentes(sessao?.token ?? null);
  const abrirPerfil = () => definirPerfilAberto(true);

  return (
    // `dvh` e não `vh`: 100vh conta a barra de endereço do celular e sobrava
    // rolagem fantasma (o mesmo que o login recebeu).
    <div className="admin-shell flex min-h-dvh flex-col font-corpo">
      <BarraSuperior aoAbrirPerfil={abrirPerfil} pendentes={pendentes} />

      {/* Cabeçalho do celular: wordmark à esquerda, conta à direita — a mesma
          popover de conta do desktop; sem gaveta, sem hamburger. */}
      <header className="admin-mobile-header flex h-16 flex-none items-center justify-between border-b border-borda bg-white px-4 lg:hidden">
        <Link to="/painel" aria-label="Doce & Carinho — ir para o Resumo">
          <MarcaWordmark pequena />
        </Link>
        <PopoverConta aoAbrirPerfil={abrirPerfil} />
      </header>

      <main className="admin-main">
        <div className="admin-breadcrumb"><span>Gestão da confeitaria</span><span aria-hidden="true">/</span><b>{area}</b></div>
        <Outlet />
      </main>

      <AbasRodape pendentes={pendentes} />

      {perfilAberto ? <JanelaPerfil aoFechar={() => definirPerfilAberto(false)} /> : null}
    </div>
  );
}
