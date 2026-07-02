/* ─── Copy to Clipboard ─── */
function copyCode(btn) {
  const code = btn.closest('.code-block').querySelector('pre code');
  const text = code.textContent.replace(/^[^\S\n]+/gm, '').trim();
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.borderColor = 'var(--green)';
    btn.style.color = 'var(--green)';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.borderColor = '';
      btn.style.color = '';
    }, 2000);
  });
}

/* ─── Particles Canvas ─── */
(function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.r = Math.random() * 1.5 + 0.5;
      this.a = Math.random() * 0.3 + 0.1;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > w || this.y < 0 || this.y > h) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(162,155,254,${this.a})`;
      ctx.fill();
    }
  }

  const count = Math.min(120, Math.floor(w * h / 12000));
  for (let i = 0; i < count; i++) particles.push(new Particle());

  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(162,155,254,${(1 - dist / 120) * 0.12})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function animate() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => { p.update(); p.draw(); });
    drawLines();
    requestAnimationFrame(animate);
  }
  animate();
})();

/* ─── Mouse Parallax Orbs ─── */
(function initOrbs() {
  const orb1 = document.getElementById('orb1');
  const orb2 = document.getElementById('orb2');
  if (!orb1 || !orb2) return;
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    orb1.style.transform = `translate(${x * -30}px, ${y * -30}px)`;
    orb2.style.transform = `translate(${x * 20}px, ${y * 20}px)`;
  });
})();

/* ─── Feature Card Mouse Glow ─── */
document.querySelectorAll('.feature-card').forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty('--mx', x + '%');
    card.style.setProperty('--my', y + '%');
  });
});

/* ─── Animated Counters ─── */
(function animateCounters() {
  const stats = document.getElementById('stats');
  if (!stats) return;
  const nums = stats.querySelectorAll('.stat-num[data-target]');
  let animated = false;

  function startCounters() {
    if (animated) return;
    animated = true;
    nums.forEach(el => {
      const target = parseInt(el.dataset.target);
      const duration = 1200;
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.floor(ease * target) + '+';
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = target + '+';
      }
      requestAnimationFrame(tick);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) { startCounters(); observer.disconnect(); }
    },
    { threshold: 0.3 }
  );
  observer.observe(stats);
})();

/* ─── Scroll-triggered Animations ─── */
(function initScrollReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        if (el.classList.contains('stagger')) {
          el.classList.add('visible');
        } else if (el.classList.contains('fade-up') || el.classList.contains('fade-in')) {
          el.classList.add('visible');
        } else {
          const delay = parseInt(el.dataset.delay) || 0;
          setTimeout(() => el.classList.add('visible'), delay + 100);
        }
        observer.unobserve(el);
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
  );

  document.querySelectorAll('.fade-up, .fade-in, .stagger, [data-delay]').forEach((el) => {
    observer.observe(el);
  });
})();

/* ─── Nav hide/show on scroll ─── */
(function initNav() {
  let lastScroll = 0;
  const nav = document.querySelector('.nav');
  window.addEventListener('scroll', () => {
    const curr = window.scrollY;
    if (curr > lastScroll && curr > 100) {
      nav.style.transform = 'translateY(-100%)';
    } else {
      nav.style.transform = 'translateY(0)';
    }
    lastScroll = curr;
  }, { passive: true });
})();

/* ─── Terminal typewriter ─── */
(function initTerminal() {
  const termBody = document.querySelector('.term-body');
  if (!termBody) return;
  const lines = Array.from(termBody.querySelectorAll('.output > div')).map(el => el.outerHTML);
  const promptEl = termBody.querySelector('.prompt');
  const cmdEl = termBody.querySelector('.cmd');
  const promptHTML = promptEl ? promptEl.outerHTML : '';
  const cmdHTML = cmdEl ? ' ' + cmdEl.outerHTML : '';
  const cursorHTML = '<span class="cursor"></span>';

  termBody.innerHTML = '';
  let lineIdx = 0;
  let currentLine = document.createElement('div');

  function typeNext() {
    if (lineIdx > lines.length) return;
    if (lineIdx === 0) {
      const firstLine = document.createElement('div');
      firstLine.innerHTML = promptHTML + cmdHTML;
      termBody.appendChild(firstLine);
      lineIdx++;
      setTimeout(typeNext, 500);
      return;
    }
    if (lineIdx === 1) {
      termBody.innerHTML += '<div class="output"></div>';
      const outDiv = termBody.querySelector('.output');
      if (!outDiv) return;
      const raw = lines[0];
      const clean = raw.replace(/<[^>]+>/g, '');
      let charIdx = 0;
      function typeChar() {
        if (charIdx >= clean.length) {
          outDiv.innerHTML += raw;
          lineIdx++;
          setTimeout(typeNext, 200);
          return;
        }
        const partial = raw.replace(clean, clean.slice(0, charIdx + 1));
        outDiv.innerHTML = partial;
        charIdx++;
        const speed = clean[charIdx] === ' ' ? 30 : 12;
        setTimeout(typeChar, speed);
      }
      typeChar();
      return;
    }
    if (lineIdx < lines.length + 1) {
      const outDiv = termBody.querySelector('.output');
      if (!outDiv) return;
      const idx = lineIdx - 1;
      if (idx < lines.length) {
        outDiv.innerHTML += lines[idx];
        lineIdx++;
        const gap = lines[idx].includes('highlight') ? 300 : 60;
        setTimeout(typeNext, gap);
      }
      return;
    }
    if (lineIdx === lines.length + 1) {
      termBody.innerHTML += cursorHTML;
      lineIdx++;
    }
    if (lineIdx > lines.length + 18) {
      const cursor = termBody.querySelector('.cursor');
      if (cursor) cursor.remove();
    }
    setTimeout(typeNext, 2000);
  }
  setTimeout(typeNext, 400);
})();
