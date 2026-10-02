import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Empty,
  Loading,
  TextArea,
  checkDraft,
  groupMessages,
  listRpc,
  messageTime,
  sendMessage,
  subscribeMessages,
  unreadCount,
  useAsync,
  useCorporateEnv,
  useProfile,
  type ChatMessage,
  type CorporateEnv,
} from '@kit';
import { channelLabel, lastActivity, type ChannelRow } from './model';

const HISTORY = 200;

/**
 * Staff chat. Membership is a row in Postgres and messages are a stream in
 * the corporate realtime database, so who may read a channel survives a page
 * reload, a new device, and an argument about who said what.
 */
export function App(): ReactElement {
  return (
    <AppShell
      minRole="moderator"
      note="Corporate chat is for staff coordination and is retained."
      tabs={[{ id: 'channels', label: 'Channels', render: () => <Channels /> }]}
    />
  );
}

function Channels(): ReactElement {
  const env = useCorporateEnv();
  const load = useCallback(() => listRpc<ChannelRow>(env, 'my_channels'), [env]);
  const { state } = useAsync(load, [env]);
  const [openId, setOpenId] = useState<string | null>(null);

  if (state.status === 'loading') return <Loading label="Loading channels." />;
  if (state.status === 'error')
    return (
      <Banner tone="bad" title="Channels did not load">
        {state.message}
      </Banner>
    );
  if (state.data.length === 0) {
    return <Empty>You are not a member of any channel yet. An owner can add you to one.</Empty>;
  }

  const open = state.data.find((channel) => channel.id === openId) ?? state.data[0];

  return (
    <div className="kit-stack">
      <Card title="Channels" description="Only channels your role may read are listed.">
        <div className="kit-row">
          {state.data.map((channel) => (
            <Button
              key={channel.id}
              size="small"
              variant={channel.id === open?.id ? 'primary' : 'quiet'}
              onClick={() => {
                setOpenId(channel.id);
              }}
            >
              {channelLabel(channel)}
            </Button>
          ))}
        </div>
      </Card>
      {open && <Channel channel={open} />}
    </div>
  );
}

function Channel({ channel }: { channel: ChannelRow }): ReactElement {
  const env = useCorporateEnv();
  const profile = useProfile();
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [seenAt, setSeenAt] = useState<number | null>(null);

  useEffect(() => {
    setReady(false);
    setError('');
    let stop = (): void => undefined;
    try {
      stop = subscribeMessages(
        env as CorporateEnv,
        channel.id,
        HISTORY,
        (next) => {
          setMessages(next);
          setReady(true);
        },
        (cause) => {
          setError(cause.message);
          setReady(true);
        },
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The channel could not be opened.');
      setReady(true);
    }
    return () => {
      stop();
    };
  }, [env, channel.id]);

  const unread = unreadCount(messages, seenAt);

  return (
    <Card
      title={channel.name}
      description={channel.topic === '' ? undefined : channel.topic}
      actions={
        <span className="kit-row">
          <Badge>{channel.member_count} members</Badge>
          {unread > 0 && <Badge tone="warn">{unread} new</Badge>}
        </span>
      }
    >
      {error !== '' && (
        <Banner tone="bad" title="This channel is not available">
          {error}
        </Banner>
      )}
      {!ready ? (
        <Loading label="Loading messages." />
      ) : messages.length === 0 ? (
        <Empty>No messages yet. Say what you need.</Empty>
      ) : (
        <div className="kit-chat">
          {groupMessages(messages).map((group) => (
            <div key={`${group.authorUid}-${group.startedAt}`} className="kit-chat-group">
              <p className="kit-chat-meta">
                {group.authorName} — {messageTime(group.startedAt)}
              </p>
              {group.messages.map((message) => (
                <p key={message.id} className="kit-chat-body">
                  {message.body}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      <p className="kit-hint">Last activity: {lastActivity(messages)}</p>

      <Composer
        channelId={channel.id}
        author={profile}
        onSent={() => {
          setSeenAt(Date.now());
        }}
      />
    </Card>
  );
}

function Composer({
  channelId,
  author,
  onSent,
}: {
  channelId: string;
  author: { readonly uid: string; readonly displayName: string } | null;
  onSent: () => void;
}): ReactElement {
  const env = useCorporateEnv();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const send = (): void => {
    if (!author) return;
    const check = checkDraft(draft);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setBusy(true);
    setError('');
    sendMessage(env, channelId, { uid: author.uid, name: author.displayName }, check.body)
      .then(() => {
        setDraft('');
        onSent();
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'The message was not sent.');
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="kit-stack" style={{ marginTop: 'var(--sp-3)' }}>
      <TextArea
        label="Message"
        hint="Enter sends. Shift and enter starts a new line."
        error={error === '' ? undefined : error}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
      />
      <div className="kit-row">
        <Button disabled={busy || draft.trim() === ''} onClick={send}>
          {busy ? 'Sending' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
