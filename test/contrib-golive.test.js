// [contrib] The go-live switch: the report flow is hidden in production until the team turns it on (ui/contrib-lib.js contribEnabled).
import { describe, test, expect } from 'bun:test';
import { contribEnabled, CONTRIB_DEFAULT_ON } from '../src/anime/ui/contrib-lib.js';

describe('contrib go-live switch', () => {
  test('production default is off until launch', () => {
    expect(CONTRIB_DEFAULT_ON).toBe(false);
    expect(contribEnabled({ hostname: 'kesennuma-living-city-production.up.railway.app' })).toEqual({ on: false, persist: null });
  });
  test('?contrib=1 turns it on and is remembered; ?contrib=0 turns it off and is remembered', () => {
    expect(contribEnabled({ search: '?contrib=1', hostname: 'example.com' })).toEqual({ on: true, persist: '1' });
    expect(contribEnabled({ search: '?contrib=0', hostname: 'localhost' })).toEqual({ on: false, persist: '0' });
  });
  test('a remembered choice holds without the parameter', () => {
    expect(contribEnabled({ hostname: 'example.com', stored: '1' }).on).toBe(true);
    expect(contribEnabled({ hostname: 'localhost', stored: '0' }).on).toBe(false);
  });
  test('local dev hosts always show it; other hosts follow the default', () => {
    for (const h of ['localhost', '127.0.0.1', 'app.localhost']) expect(contribEnabled({ hostname: h }).on).toBe(true);
    for (const h of ['host.example.net', 'localhost.evil.com', '']) expect(contribEnabled({ hostname: h }).on).toBe(false);
    expect(contribEnabled({ hostname: 'example.com', defaultOn: true }).on).toBe(true);
  });
});
