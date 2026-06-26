(function() {
  'use strict';

  const TARGET_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const TARGET_PLATFORM = 'Win32';
  const TARGET_VENDOR = 'Google Inc.';
  const TARGET_LANGUAGE = 'en-US';
  const TARGET_LANGUAGES = ['en-US', 'en'];
  const TARGET_HARDWARE_CONCURRENCY = 8;
  const TARGET_DEVICE_MEMORY = 8;
  const TARGET_MAX_TOUCH_POINTS = 0;
  const TARGET_COOKIE_ENABLED = true;

  const generateSessionSeed = function() {
    const base = Date.now() % 100000;
    return ((base * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  };

  const sessionSeed = generateSessionSeed();

  const lcg = function(seed) {
    let state = seed;
    return function() {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  };

  const noiseRng = lcg(sessionSeed * 1000);

  const applyStealthProperty = function(obj, prop, value, makeEnumerable = false) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop) || {};
      Object.defineProperty(obj, prop, {
        value: value,
        writable: descriptor.writable !== undefined ? descriptor.writable : true,
        configurable: descriptor.configurable !== undefined ? descriptor.configurable : true,
        enumerable: makeEnumerable ? true : (descriptor.enumerable !== undefined ? descriptor.enumerable : false),
        get: undefined,
        set: undefined
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  const applyStealthGetter = function(obj, prop, getterFn, makeEnumerable = false) {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop) || {};
      Object.defineProperty(obj, prop, {
        get: getterFn,
        set: descriptor.set,
        configurable: descriptor.configurable !== undefined ? descriptor.configurable : true,
        enumerable: makeEnumerable ? true : (descriptor.enumerable !== undefined ? descriptor.enumerable : false)
      });
      return true;
    } catch (e) {
      return false;
    }
  };

  (function normalizeNavigator() {
    const nav = window.navigator;

    applyStealthProperty(nav, 'userAgent', TARGET_UA);
    applyStealthProperty(nav, 'platform', TARGET_PLATFORM);
    applyStealthProperty(nav, 'vendor', TARGET_VENDOR);
    applyStealthProperty(nav, 'hardwareConcurrency', TARGET_HARDWARE_CONCURRENCY);
    applyStealthProperty(nav, 'deviceMemory', TARGET_DEVICE_MEMORY);
    applyStealthProperty(nav, 'language', TARGET_LANGUAGE);
    applyStealthProperty(nav, 'languages', TARGET_LANGUAGES);
    applyStealthProperty(nav, 'maxTouchPoints', TARGET_MAX_TOUCH_POINTS);
    applyStealthProperty(nav, 'cookieEnabled', TARGET_COOKIE_ENABLED);

    if (nav.plugins && nav.plugins.length > 0) {
      try {
        Object.defineProperty(nav, 'plugins', {
          get: function() {
            return {
              length: 0,
              item: function() { return undefined; },
              namedItem: function() { return undefined; },
              [Symbol.iterator]: function* () {}
            };
          },
          configurable: true
        });
      } catch (e) {}
    }

    if (nav.mimeTypes && nav.mimeTypes.length > 0) {
      try {
        Object.defineProperty(nav, 'mimeTypes', {
          get: function() {
            return {
              length: 0,
              item: function() { return undefined; },
              namedItem: function() { return undefined; },
              [Symbol.iterator]: function* () {}
            };
          },
          configurable: true
        });
      } catch (e) {}
    }
  })();

  (function hookCanvas() {
    const CanvasProto = HTMLCanvasElement.prototype;
    const originalToDataURL = CanvasProto.toDataURL;
    const originalToBlob = CanvasProto.toBlob;
    const originalGetContext = CanvasProto.getContext;

    const injectNoise = function(imageData) {
      if (!imageData || !imageData.data) return imageData;
      const data = imageData.data;
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        const noise = Math.floor((noiseRng() - 0.5) * 2);
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      return imageData;
    };

    Object.defineProperty(CanvasProto, 'toDataURL', {
      value: function() {
        const result = originalToDataURL.apply(this, arguments);
        if (typeof result === 'string' && result.startsWith('data:image')) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = this.width;
          tempCanvas.height = this.height;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(this, 0, 0);
            const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            injectNoise(imageData);
            ctx.putImageData(imageData, 0, 0);
            return originalToDataURL.call(tempCanvas, arguments[0], arguments[1]);
          }
        }
        return result;
      },
      writable: true,
      configurable: true
    });

    Object.defineProperty(CanvasProto, 'toBlob', {
      value: function(callback, type, quality) {
        const self = this;
        originalToBlob.call(this, function(originalBlob) {
          if (!originalBlob) {
            callback(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = function() {
            const img = new Image();
            img.onload = function() {
              const tempCanvas = document.createElement('canvas');
              tempCanvas.width = self.width;
              tempCanvas.height = self.height;
              const ctx = tempCanvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                injectNoise(imageData);
                ctx.putImageData(imageData, 0, 0);
                originalToBlob.call(tempCanvas, callback, type, quality);
                return;
              }
              callback(originalBlob);
            };
            img.src = reader.result;
          };
          reader.readAsDataURL(originalBlob);
        }, type, quality);
      },
      writable: true,
      configurable: true
    });

    Object.defineProperty(CanvasProto, 'getContext', {
      value: function(contextType, contextAttributes) {
        const context = originalGetContext.call(this, contextType, contextAttributes);
        if (contextType === 'webgl' || contextType === 'webgl2') {
          if (context && typeof WebGLRenderingContext !== 'undefined' && context instanceof WebGLRenderingContext) {
            hookWebGL(context, false);
          }
          if (context && typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext) {
            hookWebGL(context, true);
          }
        }
        return context;
      },
      writable: true,
      configurable: true
    });
  })();

  const hookWebGL = function(gl, isWebGL2) {
    if (!gl) return;

    const originalGetParameter = gl.getParameter;
    const originalGetExtension = gl.getExtension;

    const WEBGL_debug_renderer_info = isWebGL2 ? 
      (window.WebGL2RenderingContext ? window.WebGL2RenderingContext.prototype.constructor.UNMASKED_VENDOR_WEBGL : undefined) :
      (window.WebGLRenderingContext ? window.WebGLRenderingContext.prototype.constructor.UNMASKED_VENDOR_WEBGL : undefined);

    const UNMASKED_VENDOR_WEBGL = 0x9245;
    const UNMASKED_RENDERER_WEBGL = 0x9246;

    Object.defineProperty(gl, 'getParameter', {
      value: function(pname) {
        if (pname === UNMASKED_VENDOR_WEBGL) {
          return 'Google Inc. (Intel)';
        }
        if (pname === UNMASKED_RENDERER_WEBGL) {
          return 'ANGLE (Intel, Intel(R) UHD Graphics, OpenGL 4.1)';
        }
        return originalGetParameter.call(gl, pname);
      },
      writable: true,
      configurable: true
    });

    Object.defineProperty(gl, 'getExtension', {
      value: function(name) {
        if (typeof name === 'string' && name.toUpperCase() === 'WEBGL_DEBUG_RENDERER_INFO') {
          return {
            UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR_WEBGL,
            UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER_WEBGL
          };
        }
        return originalGetExtension.call(gl, name);
      },
      writable: true,
      configurable: true
    });

    const originalCreateShader = gl.createShader;
    Object.defineProperty(gl, 'createShader', {
      value: function(type) {
        return originalCreateShader.call(gl, type);
      },
      writable: true,
      configurable: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.__stealthShieldActive = true;
    }, { once: true });
  } else {
    window.__stealthShieldActive = true;
  }
})();
