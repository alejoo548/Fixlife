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

export const addResilientTileLayer = (L: any, map: any) => {
  let fallbackAdded = false;
  const primaryLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  }).addTo(map);

  primaryLayer.on('tileerror', () => {
    if (fallbackAdded) return;
    fallbackAdded = true;
    try {
      map.removeLayer(primaryLayer);
    } catch {
    }
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  });

  return primaryLayer;
};
