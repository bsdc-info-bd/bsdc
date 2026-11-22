import { describe, expect, it } from 'vitest';
import {
  ADDRESS_MAX,
  EMPTY_APPLICATION,
  type ApplicationDraft,
  addressDraftErrors,
  addressDraftValid,
  canAdvance,
  creditState,
  customerCanCancel,
  customerCanReview,
  distanceKm,
  evaluateMinimumOrder,
  evaluateShopDelivery,
  formatHhMm,
  formatTaka,
  isAddressLabel,
  isBdMobile,
  isBdPoint,
  isHttpsUrl,
  isNid,
  isValidHhMm,
  normaliseBdMobile,
  roundedDistanceKm,
  savedAddressToDraft,
  stepErrors,
  variantFor,
  timelineIndex,
  vendorActionsFor,
  WIZARD_STEPS,
} from './mk-logic';

const complete: ApplicationDraft = {
  ...EMPTY_APPLICATION,
  fullName: 'Rahim Uddin',
  nid: '1234567890123',
  mobile: '+8801712345678',
  shopName: 'Sylhet Fresh Mart',
  shopType: 'grocery',
  addressLine: 'Zindabazar, Sylhet',
  lat: 24.8949,
  lng: 91.8687,
  agreements: {
    terms: true,
    privacy: true,
    vendor_policy: true,
    cod_policy: true,
    self_delivery: true,
    accuracy: true,
  },
  packageCode: '10',
  paymentSender: '01888000111',
  paymentHolder: 'Rahim Uddin',
  paymentTxnId: 'TXN-1001',
};

describe('formatTaka', () => {
  it('shows whole taka without decimals and fractional taka with two places', () => {
    expect(formatTaka(15000, 'en')).toBe('৳150');
    expect(formatTaka(450, 'en')).toBe('৳4.50');
    expect(formatTaka(105000, 'en')).toBe('৳1,050');
  });

  it('uses Bangla digits for Bangla', () => {
    expect(formatTaka(15000, 'bn')).toMatch(/^৳[০-৯]/);
  });

  it('never prints poisha as taka', () => {
    expect(formatTaka(95000, 'en')).toBe('৳950');
  });

  it('shows a negative amount with a leading minus', () => {
    expect(formatTaka(-450, 'en')).toBe('-৳4.50');
  });
});

describe('identity validation', () => {
  it('accepts +880 and spaced mobile numbers and normalises them', () => {
    expect(normaliseBdMobile('+880 1712-345678')).toBe('01712345678');
    expect(isBdMobile('+8801712345678')).toBe(true);
  });

  it('rejects numbers that are not Bangladesh mobiles', () => {
    expect(isBdMobile('0171234567')).toBe(false);
    expect(isBdMobile('01012345678')).toBe(false);
    expect(isBdMobile('+14155550100')).toBe(false);
  });

  it('accepts NID numbers of 10, 13 or 17 digits only', () => {
    expect(isNid('1234567890')).toBe(true);
    expect(isNid('1234567890123')).toBe(true);
    expect(isNid('12345678901234567')).toBe(true);
    expect(isNid('123456789012')).toBe(false);
  });
});

describe('location', () => {
  it('requires a pin inside Bangladesh', () => {
    expect(isBdPoint(24.8949, 91.8687)).toBe(true);
    expect(isBdPoint(40.7, -74)).toBe(false);
    expect(isBdPoint(null, 91)).toBe(false);
    expect(isBdPoint(Number.NaN, 91)).toBe(false);
  });

  it('computes distance between two pins', () => {
    const dhaka = { lat: 23.8103, lng: 90.4125 };
    const sylhet = { lat: 24.8949, lng: 91.8687 };
    expect(distanceKm(dhaka, sylhet)).toBeGreaterThan(185);
    expect(distanceKm(dhaka, sylhet)).toBeLessThan(200);
    expect(distanceKm(dhaka, dhaka)).toBe(0);
  });
});

