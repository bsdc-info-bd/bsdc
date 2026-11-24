import { useState, type ReactElement, type ReactNode } from 'react';
import { useStaleBuildRecovery } from './useStaleBuildRecovery';
import { Banner, Button } from './primitives';

/**
 * Installs stale-build recovery for a whole console.
 *
 * This sits in `mountConsole`, above whichever shell the console chose — not in
 * `AppShell`. It used to live in the shell, and that was a real gap: two
 * consoles (`status-site` and `vf-site`) render `PublicShell` because their
 * audience includes people who are not signed in, so they never received the
 * recovery at all. A console left open across a deploy would still go blank for
 * them while the other eleven recovered, which is exactly the kind of
 * "mostly fixed" that reads as broken.
 *
 * Mounting it once, above the shell, makes it impossible for a new console to
 * be written without it: the only way to skip it is to stop using `mountConsole`.
 */
export function RecoveryBoundary({
  appId,
  children,
}: {
  readonly appId: string;
  readonly children: ReactNode;
}): ReactElement {
  const { failure, dismiss } = useStaleBuildRecovery(appId);
  const [hidden, setHidden] = useState(false);

  return (
    <>
      {failure !== null && !hidden && (
        <div className="kit-recovery-banner" role="status">
          <Banner tone="warn" title="This page did not load">
            {failure}
          </Banner>
          <Button
            variant="quiet"
            size="small"
            onClick={() => {
              setHidden(true);
              dismiss();
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
      {children}
    </>
  );
}
