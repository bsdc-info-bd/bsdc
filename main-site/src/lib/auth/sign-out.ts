/**
 * Sign-out helper that keeps the Firebase SDK out of the initial bundle: the
 * app bar links to it, so it must not pull firebase/auth into the eager graph.
 */
export async function signOutNow(): Promise<void> {
  const { logout } = await import('./auth-service');
  await logout();
}
