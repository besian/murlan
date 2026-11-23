export function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal rules" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <h2>How to play Murlan</h2>
        <p>
          4 players, a 54-card deck (52 + 2 jokers), all cards dealt. Be the first to get rid of your cards.
        </p>
        <h3>Card order</h3>
        <p>3 4 5 6 7 8 9 10 J Q K A 2 · Black Joker · Red Joker. Suits don't matter.</p>
        <h3>Combinations</h3>
        <ul>
          <li><b>Single</b>, <b>pair</b>, <b>three of a kind</b>.</li>
          <li><b>Straight</b>: 5+ cards in a row (e.g. 7-8-9-10-J). Ace can be high or low (A-2-3-4-5, 10-J-Q-K-A); no wrap-around, no jokers.</li>
          <li><b>Bomb</b>: four of a kind. Beats anything except a higher bomb.</li>
          <li>Jokers only play as singles.</li>
        </ul>
        <h3>Play</h3>
        <ul>
          <li>The holder of the 3♠ starts the first hand and must play it.</li>
          <li>Each next player must beat the table with the same kind and the same number of cards, higher rank — or pass.</li>
          <li>A pass doesn't lock you out of the trick. When everyone else passes, the last player to play clears the table and leads anything.</li>
          <li>If that player already went out, the next player still in leads.</li>
        </ul>
        <h3>Between hands</h3>
        <ul>
          <li>Last place gives their highest card to the winner, who gives back any card they like. Last place then leads.</li>
          <li>If last place holds both jokers, they show them: no exchange, and the winner leads.</li>
        </ul>
        <h3>Scoring</h3>
        <p>1st: 3 points, 2nd: 2, 3rd: 1, 4th: 0. First to 21 wins. If several players reach the target in the same hand, it goes up by 10 (max 51).</p>
        <p className="note">Shortcuts: Enter = play, P = pass, H = hint, Esc = clear.</p>
        <button type="button" className="primary" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
