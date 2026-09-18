document.addEventListener('DOMContentLoaded', function () {
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Theme toggle
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch (e) { /* noop */ }
    });
  }

  // Header shadow on scroll
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 8) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Copiar código (Pix etc.)
  function doCopy(text, btn) {
    var done = function () {
      if (btn) {
        btn.classList.add('copied');
        var label = btn.dataset.label || 'Copiado';
        btn.textContent = label;
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.textContent = (btn.dataset.original || 'Copiar');
        }, 2000);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
  }
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.dataset.original = btn.dataset.original || btn.textContent;
    btn.addEventListener('click', function () { doCopy(btn.dataset.copy, btn); });
  });

  // Toasts auto-dismiss
  document.querySelectorAll('.flash').forEach(function (el, i) {
    setTimeout(function () {
      el.style.transition = 'opacity .4s, transform .4s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(function () { el.remove(); }, 400);
    }, 4800 + i * 250);
  });

  // Image previews
  document.querySelectorAll('input[type=file][name=image]').forEach(function (input) {
    input.addEventListener('change', function () {
      if (!input.files || !input.files[0]) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = input.parentElement.querySelector('.thumb') || document.createElement('img');
        img.src = e.target.result;
        img.className = 'thumb';
        if (!img.parentElement) input.parentElement.appendChild(img);
      };
      reader.readAsDataURL(input.files[0]);
    });
  });

  // Reveal on scroll
  if (!reduced && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll(
      '.section-head, .cat-card, .service-card, .step, .flow-item, .benefit, .cta-band, .quote-row, .empty, .stat, .review'
    );
    targets.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          entry.target.classList.remove('reveal');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    targets.forEach(function (el) { io.observe(el); });
  }

  // Animated counters ([data-count])
  function counterOpts(el) {
    return {
      decimals: parseInt(el.getAttribute('data-decimals') || '0', 10),
      prefix: el.getAttribute('data-prefix') || '',
      suffix: el.getAttribute('data-suffix') || ''
    };
  }
  function formatCount(n, opts) {
    var parts = n.toFixed(opts.decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return opts.prefix + parts.join(opts.decimals ? ',' : '') + opts.suffix;
  }
  function animateCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0;
    var opts = counterOpts(el);
    if (reduced) { el.textContent = formatCount(target, opts); return; }
    var t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / 1100, 1);
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = formatCount(target * eased, opts);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  var countEls = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window) {
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          co.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    countEls.forEach(function (el) { co.observe(el); });
  } else {
    countEls.forEach(function (el) { el.textContent = formatCount(parseFloat(el.getAttribute('data-count')) || 0, counterOpts(el)); });
  }

  // Busy state on form submit
  document.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function () {
      var btn = form.querySelector('button[type=submit], input[type=submit]');
      if (!btn || btn.disabled || btn.querySelector('svg')) return;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Enviando…';
      btn.disabled = true;
    }, { once: true });
  });

  // Voltar ao topo
  var toTop = document.getElementById('toTop');
  if (toTop) {
    var toTopScroll = function () {
      toTop.classList.toggle('show', window.scrollY > 600);
    };
    toTopScroll();
    window.addEventListener('scroll', toTopScroll, { passive: true });
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  // Mobile: stacked table cards need data-label on cells
  document.querySelectorAll('.data-table').forEach(function (table) {
    var heads = table.querySelectorAll('thead th');
    if (!heads.length) return;
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.querySelectorAll('td').forEach(function (td, i) {
        var label = heads[i] ? heads[i].textContent.trim() : '';
        if (label) td.setAttribute('data-label', label);
      });
    });
  });
});