/**
 * The corporate kit: everything the corporate consoles share. It is
 * compiled from source by each app through a path alias rather than
 * published as a package, so a change here is type-checked by every console
 * that depends on it in the same commit.
 */
export * from './data/env';
export * from './data/client';
export * from './data/rpc';
export * from './data/session';
export * from './data/realtime';
export * from './domain/config';
export * from './domain/pages';
export * from './domain/staff';
export * from './domain/ip';
export * from './domain/status';
export * from './domain/chat';
export * from './domain/trust';
export * from './domain/seo';
export * from './domain/brand';
export * from './pdf/document';
export * from './pdf/qr';
export * from './ui/primitives';
export * from './ui/AppShell';
export * from './ui/useAsync';
export { mountConsole } from './mount';
