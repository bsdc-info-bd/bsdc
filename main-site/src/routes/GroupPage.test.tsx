import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as I18nModule from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Group } from '@/lib/communities/community-types';
import GroupPage from './GroupPage';

interface OwnerStub {
  save: (groupId: string, input: unknown) => Promise<void>;
  remove: (groupId: string) => Promise<void>;
  isSaving: boolean;
  isRemoving: boolean;
}

const hooks = vi.hoisted(() => ({
  useGroup: vi.fn(),
  owner: vi.fn<() => OwnerStub>(),
}));

vi.mock('@/hooks/use-communities', () => ({
  useGroup: hooks.useGroup,
  useGroupOwnerActions: () => hooks.owner(),
}));
vi.mock('@/components/seo/Seo', () => ({ Seo: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  };
});

const auth = vi.hoisted(() => ({
  user: null as null | { uid: string },
  claims: null as null | { staff: boolean },
}));
vi.mock('@/store/auth-store', () => ({
  selectIsSignedIn: (state: { user: unknown }) => state.user !== null,
  useAuthStore: (selector: (state: { user: unknown; claims: unknown }) => unknown): unknown =>
    selector(auth),
}));

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    slug: 'dhaka-js',
    name: 'Dhaka JS',
    description: 'The JavaScript community of Dhaka.',
    privacy: 'public',
    avatarUrl: '',
    coverUrl: '',
    rules: 'Be kind.',
    language: 'bn',
    ownerUid: 'owner-uid',
    isArchived: false,
    members: 42,
    posts: 7,
    myRole: null,
    requestStatus: null,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    group: group(),
    channels: [],
    members: [],
    requests: [],
    isLoading: false,
    isError: false,
    join: vi.fn(() => Promise.resolve('approved')),
    leave: vi.fn(() => Promise.resolve()),
    decide: vi.fn(() => Promise.resolve()),
    refresh: vi.fn(),
    ...overrides,
  };
}

function renderGroup() {
  return render(
    <MemoryRouter initialEntries={['/groups/dhaka-js']}>
      <Routes>
        <Route path="/groups/:slug" element={<GroupPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = null;
  auth.claims = null;
  hooks.useGroup.mockReset();
  hooks.owner.mockReset();
  hooks.owner.mockReturnValue({
    save: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    isSaving: false,
    isRemoving: false,
  });
});

describe('GroupPage owner controls', () => {
  it('offers edit and delete to the owner', () => {
    auth.user = { uid: 'owner-uid' };
    hooks.useGroup.mockReturnValue(state({ group: group({ myRole: 'owner' }) }));
    renderGroup();
    expect(screen.getByRole('button', { name: 'groups.manage.edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'groups.manage.delete' })).toBeInTheDocument();
  });

  it('lets a moderator correct the group but not delete it', () => {
    // `update_group` admits a moderator and `delete_group` does not; offering
    // the delete here would be a button whose only outcome is a refusal.
    auth.user = { uid: 'mod-uid' };
    hooks.useGroup.mockReturnValue(state({ group: group({ myRole: 'moderator' }) }));
    renderGroup();
    expect(screen.getByRole('button', { name: 'groups.manage.edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'groups.manage.delete' })).toBeNull();
  });

  it('offers nothing to a plain member or a stranger', () => {
    auth.user = { uid: 'member-uid' };
    hooks.useGroup.mockReturnValue(state({ group: group({ myRole: 'member' }) }));
    const first = renderGroup();
    expect(screen.queryByRole('button', { name: 'groups.manage.edit' })).toBeNull();
    first.unmount();

    auth.user = null;
    hooks.useGroup.mockReturnValue(state());
    renderGroup();
    expect(screen.queryByRole('button', { name: 'groups.manage.edit' })).toBeNull();
  });

  it('opens the edit form with the group already in it and the address read-only', () => {
    auth.user = { uid: 'owner-uid' };
    hooks.useGroup.mockReturnValue(state({ group: group({ myRole: 'owner' }) }));
    renderGroup();
    fireEvent.click(screen.getByRole('button', { name: 'groups.manage.edit' }));
    const dialog = screen.getByRole('dialog', { name: 'groups.manage.editTitle' });
    const name = within(dialog).getByLabelText<HTMLInputElement>('groups.manage.nameLabel');
    expect(name.value).toBe('Dhaka JS');
    // The address is shown, never editable: `update_group` does not take one.
    expect(within(dialog).getByText('dhaka-js')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('groups.manage.slugLabel')).toBeNull();
  });

  it('asks before deleting and explains what happens to the posts', async () => {
    auth.user = { uid: 'owner-uid' };
    const remove = vi.fn(() => Promise.resolve());
    hooks.owner.mockReturnValue({
      save: vi.fn(() => Promise.resolve()),
      remove,
      isSaving: false,
      isRemoving: false,
    });
    hooks.useGroup.mockReturnValue(state({ group: group({ myRole: 'owner' }) }));
    renderGroup();

    fireEvent.click(screen.getByRole('button', { name: 'groups.manage.delete' }));
    const dialog = screen.getByRole('dialog', { name: 'groups.manage.deleteTitle' });
    expect(within(dialog).getByText('groups.manage.deleteBody')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'groups.manage.deleteConfirm' }));
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith('group-1');
    });
  });

  it('shows staff the controls even without a membership', () => {
    auth.user = { uid: 'staff-uid' };
    auth.claims = { staff: true };
    hooks.useGroup.mockReturnValue(state());
    renderGroup();
    expect(screen.getByRole('button', { name: 'groups.manage.edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'groups.manage.delete' })).toBeInTheDocument();
  });
});
