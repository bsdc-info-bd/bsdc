/**
 * BSDC — src/pages/messages/MessagesPage.tsx
 * Purpose : The messenger route: conversation rail on the left, open thread on the right.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : On a phone the rail and the thread are the same column: the thread replaces the rail
 *   and a back control returns to it. On a laptop both are visible. This is one component with a
 *   responsive layout, not two screens, so state is never lost on a rotation.
 *   The route is `noindex` and requires a session: a messenger has no business in a search index.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/Button';
import { Container } from '@/shared/ui/Container';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Heading, Text } from '@/shared/ui/Typography';
import { Spinner } from '@/shared/ui/Spinner';
import { RequireAuth, useSession } from '@/features/auth';
import { ChatPanel, ConversationList, type ConversationRow } from '@/features/messenger';
import { listConversations, listMessages, peekMessages } from '@/entities/conversation/repository';
import type { Conversation } from '@/entities/conversation/model';

/**
 * Renders the messenger route behind the session guard.
 * @returns the messages page
 */
export function MessagesPage(): React.ReactElement {
  return (
    <RequireAuth reason="messenger">
      <MessagesWorkspace />
    </RequireAuth>
  );
}

/**
 * Renders the messenger workspace for a signed-in person.
 * @returns the workspace
 */
function MessagesWorkspace(): React.ReactElement {
  const { t } = useTranslation('messenger');
  const { session, profile, locale } = useSession();
  const uid = session.uid ?? '';
  const [conversations, setConversations] = useState<readonly Conversation[]>([]);
  const [rows, setRows] = useState<readonly ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (uid.length === 0) return;
    setLoading(true);
    const page = await listConversations(uid);
    setConversations(page.items);
    setOffline(page.source === 'local');

    const withPreviews: ConversationRow[] = [];
    for (const conversation of page.items) {
      const messages = await peekMessages(conversation.id);
      const last = messages[messages.length - 1] ?? null;
      if (last === null && conversation.lastMessagePreview.length === 0) continue;
      withPreviews.push({ conversation, lastMessage: last });
    }
    setRows(withPreviews);
    setActiveId((current) => current ?? withPreviews[0]?.conversation.id ?? null);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [activeId, conversations],
  );

  return (
    <Container className="py-6">
      <header className="bsdc-page__head">
        <Heading level={1} size="xl" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('title')}
        </Heading>
        <Text as="p" tone="muted" lang={locale === 'bn' ? 'bn' : 'en'}>
          {t('subtitle')}
        </Text>
      </header>

      {offline ? (
        <Text as="p" role="status" className="bsdc-page__note">
          {t('deviceOnly')}
        </Text>
      ) : null}

      <div className="bsdc-messenger" data-has-thread={active !== null ? 'true' : 'false'}>
        <div className="bsdc-messenger__rail">
          {loading ? (
            <div className="bsdc-page__loading" role="status">
              <Spinner size={24} label={t('loading')} />
            </div>
          ) : (
            <ConversationList
              rows={rows}
              locale={locale}
              viewerUid={uid}
              activeId={activeId}
              onSelect={(id) => void openThread(id)}
            />
          )}
        </div>

        <div className="bsdc-messenger__thread">
          {active !== null && profile !== null ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="bsdc-messenger__back"
                onClick={() => setActiveId(null)}
              >
                {t('backToList')}
              </Button>
              <ChatPanel conversation={active} viewer={profile} locale={locale} />
            </>
          ) : rows.length === 0 && !loading ? (
            <EmptyState
              illustration="welcome"
              title={t('emptyTitle')}
              description={t('emptyBody')}
            />
          ) : (
            <EmptyState
              illustration="welcome"
              title={t('chooseTitle')}
              description={t('chooseBody')}
            />
          )}
        </div>
      </div>
    </Container>
  );

  /**
   * Opens a thread and refreshes its history from the backend.
   * @param conversationId conversation id
   */
  async function openThread(conversationId: string): Promise<void> {
    setActiveId(conversationId);
    await listMessages(conversationId);
  }
}
