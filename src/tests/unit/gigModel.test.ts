/**
 * BSDC — src/tests/unit/gigModel.test.ts
 * Purpose : Proves the freelancer hub's money and time rules.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : Three rules here are the ones that matter. A gig cannot be listed without a package
 *   somebody can actually buy. Nobody buys their own service. And a rating of zero means "new",
 *   never "bad" — a marketplace that shows five empty stars has already decided something about a
 *   person who has done nothing wrong.
 *   The clock is injected throughout, so a delivery date is asserted rather than hoped for.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_PACKAGE_PRICE_BDT,
  averageRating,
  completedEarnings,
  daysToDue,
  isCancellable,
  isOrderClosed,
  newGig,
  newOrder,
  startingPrice,
  validateGig,
  validateOrder,
  type Gig,
  type NewGigInput,
} from '@/entities/gig/model';

const NOW = new Date('2026-06-01T06:00:00.000Z');

function draft(overrides: Partial<NewGigInput> = {}): NewGigInput {
  return {
    freelancerUid: 'seller',
    freelancerName: 'Rizwan Rahim',
    freelancerPhotoUrl: '',
    title: 'Laravel API setup',
    category: 'web',
    description: 'A clean API with tests and documentation.',
    packages: [
      { name: 'Basic', description: 'One endpoint', priceBdt: 1500, deliveryDays: 3, revisions: 1 },
      {
        name: 'Standard',
        description: 'Five endpoints',
        priceBdt: 6000,
        deliveryDays: 7,
        revisions: 3,
      },
    ],
    skills: ['laravel', 'php'],
    ...overrides,
  };
}

function gig(overrides: Partial<NewGigInput> = {}): Gig {
  return newGig(draft(overrides));
}

describe('gig validation', () => {
  it('accepts a gig with a payable package', () => {
    expect(validateGig(draft())).toBeNull();
  });

  it('refuses a gig with no title', () => {
    expect(validateGig(draft({ title: '  ' }))).toBe('BSDC-DATA-007');
  });

  it('refuses a gig whose only package is priced below the floor', () => {
    const cheap = [
      {
        name: 'Basic',
        description: '',
        priceBdt: MIN_PACKAGE_PRICE_BDT - 1,
        deliveryDays: 3,
        revisions: 0,
      },
    ];
    expect(validateGig(draft({ packages: cheap }))).toBe('BSDC-GIG-001');
  });

  it('refuses a gig whose package promises delivery in no days', () => {
    const zero = [
      { name: 'Basic', description: '', priceBdt: 5000, deliveryDays: 0, revisions: 0 },
    ];
    expect(validateGig(draft({ packages: zero }))).toBe('BSDC-GIG-001');
  });
});

describe('prices and ratings', () => {
  it('shows the cheapest package as the entry price', () => {
    expect(startingPrice(gig())).toBe(1500);
  });

  it('shows a gig with no packages as priced at zero rather than crashing', () => {
    expect(startingPrice(gig({ packages: [] }))).toBe(0);
  });

  it('reports zero for an unrated gig', () => {
    expect(averageRating(gig())).toBe(0);
  });

  it('rounds an average to one decimal', () => {
    const rated: Gig = { ...gig(), ratingSum: 14, ratingCount: 4 };
    expect(averageRating(rated)).toBe(3.5);
  });
});

describe('placing an order', () => {
  it('resolves the delivery date from the package it chose', () => {
    const order = newOrder({
      gig: gig(),
      packageName: 'Standard',
      buyerUid: 'buyer',
      buyerName: 'Ayesha',
      requirement: 'Five endpoints with tests.',
      now: NOW,
    });
    expect(order.packageName).toBe('Standard');
    expect(order.priceBdt).toBe(6000);
    expect(order.dueAt).toBe('2026-06-08T06:00:00.000Z');
    expect(order.status).toBe('pending');
  });

  it('falls back to the first package when the name is unknown', () => {
    const order = newOrder({
      gig: gig(),
      packageName: 'Nonexistent',
      buyerUid: 'buyer',
      buyerName: 'Ayesha',
      requirement: 'Anything.',
      now: NOW,
    });
    expect(order.packageName).toBe('Basic');
    expect(order.priceBdt).toBe(1500);
  });

  it('refuses an order from the freelancer themselves', () => {
    expect(
      validateOrder({
        gig: gig(),
        packageName: 'Basic',
        buyerUid: 'seller',
        buyerName: 'Rizwan Rahim',
        requirement: 'Buying my own work.',
      }),
    ).toBe('BSDC-GIG-002');
  });

  it('refuses an order with nothing written in it', () => {
    expect(
      validateOrder({
        gig: gig(),
        packageName: 'Basic',
        buyerUid: 'buyer',
        buyerName: 'Ayesha',
        requirement: '   ',
      }),
    ).toBe('BSDC-DATA-007');
  });
});

describe('order lifecycle', () => {
  it('allows cancellation before delivery and not after', () => {
    const pending = newOrder({
      gig: gig(),
      packageName: 'Basic',
      buyerUid: 'buyer',
      buyerName: 'Ayesha',
      requirement: 'One endpoint.',
      now: NOW,
    });
    expect(isCancellable(pending)).toBe(true);
    expect(isCancellable({ ...pending, status: 'delivered' })).toBe(false);
    expect(isCancellable({ ...pending, status: 'completed' })).toBe(false);
  });

  it('counts down the days to delivery', () => {
    const order = newOrder({
      gig: gig(),
      packageName: 'Basic',
      buyerUid: 'buyer',
      buyerName: 'Ayesha',
      requirement: 'One endpoint.',
      now: NOW,
    });
    expect(daysToDue(order, NOW)).toBe(3);
    expect(daysToDue(order, new Date('2026-06-03T06:00:00.000Z'))).toBe(1);
  });

  it('treats completed and cancelled orders as closed', () => {
    const order = newOrder({
      gig: gig(),
      packageName: 'Basic',
      buyerUid: 'buyer',
      buyerName: 'Ayesha',
      requirement: 'One endpoint.',
      now: NOW,
    });
    expect(isOrderClosed(order)).toBe(false);
    expect(isOrderClosed({ ...order, status: 'completed' })).toBe(true);
    expect(isOrderClosed({ ...order, status: 'cancelled' })).toBe(true);
  });

  it('adds up only the money a freelancer actually earned', () => {
    const base = newOrder({
      gig: gig(),
      packageName: 'Standard',
      buyerUid: 'buyer',
      buyerName: 'Ayesha',
      requirement: 'Five endpoints.',
      now: NOW,
    });
    const orders = [
      base,
      { ...base, status: 'completed' as const },
      { ...base, status: 'cancelled' as const },
    ];
    expect(completedEarnings(orders)).toBe(6000);
  });
});
