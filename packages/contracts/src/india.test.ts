import { describe, expect, it } from 'vitest';
import { formatInr, groupIndian, isValidAadhaar, isValidIfsc, isValidPan, rupeesToPaise, verhoeffDigit } from './india.js';

describe('India identifiers', () => {
  it.each([
    ['ABCPE1234F', true],
    ['abcpe1234f', true],
    ['ABCPE12345', false],
    ['ABC1234F', false],
  ])('PAN %s -> %s', (v, ok) => expect(isValidPan(v)).toBe(ok));

  it.each([
    ['HDFC0001234', true],
    ['SBIN0ABC123', true],
    ['HDFC1001234', false],
    ['HDF0001234', false],
  ])('IFSC %s -> %s', (v, ok) => expect(isValidIfsc(v)).toBe(ok));

  it('checks Aadhaar with Verhoeff', () => {
    const base = '23456789012';
    const good = `${base}${verhoeffDigit(base)}`;
    expect(isValidAadhaar(good)).toBe(true);
    expect(isValidAadhaar(`${good.slice(0, 4)} ${good.slice(4, 8)} ${good.slice(8)}`)).toBe(true);
    const bad = `${base}${(verhoeffDigit(base) + 1) % 10}`;
    expect(isValidAadhaar(bad)).toBe(false);
    expect(isValidAadhaar('123456789012')).toBe(false); // starts with 1
  });
});

describe('Indian number formatting', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['100000', '1,00,000'],
    ['1234567', '12,34,567'],
    ['123456789', '12,34,56,789'],
    ['-1234567', '-12,34,567'],
  ])('groups %s as %s', (v, out) => expect(groupIndian(v)).toBe(out));

  it.each([
    [123456700, '₹12,34,567'],
    [123456750, '₹12,34,567.50'],
    [5, '₹0.05'],
    [-250000, '-₹2,500'],
  ])('formats %d paise as %s', (p, out) => expect(formatInr(p)).toBe(out));

  it.each([
    ['12,34,567.5', 123456750],
    ['₹ 1,00,000', 10000000],
    [1200.5, 120050],
    ['abc', null],
  ])('reads %s as %s paise', (v, out) => expect(rupeesToPaise(v)).toBe(out));
});
