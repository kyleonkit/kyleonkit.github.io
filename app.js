(function () {
  const S = window.SITE || {};
  const SIMPLE_ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@13.0.0/icons/";

  // Built-in line icons (not brands)
  const BUILTIN = {
    mail: '<path d="M3 6h18v12H3z"/><path d="m3 7 9 6 9-6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  };

  function iconEl(name) {
    const span = document.createElement("span");
    span.className = "ico";
    span.setAttribute("aria-hidden", "true");
    const key = (name || "link").toLowerCase();
    if (BUILTIN[key]) {
      span.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        BUILTIN[key] + "</svg>";
    } else {
      span.classList.add("brand");
      const url = `url("${SIMPLE_ICONS}${encodeURIComponent(key)}.svg")`;
      span.style.webkitMaskImage = url;
      span.style.maskImage = url;
    }
    return span;
  }

  function anchor(url) {
    const a = document.createElement("a");
    if (url) {
      a.href = url;
      if (!url.startsWith("mailto:") && !url.startsWith("#")) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    } else {
      a.classList.add("soon");
      a.setAttribute("aria-disabled", "true");
      a.tabIndex = -1;
    }
    return a;
  }

  if (S.name) document.title = S.name;
  document.getElementById("tagline").textContent = S.tagline || "";
  document.getElementById("footer").textContent = S.footer || "";

  const socials = document.getElementById("socials");
  (S.socials || []).forEach((s) => {
    const a = anchor(s.url);
    a.className += " social";
    a.setAttribute("aria-label", s.label || s.icon);
    a.title = s.url ? s.label : `${s.label} — coming soon`;
    a.appendChild(iconEl(s.icon));
    socials.appendChild(a);
  });

  const list = document.getElementById("links");
  (S.links || []).forEach((l, i) => {
    const li = document.createElement("li");
    li.style.animationDelay = `${80 + i * 60}ms`;
    const a = anchor(l.url);
    a.className += " card" + (l.featured ? " featured" : "");
    a.appendChild(iconEl(l.icon));

    const text = document.createElement("span");
    text.className = "text";
    const t = document.createElement("span");
    t.className = "title";
    t.textContent = l.title;
    text.appendChild(t);
    const subText = l.url ? l.subtitle : "Coming soon";
    if (subText) {
      const sub = document.createElement("span");
      sub.className = "sub";
      sub.textContent = subText;
      text.appendChild(sub);
    }
    a.appendChild(text);

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
    a.appendChild(arrow);

    li.appendChild(a);
    list.appendChild(li);
  });
})();
