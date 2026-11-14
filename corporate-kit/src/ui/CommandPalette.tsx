import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  accessiblePortals,
  portalsByCategory,
  resolvePortalHref,
  searchPortals,
  type PortalEntry,
} from '../domain/portals';
import { PortalIcon, SearchIcon } from './icons';

export interface CommandPaletteAction {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly hint?: string | undefined;
  readonly onSelect: () => void;
}

/**
 * Federated Ctrl+K / Cmd+K command palette across all 14 BSDC consoles and
 * active console tabs or local commands.
 */
export function CommandPalette({
  open,
  onClose,
  currentAppId,
  userRole,
  localActions = [],
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currentAppId: string;
  readonly userRole: string | null;
  readonly localActions?: readonly CommandPaletteAction[];
}): ReactElement | null {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
      return undefined;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const portals = useMemo(
    () => searchPortals(query, accessiblePortals(userRole)),
    [query, userRole],
  );
  const grouped = useMemo(() => portalsByCategory(portals), [portals]);

  const matchingActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return localActions;
    return localActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.section.toLowerCase().includes(q) ||
        (a.hint ?? '').toLowerCase().includes(q),
    );
  }, [query, localActions]);

  if (!open) return null;

  const openPortal = (portal: PortalEntry): void => {
    const href = resolvePortalHref(portal);
    onClose();
    if (portal.id === currentAppId) return;
    window.location.assign(href);
  };

  return (
    <div
      className="kit-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Portal and command switcher"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="kit-palette">
        <div className="kit-palette-head">
          <SearchIcon size={16} />
          <input
            type="search"
            autoFocus
            value={query}
            placeholder="Jump to a console, tab, or action (Esc to close)..."
            aria-label="Search consoles and actions"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="kit-kbd">ESC</kbd>
        </div>
        <div className="kit-palette-body">
          {matchingActions.length > 0 && (
            <div className="kit-palette-group">
              <div className="kit-palette-group-label">This Console</div>
              {matchingActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="kit-palette-item"
                  onClick={() => {
                    onClose();
                    action.onSelect();
                  }}
                >
                  <span className="kit-palette-item-main">
                    <strong>{action.label}</strong>
                    {action.hint && <span className="kit-small kit-muted">{action.hint}</span>}
                  </span>
                  <span className="kit-badge">{action.section}</span>
                </button>
              ))}
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.category} className="kit-palette-group">
              <div className="kit-palette-group-label">{group.label}</div>
              {group.portals.map((portal) => {
                const isHere = portal.id === currentAppId;
                return (
                  <button
                    key={portal.id}
                    type="button"
                    className={`kit-palette-item${isHere ? ' is-current' : ''}`}
                    onClick={() => openPortal(portal)}
                  >
                    <span className="kit-palette-item-icon">
                      <PortalIcon icon={portal.icon} size={16} />
                    </span>
                    <span className="kit-palette-item-main">
                      <strong>
                        {portal.name} {isHere ? '(here)' : ''}
                      </strong>
                      <span className="kit-small kit-muted">{portal.description}</span>
                    </span>
                    <span className="kit-kbd">{portal.shortcut}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {matchingActions.length === 0 && portals.length === 0 && (
            <p className="kit-empty">No matching consoles or commands.</p>
          )}
        </div>
      </div>
    </div>
  );
}
export default CommandPalette;
