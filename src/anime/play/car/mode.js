// The あそぶ card for ドライブ・レース. The hub lists whatever kit.registerMode received.
// `how` is the three 「やりかた」 steps. PLAY-ENTRY's snippet has no field for them yet.
import { timerText } from '../kit/format.js';
import { readCar, readCourse } from './save.js';

const MEDAL_JA = { gold: '金', silver: '銀', bronze: '銅' };
const MEDAL_EN = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

export function raceProgress(store) {
  const car = readCar(store);
  const course = readCourse(store);
  const lap = Number(car.race?.bestLapMs);
  const race = Number(course?.best);
  const ms = lap > 0 ? lap : (race > 0 ? race : 0);
  if (!(ms > 0)) return null;
  const medal = (course?.medal && MEDAL_JA[course.medal] ? course.medal : null)
    || (car.race?.medal && MEDAL_JA[car.race.medal] ? car.race.medal : null);
  const clock = timerText(ms);
  const mj = medal ? MEDAL_JA[medal] + ' · ' : '';
  const me = medal ? MEDAL_EN[medal] + ' · ' : '';
  return { ja: mj + 'ベスト ' + clock, en: me + 'Best ' + clock };
}

export function raceIsNew(store) {
  const course = readCourse(store);
  return !(Number(course?.runs) > 0);
}

export function raceHow(garage) {
  if (garage) {
    return {
      ja: ['カウントダウンのあと、スタート', '港町の夜を2周', 'ガレージで色をえらぶ'],
      en: ['Countdown, then go', 'Two laps of the night harbour', 'Pick a color in the garage'],
    };
  }
  return {
    ja: ['カウントダウンのあと、スタート', '港町の夜を2周', 'スペースでドリフト'],
    en: ['Countdown, then go', 'Two laps of the night harbour', 'Space to drift'],
  };
}

export function raceModeSpec({ store, start, garage = true }) {
  return {
    id: 'race',
    order: 50,
    title: { ja: 'ドライブ・レース', en: 'Drive race' },
    hook: { ja: '夜の港を2周', en: 'Two laps of the night harbour' },
    art: '/data/play/art/race.webp',   // the night lap, from the car lane's round-4 frame (no HUD)
    minutes: 3,
    stars: 2,
    players: 1,
    how: raceHow(!!garage),
    progress: () => raceProgress(store),
    isNew: () => raceIsNew(store),
    start,
  };
}
