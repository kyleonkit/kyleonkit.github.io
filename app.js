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
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    drum: '<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9"/><path d="M4 12.5c0 1.7 3.6 3 8 3s8-1.3 8-3"/><path d="m6 2.5 5 5.5M18 2.5 13 8"/>',
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
      if (/^https?:/.test(url)) {
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

  // ↗ "opens a link" arrow, used on cards, stat tiles and chips
  function arrowEl() {
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
    return arrow;
  }

  if (S.name) document.title = S.name;
  // Tagline: "a | b | c" → segments that only wrap at the dividers
  const tag = document.getElementById("tagline");
  (S.tagline || "").split("|").map((s) => s.trim()).filter(Boolean).forEach((seg, i) => {
    if (i) {
      const d = document.createElement("span");
      d.className = "sep";
      d.textContent = "|";
      tag.append(" ", d, " ");
    }
    const s = document.createElement("span");
    s.className = "seg";
    s.textContent = seg;
    tag.appendChild(s);
  });
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

    // Section heading
    if (l.heading) {
      li.className = "heading";
      const h = document.createElement("h2");
      h.textContent = l.heading;
      li.appendChild(h);
      list.appendChild(li);
      return;
    }

    // Group (e.g. a band): name + row of labelled icon links
    if (l.group) {
      li.className = "group";
      // Header: optional band logo + name/subtitle
      const head = document.createElement("div");
      head.className = "group-head";
      if (l.logo) {
        const img = document.createElement("img");
        img.className = "group-logo" + (l.logoStyle ? " " + l.logoStyle : "");
        img.src = l.logo;
        img.alt = "";
        img.width = img.height = 64;
        head.appendChild(img);
      }
      const titles = document.createElement("div");
      const name = document.createElement("div");
      name.className = "group-name";
      name.textContent = l.group;
      titles.appendChild(name);
      if (l.subtitle) {
        const sub = document.createElement("div");
        sub.className = "group-sub";
        sub.textContent = l.subtitle;
        titles.appendChild(sub);
      }
      head.appendChild(titles);
      li.appendChild(head);
      // Links with a stat → tiles (big number + label)
      const withStats = (l.links || []).filter((g) => g.stat);
      if (withStats.length) {
        const grid = document.createElement("div");
        grid.className = "stats";
        withStats.forEach((g) => {
          const a = anchor(g.url);
          a.className += " stat";
          a.setAttribute("aria-label", `${g.label}: ${g.stat} ${g.statLabel || ""}`.trim());
          const top = document.createElement("span");
          top.className = "stat-top";
          top.appendChild(iconEl(g.icon));
          const lab = document.createElement("span");
          lab.textContent = g.label;
          top.appendChild(lab);
          if (g.url) top.appendChild(arrowEl());
          const num = document.createElement("span");
          num.className = "stat-num";
          num.textContent = g.stat;
          const what = document.createElement("span");
          what.className = "stat-label";
          what.textContent = g.statLabel || "";
          a.append(top, num, what);
          grid.appendChild(a);
        });
        li.appendChild(grid);
      }

      const row = document.createElement("div");
      row.className = "chips";
      (l.links || []).filter((g) => !g.stat).forEach((g) => {
        const a = anchor(g.url);
        a.className += " chip";
        a.appendChild(iconEl(g.icon));
        const lab = document.createElement("span");
        lab.textContent = g.label;
        a.appendChild(lab);
        if (g.url) a.appendChild(arrowEl());
        row.appendChild(a);
      });
      if (row.children.length) li.appendChild(row);
      list.appendChild(li);
      return;
    }

    const a = anchor(l.url);
    a.className += " card" + (l.featured ? " featured" : "") + (l.style ? " " + l.style : "");
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

    a.appendChild(arrowEl());

    li.appendChild(a);
    list.appendChild(li);
  });
})();
