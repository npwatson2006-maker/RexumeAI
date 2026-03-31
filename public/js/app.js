// ─────────────────────────────────────────
//  CONSTANTS  (97 frames, 4s, 960×960 square)
// ─────────────────────────────────────────
const FRAME_COUNT  = 97;
const FRAME_SPEED  = 2.0;   // video completes by 50% scroll
const IMAGE_SCALE  = 0.90;  // padded cover — slight border filled by bg

// ─────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────
let frames       = [];
let currentFrame = 0;
let bgColor      = '#000000';

// ─────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────
const canvas          = document.getElementById('canvas');
const ctx             = canvas.getContext('2d');
const canvasWrap      = document.getElementById('canvas-wrap');
const scrollContainer = document.getElementById('scroll-container');
const heroSection     = document.getElementById('hero');
const darkOverlay     = document.getElementById('dark-overlay');
const loader          = document.getElementById('loader');
const loaderBar       = document.getElementById('loader-bar');
const loaderPercent   = document.getElementById('loader-percent');

// ─────────────────────────────────────────
//  MAIN ENTRY
// ─────────────────────────────────────────
async function init() {
  setupCanvas();
  await preloadFrames();
  hideLoader();
  initLenis();
  initHeroTransition();
  initCanvasRenderer();
  initSectionAnimations();
  initMarquee();
  initDarkOverlay(0.58, 0.75);
  initCounters();
}

document.addEventListener('DOMContentLoaded', init);

// ─────────────────────────────────────────
//  1. CANVAS SETUP
// ─────────────────────────────────────────
function setupCanvas() {
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    drawFrame(currentFrame);
  });
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w   = window.innerWidth;
  const h   = window.innerHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
}

// ─────────────────────────────────────────
//  2. TWO-PHASE FRAME PRELOADER
// ─────────────────────────────────────────
function preloadFrames() {
  return new Promise((resolve) => {
    frames = new Array(FRAME_COUNT).fill(null);
    let loaded     = 0;
    const PHASE_1  = 12;  // load first 12 immediately for fast first paint

    function onLoad(index, img) {
      frames[index] = img;
      loaded++;
      const pct = Math.round((loaded / FRAME_COUNT) * 100);
      loaderBar.style.width    = pct + '%';
      loaderPercent.textContent = pct + '%';
      if (loaded === PHASE_1) {
        drawFrame(0);
      }
      if (loaded === FRAME_COUNT) resolve();
    }

    // Phase 1 — first 12 frames immediately
    for (let i = 0; i < PHASE_1; i++) {
      const img = new Image();
      const n   = String(i + 1).padStart(4, '0');
      const idx = i;
      img.onload  = () => onLoad(idx, img);
      img.onerror = () => onLoad(idx, null);
      img.src = `frames/frame_${n}.webp`;
    }

    // Phase 2 — remaining frames shortly after
    setTimeout(() => {
      for (let i = PHASE_1; i < FRAME_COUNT; i++) {
        const img = new Image();
        const n   = String(i + 1).padStart(4, '0');
        const idx = i;
        img.onload  = () => onLoad(idx, img);
        img.onerror = () => onLoad(idx, null);
        img.src = `frames/frame_${n}.webp`;
      }
    }, 80);
  });
}

function hideLoader() {
  gsap.to(loader, {
    opacity: 0,
    duration: 0.7,
    ease: 'power2.in',
    onComplete: () => { loader.style.display = 'none'; }
  });
}

// ─────────────────────────────────────────
//  3. BACKGROUND COLOR SAMPLING
// ─────────────────────────────────────────
function sampleBgColor(img) {
  try {
    const off    = document.createElement('canvas');
    const iw     = img.naturalWidth;
    const ih     = img.naturalHeight;
    off.width    = iw;
    off.height   = ih;
    const offCtx = off.getContext('2d');
    offCtx.drawImage(img, 0, 0);
    const corners = [
      offCtx.getImageData(2, 2, 1, 1).data,
      offCtx.getImageData(iw - 2, 2, 1, 1).data,
      offCtx.getImageData(2, ih - 2, 1, 1).data,
      offCtx.getImageData(iw - 2, ih - 2, 1, 1).data,
    ];
    const sum = corners.reduce((acc, c) => ({
      r: acc.r + c[0], g: acc.g + c[1], b: acc.b + c[2]
    }), { r: 0, g: 0, b: 0 });
    const brightness = (sum.r + sum.g + sum.b) / (3 * 4);
    bgColor = brightness < 35
      ? '#000000'
      : `rgb(${Math.round(sum.r / 4)},${Math.round(sum.g / 4)},${Math.round(sum.b / 4)})`;
  } catch (e) {
    bgColor = '#000000';
  }
}

