// [play] The talk pill: priority, the E key while walking, and the phone row without 飛ぶ.
import { describe, expect, test } from 'bun:test';
import { makeDom } from './lib/mini-dom.js';
import { promptReplaces, promptKeyFires, promptPadIds, mountUi } from '../src/anime/play/kit/ui.js';

describe('prompt priority and the talk key', () => {
  test('a lower prompt cannot cover a higher one', () => {
    expect(promptReplaces(0, 1)).toBe(true);
    expect(promptReplaces(null, 1)).toBe(true);
    expect(promptReplaces(1, 1)).toBe(true);
    expect(promptReplaces(1, 2)).toBe(true);
    expect(promptReplaces(3, 2)).toBe(false);
    expect(promptReplaces(3, 1)).toBe(false);
    expect(promptReplaces(2, 3)).toBe(true);
  });

  test('Enter always presses; E only while walking', () => {
    expect(promptKeyFires('Enter', false)).toBe(true);
    expect(promptKeyFires('Enter', true)).toBe(true);
    expect(promptKeyFires('KeyE', true)).toBe(true);
    expect(promptKeyFires('KeyE', false)).toBe(false);
    expect(promptKeyFires('KeyF', true)).toBe(false);
  });

  test('the talk row keeps jump and dash, and leaves 飛ぶ off', () => {
    expect(promptPadIds({ talk: true })).toEqual(['jump', 'dash']);
    expect(promptPadIds({})).toEqual(['jump', 'dash', 'fly']);
  });

  test('the talk pill wins, shows an E keycap, and the pad drops 飛ぶ', () => {
    const dom = makeDom();
    const prev = { document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage };
    globalThis.document = dom.document;
    globalThis.window = dom.window;
    globalThis.localStorage = dom.localStorage;
    const modes = {};
    const pad = {
      mode: 'walk',
      active: true,
      registerMode(id, spec) { modes[id] = spec; },
      setMode(id) { this.mode = id; },
    };
    const player = { fly: false, enabled: true };
    let presses = 0;
    try {
      dom.document.body.classList.add('playing');
      const ui = mountUi({
        pad,
        playerObj: player,
        services: {},
        onStep() {},
      });
      const low = ui.prompt('乗る', { priority: 1, onPress() { presses += 10; } });
      expect(low.shown).toBe(true);
      const talk = ui.prompt('話す', {
        priority: 3, keycap: 'E', talk: true, onPress() { presses += 1; },
      });
      expect(talk.shown).toBe(true);
      expect(low.shown).toBe(false);
      const blocked = ui.prompt('とまる', { priority: 1, onPress() { presses += 100; } });
      expect(blocked.shown).toBe(false);
      const pill = dom.document.querySelector('#klc-play .prompt');
      expect(pill.hidden).toBe(false);
      expect(pill.classList.contains('has-key')).toBe(true);
      expect(pill.querySelector('kbd').textContent).toBe('E');
      expect(pill.getAttribute('aria-label')).toBe('話す');
      expect(pill.textContent).toContain('話す');
      expect(modes['play-prompt'].buttons.map((b) => b.id)).toEqual(['play-go', 'jump', 'dash']);
      dom.fire(dom.document, 'keydown', { code: 'KeyE', repeat: false, target: dom.document.body });
      expect(presses).toBe(1);
      player.fly = true;
      dom.fire(dom.document, 'keydown', { code: 'KeyE', repeat: false, target: dom.document.body });
      expect(presses).toBe(1);
      dom.fire(dom.document, 'keydown', { code: 'Enter', repeat: false, target: dom.document.body });
      expect(presses).toBe(2);
      talk.hide();
      expect(pill.hidden).toBe(true);
      const playBtn = dom.document.querySelector('[data-act="play"]');
      playBtn.hidden = false;
      const eat = dom.window.__play.eatKeyP;
      const key = { code: 'KeyP', repeat: false, metaKey: false, ctrlKey: false, altKey: false, preventDefault() { this.prevented = true; }, target: dom.document.body };
      player.fly = false;
      expect(eat(key)).toBe(false);
      player.fly = true;
      dom.window.__play.photoOwnsP = true;
      expect(eat(key)).toBe(false);
      dom.window.__play.photoOwnsP = false;
      expect(eat(key)).toBe(true);
      expect(dom.document.head.querySelector('style').textContent).toContain('.prompt kbd');
    } finally {
      globalThis.document = prev.document;
      globalThis.window = prev.window;
      globalThis.localStorage = prev.localStorage;
    }
  });
});
