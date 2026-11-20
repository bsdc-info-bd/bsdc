import { describe, expect, it } from 'vitest';
import {
  marketplaceErrorPresentation,
  packagePriceLabel,
  packageSaveArgs,
  poishaToTakaInput,
  positiveInteger,
  takaToPoisha,
} from './marketplace';

describe('Taka and poisha conversion', () => {
  it('converts whole Taka and exact poisha without floating-point drift', () => {
    expect(takaToPoisha('100')).toBe(10_000);
    expect(takaToPoisha('50.5')).toBe(5_050);
    expect(takaToPoisha('50.05')).toBe(5_005);
    expect(takaToPoisha('.01')).toBe(1);
    expect(takaToPoisha('1.')).toBe(100);
  });

  it('rejects zero, negative, malformed, over-precision, and unsafe values', () => {
    for (const value of ['', '0', '0.00', '-1', '+1', '1.001', 'NaN', 'Infinity', '1,000']) {
      expect(takaToPoisha(value), value).toBeNull();
    }
    expect(takaToPoisha('90071992547410')).toBeNull();
  });

  it('converts saved poisha back to an edit value and a Taka label', () => {
    expect(poishaToTakaInput(10_000)).toBe('100');
    expect(poishaToTakaInput(5_050)).toBe('50.50');
    expect(packagePriceLabel(95_000)).toBe('৳950');
    expect(packagePriceLabel(12_345)).toBe('৳123.45');
    expect(poishaToTakaInput(Number.NaN)).toBe('');
  });
});

describe('package editing validation and RPC payloads', () => {
  it('accepts only a positive safe whole order count', () => {
    expect(positiveInteger('10')).toBe(10);
    expect(positiveInteger(' 50 ')).toBe(50);
    for (const value of ['', '0', '-1', '1.5', '1e2', '9007199254740992']) {
      expect(positiveInteger(value), value).toBeNull();
    }
  });

  it('creates the exact admin RPC argument names and integer poisha amount', () => {
    expect(
      packageSaveArgs({
        code: '50',
        orders: '55',
        priceTaka: '123.45',
        isActive: false,
      }),
    ).toEqual({
      ok: true,
      args: {
        p_code: '50',
        p_orders: 55,
        p_price_poisha: 12_345,
        p_is_active: false,
      },
    });
  });

  it('returns inline errors instead of sending NaN, zero, or fractional orders', () => {
    expect(
      packageSaveArgs({ code: '10', orders: '1.5', priceTaka: 'not money', isActive: true }),
    ).toEqual({
      ok: false,
      errors: {
        orders: 'Enter a whole number of orders greater than zero.',
        priceTaka: 'Enter a price greater than ৳0 with no more than two decimal places.',
      },
    });
  });
});

describe('marketplace access errors', () => {
  it('renders a permission-specific access-denied state for settings RPC errors', () => {
    const state = marketplaceErrorPresentation(
      'This account needs the marketplace.settings permission. Ask an owner to review its staff access.',
    );
    expect(state.accessDenied).toBe(true);
    expect(state.title).toContain('Access denied');
    expect(state.message).toContain('marketplace.settings');
    expect(state.message).toContain('Ask an owner');
  });

  it('keeps network and deployment failures distinct from permission denial', () => {
    const state = marketplaceErrorPresentation('The API is temporarily unavailable.');
    expect(state.accessDenied).toBe(false);
    expect(state.title).toContain('could not be loaded');
    expect(state.message).toBe('The API is temporarily unavailable.');
  });
});