// ─────────────────────────────────────────
//  4. DRAW FRAME — padded cover mode
// ─────────────────────────────────────────
function drawFrame(index) {
  const img = frames[index];
  if (!img) return;
  const dpr = window.devicePixelRatio || 1;
  const cw  = canvas.width  / dpr;
  const ch  = canvas.height / dpr;
  const iw  = img.naturalWidth;
  const ih  = img.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
  const dw  = iw * scale;
  const dh  = ih * scale;
  const dx  = (cw - dw) / 2 + cw * 0.13;  // shift right ~13% of viewport
  const dy  = (ch - dh) / 2;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ─────────────────────────────────────────
//  5. LENIS SMOOTH SCROLL
// ─────────────────────────────────────────
function initLenis() {
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

// ─────────────────────────────────────────
//  6. HERO CIRCLE-WIPE TRANSITION
// ─────────────────────────────────────────
function initHeroTransition() {
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate(self) {
      const p = self.progress;

      // Hero fades out in first 6% of scroll
      heroSection.style.opacity      = Math.max(0, 1 - p * 18).toString();
      heroSection.style.pointerEvents = p > 0.06 ? 'none' : 'auto';

      // Canvas reveals via expanding circle clip-path
      const wipeProgress = Math.min(1, Math.max(0, (p - 0.005) / 0.07));
      const radius       = wipeProgress * 82;
      canvasWrap.style.clipPath         = `circle(${radius}% at 50% 50%)`;
      canvasWrap.style.webkitClipPath   = `circle(${radius}% at 50% 50%)`;
    },
  });
}

// ─────────────────────────────────────────
//  7. CANVAS FRAME SCRUBBING
// ─────────────────────────────────────────
function initCanvasRenderer() {
  let sampleTick = 0;
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate(self) {
      const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
      const index = Math.min(
        Math.floor(accelerated * FRAME_COUNT),
        FRAME_COUNT - 1
      );
      if (index !== currentFrame) {
        currentFrame = index;
        sampleTick++;
        if (sampleTick % 20 === 0 && frames[currentFrame]) {
          sampleBgColor(frames[currentFrame]);
        }
        requestAnimationFrame(() => drawFrame(currentFrame));
      }
    },
  });
}

// ─────────────────────────────────────────
//  8. SECTION ANIMATIONS
// ─────────────────────────────────────────
function initSectionAnimations() {
  const containerH = scrollContainer.offsetHeight;

  document.querySelectorAll('.scroll-section').forEach((section) => {
    const enter  = parseFloat(section.dataset.enter) / 100;
    const leave  = parseFloat(section.dataset.leave) / 100;
    const persist = section.dataset.persist === 'true';
    const mid    = (enter + leave) / 2;

    // Position section at midpoint of its scroll range
    section.style.top       = (mid * containerH) + 'px';
    section.style.transform = 'translateY(-50%)';

    // Determine the animatable root element
    const root    = section.querySelector('.section-inner, .stats-grid, .cta-inner');
    if (!root) return;

    const type     = section.dataset.animation;
    const children = root.querySelectorAll(
      '.section-label, .section-heading, .section-body, .section-tag, .cta-button, .stat, .stats-subtext, .cta-body'
    );
    const targets  = children.length ? Array.from(children) : [root];

    // Build GSAP timeline
    const tl = gsap.timeline({ paused: true });

    switch (type) {
      case 'fade-up':
        tl.set(root, { opacity: 1 });
        tl.from(targets, { y: 55, opacity: 0, stagger: 0.12, duration: 0.9, ease: 'power3.out' });
        break;
      case 'slide-left':
        tl.set(root, { opacity: 1 });
        tl.from(targets, { x: -85, opacity: 0, stagger: 0.14, duration: 0.9, ease: 'power3.out' });
        break;
      case 'slide-right':
        tl.set(root, { opacity: 1 });
        tl.from(targets, { x: 85, opacity: 0, stagger: 0.14, duration: 0.9, ease: 'power3.out' });
        break;
      case 'rotate-in':
        tl.set(root, { opacity: 1 });
        tl.from(targets, { y: 45, rotation: 2.5, opacity: 0, stagger: 0.10, duration: 0.95, ease: 'power3.out' });
        break;
      case 'clip-reveal':
        tl.set(root, { opacity: 1 });
        tl.from(targets, {
          clipPath: 'inset(100% 0 0 0)',
          opacity: 0,
          stagger: 0.14,
          duration: 1.1,
          ease: 'power4.inOut',
        });
        break;
      case 'scale-up':
        tl.set(root, { opacity: 1 });
        tl.from(targets, { scale: 0.82, opacity: 0, stagger: 0.11, duration: 1.0, ease: 'power2.out' });
        break;
      case 'stagger-up':
        tl.set(root, { opacity: 1 });
        tl.from(targets, { y: 65, opacity: 0, stagger: 0.15, duration: 0.85, ease: 'power3.out' });
        // Also animate stats-subtext after grid
        const subtext = section.querySelector('.stats-subtext');
        if (subtext) tl.from(subtext, { y: 30, opacity: 0, duration: 0.7, ease: 'power2.out' }, '-=0.3');
        break;
      default:
        tl.set(root, { opacity: 1 });
        tl.from(targets, { opacity: 0, duration: 0.8, ease: 'power2.out' });
    }

    // Wire play/reverse to scroll progress
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end: 'bottom bottom',
      scrub: false,
      onUpdate(self) {
        const p = self.progress;
        const inRange = p >= enter && p <= leave;

        if (inRange) {
          if (tl.paused() || tl.reversed()) tl.play();
        } else if (!persist) {
          if (!tl.paused() || tl.progress() > 0) tl.reverse();
        }
      },
    });
  });
}

