import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageComposer } from '@/components/messaging/MessageComposer';
import { changeLanguage } from '@/i18n';

vi.mock('@/hooks/use-voice-recorder', () => ({
  useVoiceRecorder: () => ({
    state: 'unsupported',
    blockKey: 'chat.voice.noRecorder',
    errorKey: null,
    dismissError: vi.fn(),
  }),
}));

function Harness({
  onSend,
  disabled = false,
}: {
  onSend: (body: string, reply: string | null) => Promise<void>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  return (
    <MessageComposer
      draft={draft}
      onDraftChange={setDraft}
      onSend={onSend}
      onSendAttachment={vi.fn()}
      onTyping={vi.fn()}
      replyTo={null}
      onCancelReply={vi.fn()}
      editing={null}
      onCancelEdit={vi.fn()}
      onSaveEdit={vi.fn()}
      memberName={() => 'Member'}
      disabled={disabled}
    />
  );
}

beforeEach(async () => {
  await changeLanguage('en');
});

describe('composer interaction', () => {
  it('does not send while an IME is composing or on Shift+Enter', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSend={send} />);
    const input = screen.getByLabelText('Write a message');
    fireEvent.change(input, { target: { value: 'বাংলা' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    expect(input).toHaveValue('বাংলা');
  });

  it('queues once, clears immediately, and remains usable while delivery is pending', async () => {
    const send = vi.fn().mockImplementation(() => new Promise(() => {}));
    render(<Harness onSend={send} />);
    const input = screen.getByLabelText('Write a message');
    fireEvent.change(input, { target: { value: 'First' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('First', null);
    expect(input).toHaveValue('');
    await Promise.resolve();
    fireEvent.change(input, { target: { value: 'Second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('Second', null);
  });

  it('disables sending and attachments when the thread is unavailable', () => {
    const send = vi.fn().mockResolvedValue(undefined);
    render(<Harness onSend={send} disabled />);
    expect(screen.getByLabelText('Write a message')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Attach an image' })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Write a message'), { key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });
});
