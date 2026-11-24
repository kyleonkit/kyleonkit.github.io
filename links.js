// ─────────────────────────────────────────────────────────────
//  Kyle on Kit — link page content
//  Edit this file to change what shows on the page.
//
//  icon: any slug from https://simpleicons.org (e.g. "youtube",
//        "instagram", "tiktok", "spotify", "patreon") or one of the
//        built-ins: "mail", "link", "calendar", "cart", "music".
//  url:  leave "" to show the button greyed out as "coming soon".
//  featured: true makes the button yellow and full-weight.
// ─────────────────────────────────────────────────────────────
window.SITE = {
  name: "Kyle on Kit",
  tagline: "Drummer · Gig vlogs · Covers",

  // Small round icons under the logo
  socials: [
    { icon: "youtube",   label: "YouTube",   url: "" },
    { icon: "instagram", label: "Instagram", url: "" },
    { icon: "tiktok",    label: "TikTok",    url: "" },
    { icon: "facebook",  label: "Facebook",  url: "" },
  ],

  // Big buttons
  links: [
    { icon: "youtube",   title: "Latest Video",        subtitle: "Watch the newest upload", url: "", featured: true },
    { icon: "youtube",   title: "YouTube Channel",     subtitle: "Subscribe for gig vlogs & covers", url: "" },
    { icon: "calendar",  title: "Upcoming Shows",      subtitle: "Where to catch me live", url: "" },
    { icon: "music",     title: "My Gear",             subtitle: "Kit, cymbals & electronics", url: "" },
    { icon: "mail",      title: "Booking & Contact",   subtitle: "Session work, gigs, collabs", url: "" },
  ],

  footer: "© Kyle on Kit",
};
