import { test as bunTest, expect } from 'bun:test';
import * as L from '../src/anime/world/layout.js';
import { designSpots, lotIndex, volumeAt, _resetSpots } from '../src/anime/play/katsuo/place.js';
import { Box3, Vector3 } from 'three';
import { charmGeometry, charmShadowY, charmCentreY, CHARM_GOLD, CHARM_GOLD_HI, CHARM_NAVY, CHARM_SHADOW, CHARM_LEN, CHARM_GAP, CHARM_DROP, CHARM_BOB, LOGO_FISH } from '../src/anime/play/katsuo/charm.js';
import { pickupRadius, nextCombo, comboPitch, comboName, shimmerGain, isMilestone, isFinale, glintMetres, GLINT_PX, GLINT_REST, GLINT_FLASH, COMBO_S, SWIM_R } from '../src/anime/play/katsuo/rules.js';

const test = (name, fn) => bunTest(name, fn, 60_000);
const SENSITIVE = /\u6d25\u6ce2|\u9707\u707d|被災|復興|tsun[a]mi|earthquake|201[1]|3\.1[1]|慰霊|避難|防潮堤|伝承館|遺構|memorial|disaster/i;

test('pickup, combo and milestones', () => {
  expect(pickupRadius('walk')).toBe(2.5);
  expect(pickupRadius('drive')).toBe(4);
  expect(pickupRadius('fly')).toBe(4);
  expect(pickupRadius('sail')).toBe(9);
  expect(pickupRadius('menu')).toBe(0);
  expect(pickupRadius('photo')).toBe(0);
  expect(pickupRadius('interior')).toBe(0);
  expect(pickupRadius('swim')).toBe(SWIM_R);
  expect(nextCombo(-1, 0)).toBe(0);
  expect(nextCombo(0, 6)).toBe(1);
  expect(nextCombo(0, COMBO_S)).toBe(1);
  expect(nextCombo(0, COMBO_S + 0.01)).toBe(0);
  expect(nextCombo(5, 1)).toBe(5);
  expect(comboPitch(0)).toBe(0);
  expect(comboPitch(2)).toBe(4);
  expect(comboPitch(5)).toBe(12);
  expect(comboName(0)).toBe('chime');
  expect(comboName(3)).toBe('combo');
  expect(shimmerGain(0)).toBe(1);
  expect(shimmerGain(40)).toBe(0);
  expect(shimmerGain(20)).toBeCloseTo(0.25, 5);
  expect(isMilestone(10)).toBe(true);
  expect(isMilestone(11)).toBe(false);
  expect(isFinale(49, 50)).toBe(true);
  expect(isFinale(50, 50)).toBe(false);
  const px = glintMetres(60, 55, 852);
  expect(px).toBeGreaterThan(1);
  expect(px).toBeCloseTo(GLINT_PX * (2 * Math.tan((55 * Math.PI) / 360) * 60) / 852, 5);
  expect(GLINT_PX).toBe(14);
  expect(GLINT_REST).toBe(1);
  expect(GLINT_FLASH).toBeGreaterThan(1);
  expect(GLINT_FLASH * GLINT_PX).toBeLessThanOrEqual(64);
});

test('the charm is gold with a thin navy hull', () => {
  const geo = charmGeometry();
  const mark = geo.attributes.mark.array;
  let gold = 0, hull = 0, eye = 0;
  for (let i = 0; i < mark.length; i++) {
    if (mark[i] > 1.5) eye++;
    else if (mark[i] > 0.5) hull++;
    else gold++;
  }
  expect(gold).toBe(hull);
  expect(eye).toBeGreaterThan(20);
  const size = new Vector3();
  new Box3().setFromBufferAttribute(geo.attributes.position).getSize(size);
  expect(size.x).toBeGreaterThan(CHARM_LEN - 0.04);
  expect(size.x).toBeLessThan(CHARM_LEN + 0.08);
  // The title logo's カツオ: 112 units long, 52 tall with the dorsal and the crescent tail.
  expect(size.y).toBeGreaterThan(0.9 * 52 / 112 - 0.02);
  expect(size.y).toBeLessThan(0.9 * 52 / 112 + 0.02);
  expect(size.z).toBeLessThan(0.22);
  expect(LOGO_FISH.body.startsWith('M-44 0')).toBe(true);
  // The hull is pushed out along welded normals, so it closes over the fin edges.
  expect(geo.attributes.hn.count).toBe(geo.attributes.position.count);
  expect(geo.boundingSphere.radius).toBeGreaterThan(0.35);
  expect(geo.boundingSphere.radius).toBeLessThan(0.55);
  expect(CHARM_GOLD).toBe('#F8B500');
  expect(CHARM_GOLD_HI).toBe('#FFE38A');
  expect(CHARM_SHADOW).toBe('#A86A00');
  expect(CHARM_NAVY).toBe('#223A70');
  geo.dispose();
});

