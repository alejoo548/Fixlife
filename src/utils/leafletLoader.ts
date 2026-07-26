declare global {
  interface Window {
    L?: any;
  }
}

const LEAFLET_CSS_URLS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
];

const LEAFLET_JS_URLS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
];

const loadStylesheet = (id: string, href: string) => {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
};

const loadScript = (id: string, src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Could not load ${src}`));
    };
    document.body.appendChild(script);
  });

export const loadLeaflet = async (scope: string) => {
  if (window.L) return true;

  LEAFLET_CSS_URLS.forEach((href, index) => loadStylesheet(`leaflet-css-${scope}-${index}`, href));

  for (let index = 0; index < LEAFLET_JS_URLS.length; index += 1) {
    try {
      await loadScript(`leaflet-js-${scope}`, LEAFLET_JS_URLS[index]);
      if (window.L) return true;
    } catch {
    }
  }

  return Boolean(window.L);
};

export const addResilientTileLayer = (L: any, map: any, dark: boolean = false) => {
  let fallbackAdded = false;
  // Light: CARTO Positron — minimal grey/white basemap (Uber/rideshare-app
  // look), swapped from the old colorful Voyager tiles. Dark: CARTO Dark
  // Matter, softened with a CSS filter (see .fixlife-map-tiles-dark in
  // index.css) so roads/water/labels stay legible instead of near-black.
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const primaryLayer = L.tileLayer(tileUrl, {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    keepBuffer: 1,
    updateWhenIdle: true,
    updateWhenZooming: false,
    className: dark ? 'fixlife-map-tiles-dark' : '',
  }).addTo(map);

  primaryLayer.on('tileerror', () => {
    if (fallbackAdded) return;
    fallbackAdded = true;
    try {
      map.removeLayer(primaryLayer);
    } catch {
    }
    // Fallback only fires if CARTO is unreachable; plain OSM tiles are light,
    // not dark, but keeping the map usable matters more than the theme here.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
    }).addTo(map);
  });

  return primaryLayer;
};
