import { Link, NavLink, useLocation } from "react-router-dom";
import { PopoverConta } from "./PopoverConta";
import { ContadorMenu } from "./ContadorMenu";
import { MarcaWordmark } from "./MarcaWordmark";
import { ITENS_MENU } from "../lib/menu";

// Barra superior do desktop (4.1): o menu são PALAVRAS sobre o creme — sem
// sidebar, sem ícone, sem pílula. A aba ativa se marca por peso (semibold) e
// pelo sublinhado de 2px em caramelo colado na borda; o resto é textoSuave.
// A cor fica reservada para essa marcação, e é isso.
interface PropriedadesBarraSuperior {
  aoAbrirPerfil: () => void;
  pendentes: number | null;
}

export function BarraSuperior({
  aoAbrirPerfil,
  pendentes,
}: PropriedadesBarraSuperior): JSX.Element {
  // `ativo` calculado do pathname para o aria-current EXPLÍCITO (criterio do
  // cluster). O NavLink também deduz, e as duas leituras coincidem porque as
  // cinco rotas são folhas compartilhando exatamente o path atual.
  const { pathname } = useLocation();

  return (
    <header className="admin-top-header hidden lg:block">
      <div className="admin-top-inner">
        {/* O wordmark/lead leva para o Resumo. */}
        <Link
          to="/painel"
          className="admin-brand-link"
          aria-label="Doce & Carinho — ir para o Resumo"
        >
          <MarcaWordmark />
        </Link>

        <nav aria-label="Navegação do painel" className="admin-top-nav">
          {ITENS_MENU.map((item) => {
            const ativo = pathname === item.rota;
            return (
              <NavLink
                key={item.rota}
                to={item.rota}
                end
                aria-current={ativo ? "page" : undefined}
                className={({ isActive }) =>
                  isActive ? 'admin-top-link is-active' : 'admin-top-link'
                }
              >
                {() => (
                  <>
                    <span className="flex items-center gap-2">
                      {item.rotulo}
                      {/* Contador só existe se houver pendência; zero não
                          desenha (mesma regra do menu antigo). */}
                      {item.contagem === undefined ? null : <ContadorMenu valor={pendentes} />}
                    </span>

                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex items-center">
          <PopoverConta aoAbrirPerfil={aoAbrirPerfil} />
        </div>
      </div>
    </header>
  );
}