describe('wizard steps', () => {
  it('lets the complete draft pass every step', () => {
    for (const step of WIZARD_STEPS) {
      expect(canAdvance(step, complete), step).toBe(true);
    }
  });

  it('blocks the shop step until a type is chosen', () => {
    expect(stepErrors('shop', { ...complete, shopType: '' })).toEqual({ shopType: 'type_missing' });
  });

  it('lists every unticked agreement', () => {
    const errors = stepErrors('agreements', {
      ...complete,
      agreements: { ...complete.agreements, privacy: false, accuracy: false },
    });
    expect(Object.keys(errors).sort()).toEqual(['accuracy', 'privacy']);
  });

  it('blocks the location step outside Bangladesh', () => {
    expect(stepErrors('location', { ...complete, lat: 40.7, lng: -74 })).toEqual({
      location: 'location_outside_bd',
    });
  });

  it('checks the transaction ID on the payment step', () => {
    expect(stepErrors('payment', { ...complete, paymentTxnId: 'ab' })).toEqual({
      paymentTxnId: 'txn_invalid',
    });
  });

  it('the review step fails if any earlier step is incomplete', () => {
    expect(canAdvance('review', { ...complete, packageCode: '' })).toBe(false);
    expect(canAdvance('review', complete)).toBe(true);
  });

  it('an empty draft cannot leave the identity step', () => {
    expect(canAdvance('identity', EMPTY_APPLICATION)).toBe(false);
  });
});

describe('orders', () => {
  it('a vendor can accept or decline a placed order only', () => {
    expect(vendorActionsFor('placed')).toEqual(['accepted', 'cancelled']);
    expect(vendorActionsFor('delivered')).toEqual([]);
    expect(vendorActionsFor('cancelled')).toEqual([]);
  });

  it('the timeline runs placed to delivered and leaves cancelled off the line', () => {
    expect(timelineIndex('placed')).toBe(0);
    expect(timelineIndex('out_for_delivery')).toBe(3);
    expect(timelineIndex('delivered')).toBe(4);
    expect(timelineIndex('cancelled')).toBe(-1);
  });

  it('a customer can cancel only while the order is still placed', () => {
    expect(customerCanCancel('placed')).toBe(true);
    expect(customerCanCancel('accepted')).toBe(false);
  });

  it('a review needs a delivered order and no earlier review', () => {
    expect(customerCanReview('delivered', false)).toBe(true);
    expect(customerCanReview('delivered', true)).toBe(false);
    expect(customerCanReview('out_for_delivery', false)).toBe(false);
  });
});

describe('credits', () => {
  it('classifies the credit balance', () => {
    expect(creditState(0)).toBe('empty');
    expect(creditState(3)).toBe('low');
    expect(creditState(5)).toBe('healthy');
  });
});

