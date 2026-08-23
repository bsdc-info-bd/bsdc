/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar, MobileSidebar, BottomNav } from './Navigation';
import { Footer } from './Footer';
import { FullPageLoader } from '@/components/ui/Skeleton';
import { OfflineBanner, AnnouncementBanner } from './OfflineBanner';
import { useOnlineStatus } from '@/hooks/useMediaQuery';
import { listenSystemSettings } from '@/lib/firestore';
import { useUIStore } from '@/stores/uiStore';
import { toast } from 'sonner';

export function MainLayout() {
  const location = useLocation();
  const online = useOnlineStatus();
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const setSystemSettings = useUIStore((s) => s.setSystemSettings);

  // Check if the current route is a message page
  const isMessagePage = location.pathname.startsWith('/messages');

  useEffect(() => {
    setMobileNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname, setMobileNavOpen]);

  useEffect(() => {
    const unsub = listenSystemSettings((settings) => setSystemSettings(settings));
    return unsub;
  }, [setSystemSettings]);

  useEffect(() => {
    if (!online) toast.warning('You are offline — showing cached content');
  }, [online]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>
      
      {/* Hide header on mobile chat view if you want true full-screen, or keep it */}
      <Header />
      <AnnouncementBanner />
      {!online ? <OfflineBanner /> : null}

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 overflow-hidden px-3 sm:px-4 lg:px-6">
        {!isMessagePage && <Sidebar />}
        
        {/* Main section becomes a rigid flex container when on messages */}
        <main id="main-content" className={`min-w-0 flex-1 flex flex-col ${isMessagePage ? 'py-0 pb-0' : 'py-4 pb-24 lg:pb-8 overflow-y-auto'}`}>
          <Suspense fallback={<FullPageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Hide footer and bottom nav on message pages so they don't block the input box */}
      {!isMessagePage && <Footer />}
      {!isMessagePage && <MobileSidebar />}
      {!isMessagePage && <BottomNav />}
    </div>
  );
}
