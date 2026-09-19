/**
 * BSDC — src/app/layouts/ErrorLayout.tsx
 * Purpose : Bare layout for error and offline pages (PART 24.2).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : No navigation is offered: a member who is offline or on a broken route should not be
 *           invited deeper into the app.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { Container } from '@/shared/ui/Container';
import { BrandLogo } from '@/shared/ui/BrandLogo';

/**
 * Renders a bare, centred layout.
 * @param props component props
 * @returns the layout
 */
export function ErrorLayout({ children }: { readonly children: ReactNode }): React.ReactElement {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg p-4">
      <BrandLogo variant="horizontal" height={40} />
      <Container width="prose" className="text-center">
        {children}
      </Container>
    </div>
  );
}
