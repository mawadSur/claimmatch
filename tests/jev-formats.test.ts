import { describe, expect, it } from 'vitest';
import {
  USPS_STATE_CODES,
  findSecrets,
  isCardNumberLike,
  isEmailAddress,
  isIsoDate,
  isMoneyAmount,
  isRoutingNumberLike,
  isSsnShape,
  isUsPhone,
  isUsStateCode,
  isZipCode,
  luhnValid,
  numericValueOf,
  vinProblem,
} from '@/lib/jev/formats';

describe('named formats', () => {
  it('knows every USPS state, DC, territory and military code', () => {
    expect(USPS_STATE_CODES).toHaveLength(62);
    expect(new Set(USPS_STATE_CODES).size).toBe(62);
    for (const code of ['CA', 'DC', 'PR', 'GU', 'AE', 'WY']) expect(isUsStateCode(code)).toBe(true);
    for (const code of ['ca', 'XX', 'UK', '']) expect(isUsStateCode(code)).toBe(false);
  });

  it.each([
    ['94110', true],
    ['94110-1234', true],
    ['00501', true],
    ['9411', false],
    ['941101', false],
    ['94110-123', false],
    ['941101234', false],
    ['00000', false],
  ])('ZIP %s: %s', (zip, ok) => {
    expect(isZipCode(zip)).toBe(ok);
  });

  it.each([
    ['(212) 555-0123', true],
    ['212.555.0123', true],
    ['+1 212 555 0123', true],
    ['12125550123', true],
    ['2125550123', true],
    ['555-123-4567', false],
    ['112-555-0123', false],
    ['911-555-0123', false],
    ['290-555-0123', false],
    ['212-911-0123', false],
    ['212-555-012', false],
    ['212-555-0123 ext 4', false],
    ['22125550123', false],
  ])('phone %s: %s', (phone, ok) => {
    expect(isUsPhone(phone)).toBe(ok);
  });

  it.each([
    ['ada@example.com', true],
    ['ada.lovelace+claims@mail.example.co.uk', true],
    ["o'brien@example.org", true],
    ['ada@xn--bcher-kva.example', true],
    ['ada@example', false],
    ['ada@@example.com', false],
    ['.ada@example.com', false],
    ['ada..l@example.com', false],
    ['ada@-example.com', false],
    ['ada example@example.com', false],
    ['ada@example.c', false],
  ])('email %s: %s', (email, ok) => {
    expect(isEmailAddress(email)).toBe(ok);
  });

  it('dates, money and numbers', () => {
    expect([isIsoDate('2024-02-29'), isIsoDate('2023-02-29'), isIsoDate('2023-13-01'), isIsoDate('2023-1-01')]).toEqual([true, false, false, false]);
    expect(['0', '12', '12.3', '12.34', '999999999999.99'].every(isMoneyAmount)).toBe(true);
    expect(['', '-1', '01', '12.345', '$12', '1,000', '1e3', '12.'].some(isMoneyAmount)).toBe(false);
    expect([numericValueOf(3), numericValueOf('12.50'), numericValueOf('-3'), numericValueOf('x'), numericValueOf(Number.NaN)]).toEqual([3, 12.5, -3, null, null]);
  });

  it('VIN check digits', () => {
    expect(vinProblem('1HGCM82633A004352')).toBeNull();
    expect(vinProblem('1M8GDM9AXKP042788')).toBeNull();
    expect(vinProblem('1HGCM82633A004353')).toBe('check_digit');
    expect(vinProblem('1HGCM82633A00435O')).toBe('format');
  });
});

describe('secret detectors', () => {
  it('payment cards: brand prefix, 13 to 19 digits, Luhn', () => {
    for (const card of ['4111111111111111', '5555555555554444', '2223003122003222', '378282246310005', '6011111111111117', '3530111333300000']) {
      expect(isCardNumberLike(card)).toBe(true);
    }
    expect(luhnValid('1234567812345670')).toBe(true);
    expect(isCardNumberLike('1234567812345670')).toBe(false);
    expect(isCardNumberLike('4111111111111112')).toBe(false);
    expect(isCardNumberLike('411111111111')).toBe(false);
  });

  it('routing numbers and SSN shapes', () => {
    expect(isRoutingNumberLike('021000021')).toBe(true);
    expect(isRoutingNumberLike('011000015')).toBe(true);
    expect(isRoutingNumberLike('123456789')).toBe(false);
    expect(isRoutingNumberLike('921000021')).toBe(false);
    expect(isSsnShape('123456789')).toBe(true);
    for (const bad of ['000123456', '666123456', '900123456', '123004567', '123450000']) expect(isSsnShape(bad)).toBe(false);
  });

  it.each([
    ['SSN 123-45-6789', { ssn: true }],
    ['123 45 6789', { ssn: true, bareNine: true }],
    ['123-45 6789', {}],
    ['000-12-3456', {}],
    ['phone 212-555-0123', {}],
    ['4111-1111-1111-1111', { card: true }],
    ['card ending 1111', {}],
    ['ABA 011000015 please', { routing: true, bankAccount: true }],
    ['order 011000015', {}],
    [' 123456789 ', { bareNine: true }],
    ['021000021', { bareNine: true }],
    ['987654321', {}],
    ['checking account 12345678901', { bankAccount: true }],
    ['bank acct 00012345678', { bankAccount: true }],
    ['Comcast account 8772100123456', {}],
    ['Savings Mart, aisle 4', {}],
    ['PIN is 4821', { credential: true }],
    ['my pin number: 4821', { credential: true }],
    ['password: hunter2', { credential: true }],
    ['verification code 482913', { credential: true }],
    ['CVV 123', { credential: true }],
    ['I lost my PIN', {}],
    ['pins 3 photos to the board', {}],
    ['security code is on the back', {}],
    ['zip code 94110 and promo code 10OFF', {}],
    ['Spinach 1234 and Pinball 5000', {}],
  ])('%j', (text, expected) => {
    expect(findSecrets(text)).toEqual({ ssn: false, card: false, routing: false, bankAccount: false, credential: false, bareNine: false, ...expected });
  });
});
