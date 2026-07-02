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

/* ─── Scroll-triggered Animations ─── */
document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = parseInt(el.dataset.delay) || 0;
        setTimeout(() => el.classList.add('visible'), delay + 100);
        observer.unobserve(el);
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('[data-delay]').forEach((el) => {
    observer.observe(el);
  });

  document.querySelectorAll('.feature-card, .step, .prov-card').forEach((el) => {
    if (!el.dataset.delay) observer.observe(el);
  });

  /* ─── Nav hide/show on scroll ─── */
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

  /* ─── Terminal typewriter ─── */
  const termBody = document.querySelector('.term-body');
  if (termBody) {
    const html = termBody.innerHTML;
    const lines = html.split('\n').map(l => l.trim()).filter(Boolean);
    termBody.innerHTML = '';
    let lineIdx = 0;
    let currentLine = document.createElement('div');

    function getCleanText(raw) {
      return raw.replace(/<[^>]+>/g, '');
    }

    function typeNext() {
      if (lineIdx >= lines.length) return;
      const raw = lines[lineIdx];
      const clean = getCleanText(raw);
      if (!currentLine.parentNode) termBody.appendChild(currentLine);

      const shown = getCleanText(currentLine.innerHTML);
      if (shown.length < clean.length) {
        const nextIdx = shown.length + 1;
        const partial = raw.replace(clean, clean.slice(0, nextIdx));
        currentLine.innerHTML = partial;
        setTimeout(typeNext, 16);
      } else {
        currentLine.innerHTML = raw;
        currentLine = document.createElement('div');
        lineIdx++;
        setTimeout(typeNext, 80);
      }
    }
    setTimeout(typeNext, 600);
  }
});
