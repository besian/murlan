import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The floating menu (round button, top right). The app adds its own items; screens deeper
 * in the tree (a game, the online lobby, a tutorial lesson) register extra items with
 * `useMenuItems`, so the menu always offers what makes sense for the current screen.
 */

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  /** Styled as destructive and asks "tap again to confirm" first. */
  danger?: boolean;
}

interface MenuCtx {
  setSection: (key: string, items: MenuItem[] | null) => void;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
}

const MenuContext = createContext<MenuCtx>({
  setSection: () => {},
  logOpen: false,
  setLogOpen: () => {},
});

export const useMenu = () => useContext(MenuContext);

/** Section order in the menu, top to bottom. */
const SECTION_ORDER = ['table', 'game', 'tutorial'];

export function useMenuRegistry() {
  const sections = useRef(new Map<string, MenuItem[]>());
  const [, setVersion] = useState(0);
  const [logOpen, setLogOpen] = useState(false);

  const setSection = useCallback((key: string, items: MenuItem[] | null) => {
    const prev = sections.current.get(key);
    const sig = (xs?: MenuItem[] | null) => (xs ? xs.map((x) => x.id + x.label).join('|') : '');
    if (items) sections.current.set(key, items);
    else sections.current.delete(key);
    // Re-render only when what the menu shows changes; handlers update silently.
    if (sig(prev) !== sig(items)) setVersion((v) => v + 1);
  }, []);

  const items = SECTION_ORDER.flatMap((k) => sections.current.get(k) ?? []);
  const ctx = useMemo(() => ({ setSection, logOpen, setLogOpen }), [setSection, logOpen]);
  return { ctx, items };
}

export function MenuProvider({ value, children }: { value: MenuCtx; children: ReactNode }) {
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

/** Register menu items for as long as the calling component is mounted (pass null to hide). */
export function useMenuItems(key: string, items: MenuItem[] | null) {
  const { setSection } = useMenu();
  useEffect(() => setSection(key, items));
  useEffect(() => () => setSection(key, null), [key, setSection]);
}

export function MenuButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <button type="button" className="menu-fab" aria-label="Menu" aria-haspopup="dialog" aria-expanded={open} onClick={onClick}>
      <span />
      <span />
      <span />
    </button>
  );
}

export function MenuModal({
  title,
  subtitle,
  items,
  extra,
  onClose,
}: {
  title: string;
  subtitle?: string;
  items: MenuItem[];
  extra?: ReactNode;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop menu-backdrop" onClick={onClose}>
      <div className="modal menu-modal" role="dialog" aria-modal aria-label="Menu" onClick={(e) => e.stopPropagation()}>
        <div className="menu-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <div className="menu-sub">{subtitle}</div>}
          </div>
          <button type="button" className="ghost close" onClick={onClose} aria-label="Close menu">
            ✕
          </button>
        </div>
        <button type="button" className="primary menu-item" onClick={onClose} autoFocus>
          Resume
        </button>
        {extra}
        {items.map((item) => {
          const armed = confirming === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={'menu-item' + (item.danger ? ' danger' : '') + (armed ? ' armed' : '')}
              onClick={() => {
                if (item.danger && !armed) {
                  setConfirming(item.id);
                  return;
                }
                onClose();
                item.onSelect();
              }}
            >
              {armed ? `Tap again to ${item.label.toLowerCase()}` : item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
