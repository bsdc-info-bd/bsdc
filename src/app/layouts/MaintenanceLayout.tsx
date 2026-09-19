/**
 * BSDC — src/app/layouts/MaintenanceLayout.tsx
 * Purpose : Layout shown during a scheduled maintenance window (PART 03.05).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : The brand, the reason and the expected return time are always visible; nothing in the
 *           app is interactive while this layout is mounted.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { Container } from '@/shared/ui/Container';
import { BrandLogo } from '@/shared/ui/BrandLogo';

/** Props for the maintenance layout. */
export interface MaintenanceLayoutProps {
  readonly children: ReactNode;
}

/**
 * Renders the maintenance layout.
 * @param props component props
 * @returns the layout
 */
export function MaintenanceLayout({ children }: MaintenanceLayoutProps): React.ReactElement {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-bg p-4">
      <BrandLogo variant="stacked" height={160} />
      <Container width="prose" className="text-center">
        {children}
      </Container>
    </main>
  );
}