describe('https links', () => {
  it('accepts https and rejects everything else', () => {
    expect(isHttpsUrl('https://i.ibb.co/x/y.webp')).toBe(true);
    expect(isHttpsUrl('http://insecure.example/a.jpg')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
  });
});

describe('3-mode delivery fees and schedule helpers', () => {
  const center = { lat: 24.8949, lng: 91.8687 };

  it('rounds great-circle distance up to whole kilometres', () => {
    expect(roundedDistanceKm(center, center)).toBe(0);
    // ~2.8 km north-east -> ceil = 3 km
    expect(roundedDistanceKm(center, { lat: 24.915, lng: 91.885 })).toBe(3);
  });

  it('evaluates default, custom fixed (above ৳150), and custom per-km fees accurately', () => {
    const defaultMode = evaluateShopDelivery(
      {
        scope: 'all_bd',
        radius_km: 10,
        fee_mode: 'default',
        fee_poisha: 15000,
        default_fee_poisha: 15000,
        center_lat: center.lat,
        center_lng: center.lng,
      },
      null,
    );
    expect(defaultMode.feePoisha).toBe(15000);
    expect(defaultMode.needsPinForFee).toBe(false);

    const fixedMode = evaluateShopDelivery(
      {
        scope: 'all_bd',
        radius_km: 10,
        fee_mode: 'fixed',
        fee_poisha: 45000,
        fixed_fee_poisha: 45000,
        center_lat: center.lat,
        center_lng: center.lng,
      },
      null,
    );
    expect(fixedMode.feePoisha).toBe(45000);

    const perKmNoPin = evaluateShopDelivery(
      {
        scope: 'radius',
        radius_km: 10,
        fee_mode: 'per_km',
        fee_poisha: 15000,
        per_km_rate_poisha: 2500,
        center_lat: center.lat,
        center_lng: center.lng,
      },
      null,
    );
    expect(perKmNoPin.needsPinForFee).toBe(true);
    expect(perKmNoPin.feePoisha).toBe(0);

    const perKmPinned = evaluateShopDelivery(
      {
        scope: 'radius',
        radius_km: 10,
        fee_mode: 'per_km',
        fee_poisha: 15000,
        per_km_rate_poisha: 2500,
        center_lat: center.lat,
        center_lng: center.lng,
      },
      { lat: 24.915, lng: 91.885 },
    );
    expect(perKmPinned.roundedKm).toBe(3);
    expect(perKmPinned.feePoisha).toBe(7500);
    expect(perKmPinned.withinArea).toBe(true);

    const outOfRadius = evaluateShopDelivery(
      {
        scope: 'radius',
        radius_km: 2,
        fee_mode: 'fixed',
        fee_poisha: 10000,
        fixed_fee_poisha: 10000,
        center_lat: center.lat,
        center_lng: center.lng,
      },
      { lat: 24.915, lng: 91.885 },
    );
    expect(outOfRadius.withinArea).toBe(false);
  });

  it('validates and formats HH:MM schedule times in English and Bangla', () => {
    expect(isValidHhMm('09:00')).toBe(true);
    expect(isValidHhMm('24:00', false)).toBe(false);
    expect(isValidHhMm('24:00', true)).toBe(true);
    expect(isValidHhMm('25:00', true)).toBe(false);
    expect(formatHhMm('09:30', 'en')).toBe('9:30 AM');
    expect(formatHhMm('21:05', 'en')).toBe('9:05 PM');
    expect(formatHhMm('09:30', 'bn')).toContain('পূর্বাহ্ণ');
  });
});

describe('variantFor', () => {
  const full = 'https://i.ibb.co/aaa111/full.jpg';
  const medium = 'https://i.ibb.co/bbb222/medium.jpg';
  const images = [full, 'https://i.ibb.co/ccc333/second.jpg'];

  it('returns the recorded lighter copy', () => {
    expect(variantFor(images, { [full]: medium }, full)).toBe(medium);
  });

  it('resolves by url, not by position', () => {
    // The catalogue lets a vendor reorder pictures, so the map cannot be indexed
    // by array position; a second picture's variant must survive a reorder.
    const second = images[1]!;
    const variants = { [second]: 'https://i.ibb.co/ddd444/second-medium.jpg' };
    expect(variantFor([...images].reverse(), variants, second)).toBe(
      'https://i.ibb.co/ddd444/second-medium.jpg',
    );
  });

  it('returns empty when there is nothing usable to return', () => {
    expect(variantFor(images, undefined, full)).toBe('');
    expect(variantFor(images, null, full)).toBe('');
    expect(variantFor(images, {}, full)).toBe('');
    // A row written before 0116 has no map at all; the page must still render.
    expect(variantFor([], {}, full)).toBe('');
  });

  it('ignores a key that is not one of the images on this product', () => {
    const stale = { ['https://i.ibb.co/zzz999/removed.jpg']: medium };
    expect(variantFor(images, stale, full)).toBe('');
  });

  it('refuses a variant that is not https, or that is the original', () => {
    expect(variantFor(images, { [full]: 'http://i.ibb.co/bbb222/medium.jpg' }, full)).toBe('');
    // Identical values would make the srcset advertise the same file twice.
    expect(variantFor(images, { [full]: full }, full)).toBe('');
    expect(variantFor(images, { [full]: '' }, full)).toBe('');
  });
});

describe('evaluateMinimumOrder', () => {
  it('says nothing is required when the shop set no minimum', () => {
    expect(evaluateMinimumOrder(1, 0)).toEqual({ required: false, met: true, shortfallPoisha: 0 });
    expect(evaluateMinimumOrder(1, undefined)).toEqual({
      required: false,
      met: true,
      shortfallPoisha: 0,
    });
  });

  it('measures the goods, never the ride', () => {
    // ৳600 of tea at a ৳700 minimum, plus a ৳150 delivery charge: the total clears ৳700 and the
    // order still fails, because the charge is not something the customer bought. A screen that
    // compared totals would promise an order the routine then refuses.
    const subtotal = 60000;
    const fee = 15000;
    expect(evaluateMinimumOrder(subtotal, 70000).met).toBe(false);
    expect(evaluateMinimumOrder(subtotal + fee, 70000).met).toBe(true);
    expect(evaluateMinimumOrder(subtotal, 70000).shortfallPoisha).toBe(10000);
  });

  it('counts an exactly-equal basket as met', () => {
    expect(evaluateMinimumOrder(80000, 80000)).toEqual({
      required: true,
      met: true,
      shortfallPoisha: 0,
    });
  });

  it('treats a nonsense minimum as no minimum, the way the routine treats its zero', () => {
    expect(evaluateMinimumOrder(1, -500).met).toBe(true);
  });
});

describe('addressDraftErrors', () => {
  const good = {
    name: 'Rahim Uddin',
    phone: '01712-345678',
    address: 'House 4, Road 7, Zindabazar',
    nickname: 'Ammu flat',
    label: 'home',
    pin: { lat: 24.8949, lng: 91.8687 },
  };

  it('accepts a phone typed with separators, because the routine strips them too', () => {
    expect(addressDraftValid(good)).toBe(true);
    expect(addressDraftErrors(good).phone).toBe(false);
  });

  it('refuses what mk_save_address refuses, and only that', () => {
    expect(addressDraftErrors({ ...good, name: 'A' }).name).toBe(true);
    expect(addressDraftErrors({ ...good, phone: '0171234567' }).phone).toBe(true);
    expect(addressDraftErrors({ ...good, address: 'Hous' }).address).toBe(true);
    expect(addressDraftErrors({ ...good, nickname: 'x'.repeat(41) }).nickname).toBe(true);
    expect(addressDraftErrors({ ...good, pin: null }).pin).toBe(true);
    expect(addressDraftErrors({ ...good, label: 'flat' }).label).toBe(true);
    expect(addressDraftErrors({ ...good, label: 'flat' }).pin).toBe(false);
  });

  it('refuses a pin outside Bangladesh, which is what makes the fee meaningless', () => {
    expect(addressDraftErrors({ ...good, pin: { lat: 13.7563, lng: 100.5018 } }).pin).toBe(true);
    expect(addressDraftErrors({ ...good, pin: { lat: NaN, lng: 90.4 } }).pin).toBe(true);
  });

  it('knows the three labels the table allows, and the cap it enforces', () => {
    expect(['home', 'work', 'other'].every(isAddressLabel)).toBe(true);
    expect(isAddressLabel('flat')).toBe(false);
    expect(ADDRESS_MAX).toBe(8);
  });
});

describe('savedAddressToDraft', () => {
  it('fills every field the checkout asks for from one row', () => {
    const draft = savedAddressToDraft({
      customer_name: 'Ammu',
      customer_phone: '01712345678',
      address_line: 'House 9, Road 3, Uposhohor',
      landmark: 'Near the pharmacy',
      place_label: 'Uposhohor, Sylhet',
      lat: 24.9,
      lng: 91.86,
      note: 'Third floor',
    });
    expect(draft).toEqual({
      name: 'Ammu',
      phone: '01712345678',
      address: 'House 9, Road 3, Uposhohor',
      landmark: 'Near the pharmacy',
      note: 'Third floor',
      pin: { lat: 24.9, lng: 91.86, label: 'Uposhohor, Sylhet' },
    });
  });

  it('carries the saved note into the form, where the member can still change it for one order', () => {
    const draft = savedAddressToDraft({
      customer_name: 'Ammu',
      customer_phone: '01712345678',
      address_line: 'House 9, Road 3',
      landmark: '',
      place_label: '',
      lat: 24.9,
      lng: 91.86,
      note: 'Third floor',
    });
    expect(draft.note).toBe('Third floor');
  });
});