test('on foot the charm floats 0.15 m over its ring; drone, boat and swim keep their height', () => {
  const walk = { mode: 'walk', x: 0, y: 4.08, z: 0 };
  const ground = charmShadowY(walk);
  expect(ground).toBeCloseTo(3, 5);
  const low = charmCentreY(walk) - CHARM_BOB * 0.5 - CHARM_DROP;
  expect(low - ground).toBeCloseTo(CHARM_GAP, 5);
  expect(CHARM_GAP).toBe(0.15);
  expect(charmCentreY(walk) - ground).toBeLessThan(0.5);
  expect(charmCentreY({ mode: 'drive', x: 0, y: 4.08, z: 0 })).toBeCloseTo(charmCentreY(walk), 5);
  for (const mode of ['fly', 'sail', 'swim']) expect(charmCentreY({ mode, x: 0, y: 7.5, z: 0 })).toBe(7.5);
});

test('fifty charms, spaced, reachable, every district', () => {
  _resetSpots();
  const spots = designSpots(L);
  expect(designSpots(L)).toBe(spots);
  _resetSpots();
  expect(JSON.stringify(designSpots(L))).toBe(JSON.stringify(spots));

  expect(spots).toHaveLength(50);
  const modes = {};
  const districts = {};
  for (const s of spots) {
    modes[s.mode] = (modes[s.mode] || 0) + 1;
    districts[s.district] = (districts[s.district] || 0) + 1;
    expect(s.note).not.toMatch(SENSITIVE);
    expect(s.district.length).toBeGreaterThan(0);
  }
  expect(modes).toEqual({ walk: 20, fly: 14, drive: 7, sail: 6, swim: 3 });
  expect(Object.keys(districts).length).toBeGreaterThanOrEqual(10);
  for (const n of Object.values(districts)) expect(n).toBeLessThanOrEqual(12);

  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      expect(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z)).toBeGreaterThanOrEqual(60);
    }
  }

  const map = lotIndex(L.LOTS);
  const cam = L.HERO.drone.pos;
  let visible = 0;
  for (const s of spots) {
    expect(volumeAt(map, L.LOTS, s.x, s.y, s.z)).toBe(false);
    if (Math.hypot(s.x - cam[0], s.y - cam[1], s.z - cam[2]) < 180) visible++;
    if (s.mode === 'walk') {
      expect(s.reach?.length).toBeGreaterThan(0);
      expect(L.isWater(s.x, s.z)).toBe(false);
      expect(L.shoreDist(s.x, s.z)).toBeLessThanOrEqual(-4);
      expect(L.waterClass(s.x, s.z)).not.toBe(2);
    }
    if (s.mode === 'sail') {
      expect(L.isWater(s.x, s.z)).toBe(true);
      expect(L.shoreDist(s.x, s.z)).toBeGreaterThan(8);
      expect(s.y).toBeGreaterThan(0.4);
      expect(s.y).toBeLessThan(4);
    }
    if (s.mode === 'drive') expect(L.isWater(s.x, s.z)).toBe(false);
    if (s.mode === 'fly') expect(s.y).toBeGreaterThan(L.groundAt(s.x, s.z) + 1);
    if (s.mode === 'swim') {
      expect(L.isWater(s.x, s.z)).toBe(true);
      expect(s.y).toBeLessThan(-0.4);
      expect(s.y).toBeGreaterThan(L.heightAt(s.x, s.z) + 0.4);
    }
  }
  expect(visible).toBeGreaterThan(0);

  const by = Object.fromEntries(spots.map((s) => [s.id, s]));
  const a = by['w-otokoyama'], b = by['w-kakuboshi'], c = by['w-takeyama'];
  const leg = Math.hypot(a.x - b.x, a.z - b.z) + Math.hypot(b.x - c.x, b.z - c.z);
  expect(leg).toBeLessThan(220);
  expect(by['w-open']).toBeTruthy();
  expect(by['u-shallows']).toMatchObject({ x: 348, y: -1.5, z: 8, mode: 'swim' });
  expect(by['u-raft']).toMatchObject({ x: 1620, y: -6.5, z: 3644, mode: 'swim' });
  expect(by['u-wakame']).toMatchObject({ x: 1700, y: -5, z: 7520, mode: 'swim' });

  const yaw = 111 * Math.PI / 180;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const open = by['w-open'];
  const dx = open.x - 168, dz = open.z - -122;
  const dist = Math.hypot(dx, dz);
  expect(dist).toBeGreaterThan(12);
  expect(dist).toBeLessThan(40);
  expect((dx * fx + dz * fz) / dist).toBeGreaterThan(Math.cos(12 * Math.PI / 180));

  const line = ['w-open', 'w-prom', 'w-isuzu'].map((id) => by[id]);
  let run = 0;
  for (let i = 1; i < line.length; i++) {
    const gap = Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
    expect(gap).toBeGreaterThanOrEqual(60);
    const sprint = (gap - 5) / 6.4;
    expect(sprint).toBeLessThan(COMBO_S);
    run += gap;
  }
  expect(run / 6.4).toBeLessThan(60);
});
