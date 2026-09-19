/**
 * BSDC — src/features/auth/RequireAuth.tsx
 * Purpose : Route guard for surfaces that need an identity.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The guard renders the sign-in surface in place of the protected screen rather than
 *   redirecting, so the URL the person wanted is preserved and no flash of an unrelated page
 *   happens. It is a rendering decision: the data underneath is protected by rules, and a person
 *   who forces their way past this component still reads nothing.
 * Licence : Source-available. Re-deployment or re-debranding is not permitted.
 */
import type { ReactNode } from 'react';
import { useSession } from './useSession';
import { SignInCard } from './SignInCard';

/** Props for the guard. */
export interface RequireAuthProps {
  readonly children: ReactNode;
  /** Message shown above the sign-in form, explaining why it appeared. */
  readonly reason?: 'default' | 'messenger' | 'notifications' | 'settings' | 'saved';
}

/**
 * Renders children when signed in, otherwise the sign-in surface.
 * @param props children and an optional reason
 * @returns the children or the sign-in card
 */
export function RequireAuth({ children, reason = 'default' }: RequireAuthProps): ReactNode {
  const { session } = useSession();

  if (session.status === 'unknown') return null;
  if (session.status === 'signed-in' && !session.claims.suspended) return children;

  return <SignInCard reason={reason} />;
}
