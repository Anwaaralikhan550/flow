(function() {
  'use strict';

  // --- CONFIGURATION: TARGET WINDOWS CHROME PROFILE ---
  const TARGET_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const TARGET_PLATFORM = "Win32";
  const TARGET_VENDOR = "Google Inc.";
  const TARGET_LANGUAGE = "en-US";
  const TARGET_LANGUAGES = ["en-US", "en"];
  const TARGET_HARDWARE_CONCURRENCY = 8;
  const TARGET_DEVICE_MEMORY = 8;
  const TARGET_MAX_TOUCH_POINTS = 0;
  const TARGET_COOKIE_ENABLED = true;

  // --- UTILS: FAST SPARSE NOISE GENERATION ---
  let seed = Date.now() % 100000;
  const lcg = function() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  /**
   * Injects noise into canvas data using sparse sampling.
   * Only modifies ~0.4% of pixels to prevent FPS drops.
   */
  const injectNoise = function(imageData) {
    if (!imageData || !imageData.data) return imageData;
    const data = imageData.data;
    const totalPixels = data.length >> 2;
    const modCount = Math.max(1, totalPixels >> 8); // 1/256 = ~0.4%
    
    for (let i = 0; i < modCount; i++) {
      const idx = (Math.floor(lcg() * totalPixels)) << 2;
      const noise = (lcg() > 0.5 ? 1 : -1);
      data[idx] = (data[idx] + noise) & 0xFF;
      data[idx + 1] = (data[idx + 1] + noise) & 0xFF;
      data[idx + 2] = (data[idx + 2] + noise) & 0xFF;
    }
    return imageData;
  };

  // --- CORE: NATIVE CODE MASKING WITH DYNAMIC REFLECTION ---
  const nativeToString = Function.prototype.toString;
  const overriddenFns = new WeakMap();

  // Helper to create a native-looking function wrapper
  const createNativeWrapper = function(fn, name, isGetter) {
    const wrapper = isGetter 
      ? function get() { return fn.apply(this, arguments); }
      : function() { return fn.apply(this, arguments); };
    
    try {
      Object.defineProperty(wrapper, 'name', { value: name, configurable: true });
    } catch (e) {}
    
    overriddenFns.set(wrapper, true);
    return wrapper;
  };

  // Proxy Function.prototype.toString to return proper native format
  Function.prototype.toString = new Proxy(nativeToString, {
    apply: function(target, thisArg, args) {
      if (overriddenFns.has(thisArg)) {
        const fnName = thisArg.name || '';
        if (fnName.startsWith('get ')) {
          return 'function get ' + fnName.slice(4) + '() { [native code] }';
        } else if (fnName.startsWith('set ')) {
          return 'function set ' + fnName.slice(4) + '() { [native code] }';
        } else {
          return 'function ' + fnName + '() { [native code] }';
        }
      }
      return nativeToString.apply(thisArg, args);
    }
  });

  // Helper to define a property with a native-looking getter
  const overrideProperty = function(obj, prop, value) {
    try {
      const getterFn = function() { return value; };
      const wrappedGetter = createNativeWrapper(getterFn, 'get ' + prop, true);
      
      Object.defineProperty(obj, prop, {
        get: wrappedGetter,
        set: undefined,
        configurable: true,
        enumerable: true
      });
    } catch (e) {}
  };

  // --- EXECUTION: NAVIGATOR SPOOFING ---
  (function normalizeNavigator() {
    const nav = window.navigator;

    overrideProperty(nav, 'userAgent', TARGET_UA);
    overrideProperty(nav, 'platform', TARGET_PLATFORM);
    overrideProperty(nav, 'vendor', TARGET_VENDOR);
    overrideProperty(nav, 'language', TARGET_LANGUAGE);
    overrideProperty(nav, 'languages', TARGET_LANGUAGES);
    overrideProperty(nav, 'hardwareConcurrency', TARGET_HARDWARE_CONCURRENCY);
    overrideProperty(nav, 'deviceMemory', TARGET_DEVICE_MEMORY);
    overrideProperty(nav, 'maxTouchPoints', TARGET_MAX_TOUCH_POINTS);
    overrideProperty(nav, 'cookieEnabled', TARGET_COOKIE_ENABLED);

    // Spoof plugins
    try {
      const emptyPlugins = {
        length: 0,
        item: createNativeWrapper(function() { return undefined; }, 'item', false),
        namedItem: createNativeWrapper(function() { return undefined; }, 'namedItem', false)
      };
      Object.defineProperty(emptyPlugins, Symbol.iterator, {
        value: createNativeWrapper(function* () {}, Symbol.iterator.toString(), false),
        writable: true,
        configurable: true
      });
      Object.defineProperty(nav, 'plugins', {
        get: createNativeWrapper(function() { return emptyPlugins; }, 'get plugins', true),
        configurable: true
      });
    } catch (e) {}

    // Spoof mimeTypes
    try {
      const emptyMimeTypes = {
        length: 0,
        item: createNativeWrapper(function() { return undefined; }, 'item', false),
        namedItem: createNativeWrapper(function() { return undefined; }, 'namedItem', false)
      };
      Object.defineProperty(emptyMimeTypes, Symbol.iterator, {
        value: createNativeWrapper(function* () {}, Symbol.iterator.toString(), false),
        writable: true,
        configurable: true
      });
      Object.defineProperty(nav, 'mimeTypes', {
        get: createNativeWrapper(function() { return emptyMimeTypes; }, 'get mimeTypes', true),
        configurable: true
      });
    } catch (e) {}
  })();

  // --- EXECUTION: CANVAS SPOOFING (PROTOTYPE LEVEL) ---
  (function hookCanvas() {
    const CanvasProto = HTMLCanvasElement.prototype;
    const originalGetContext = CanvasProto.getContext;

    // Global toDataURL override on prototype - works for ALL context types
    const originalToDataURL = CanvasProto.toDataURL;
    const hookedToDataURL = function(type, quality) {
      // Create offscreen shadow canvas for non-destructive noise injection
      const shadow = document.createElement('canvas');
      shadow.width = this.width;
      shadow.height = this.height;
      const shadowCtx = shadow.getContext('2d');
      shadowCtx.drawImage(this, 0, 0);
      const imageData = shadowCtx.getImageData(0, 0, shadow.width, shadow.height);
      injectNoise(imageData);
      shadowCtx.putImageData(imageData, 0, 0);
      return originalToDataURL.call(shadow, type, quality);
    };
    Object.defineProperty(CanvasProto, 'toDataURL', {
      value: createNativeWrapper(hookedToDataURL, 'toDataURL', false),
      writable: true,
      configurable: true
    });

    // Global toBlob override on prototype - works for ALL context types
    const originalToBlob = CanvasProto.toBlob;
    const hookedToBlob = function(callback, type, quality) {
      const shadow = document.createElement('canvas');
      shadow.width = this.width;
      shadow.height = this.height;
      const shadowCtx = shadow.getContext('2d');
      shadowCtx.drawImage(this, 0, 0);
      const imageData = shadowCtx.getImageData(0, 0, shadow.width, shadow.height);
      injectNoise(imageData);
      shadowCtx.putImageData(imageData, 0, 0);
      return originalToBlob.call(shadow, callback, type, quality);
    };
    Object.defineProperty(CanvasProto, 'toBlob', {
      value: createNativeWrapper(hookedToBlob, 'toBlob', false),
      writable: true,
      configurable: true
    });

    // Override getContext at prototype level
    const hookedGetContext = function(contextType, contextAttributes) {
      const ctx = originalGetContext.call(this, contextType, contextAttributes);
      if (!ctx) return ctx;

      if (contextType === 'webgl' || contextType === 'webgl2') {
        hookWebGL(ctx, contextType === 'webgl2');
      }

      return ctx;
    };

    Object.defineProperty(CanvasProto, 'getContext', {
      value: createNativeWrapper(hookedGetContext, 'getContext', false),
      writable: true,
      configurable: true
    });
  })();

  // --- EXECUTION: WEBGL SPOOFING (COHERENT SUBSYSTEM MAPPING) ---
  const hookWebGL = function(gl, isWebGL2) {
    if (!gl) return;

    const UNMASKED_VENDOR_WEBGL = 0x9245;
    const UNMASKED_RENDERER_WEBGL = 0x9246;
    const VENDOR = 0x1F00;
    const RENDERER = 0x1F01;

    const originalGetParameter = gl.getParameter;
    const originalGetExtension = gl.getExtension;

    // Unified hardware profile
    const SPOOFED_VENDOR = "Google Inc. (Intel)";
    const SPOOFED_RENDERER = "ANGLE (Intel, Intel(R) UHD Graphics, OpenGL 4.1)";

    const hookedGetParameter = function(pname) {
      // Standard constants
      if (pname === VENDOR) return SPOOFED_VENDOR;
      if (pname === RENDERER) return SPOOFED_RENDERER;
      // Debug renderer info extension constants
      if (pname === UNMASKED_VENDOR_WEBGL) return "Google Inc.";
      if (pname === UNMASKED_RENDERER_WEBGL) return "Google SwiftShader";
      return originalGetParameter.call(gl, pname);
    };

    Object.defineProperty(gl, 'getParameter', {
      value: createNativeWrapper(hookedGetParameter, 'getParameter', false),
      writable: true,
      configurable: true
    });

    const hookedGetExtension = function(name) {
      if (typeof name === 'string' && name.toUpperCase() === 'WEBGL_DEBUG_RENDERER_INFO') {
        return {
          UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR_WEBGL,
          UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER_WEBGL
        };
      }
      return originalGetExtension.call(gl, name);
    };

    Object.defineProperty(gl, 'getExtension', {
      value: createNativeWrapper(hookedGetExtension, 'getExtension', false),
      writable: true,
      configurable: true
    });
  };

})();
