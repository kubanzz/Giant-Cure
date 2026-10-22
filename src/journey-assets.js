// The bundler replaces this object with local image data URLs.
(() => {
  'use strict';
  const sources = /* JOURNEY_IMAGE_DATA */ {};
  const assets = { images: {}, ready: null, error: null, clinicError: null, recoveryError: null, retry: load };
  function load() {
    assets.error = null; assets.clinicError = null; assets.recoveryError = null;
    assets.ready = Promise.all(Object.entries(sources).map(([name, source]) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { assets.images[name] = image; resolve(image); };
      image.onerror = () => {
        const error = new Error('插画载入失败：' + name);
        // Decorative plates have drawing fallbacks; a damaged recovery layer
        // must not prevent entering the chapter or completing treatment.
        if (name === 'clinic') { delete assets.images[name]; assets.clinicError = error; resolve(null); }
        else if (name.startsWith('recovery')) { delete assets.images[name]; assets.recoveryError = error; resolve(null); }
        else reject(error);
      };
      image.src = source;
    }))).then(() => assets.images).catch(error => { assets.error = error; throw error; });
    // Preloading starts before the player clicks a chapter; its UI handles failures.
    assets.ready.catch(() => {});
    return assets.ready;
  }
  window.GiantCureAssets = assets;
  load();
})();
