import { Card, SUIT_SYMBOL, isJoker, isRed, rankLabel, cardLabel } from '../engine';

interface Props {
  card: Card;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  dim?: boolean;
}

export function CardView({ card, selected, onClick, small, dim }: Props) {
  const cls = [
    'card',
    isRed(card) ? 'red' : 'black',
    selected ? 'selected' : '',
    small ? 'small' : '',
    dim ? 'dim' : '',
    onClick ? 'clickable' : '',
    isJoker(card) ? 'joker' : '',
  ].join(' ');
  const content = isJoker(card) ? (
    <>
      <span className="corner tl">★</span>
      <span className="joker-text">JOKER</span>
      <span className="pip big">★</span>
      <span className="corner br">★</span>
    </>
  ) : (
    <>
      <span className="corner tl">
        {rankLabel(card.rank)}
        <br />
        {SUIT_SYMBOL[card.suit!]}
      </span>
      <span className="pip">{SUIT_SYMBOL[card.suit!]}</span>
      <span className="corner br">
        {rankLabel(card.rank)}
        <br />
        {SUIT_SYMBOL[card.suit!]}
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={selected} aria-label={cardLabel(card)}>
        {content}
      </button>
    );
  }
  return (
    <div className={cls} aria-label={cardLabel(card)}>
      {content}
    </div>
  );
}

export function CardBack({ small }: { small?: boolean }) {
  return <div className={'card back' + (small ? ' small' : '')} aria-hidden />;
}
