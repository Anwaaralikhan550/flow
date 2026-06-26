(function envCompatMain() {
  if (window.__vidgenEnvCompatLoaded) return;
  Object.defineProperty(window, "__vidgenEnvCompatLoaded", {
    value: true,
    configurable: false
  });

  const NAVIGATOR_KEYS = [
    "userAgent",
    "platform",
    "language",
    "languages",
    "hardwareConcurrency",
    "deviceMemory",
    "maxTouchPoints",
    "cookieEnabled",
    "vendor"
  ];
  const canvasCache = new WeakMap();

  function readNavigatorSnapshot() {
    const snapshot = {};
    for (const key of NAVIGATOR_KEYS) {
      const value = navigator[key];
      snapshot[key] = Array.isArray(value) ? Object.freeze([...value]) : value;
    }
    return Object.freeze(snapshot);
  }

  function summarizeCanvas(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const cached = canvasCache.get(canvas);
    if (cached) return cached;

    const summary = Object.freeze({
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight
    });
    canvasCache.set(canvas, summary);
    return summary;
  }

  function summarizeWebGL(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return null;

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const summary = {
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) || []),
      extensions: Object.freeze((gl.getSupportedExtensions() || []).slice().sort()),
      unmaskedVendor: null,
      unmaskedRenderer: null
    };

    if (debugInfo) {
      summary.unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      summary.unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    }

    return Object.freeze(summary);
  }

  function createProbeCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    return canvas;
  }

  const navigatorSnapshot = readNavigatorSnapshot();
  const probeCanvas = createProbeCanvas();
  const canvasSnapshot = summarizeCanvas(probeCanvas);
  const webglSnapshot = summarizeWebGL(probeCanvas);

  const compat = {};
  Object.defineProperties(compat, {
    version: { value: "1.0.0", enumerable: true },
    navigator: { value: navigatorSnapshot, enumerable: true },
    canvas: { value: canvasSnapshot, enumerable: true },
    webgl: { value: webglSnapshot, enumerable: true },
    summarizeCanvas: { value: summarizeCanvas, enumerable: true },
    summarizeWebGL: { value: summarizeWebGL, enumerable: true },
    readyAt: { value: Date.now(), enumerable: true }
  });

  Object.defineProperty(window, "__vidgenEnvCompat", {
    value: Object.freeze(compat),
    enumerable: false,
    configurable: false
  });
})();
