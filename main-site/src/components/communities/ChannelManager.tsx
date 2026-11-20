import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, Modal, TextField } from '@/design-system';
import { dataErrorKey } from '@/lib/supabase/errors';
import type { Channel } from '@/lib/communities/community-types';

/** What `create_channel` accepts (migration 0130). */
export interface ChannelCreateDraft {
  slug: string;
  name: string;
  topic: string;
}

export interface ChannelManagerProps {
  isSaving: boolean;
  onCreate: (draft: ChannelCreateDraft) => Promise<void>;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * The channel manager: build a room, name it, order it, close it.
 *
 * Every action is one call to the 0130 routine — the same rule the row-level
 * policy applies — so this component never writes the `channels` table
 * itself. The create form validates the slug and name the way the routine
 * does, so the member learns before the server answers.
 */
export function ChannelManager({ isSaving, onCreate }: ChannelManagerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');

  const slugInvalid = slug.trim().length > 0 && !SLUG_PATTERN.test(slug.trim());
  const nameInvalid = name.trim().length === 0 || name.trim().length > 60;
  const topicTooLong = topic.length > 300;
  const invalid = slugInvalid || nameInvalid || topicTooLong;

  async function submit() {
    try {
      await onCreate({ slug: slug.trim(), name: name.trim(), topic: topic.trim() });
      setOpen(false);
      setSlug('');
      setName('');
      setTopic('');
      toast.success(t('channels.admin.created'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t('channels.admin.create')}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('channels.admin.createTitle')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={isSaving} disabled={invalid} onClick={() => void submit()}>
              {t('channels.admin.create')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label={t('channels.admin.slug')}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            {...(slugInvalid ? { hint: t('channels.admin.slugHint') } : {})}
          />
          <TextField
            label={t('channels.admin.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            {...(nameInvalid ? { hint: t('channels.admin.nameHint') } : {})}
          />
          <TextField
            label={t('channels.admin.topic')}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            {...(topicTooLong ? { hint: t('channels.admin.topicHint') } : {})}
          />
        </div>
      </Modal>
    </>
  );
}

/**
 * One channel's row controls: rename in place, move up or down, and close or
 * open. The rename is committed with a single `update_channel` call that
 * sends only what changed.
 */
export function ChannelRowControls({
  channel,
  index,
  total,
  isSaving,
  onRename,
  onMove,
  onToggleReadOnly,
}: {
  channel: Channel;
  index: number;
  total: number;
  isSaving: boolean;
  onRename: (channelId: string, name: string, topic: string) => Promise<void>;
  onMove: (channelId: string, position: number) => Promise<void>;
  onToggleReadOnly: (channel: Channel) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic);

  async function save() {
    try {
      await onRename(channel.id, name.trim(), topic.trim());
      setEditing(false);
      toast.success(t('channels.admin.saved'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function move(delta: number) {
    try {
      await onMove(channel.id, channel.position + delta);
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  async function toggle() {
    try {
      await onToggleReadOnly(channel);
      toast.success(channel.isReadOnly ? t('channels.admin.opened') : t('channels.admin.closed'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <TextField
          label={t('channels.admin.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          label={t('channels.admin.topic')}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" loading={isSaving} onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        {t('channels.admin.editTitle')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={index === 0}
        onClick={() => void move(-1)}
        title={t('channels.admin.positionUp')}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={index === total - 1}
        onClick={() => void move(1)}
        title={t('channels.admin.positionDown')}
      >
        ↓
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void toggle()}>
        {channel.isReadOnly ? t('channels.admin.open') : t('channels.admin.close')}
      </Button>
    </div>
  );
}
