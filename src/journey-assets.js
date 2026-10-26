// The bundler replaces this object with local image data URLs.
(() => {
  'use strict';
  const sources = /* JOURNEY_IMAGE_DATA */ {};
  const assets = { images: {}, ready: null, clinicReady: null, error: null, clinicError: null, recoveryError: null, retry: loadRooms, retryClinic: loadClinic };
  function loadImage(name) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { assets.images[name] = image; resolve(image); };
      image.onerror = () => { delete assets.images[name]; reject(new Error('插画载入失败：' + name)); };
      image.src = sources[name];
    });
  }
  function loadRooms() {
    assets.error = null;
    assets.ready = Promise.all(['entry', 'main', 'heart'].filter(name => sources[name]).map(loadImage))
      .then(() => assets.images).catch(error => { assets.error = error; throw error; });
    assets.ready.catch(() => {});
    return assets.ready;
  }
  function loadClinic() {
    assets.clinicError = null;
    assets.clinicReady = (sources.scanGiant ? loadImage('scanGiant') : Promise.resolve())
      .then(() => assets.images).catch(error => { assets.clinicError = error; throw error; });
    assets.clinicReady.catch(() => {});
    return assets.clinicReady;
  }
  window.GiantCureAssets = assets;
  loadRooms(); loadClinic();
})();
