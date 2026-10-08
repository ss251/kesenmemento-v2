// [contrib] Build identity, stamped into every report (pose.appVersion / pose.layoutVersion) so a moderator knows which build and
// which layout data the contributor was looking at.
//
// scripts/anime/buildinfo.js computes the values and passes them to Bun.build as `define` constants (scripts/build-web.js and
// tools/anime/cdp.mjs). A page that was not built that way (bun test, a hand-made bundle) reports 'dev'.
/* global __KLC_APP_VERSION__, __KLC_LAYOUT_VERSION__ */
/** package.json version + the commit the bundle was built from, e.g. "0.1.0+df15fdd". */
export const APP_VERSION = typeof __KLC_APP_VERSION__ === 'string' ? __KLC_APP_VERSION__ : 'dev';
/** data/anime/layout.json: its own version and a short content hash, e.g. "v1.3fa9c2d1". */
export const LAYOUT_VERSION = typeof __KLC_LAYOUT_VERSION__ === 'string' ? __KLC_LAYOUT_VERSION__ : 'dev';
