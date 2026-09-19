/**
 * BSDC — src/app/layouts/PublicLayout.tsx
 * Purpose : Layout for public, indexable pages: header, centred content, footer (PART 07.01).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Public pages get the network hub in an aside so the RRC ecosystem is discoverable
 *           without depending on the app feed.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopBar } from '@/widgets/header/TopBar';
import { SiteFooter } from '@/widgets/footer/SiteFooter';
import { NetworkHub } from '@/widgets/footer/NetworkHub';
import { RouteErrorBoundary } from '../boundaries/RouteErrorBoundary';
import { Container } from '@/shared/ui/Container';

/**
 * Renders the public layout.
 * @returns the layout
 */
export function PublicLayout(): React.ReactElement {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <a className="bsdc-skip-link" href="#main-content">
        Skip to content
      </a>
      <TopBar />
      <main id="main-content" className="flex-1">
        <Container className="py-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <RouteErrorBoundary>
                <Outlet />
              </RouteErrorBoundary>
            </div>
            <aside className="min-w-0" aria-label="RRC network">
              <NetworkHub />
            </aside>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
