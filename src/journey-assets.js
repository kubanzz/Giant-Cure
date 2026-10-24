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
      // Only the three playable room backgrounds are image resources. Clinic
      // and recovery art are shared vector drawing; their legacy errors stay null.
      image.onerror = () => { delete assets.images[name]; reject(new Error('插画载入失败：' + name)); };
      image.src = source;
    }))).then(() => assets.images).catch(error => { assets.error = error; throw error; });
    // Preloading starts before the player clicks a chapter; its UI handles failures.
    assets.ready.catch(() => {});
    return assets.ready;
  }
  window.GiantCureAssets = assets;
  load();
})();
