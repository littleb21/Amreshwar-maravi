/**
 * Amreshwar Maravi Portfolio — Scroll-Driven Canvas Engine with Real-Time Chroma Keying
 * Renders the character over the PORTFOLIO typography using GPU-accelerated WebGL
 */

(function () {
  'use strict';

  // Configuration Constants
  const FRAME_COUNT = 240;
  const FRAME_DIR = 'video_frames';
  const LERP_SPEED = 0.085; // Inertia smoothing factor
  const CONCURRENT_LOAD_LIMIT = 8; // Parallel preloader concurrency

  // DOM Elements
  const canvas = document.getElementById('canvas');
  const loaderOverlay = document.getElementById('loaderOverlay');
  const loaderPercent = document.getElementById('loaderPercent');
  const loaderProgressBar = document.getElementById('loaderProgressBar');

  // Animation State
  const frames = new Array(FRAME_COUNT).fill(null);
  let loadedCount = 0;
  let targetFrame = 0;
  let currentFrame = 0;
  let lastRenderedIndex = -1;
  let isInitialFrameDrawn = false;

  // WebGL State
  let gl = null;
  let isWebGLReady = false;
  let program = null;
  let positionBuffer = null;
  let texCoordBuffer = null;
  let glTexture = null;
  let ctx2D = null; // Fallback context if WebGL is unavailable

  /**
   * Generates zero-padded frame URL (video_frames/frame_0001.png)
   */
  function getFrameUrl(index) {
    const frameNum = String(index + 1).padStart(4, '0');
    return `${FRAME_DIR}/frame_${frameNum}.png`;
  }

  /**
   * Initializes WebGL with Chroma-Key Fragment Shader
   */
  function initWebGL() {
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) ||
           canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });

      if (!gl) {
        console.warn('WebGL not available, falling back to 2D Canvas');
        ctx2D = canvas.getContext('2d');
        return false;
      }

      // Vertex Shader
      const vsSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texCoord = a_texCoord;
        }
      `;

      // Fragment Shader: Keys out pure studio red background to transparent
      const fsSource = `
        precision mediump float;
        uniform sampler2D u_image;
        varying vec2 v_texCoord;

        void main() {
          vec4 color = texture2D(u_image, v_texCoord);

          // Studio red background: Red > 0.35, Green < 0.14, Blue < 0.16, and (Red - max(G,B)) > 0.27
          float maxGB = max(color.g, color.b);
          float diff = color.r - maxGB;

          if (diff > 0.27 && color.g < 0.14 && color.b < 0.16 && color.r > 0.35) {
            float edge = smoothstep(0.27, 0.35, diff);
            gl_FragColor = vec4(color.rgb, 1.0 - edge);
          } else {
            gl_FragColor = color;
          }
        }
      `;

      function createShader(glCtx, type, source) {
        const shader = glCtx.createShader(type);
        glCtx.shaderSource(shader, source);
        glCtx.compileShader(shader);
        if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
          console.warn(glCtx.getShaderInfoLog(shader));
          glCtx.deleteShader(shader);
          return null;
        }
        return shader;
      }

      const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return false;

      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn(gl.getProgramInfoLog(program));
        return false;
      }

      gl.useProgram(program);

      // Setup Geometry (Screen Quad)
      positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]), gl.STATIC_DRAW);

      const posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      // Setup Texture Coordinate Buffer
      texCoordBuffer = gl.createBuffer();
      const texLoc = gl.getAttribLocation(program, 'a_texCoord');
      gl.enableVertexAttribArray(texLoc);

      // Setup Texture Object
      glTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, glTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      // Enable standard alpha blending
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      isWebGLReady = true;
      return true;
    } catch (err) {
      console.warn('WebGL initialization failed:', err);
      ctx2D = canvas.getContext('2d');
      return false;
    }
  }

  /**
   * Resizes canvas to match viewport taking devicePixelRatio into account
   */
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);

    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    if (lastRenderedIndex >= 0) {
      renderFrame(lastRenderedIndex);
    }
  }

  /**
   * Draws image using WebGL Chroma Key with Aspect Ratio 'cover'
   */
  function drawWebGLCoverImage(img) {
    if (!gl || !img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const canvasRatio = cw / ch;
    const imageRatio = iw / ih;

    let minU = 0.0, maxU = 1.0, minV = 0.0, maxV = 1.0;

    if (canvasRatio > imageRatio) {
      // Wider than 16:9
      const scale = imageRatio / canvasRatio;
      const offset = (1.0 - scale) / 2.0;
      minV = offset;
      maxV = 1.0 - offset;
    } else {
      // Taller than 16:9
      const scale = canvasRatio / imageRatio;
      const offset = (1.0 - scale) / 2.0;
      minU = offset;
      maxU = 1.0 - offset;
    }

    // Update texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      minU, minV,
      maxU, minV,
      minU, maxV,
      minU, maxV,
      maxU, minV,
      maxU, maxV
    ]), gl.DYNAMIC_DRAW);

    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

    // Upload frame texture
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    // Clear and draw
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  /**
   * 2D Fallback Cover Draw
   */
  function draw2DCoverImage(img) {
    if (!ctx2D || !img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    const canvasRatio = cw / ch;
    const imageRatio = iw / ih;

    let dw, dh, dx, dy;

    if (canvasRatio > imageRatio) {
      dw = cw;
      dh = cw / imageRatio;
      dx = 0;
      dy = (ch - dh) / 2;
    } else {
      dh = ch;
      dw = ch * imageRatio;
      dx = (cw - dw) / 2;
      dy = 0;
    }

    ctx2D.drawImage(img, Math.floor(dx), Math.floor(dy), Math.ceil(dw), Math.ceil(dh));
  }

  /**
   * Finds the nearest loaded frame to eliminate black frame flashes
   */
  function getNearestLoadedFrame(targetIdx) {
    if (frames[targetIdx] && frames[targetIdx].complete && frames[targetIdx].naturalWidth > 0) {
      return frames[targetIdx];
    }

    for (let offset = 1; offset < FRAME_COUNT; offset++) {
      const prev = targetIdx - offset;
      if (prev >= 0 && frames[prev] && frames[prev].complete && frames[prev].naturalWidth > 0) {
        return frames[prev];
      }
      const next = targetIdx + offset;
      if (next < FRAME_COUNT && frames[next] && frames[next].complete && frames[next].naturalWidth > 0) {
        return frames[next];
      }
    }
    return null;
  }

  /**
   * Renders a specific frame to canvas
   */
  function renderFrame(index) {
    const safeIndex = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(index)));
    const img = getNearestLoadedFrame(safeIndex);

    if (img) {
      if (isWebGLReady) {
        drawWebGLCoverImage(img);
      } else {
        draw2DCoverImage(img);
      }
      lastRenderedIndex = safeIndex;
    }
  }

  /**
   * Updates target frame based on page scroll position
   */
  function updateTargetFromScroll() {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.max(0, Math.min(1, scrollY / maxScroll));

    targetFrame = progress * (FRAME_COUNT - 1);
  }

  /**
   * Inertia-smoothed requestAnimationFrame rendering loop
   */
  function animationLoop() {
    const diff = targetFrame - currentFrame;

    if (Math.abs(diff) > 0.001) {
      currentFrame += diff * LERP_SPEED;
    } else {
      currentFrame = targetFrame;
    }

    const frameIdx = Math.round(currentFrame);
    if (frameIdx !== lastRenderedIndex) {
      renderFrame(frameIdx);
    }

    requestAnimationFrame(animationLoop);
  }

  /**
   * Single frame loader helper
   */
  function loadSingleFrame(index) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = getFrameUrl(index);

      img.onload = () => {
        frames[index] = img;
        loadedCount++;
        onProgressUpdate();

        if (!isInitialFrameDrawn) {
          isInitialFrameDrawn = true;
          renderFrame(Math.round(currentFrame));
        }

        resolve(img);
      };

      img.onerror = () => {
        console.warn(`Failed to load frame ${index}`);
        loadedCount++;
        onProgressUpdate();
        resolve(null);
      };
    });
  }

  /**
   * Updates loader UI percentage and hides overlay upon completion
   */
  function onProgressUpdate() {
    const percent = Math.min(100, Math.round((loadedCount / FRAME_COUNT) * 100));
    if (loaderPercent) loaderPercent.textContent = `${percent}%`;
    if (loaderProgressBar) loaderProgressBar.style.width = `${percent}%`;

    if (loadedCount >= FRAME_COUNT && loaderOverlay) {
      setTimeout(() => {
        loaderOverlay.classList.add('hidden');
      }, 500);
    }
  }

  /**
   * Progressive Keyframe Preloading Sequence
   */
  async function preloadAllFrames() {
    updateTargetFromScroll();
    const initialIdx = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(targetFrame)));

    // 1. Immediate priority: Active scroll frame & Frame 0
    await loadSingleFrame(initialIdx);
    if (initialIdx !== 0) {
      loadSingleFrame(0);
    }

    currentFrame = targetFrame;
    renderFrame(initialIdx);

    // 2. Sparse keyframes (every 8th frame) across timeline
    const keyframes = [];
    const remaining = [];

    for (let i = 0; i < FRAME_COUNT; i++) {
      if (i === initialIdx || i === 0) continue;
      if (i % 8 === 0) {
        keyframes.push(i);
      } else {
        remaining.push(i);
      }
    }

    const queue = [...keyframes, ...remaining];

    // 3. Worker queue with concurrency limit
    let queueIdx = 0;
    async function worker() {
      while (queueIdx < queue.length) {
        const idx = queue[queueIdx++];
        await loadSingleFrame(idx);
      }
    }

    const workers = [];
    for (let w = 0; w < CONCURRENT_LOAD_LIMIT; w++) {
      workers.push(worker());
    }

    await Promise.all(workers);
  }

  // Event Listeners
  window.addEventListener('resize', resizeCanvas, { passive: true });
  window.addEventListener('scroll', updateTargetFromScroll, { passive: true });

  // Initialize
  initWebGL();
  resizeCanvas();
  updateTargetFromScroll();
  currentFrame = targetFrame;
  preloadAllFrames();
  requestAnimationFrame(animationLoop);

  // Back to top button listener
  const backToTopBtn = document.getElementById('backToTopBtn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

})();
