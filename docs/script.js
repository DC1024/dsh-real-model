// Subtle reveal-on-scroll for sections.
document.addEventListener('DOMContentLoaded', () => {
  const targets = document.querySelectorAll('section, .card, .step, .step-block');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => (el.style.opacity = '1'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  targets.forEach((el) => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
    el.style.transform = 'translateY(16px)';
    io.observe(el);
  });

  const style = document.createElement('style');
  style.textContent = '.in-view{opacity:1 !important;transform:none !important;}';
  document.head.appendChild(style);
});
