import { useCallback, useEffect, useMemo, useState } from 'react';
import { Home, MapPin, Pencil, Briefcase, Building2, Plus, Star, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { LocationPicker } from '@/components/mk/LocationPicker';
import { Button, Modal, Switch, TextField, TextareaField } from '@/design-system';
import { cn } from '@/lib/cn';
import type { MkCopy } from '@/lib/mk/mk-copy';
import {
  ADDRESS_LABELS,
  ADDRESS_MAX,
  addressDraftErrors,
  evaluateShopDelivery,
  formatTaka,
  type AddressLabel,
  type Language,
} from '@/lib/mk/mk-logic';
import {
  addressHeadline,
  editorToInput,
  emptyAddressEditor,
  type AddressEditorValue,
} from '@/lib/mk/mk-address';
import type { MkAddressInput, MkSavedAddress, MkShopDelivery } from '@/lib/mk/mk-types';

/**
 * The address book (0131).
 *
 * Two pieces in one file, because they are one decision: a member picks a door here and edits it
 * there, and both must agree on what makes an address worth saving. The editor deliberately refuses
 * what `mk_save_address` refuses — the same checks, in the same order — so a member is never shown
 * a green field the database calls invalid, and never shown an error the database would have
 * accepted. The pin is not decoration: it is what `mk_place_order` measures the delivery charge and
 * the shop's radius from, so an address without one is not a partial address but no address.
 */

const LABEL_ICONS: Record<AddressLabel, ReactNode> = {
  home: <Home size={15} aria-hidden />,
  work: <Briefcase size={15} aria-hidden />,
  other: <Building2 size={15} aria-hidden />,
};

function labelFor(label: AddressLabel, copy: MkCopy): string {
  return copy.buyer.addressLabel[label];
}

interface AddressBookProps {
  addresses: MkSavedAddress[];
  selectedId: string | null;
  copy: MkCopy;
  language: Language;
  delivery: MkShopDelivery | undefined;
  onPick: (address: MkSavedAddress) => void;
  onNew: () => void;
  onEdit: (address: MkSavedAddress) => void;
  onDelete: (address: MkSavedAddress) => void;
}

/**
 * The saved doors, in the order the routine returned them: the default first, then whatever the
 * member has actually been ordering to. Nothing here re-sorts — a client that ordered the list
 * itself would disagree with the phone next door about which address "first" is.
 */
export function AddressBook({
  addresses,
  selectedId,
  copy,
  language,
  delivery,
  onPick,
  onNew,
  onEdit,
  onDelete,
}: AddressBookProps) {
  const full = addresses.length >= ADDRESS_MAX;
  return (
    <div className="space-y-3">
      {addresses.length === 0 ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">{copy.buyer.noAddresses}</p>
      ) : (
        <ul
          className="grid gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-label={copy.buyer.addressPick}
        >
          {addresses.map((address) => {
            const selected = address.id === selectedId;
            // The fee shown on the card is the fee that will be charged: the same evaluation the
            // summary uses, run against this address's own pin.
            const quote = evaluateShopDelivery(delivery, { lat: address.lat, lng: address.lng });
            return (
              <li key={address.id}>
                <div
                  className={cn(
                    'group relative h-full rounded-2xl border p-4 transition-all duration-200',
                    // Tinted with the primary at an alpha, because the theme has no soft primary:
                    // only danger, warn, success and blue carry one. A name invented here emits no
                    // rule at all, and the selected card would be distinguished by its border alone.
                    selected
                      ? 'border-primary bg-primary/10 shadow-md'
                      : 'border-border bg-surface hover:border-primary/50 hover:shadow-card',
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onPick(address)}
                    className="w-full text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-xl',
                          selected ? 'bg-primary text-on-primary' : 'bg-success-soft text-success',
                        )}
                        aria-hidden
                      >
                        {LABEL_ICONS[address.label]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-text">
                        {addressHeadline(address, copy.buyer.addressLabel)}
                      </span>
                      {address.is_default ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-success">
                          <Star size={10} aria-hidden />
                          {copy.buyer.addressDefaultBadge}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-2 block text-sm leading-snug text-text">
                      {address.customer_name} · {address.customer_phone}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted">
                      {address.address_line}
                      {address.landmark.trim() === '' ? '' : ` — ${address.landmark}`}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs font-medium text-muted">
                      {address.place_label.trim() === '' ? null : (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} aria-hidden />
                          {address.place_label}
                        </span>
                      )}
                      {delivery ? (
                        <span className={cn(quote.withinArea ? '' : 'text-danger')}>
                          {quote.withinArea
                            ? `${copy.buyer.deliveryFee} ${formatTaka(quote.feePoisha, language)}`
                            : copy.delivery.outsideRadius(delivery.radius_km)}
                        </span>
                      ) : null}
                      {quote.roundedKm !== null && quote.withinArea ? (
                        <span>{copy.delivery.distanceRounded(quote.roundedKm)}</span>
                      ) : null}
                      {address.times_used > 0 ? (
                        <span>
                          {address.times_used} {copy.buyer.usedTimes}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(address)}
                      aria-label={`${copy.buyer.addressEdit}: ${addressHeadline(address, copy.buyer.addressLabel)}`}
                    >
                      <Pencil size={14} aria-hidden />
                      {copy.buyer.addressEdit}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(address)}
                      aria-label={`${copy.buyer.addressDelete}: ${addressHeadline(address, copy.buyer.addressLabel)}`}
                    >
                      <Trash2 size={14} aria-hidden />
                      {copy.buyer.addressDelete}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        type="button"
        variant={addresses.length === 0 ? 'primary' : 'ghost'}
        className="w-full rounded-2xl"
        onClick={onNew}
        disabled={full}
        title={full ? copy.buyer.addressLimit : undefined}
      >
        <Plus size={16} aria-hidden className="mr-2" />
        {copy.buyer.addressNew}
      </Button>
      {full ? (
        <p className="text-xs font-medium text-warn-text">{copy.buyer.addressLimit}</p>
      ) : null}
    </div>
  );
}

interface AddressEditorProps {
  open: boolean;
  title: string;
  initial: AddressEditorValue | null;
  copy: MkCopy;
  language: Language;
  saving: boolean;
  /** A shop's area rule, drawn on the map so a member can see whether a door is inside it. */
  delivery: MkShopDelivery | undefined;
  onClose: () => void;
  onSave: (input: MkAddressInput) => void;
}

/**
 * Add or change one address. `initial` null means a new row, which is also the only case where the
 * default checkbox is worth explaining: the first address becomes the default whatever the member
 * ticks, and the routine says so rather than the form pretending to have asked.
 */
export function AddressEditor({
  open,
  title,
  initial,
  copy,
  language,
  saving,
  delivery,
  onClose,
  onSave,
}: AddressEditorProps) {
  const [value, setValue] = useState<AddressEditorValue>(initial ?? emptyAddressEditor());
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initial ?? emptyAddressEditor());
      setShowErrors(false);
    }
  }, [open, initial]);

  const errors = useMemo(() => addressDraftErrors(value), [value]);
  const valid = !Object.values(errors).some(Boolean);

  const submit = useCallback(() => {
    if (!valid) {
      setShowErrors(true);
      return;
    }
    onSave(editorToInput(value));
  }, [valid, onSave, value]);

  return (
    <Modal open={open} onClose={onClose} title={title} closeLabel={copy.buyer.back}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label={copy.buyer.addressPick}>
          {ADDRESS_LABELS.map((label) => {
            const active = value.label === label;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() => setValue({ ...value, label })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150',
                  active
                    ? 'border-primary bg-primary text-on-primary shadow-sm'
                    : 'border-border bg-surface text-muted hover:border-primary/50 hover:text-text',
                )}
              >
                {LABEL_ICONS[label]}
                {labelFor(label, copy)}
              </button>
            );
          })}
        </div>

        <TextField
          label={copy.buyer.addressNickname}
          value={value.nickname}
          onChange={(event) => setValue({ ...value, nickname: event.target.value })}
          error={showErrors && errors.nickname ? copy.buyer.addressNicknameLimit : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={copy.buyer.addressRecipient}
            value={value.name}
            autoComplete="name"
            onChange={(event) => setValue({ ...value, name: event.target.value })}
            error={showErrors && errors.name ? copy.fieldErrors.name_short : undefined}
          />
          <TextField
            label={copy.buyer.addressPhone}
            inputMode="tel"
            autoComplete="tel"
            value={value.phone}
            onChange={(event) => setValue({ ...value, phone: event.target.value })}
            error={showErrors && errors.phone ? copy.fieldErrors.mobile_invalid : undefined}
          />
        </div>
        <TextareaField
          label={copy.buyer.addressStreet}
          value={value.address}
          onChange={(event) => setValue({ ...value, address: event.target.value })}
          error={showErrors && errors.address ? copy.fieldErrors.address_short : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={copy.buyer.landmark}
            value={value.landmark}
            onChange={(event) => setValue({ ...value, landmark: event.target.value })}
          />
          <TextField
            label={copy.buyer.note}
            value={value.note}
            onChange={(event) => setValue({ ...value, note: event.target.value })}
          />
        </div>

        <LocationPicker
          language={language}
          value={value.pin}
          onChange={(pin) => setValue({ ...value, pin })}
          radiusKm={delivery?.scope === 'radius' ? delivery.radius_km : null}
          circleCenter={delivery ? { lat: delivery.center_lat, lng: delivery.center_lng } : null}
          labels={{
            title: copy.buyer.pinTitle,
            hint: copy.buyer.addressPinHint,
            search: copy.buyer.searchPlaceholder,
            useCurrent: copy.buyer.useCurrent,
            outside: copy.fieldErrors.location_outside_bd,
          }}
        />
        {showErrors && errors.pin ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {copy.buyer.pinRequired}
          </p>
        ) : null}

        <Switch
          label={copy.buyer.addressDefault}
          checked={value.isDefault}
          onCheckedChange={(isDefault) => setValue({ ...value, isDefault })}
        />
      </div>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <Button
          type="button"
          className="w-full rounded-2xl sm:w-auto"
          loading={saving}
          onClick={submit}
        >
          {copy.buyer.addressSave}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-2xl sm:w-auto"
          onClick={onClose}
        >
          {copy.buyer.back}
        </Button>
      </div>
    </Modal>
  );
}
