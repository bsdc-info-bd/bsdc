import { Pencil, Trash2, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@/design-system';

/**
 * The owner's controls on a listing: edit, close/cancel, delete.
 *
 * Written once and used by a gig, a job, a group and an event, because those
 * four pages had the same gap for the same reason — the tables let their author
 * write them and no screen offered a form — and because four hand-written
 * confirm dialogs is four chances for one of them to describe a consequence
 * that the routine does not actually have. Every sentence here is supplied by
 * the page that owns the entity, so each surface keeps its own wording while
 * the behaviour (a confirm step, a typed consequence, a busy state, a refusal
 * surfaced as a toast) is identical.
 *
 * Rendered only when the server already said the reader may act. The routines
 * re-check on every write, so hiding these is a courtesy and not the boundary.
 */
export interface OwnerActionLabels {
  readonly edit: string;
  readonly close?: string;
  readonly delete: string;
  readonly closeTitle?: string;
  readonly closeBody?: string;
  readonly closeConfirm?: string;
  readonly deleteTitle: string;
  readonly deleteBody: string;
  readonly deleteConfirm: string;
  readonly cancel: string;
}

export interface OwnerActionsProps {
  labels: OwnerActionLabels;
  /** Opens the page's edit form. Omit to hide the edit control entirely. */
  onEdit?: () => void;
  /** Closing or cancelling: a soft, reversible-in-spirit state change. */
  onClose?: () => Promise<void>;
  /**
   * The delete. Runs only after the member confirms in the dialog. Omitted
   * where the routine allows correction but not removal — a group's moderator
   * may edit it, and only its owner may delete it.
   */
  onDelete?: () => Promise<void>;
  isClosing?: boolean;
  isDeleting?: boolean;
  /** Extra controls rendered in the same row (a proposal queue link, say). */
  children?: ReactNode;
}

export function OwnerActions({
  labels,
  onEdit,
  onClose,
  onDelete,
  isClosing = false,
  isDeleting = false,
  children,
}: OwnerActionsProps) {
  const { t } = useTranslation();
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {onEdit ? (
          <Button variant="outline" size="md" iconStart={<Pencil size={16} />} onClick={onEdit}>
            {labels.edit}
          </Button>
        ) : null}
        {onClose && labels.close ? (
          <Button
            variant="ghost"
            size="md"
            iconStart={<XCircle size={16} />}
            onClick={() => {
              setConfirmingClose(true);
            }}
          >
            {labels.close}
          </Button>
        ) : null}
        {onDelete ? (
          <Button
            variant="ghost"
            size="md"
            iconStart={<Trash2 size={16} />}
            onClick={() => {
              setConfirmingDelete(true);
            }}
          >
            {labels.delete}
          </Button>
        ) : null}
        {children}
      </div>

      {onClose && labels.closeTitle ? (
        <Modal
          open={confirmingClose}
          onClose={() => {
            setConfirmingClose(false);
          }}
          title={labels.closeTitle}
          closeLabel={t('common.close')}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmingClose(false);
                }}
              >
                {labels.cancel}
              </Button>
              <Button
                loading={isClosing}
                onClick={() => {
                  void (async () => {
                    await onClose();
                    setConfirmingClose(false);
                  })();
                }}
              >
                {labels.closeConfirm ?? labels.close}
              </Button>
            </div>
          }
        >
          {labels.closeBody ? <p className="text-sm">{labels.closeBody}</p> : null}
        </Modal>
      ) : null}

      {onDelete ? (
        <Modal
          open={confirmingDelete}
          onClose={() => {
            setConfirmingDelete(false);
          }}
          title={labels.deleteTitle}
          closeLabel={t('common.close')}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirmingDelete(false);
                }}
              >
                {labels.cancel}
              </Button>
              <Button
                variant="danger"
                loading={isDeleting}
                onClick={() => {
                  void (async () => {
                    await onDelete?.();
                    setConfirmingDelete(false);
                  })();
                }}
              >
                {labels.deleteConfirm}
              </Button>
            </div>
          }
        >
          <p className="text-sm">{labels.deleteBody}</p>
        </Modal>
      ) : null}
    </>
  );
}
