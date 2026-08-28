import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useAuthStore } from '@/stores/authStore';

export function AppLayout() {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header />
      <Sidebar />
      <main
        className="pt-14 pb-16 md:pb-0 lg:pl-64 transition-all duration-200"
        role="main"
        id="main-content"
      >
        <div className="container-app py-6">
          <Outlet />
        </div>
      </main>
      {isAuthenticated && <BottomNav />}
      {!isAuthenticated && <BottomNav />}
    </div>
  );
}

export function AuthLayout() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <Outlet />
    </div>
  );
}

export function FullWidthLayout() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Header />
      <main className="pt-14" role="main" id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
