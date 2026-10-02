import { Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageSkeleton,
  SectionHeading,
  SelectField,
  TextField,
} from '@/design-system';
import { useAdminPeople, usePermissions } from '@/hooks/use-admin';
import { assignableRoles, type AccountStatus, type Role } from '@/lib/admin/admin-types';
import { formatAbsoluteDate } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { useAuthStore } from '@/store/auth-store';

const STATUSES: AccountStatus[] = ['active', 'suspended', 'deactivated'];

/** Roles and account standing. The database refuses an escalation anyway. */
export default function AdminPeoplePage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const uid = useAuthStore((state) => state.user?.uid ?? '');
  const actorRole = useAuthStore((state) => state.claims.role);
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const canRead = permissions.includes('people.read');
  const canRole = permissions.includes('people.role');
  const canSuspend = permissions.includes('people.suspend');
  const people = useAdminPeople(canRead);
  const [reason, setReason] = useState('');

  async function changeRole(targetUid: string, role: Role): Promise<void> {
    try {
      await people.setRole(targetUid, role);
      toast.success(t('admin.people.roleChanged'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function changeStatus(targetUid: string, status: AccountStatus): Promise<void> {
    try {
      await people.setStatus(targetUid, status, reason.trim());
      toast.success(t('admin.people.statusChanged'));
      setReason('');
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('admin.people.metaTitle')}
        description={t('admin.people.metaDescription')}
        path={ROUTES.adminPeople}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading
          title={t('admin.people.title')}
          description={t('admin.people.description')}
        />

        {permissionsLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {!permissionsLoading && !canRead ? (
          <Alert tone="warning" title={t('admin.denied')} className="mt-4" />
        ) : null}

        {canRead ? (
          <>
            <Card className="mt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={t('admin.people.search')}
                  type="search"
                  value={people.search}
                  maxLength={60}
                  onChange={(event) => {
                    people.setSearch(event.target.value);
                  }}
                />
                <TextField
                  label={t('admin.people.reason')}
                  value={reason}
                  hint={t('admin.people.reasonHint')}
                  maxLength={500}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                />
              </div>
            </Card>

            {people.isLoading ? <PageSkeleton label={t('common.loading')} /> : null}

            {!people.isLoading && people.people.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={<Users size={22} />}
                  title={t('admin.people.emptyTitle')}
                  description={t('admin.people.emptyBody')}
                />
              </div>
            ) : null}

            <ul className="mt-4 grid gap-3">
              {people.people.map((person) => {
                const roles = assignableRoles(actorRole, person.role);
                const isSelf = person.uid === uid;
                return (
                  <Card as="li" key={person.uid}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{person.displayName}</p>
                        <p className="mt-1 text-xs text-muted">
                          {person.username !== null ? `@${person.username} · ` : ''}
                          {formatAbsoluteDate(new Date(person.createdAt), language)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone="blue">{t(`admin.roles.${person.role}`)}</Badge>
                        <Badge tone={person.status === 'active' ? 'green' : 'danger'}>
                          {t(`admin.accountStatuses.${person.status}`)}
                        </Badge>
                      </div>
                    </div>

                    {isSelf ? (
                      <p className="mt-3 text-xs text-muted">{t('admin.people.selfNote')}</p>
                    ) : (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {canRole && roles.length > 0 ? (
                          <SelectField
                            label={t('admin.people.role')}
                            value={person.role}
                            disabled={people.isSaving}
                            options={[
                              { value: person.role, label: t(`admin.roles.${person.role}`) },
                              ...roles.map((role) => ({
                                value: role,
                                label: t(`admin.roles.${role}`),
                              })),
                            ]}
                            onChange={(event) => {
                              void changeRole(person.uid, event.target.value as Role);
                            }}
                          />
                        ) : null}

                        {canSuspend ? (
                          <div className="flex flex-wrap items-end gap-2">
                            {STATUSES.filter((status) => status !== person.status).map((status) => (
                              <Button
                                key={status}
                                size="sm"
                                variant={status === 'active' ? 'primary' : 'ghost'}
                                disabled={people.isSaving}
                                onClick={() => {
                                  void changeStatus(person.uid, status);
                                }}
                              >
                                {t(`admin.people.setStatus.${status}`)}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </Card>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
    </>
  );
}
