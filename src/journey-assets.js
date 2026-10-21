// The bundler replaces this object with local image data URLs.
(() => {
  'use strict';
  const sources = /* JOURNEY_IMAGE_DATA */ {};
  const assets = { images: {}, ready: null, error: null, retry: load };
  function load() {
    assets.error = null;
    assets.ready = Promise.all(Object.entries(sources).map(([name, source]) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { assets.images[name] = image; resolve(image); };
      image.onerror = () => reject(new Error('插画载入失败：' + name));
      image.src = source;
    }))).then(() => assets.images).catch(error => { assets.error = error; throw error; });
    // Preloading starts before the player clicks a chapter; its UI handles failures.
    assets.ready.catch(() => {});
    return assets.ready;
  }
  window.GiantCureAssets = assets;
  load();
})();
