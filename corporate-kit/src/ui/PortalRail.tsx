import { useMemo, type ReactElement } from 'react';
import {
  accessiblePortals,
  portalsByCategory,
  resolvePortalHref,
  type PortalEntry,
} from '../domain/portals';
import { ExternalIcon, PortalIcon } from './icons';

/**
 * Persistent cross-portal navigation rail & drawer. Links every BSDC admin,
 * trust, security, telemetry, and public console together cleanly.
 */
export function PortalRail({
  currentAppId,
  userRole,
  openMobile,
  onCloseMobile,
  compact = false,
}: {
  readonly currentAppId: string;
  readonly userRole: string | null;
  readonly openMobile: boolean;
  readonly onCloseMobile: () => void;
  readonly compact?: boolean;
}): ReactElement {
  const groups = useMemo(() => portalsByCategory(accessiblePortals(userRole)), [userRole]);

  const renderLink = (portal: PortalEntry): ReactElement => {
    const active = portal.id === currentAppId;
    const href = resolvePortalHref(portal);
    return (
      <a
        key={portal.id}
        href={href}
        className={`kit-rail-link${active ? ' is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        title={portal.description}
        onClick={() => onCloseMobile()}
      >
        <span className="kit-rail-icon">
          <PortalIcon icon={portal.icon} size={16} />
        </span>
        <span className="kit-rail-text">
          <span className="kit-rail-title">{portal.shortName}</span>
          {!compact && <span className="kit-rail-sub">{portal.minRole}</span>}
        </span>
        {portal.minRole === 'public' && !active && (
          <span className="kit-rail-ext" aria-hidden="true">
            <ExternalIcon size={12} />
          </span>
        )}
      </a>
    );
  };

  return (
    <>
      {openMobile && <div className="kit-rail-scrim" aria-hidden="true" onClick={onCloseMobile} />}
      <aside
        className={`kit-rail${openMobile ? ' is-open' : ''}${compact ? ' is-compact' : ''}`}
        aria-label="BSDC portal network"
      >
        <div className="kit-rail-head">
          <span>Portal Network</span>
          <button
            type="button"
            className="kit-btn kit-btn--quiet kit-btn--small kit-rail-close"
            onClick={onCloseMobile}
            aria-label="Close portal menu"
          >
            Close
          </button>
        </div>
        <div className="kit-rail-groups">
          {groups.map((group) => (
            <div key={group.category} className="kit-rail-group">
              <div className="kit-rail-group-title">{group.label}</div>
              <nav className="kit-rail-list" aria-label={group.label}>
                {group.portals.map(renderLink)}
              </nav>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

/** Inline cross-portal strip usable in public desks (Status / Verification) or overview footers. */
export function PortalFederationStrip({
  currentAppId,
  userRole,
}: {
  readonly currentAppId: string;
  readonly userRole: string | null;
}): ReactElement {
  const portals = useMemo(() => accessiblePortals(userRole), [userRole]);
  return (
    <nav className="kit-portal-strip" aria-label="BSDC portals">
      {portals.map((portal) => {
        const active = portal.id === currentAppId;
        return (
          <a
            key={portal.id}
            href={resolvePortalHref(portal)}
            className={`kit-portal-pill${active ? ' is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <PortalIcon icon={portal.icon} size={14} />
            <span>{portal.shortName}</span>
          </a>
        );
      })}
    </nav>
  );
}
