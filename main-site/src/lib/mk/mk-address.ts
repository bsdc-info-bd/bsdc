import type { AddressLabel } from './mk-logic';
import type { MkAddressInput, MkSavedAddress } from './mk-types';

/**
 * The address editor's value and its translations, kept out of the component file on purpose: a
 * module that exports a helper next to its components can only hot-reload as a whole, and these
 * three functions are the part most worth changing — they are where a form becomes a row.
 *
 * They also carry the two rules the checkout cannot express in markup. A card is headed by the
 * nickname when the member gave one and by the label when they did not, and the editor carries an
 * id it never shows: without one an edit inserts a second address, which is the kind of bug a form
 * can hold for a release without anybody noticing, because both rows are real and one of them is
 * just wrong.
 */

/** What the editor holds while it is open: the form, not the row. */
export interface AddressEditorValue {
  id: string | null;
  label: AddressLabel;
  nickname: string;
  name: string;
  phone: string;
  address: string;
  landmark: string;
  note: string;
  pin: { lat: number; lng: number; label: string } | null;
  isDefault: boolean;
}

export function emptyAddressEditor(): AddressEditorValue {
  return {
    id: null,
    label: 'home',
    nickname: '',
    name: '',
    phone: '',
    address: '',
    landmark: '',
    note: '',
    pin: null,
    isDefault: false,
  };
}

/** A card's headline: what the member called this door, or the kind of place it is. */
export function addressHeadline(
  address: Pick<MkSavedAddress, 'label' | 'nickname'>,
  labels: Record<AddressLabel, string>,
): string {
  const nickname = address.nickname.trim();
  return nickname === '' ? labels[address.label] : nickname;
}

export function editorFromAddress(address: MkSavedAddress): AddressEditorValue {
  return {
    id: address.id,
    label: address.label,
    nickname: address.nickname,
    name: address.customer_name,
    phone: address.customer_phone,
    address: address.address_line,
    landmark: address.landmark,
    note: address.note,
    pin: { lat: address.lat, lng: address.lng, label: address.place_label },
    isDefault: address.is_default,
  };
}

/** The routine's own payload, from the editor's form. */
export function editorToInput(value: AddressEditorValue): MkAddressInput {
  return {
    id: value.id,
    label: value.label,
    nickname: value.nickname.trim(),
    customer_name: value.name.trim(),
    // The number is stored as typed here and stripped of separators by `mk_save_address`, which is
    // the only place that knows the difference between "01712-345678" and a wrong number. Cleaning
    // it twice, in two languages, is how the two versions start to disagree.
    customer_phone: value.phone,
    address_line: value.address.trim(),
    landmark: value.landmark.trim(),
    place_label: value.pin?.label ?? '',
    lat: value.pin?.lat ?? 0,
    lng: value.pin?.lng ?? 0,
    note: value.note.trim(),
    is_default: value.isDefault,
  };
}
