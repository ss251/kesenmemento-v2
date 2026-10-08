// [feel] The walker has no credit pill. The avatar stylesheet only styles the look picker.
import { test, expect, describe } from 'bun:test';
import { CSS } from '../src/anime/play/avatar/index.js';

describe('the walker has no credit pill', () => {
  test('the avatar stylesheet styles the look row and does not place a caption', () => {
    expect(CSS).toContain('#klc-play .avatar-row');
    expect(CSS).toContain('#klc-play .avatar-note');
    expect(CSS).not.toMatch(/credit/i);
  });
});
