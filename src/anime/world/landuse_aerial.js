// [v4:polish2] Land-use areas traced by hand on the GSI seamless aerial photo (data/ortho/core.jpg, 0.53 m/px; grid-
// checked in ENU metres) where OSM maps nothing and the ground read wrongly as lawn. Same shape as layout LANDUSE.
// Source: 国土地理院 シームレス空中写真 (seamlessphoto z18), traced 2026-09-30.
export const AERIAL_LANDUSE = [
  // 海の市 south, either side of the lane at the 海の市 walk spot (381, 732): bare gravel lots (未舗装の空き地)
  { cls: 'gravel', type: 'aerial:gravel', name: null, ring: [[358, 701], [379, 702], [379, 728], [357, 728]], holes: [], area: 546, src: 'aerial' },
  // the overgrown lot straight ahead of that spot: rough weeds, dark olive in the photo (not a mown lawn)
  { cls: 'weeds', type: 'aerial:weeds', name: null, ring: [[380, 704], [397, 705], [397, 729], [380, 729]], holes: [], area: 425, src: 'aerial' },
  { cls: 'gravel', type: 'aerial:gravel', name: null, ring: [[350, 734], [370, 734], [370, 762], [349, 762]], holes: [], area: 574, src: 'aerial' },
];
