import { test, expect } from 'bun:test';
import { counterText, timerText, splitText, splitFaster } from '../src/anime/play/kit/format.js';

test('counter is half-width digits', () => {
  expect(counterText(12, 50)).toBe('12/50');
  expect(counterText(0, 50)).toBe('0/50');
  expect(counterText(-3, 50)).toBe('0/50');
  expect(counterText(12.9, 50)).toBe('12/50');
  expect(counterText(12, 50)).not.toMatch(/[０-９]/);
});

test('timer text', () => {
  expect(timerText(42370)).toBe('0:42.37');
  expect(timerText(0)).toBe('0:00.00');
  expect(timerText(60000)).toBe('1:00.00');
  expect(timerText(125430)).toBe('2:05.43');
  expect(timerText(-20)).toBe('0:00.00');
});

test('splits use a real minus and one decimal', () => {
  expect(splitText(1000, 2200)).toBe('−1.2');
  expect(splitText(1000, 2200).charCodeAt(0)).toBe(0x2212);
  expect(splitText(1800, 1000)).toBe('+0.8');
  expect(splitText(1000, 1000)).toBe('0.0');
  expect(splitText(1040, 1000)).toBe('0.0');
  expect(splitText(1060, 1000)).toBe('+0.1');
  expect(splitText(5000, null)).toBe('');
  expect(splitFaster(1000, 2200)).toBe(true);
  expect(splitFaster(1800, 1000)).toBe(false);
  expect(splitFaster(1000, 1000)).toBe(false);
});
