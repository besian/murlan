import type { CSSProperties } from 'react';
import type { Combo } from '../engine';
import { CardView } from './CardView';

export interface PileLayer {
  /** Stable key (absolute log index) so layers already on the pile don't re-animate. */
  key: number;
  /** Seat relative to you: 0 = you (bottom), 1 = left, 2 = top, 3 = right. */
  from: number;
  combo: Combo;
}

/** Where each relative seat sits, measured from the table centre. */
const FROM: Record<number, [number, number]> = {
  0: [0, 220],
  1: [-320, 0],
  2: [0, -220],
  3: [320, 0],
};

/** Deterministic pseudo-random in [-1, 1] so a layer keeps its tilt across re-renders. */
function jitter(seed: number, salt: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

const MAX_LAYERS = 8;

export function Pile({ layers }: { layers: PileLayer[] }) {
  const visible = layers.slice(-MAX_LAYERS);
  return (
    <div className="pile-stack">
      {visible.map((layer, i) => {
        const top = i === visible.length - 1;
        const [fx, fy] = FROM[layer.from] ?? [0, 0];
        const style = {
          '--tx': `${jitter(layer.key, 1) * 16}px`,
          '--ty': `${jitter(layer.key, 2) * 10}px`,
          '--rot': `${jitter(layer.key, 3) * 11}deg`,
          '--fx': `${fx}px`,
          '--fy': `${fy}px`,
          zIndex: i + 1,
        } as CSSProperties;
        return (
          <div key={layer.key} className={'pile-layer' + (top ? ' top' : '')} style={style}>
            {layer.combo.cards.map((c) => (
              <CardView key={c.id} card={c} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
