import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Badge,
  Card,
  PageSkeleton,
  SectionHeading,
  SelectField,
  Switch,
} from '@/design-system';
import { usePermissions, usePlugins } from '@/hooks/use-admin';
import { canToggle, cascadeOff, groupByModule, missingDependencies } from '@/lib/admin/admin-types';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';

const ROLLOUTS = [0, 10, 25, 50, 75, 100];

/**
 * The plugin registry. Every feature on BSDC is here, and the dependency
 * graph is shown rather than hidden: turning one thing off says exactly what
 * else goes with it.
 */
export default function AdminPluginsPage() {
  const { t } = useTranslation();
  const { permissions, isLoading: permissionsLoading } = usePermissions();
  const canRead = permissions.includes('plugins.read');
  const canWrite = permissions.includes('plugins.write');
  const { plugins, isLoading, toggle, setRollout, isSaving } = usePlugins(canRead);

  async function onToggle(key: string, enabled: boolean): Promise<void> {
    try {
      await toggle(key, enabled);
      toast.success(enabled ? t('admin.pluginEnabled') : t('admin.pluginDisabled'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function onRollout(key: string, percent: number): Promise<void> {
    try {
      await setRollout(key, percent);
      toast.success(t('admin.rolloutSaved'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('admin.plugins.metaTitle')}
        description={t('admin.plugins.metaDescription')}
        path={ROUTES.adminPlugins}
        noindex
      />

      <div className="fab-container max-w-4xl py-6 sm:py-10">
        <SectionHeading
          title={t('admin.plugins.title')}
          description={t('admin.plugins.description')}
        />

        {permissionsLoading || isLoading ? <PageSkeleton label={t('common.loading')} /> : null}
        {!permissionsLoading && !canRead ? (
          <Alert tone="warning" title={t('admin.denied')} className="mt-4" />
        ) : null}
        {canRead && !canWrite ? (
          <Alert tone="info" title={t('admin.plugins.readOnly')} className="mt-4" />
        ) : null}

        {groupByModule(plugins).map(([module, items]) => (
          <section key={module} className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {t(`admin.modules.${module}`, { defaultValue: module })}
            </h2>
            <ul className="mt-2 grid gap-2">
              {items.map((plugin) => {
                const cascade = cascadeOff(plugins, plugin.key);
                const missing = missingDependencies(plugins, plugin.key);
                const disabled = !canWrite || isSaving || !canToggle(plugin, !plugin.enabled);

                return (
                  <Card as="li" key={plugin.key}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{plugin.label}</p>
                          {plugin.isCore ? (
                            <Badge tone="blue">{t('admin.plugins.core')}</Badge>
                          ) : null}
                          {plugin.blockedBy.length > 0 ? (
                            <Badge tone="warn">{t('admin.plugins.blocked')}</Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted">{plugin.description}</p>
                        <p className="mt-1 font-mono text-2xs text-muted">{plugin.key}</p>

                        {plugin.blockedBy.length > 0 ? (
                          <p className="mt-1 text-xs text-warn">
                            {t('admin.plugins.blockedBy', { keys: plugin.blockedBy.join(', ') })}
                          </p>
                        ) : null}
                        {!plugin.enabled && missing.length > 0 ? (
                          <p className="mt-1 text-xs text-muted">
                            {t('admin.plugins.needsFirst', { keys: missing.join(', ') })}
                          </p>
                        ) : null}
                        {plugin.enabled && cascade.length > 0 ? (
                          <p className="mt-1 text-xs text-muted">
                            {t('admin.plugins.cascade', { keys: cascade.join(', ') })}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex min-w-[9rem] flex-col items-end gap-2">
                        <Switch
                          checked={plugin.enabled}
                          disabled={disabled}
                          label={plugin.enabled ? t('admin.plugins.on') : t('admin.plugins.off')}
                          onCheckedChange={(checked) => {
                            void onToggle(plugin.key, checked);
                          }}
                        />
                        <SelectField
                          label={t('admin.plugins.rollout')}
                          value={String(plugin.rolloutPercent)}
                          disabled={!canWrite || isSaving}
                          options={ROLLOUTS.map((percent) => ({
                            value: String(percent),
                            label: `${String(percent)}%`,
                          }))}
                          onChange={(event) => {
                            void onRollout(plugin.key, Number.parseInt(event.target.value, 10));
                          }}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
