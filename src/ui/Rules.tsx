import { useState } from 'react';

const TABS = ['Cards', 'Combos', 'Play', 'Scoring'] as const;
type Tab = (typeof TABS)[number];

/** Rules summary, split into tabs so it fits on one screen without scrolling. */
export function Rules({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('Cards');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules" role="dialog" aria-modal aria-label="Rules" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>How to play</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="tab-body" role="tabpanel">
          {tab === 'Cards' && (
            <>
              <p>4 players, 54 cards (52 + 2 jokers), all dealt. Be the first to get rid of your cards.</p>
              <p className="rank-row">3 4 5 6 7 8 9 10 J Q K A 2 · Black Joker · Red Joker</p>
              <p>That’s the order from lowest to highest. Suits don’t matter.</p>
            </>
          )}
          {tab === 'Combos' && (
            <ul>
              <li><b>Single</b>, <b>pair</b>, <b>three of a kind</b>.</li>
              <li><b>Straight</b>: 5+ cards in a row. Ace high or low (A-2-3-4-5, 10-J-Q-K-A); no wrap-around, no jokers.</li>
              <li><b>Bomb</b>: four of a kind. Beats anything except a higher bomb.</li>
              <li>Jokers only play as singles.</li>
            </ul>
          )}
          {tab === 'Play' && (
            <ul>
              <li>The 3♠ holder starts the first hand and must play it.</li>
              <li>Beat the table with the same kind and number of cards, higher — or pass. You can come back in after passing.</li>
              <li>When everyone else passes, the last player clears the table and leads anything (or the next player still in, if they went out).</li>
            </ul>
          )}
          {tab === 'Scoring' && (
            <ul>
              <li>1st: 3 points, 2nd: 2, 3rd: 1, last: 0. First to 21 wins; if several reach it in one hand, the target rises by 10 (max 51).</li>
              <li>Next hand: last place gives their highest card to the winner, gets any card back, and leads.</li>
              <li>If last place holds both jokers: no exchange, the winner leads.</li>
            </ul>
          )}
        </div>
        <p className="note">Keys: Enter = play · P = pass · H = hint · Esc = clear</p>
      </div>
    </div>
  );
}
