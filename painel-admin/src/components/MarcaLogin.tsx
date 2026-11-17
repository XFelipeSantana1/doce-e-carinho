import { MarcaWordmark } from "./MarcaWordmark";

// Lado da marca da tela de login. A coluna agora tem FOTO de confeitaria ao
// fundo (pedido do autor): a imagem cobre a coluna inteira e um degradê
// AREIA — a cor do papel do projeto — escurece a base onde o lockup fica
// pregado, para o texto escuro continuar com contraste sobre a foto.
//
// Regra que não muda: nada de faixa translúcida arredondada nem caixa; o
// wordmark continua "solto" sobre o papel, só que o papel agora é a foto.
//
// No celular o wordmark vira uma faixa no topo, à esquerda, sem foto — o
// rótulo de página não precisa de paisagem e a foto atrasaria o formulário.
const FOTO_CONFEITARIA = "/fotos/brigadeiro.jpg";

export function MarcaLogin({ compacta = false }: { compacta?: boolean }): JSX.Element {
  return (
    <div
      aria-hidden={compacta ? undefined : "true"}
      className={
        compacta
          ? "bg-areia px-5 py-4 md:hidden"
          : "relative hidden items-end overflow-hidden bg-areia p-12 md:flex"
      }
    >
      {compacta ? null : (
        <>
          {/* Foto de fundo: preenche a coluna inteira (object-cover corta
              pelo centro — confeitarias são horizontais, então recorta bem).
              alt="" e aria-hidden: é puramente decorativa. */}
          <img
            src={FOTO_CONFEITARIA}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Degradê da cor do papel: opaco na base (legibilidade do lockup),
              quase transparente no topo (a foto aparece de verdade). */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-areia via-areia/80 to-areia/10"
          />
        </>
      )}
      <div className="relative flex flex-col gap-3">
        <MarcaWordmark grande={!compacta} />
        <p
          className={
            compacta
              ? "text-xs text-textoSuave"
              : "text-sm leading-relaxed text-textoSuave"
          }
        >
          Painel da confeitaria
        </p>
      </div>
    </div>
  );
}
