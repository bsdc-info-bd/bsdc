import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button, TextareaField } from '@/design-system';
import { dataErrorKey } from '@/lib/supabase/errors';

export interface CommentFormProps {
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  placeholder: string;
  submitLabel: string;
  busy?: boolean;
}

const MAX_LENGTH = 4000;

/** Shared by the thread composer and every reply box. */
export function CommentForm({
  onSubmit,
  onCancel,
  placeholder,
  submitLabel,
  busy = false,
}: CommentFormProps) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX_LENGTH;

  async function submit() {
    if (trimmed.length === 0 || tooLong) return;
    setSaving(true);
    try {
      await onSubmit(trimmed);
      setBody('');
      onCancel?.();
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextareaField
        label={placeholder}
        rows={3}
        value={body}
        maxLength={MAX_LENGTH}
        counterMax={MAX_LENGTH}
        onChange={(event) => {
          setBody(event.target.value);
        }}
        hint={t('interactions.commentHint')}
        error={tooLong ? t('interactions.commentTooLong') : undefined}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={trimmed.length === 0 || tooLong || saving || busy}
        >
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
