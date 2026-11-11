import { useCallback, useState, type ReactElement } from 'react';
import {
  Banner,
  BulkBar,
  Button,
  Card,
  Empty,
  Loading,
  Select,
  Table,
  TextArea,
  callRpc,
  getDb,
  listRpc,
  messageOf,
  toDataError,
  useAsync,
  useCorporateEnv,
  type RedirectRow,
} from '@kit';

/**
 * Unified bulk governance workbench inside admin-site for batch shop/campaign
 * decisions and batch redirect / SEO cleanup.
 */
export function BulkWorkbench(): ReactElement {
  const env = useCorporateEnv();
  const [target, setTarget] = useState<'shops' | 'campaigns' | 'redirects' | 'seo'>('shops');
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    if (target === 'shops') {
      const rows = await listRpc<{ id: string; name: string; city: string; owner_name: string }>(
        env,
        'admin_pending_shops',
        { p_limit: 100 },
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.name,
        subtitle: `${r.city} · ${r.owner_name}`,
      }));
    }
    if (target === 'campaigns') {
      const rows = await listRpc<{
        id: string;
        name: string;
        owner_name: string;
        creative_count: number;
      }>(env, 'admin_pending_campaigns', { p_limit: 100 });
      return rows.map((r) => ({
        id: r.id,
        title: r.name,
        subtitle: `${r.owner_name} · ${r.creative_count} creatives`,
      }));
    }
    if (target === 'redirects') {
      const { data, error } = await getDb(env)
        .from('redirects')
        .select('from_path, to_path, status, hits')
        .order('hits', { ascending: true })
        .limit(100);
      if (error) throw toDataError(error);
      return ((data ?? []) as RedirectRow[]).map((r) => ({
        id: r.from_path,
        title: `${r.from_path} -> ${r.to_path}`,
        subtitle: `HTTP ${r.status} · ${r.hits} hits`,
      }));
    }
    const { data, error } = await getDb(env)
      .from('seo_overrides')
      .select('path, title, robots')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw toDataError(error);
    return ((data ?? []) as Array<{ path: string; title: string; robots: string }>).map((r) => ({
      id: r.path,
      title: r.path,
      subtitle: `${r.title || 'Untitled'} (${r.robots})`,
    }));
  }, [env, target]);

  const { state, reload } = useAsync(load, [env, target]);

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runBatch = async (approve: boolean): Promise<void> => {
    if (selected.length === 0) return;
    setBusy(true);
    setFeedback('');
    try {
      if (target === 'shops') {
        if (!approve && reason.trim().length < 4) {
          throw new Error('Refusing shops requires a reason of at least 4 characters.');
        }
        const count = await callRpc<number>(env, 'bulk_decide_shops', {
          p_shop_ids: selected,
          p_approve: approve,
          p_reason: approve ? '' : reason.trim(),
        });
        setFeedback(`Processed ${count} shop(s).`);
      } else if (target === 'campaigns') {
        if (!approve && reason.trim().length < 4) {
          throw new Error('Refusing campaigns requires a reason of at least 4 characters.');
        }
        const count = await callRpc<number>(env, 'bulk_decide_campaigns', {
          p_campaign_ids: selected,
          p_approve: approve,
          p_note: approve ? '' : reason.trim(),
        });
        setFeedback(`Processed ${count} campaign(s).`);
      } else if (target === 'redirects') {
        for (const fromPath of selected) {
          await callRpc<boolean>(env, 'remove_redirect', { p_from: fromPath });
        }
        setFeedback(`Removed ${selected.length} redirect(s).`);
      } else {
        for (const path of selected) {
          await callRpc<boolean>(env, 'clear_seo_override', { p_path: path });
        }
        setFeedback(`Cleared ${selected.length} SEO override(s).`);
      }
      setSelected([]);
      setReason('');
      reload();
    } catch (cause) {
      setFeedback(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kit-stack">
      <Card
        title="Bulk Operations Workbench"
        description="Execute auditable batch decisions on shops, campaigns, redirects, or SEO overrides from one workspace."
      >
        <div className="kit-grid kit-grid--2">
          <Select
            label="Target Queue"
            value={target}
            options={[
              { value: 'shops', label: 'Pending Shops' },
              { value: 'campaigns', label: 'Pending Campaigns' },
              { value: 'redirects', label: 'Active Redirects' },
              { value: 'seo', label: 'SEO Overrides' },
            ]}
            onChange={(e) => {
              setSelected([]);
              setFeedback('');
              setTarget(e.target.value as 'shops' | 'campaigns' | 'redirects' | 'seo');
            }}
          />
          {(target === 'shops' || target === 'campaigns') && (
            <TextArea
              label="Batch Refusal Note (required for refuse)"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
        </div>
      </Card>

      {feedback !== '' && (
        <Banner tone="neutral" title="Batch Result">
          <p className="kit-small">{feedback}</p>
        </Banner>
      )}

      {state.status === 'loading' && <Loading label="Loading queue items." />}
      {state.status === 'error' && (
        <Banner tone="bad" title="Could not load queue">
          {state.message}
        </Banner>
      )}
      {state.status === 'ready' && state.data.length === 0 && (
        <Empty>No records available in this queue.</Empty>
      )}
      {state.status === 'ready' && state.data.length > 0 && (
        <Card
          title={`Selectable Items (${state.data.length})`}
          actions={
            <div className="kit-row">
              <Button
                size="small"
                variant="quiet"
                onClick={() => setSelected(state.data.map((i) => i.id))}
              >
                Select All
              </Button>
              <Button size="small" variant="quiet" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          }
        >
          <Table caption="Bulk items" head={['Select', 'Record', 'Detail']}>
            {state.data.map((item) => (
              <tr key={item.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.title}`}
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                </td>
                <td>
                  <strong>{item.title}</strong>
                  <div className="kit-mono kit-small kit-muted">{item.id}</div>
                </td>
                <td className="kit-small">{item.subtitle}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <BulkBar selectedCount={selected.length} onClear={() => setSelected([])}>
        {target === 'shops' || target === 'campaigns' ? (
          <>
            <Button
              size="small"
              disabled={busy}
              onClick={() => {
                void runBatch(true);
              }}
            >
              Approve Selected
            </Button>
            <Button
              size="small"
              variant="danger"
              disabled={busy || reason.trim().length < 4}
              onClick={() => {
                void runBatch(false);
              }}
            >
              Refuse Selected
            </Button>
          </>
        ) : (
          <Button
            size="small"
            variant="danger"
            disabled={busy}
            onClick={() => {
              void runBatch(false);
            }}
          >
            Remove Selected
          </Button>
        )}
      </BulkBar>
    </div>
  );
}
export default BulkWorkbench;