// ─────────────────────────────────────────
//  9. MARQUEE — ghost text sliding on scroll
// ─────────────────────────────────────────
function initMarquee() {
  const ENTER       = 0.52;
  const LEAVE       = 0.72;
  const FADE_RANGE  = 0.025;

  document.querySelectorAll('.marquee-wrap').forEach((el) => {
    const speed = parseFloat(el.dataset.scrollSpeed) || -30;

    gsap.to(el.querySelector('.marquee-text'), {
      xPercent: speed,
      ease: 'none',
      scrollTrigger: {
        trigger: scrollContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
      },
    });

    // Opacity fade in/out
    ScrollTrigger.create({
      trigger: scrollContainer,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate(self) {
        const p = self.progress;
        let opacity = 0;
        if (p >= ENTER - FADE_RANGE && p < ENTER) {
          opacity = (p - (ENTER - FADE_RANGE)) / FADE_RANGE;
        } else if (p >= ENTER && p <= LEAVE) {
          opacity = 1;
        } else if (p > LEAVE && p <= LEAVE + FADE_RANGE) {
          opacity = 1 - (p - LEAVE) / FADE_RANGE;
        }
        el.style.opacity = opacity;
      },
    });
  });
}

// ─────────────────────────────────────────
//  10. DARK OVERLAY — for stats section
// ─────────────────────────────────────────
function initDarkOverlay(enter, leave) {
  const FADE = 0.035;
  ScrollTrigger.create({
    trigger: scrollContainer,
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate(self) {
      const p = self.progress;
      let opacity = 0;
      if (p >= enter - FADE && p < enter) {
        opacity = (p - (enter - FADE)) / FADE;
      } else if (p >= enter && p <= leave) {
        opacity = 0.92;
      } else if (p > leave && p <= leave + FADE) {
        opacity = 0.92 * (1 - (p - leave) / FADE);
      }
      darkOverlay.style.opacity = opacity;
    },
  });
}

// ─────────────────────────────────────────
//  11. COUNTER ANIMATIONS
// ─────────────────────────────────────────
function initCounters() {
  document.querySelectorAll('.stat-number').forEach((el) => {
    const target   = parseFloat(el.dataset.value);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    gsap.from(el, {
      textContent: 0,
      duration: 1.8,
      ease: 'power1.out',
      snap: { textContent: decimals === 0 ? 1 : 0.01 },
      scrollTrigger: {
        trigger: el.closest('.scroll-section'),
        start: 'top 75%',
        toggleActions: 'play none none reverse',
      },
      onUpdate() {
        const v = parseFloat(el.textContent);
        el.textContent = decimals === 0 ? Math.round(v) : v.toFixed(decimals);
      },
    });
  });
}

// ─────────────────────────────────────────
//  NAV DROPDOWN
// ─────────────────────────────────────────
(function initNavDropdown() {
  const dropdown = document.querySelector('.nav-dropdown');
  if (!dropdown) return;

  const trigger = dropdown.querySelector('.nav-dropdown-trigger');

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    dropdown.classList.toggle('open');
  });

  // Close when clicking anywhere outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });
})();
