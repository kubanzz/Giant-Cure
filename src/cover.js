// The cover, clinic and recovery all use the same illustrated patient.
(() => {
  'use strict';
  window.GiantCureCover = Object.freeze({
    draw(ctx, time, restored) {
      return window.GiantCureGiantArt.draw(ctx, {
        bounds: { x: 0, y: 430, w: 720, h: 548 }, time, restored,
        reducedMotion: false, heartVisible: false, recovering: false
      });
    }
  });
})();
