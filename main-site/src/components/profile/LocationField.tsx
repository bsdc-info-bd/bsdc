import { Loader2, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { IconButton, TextField } from '@/design-system';
import { useErrorToast } from '@/hooks/use-error-toast';
import { usePlaceFinder } from '@/hooks/use-location';
import { PROFILE_LIMITS } from '@/lib/profile/coerce';

export interface LocationFieldProps {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  hint?: string;
  autoComplete?: string;
  id?: string;
}

/**
 * The city field, with a way to fill it in that does not ask for an address.
 *
 * The pin is the whole of the addition. Pressing it asks the browser for a
 * position — a decision the member makes in the browser's own prompt, with the
 * field they are filling in on screen as the reason — rounds it to about a
 * kilometre before it leaves the device, and trades that for a city name. What
 * lands in the field is words, and the member can edit or clear them like
 * anything else they typed.
 *
 * The pin is hidden rather than dead where the browser cannot be asked: an
 * insecure context or a browser with no geolocation gets a text field and nothing
 * that pretends otherwise.
 */
export function LocationField({
  value,
  onChange,
  label,
  hint,
  autoComplete = 'address-level2',
  id,
}: LocationFieldProps) {
  const { t } = useTranslation();
  const finder = usePlaceFinder();

  useErrorToast(finder.errorKey, finder.dismissError, { title: t('location.title') });

  async function fillFromDevice() {
    const place = await finder.find();
    if (place === null) return;
    onChange(place.slice(0, PROFILE_LIMITS.location));
    toast.success(t('location.found', { place }));
  }

  return (
    <TextField
      id={id}
      label={label ?? t('onboarding.locationLabel')}
      hint={hint ?? t('location.hint')}
      value={value}
      maxLength={PROFILE_LIMITS.location}
      autoComplete={autoComplete}
      iconStart={<MapPin size={18} />}
      onChange={(event) => onChange(event.target.value)}
      addonEnd={
        finder.block === 'ok' ? (
          <IconButton
            label={t('location.use')}
            size="sm"
            disabled={finder.busy}
            onClick={() => void fillFromDevice()}
            icon={
              finder.busy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <MapPin aria-hidden className="size-4" />
              )
            }
          />
        ) : undefined
      }
    />
  );
}
