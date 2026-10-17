/* ============================================================
   dsh-real-model — site interactions
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     1. Particle constellation background
     --------------------------------------------------------- */
  function initMesh() {
    var canvas = document.getElementById('mesh');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    var points = [];
    var COUNT = 62;
    var LINK_DIST = 148;
    var raf = null;

    function resize() {
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * DPR);
      canvas.height = Math.floor(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed();
    }

    function seed() {
      points = [];
      var n = Math.round(COUNT * Math.min(1, (w * h) / (1440 * 900)) + 18);
      for (var i = 0; i < n; i++) {
        points.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.24,
          vy: (Math.random() - 0.5) * 0.24,
          r: Math.random() * 1.5 + 0.7,
          hue: Math.random() < 0.28 ? 'violet' : 'cyan'
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      // links
      for (var i = 0; i < points.length; i++) {
        for (var j = i + 1; j < points.length; j++) {
          var a = points[i], b = points[j];
          var dx = a.x - b.x, dy = a.y - b.y;
          var d2 = dx * dx + dy * dy;
          if (d2 > LINK_DIST * LINK_DIST) continue;
          var alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.20;
          ctx.strokeStyle = 'rgba(34, 211, 238, ' + alpha.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // nodes
      for (var k = 0; k < points.length; k++) {
        var p = points[k];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.hue === 'violet'
          ? 'rgba(124, 92, 255, 0.55)'
          : 'rgba(34, 211, 238, 0.55)';
        ctx.fill();
      }
    }

    function step() {
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    resize();
    window.addEventListener('resize', resize, { passive: true });

    if (reduceMotion) {
      draw();                       // static frame, no animation
    } else {
      raf = requestAnimationFrame(step);
      // pause when tab is hidden
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          if (raf) { cancelAnimationFrame(raf); raf = null; }
        } else if (!raf) {
          raf = requestAnimationFrame(step);
        }
      });
    }
  }

  /* ---------------------------------------------------------
     2. Copy buttons
     --------------------------------------------------------- */
  function initCopy() {
    var buttons = document.querySelectorAll('.copy[data-copy]');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        var sel = btn.getAttribute('data-copy');
        var target = sel ? document.querySelector(sel) : null;
        if (!target) return;
        var text = target.textContent.trim();

        function done() {
          var old = btn.textContent;
          btn.textContent = 'COPIED';
          btn.classList.add('done');
          setTimeout(function () {
            btn.textContent = old;
            btn.classList.remove('done');
          }, 1400);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else {
          fallback();
        }

        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
          document.body.removeChild(ta);
        }
      });
    });
  }

  /* ---------------------------------------------------------
     4. Hero chip: cycle through plausible real-model names,
        demonstrating that the upstream model varies.
     --------------------------------------------------------- */
  function initChipCycle() {
    var chip = document.getElementById('chipA');
    if (!chip || reduceMotion) return;
    // Deliberately excludes glm-5.3-flash so it never collides with the
    // second (static) chip in the same transcript.
    var models = [
      'deepseek-v4.1-flash',
      'gemini-3-flash-preview',
      'deepseek-v4.1-flash',
      'qwen3-max'
    ];
    var i = 0;
    setInterval(function () {
      i = (i + 1) % models.length;
      chip.textContent = models[i];
    }, 3200);
  }

  /* ---------------------------------------------------------
     boot
     --------------------------------------------------------- */
  function boot() {
    initMesh();
    initCopy();
    initChipCycle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
