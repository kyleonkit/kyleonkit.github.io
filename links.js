// ─────────────────────────────────────────────────────────────
//  Kyle on Kit — link page content
//  Edit this file to change what shows on the page.
//
//  icon: any slug from https://simpleicons.org (e.g. "youtube",
//        "instagram", "tiktok", "spotify", "linktree") or one of the
//        built-ins: "mail", "link", "globe", "calendar", "cart", "music".
//  url:  leave "" to show the item greyed out as "coming soon".
//
//  links[] entries can be:
//    { title, subtitle, icon, url, featured }  → big button
//    { heading: "Bands" }                      → section divider
//    { group: "Band", subtitle, links: [{ icon, label, url }] }
//                                              → card with a row of chips
// ─────────────────────────────────────────────────────────────
window.SITE = {
  name: "Kyle on Kit",
  tagline: "Drummer | Audio/Video Engineer | Gig Vlogs",

  // Small round icons under the logo (Kyle's own profiles)
  socials: [
    { icon: "youtube",   label: "YouTube",   url: "https://www.youtube.com/@kyleonkitdrums" },
    { icon: "instagram", label: "Instagram", url: "https://www.instagram.com/kyleonkit" },
    { icon: "tiktok",    label: "TikTok",    url: "https://www.tiktok.com/@kyleonkit" },
  ],

  links: [
    { icon: "youtube",   title: "YouTube",   subtitle: "Gig vlogs & drum covers", url: "https://www.youtube.com/@kyleonkitdrums", featured: true },
    { icon: "instagram", title: "Instagram", subtitle: "@kyleonkit", url: "https://www.instagram.com/kyleonkit" },
    { icon: "tiktok",    title: "TikTok",    subtitle: "@kyleonkit", url: "https://www.tiktok.com/@kyleonkit" },

    { heading: "Bands" },

    {
      group: "Lame Genie",
      links: [
        { icon: "youtube",   label: "YouTube",   url: "https://www.youtube.com/@lamegenie" },
        { icon: "spotify",   label: "Spotify",   url: "https://open.spotify.com/artist/0LTTK6hdRk3ksLfnuppOHm" },
        { icon: "instagram", label: "Instagram", url: "https://www.instagram.com/lamegenie" },
        { icon: "tiktok",    label: "TikTok",    url: "https://www.tiktok.com/@lamegenie" },
        { icon: "globe",     label: "Website",   url: "https://lamegenie.com" },
      ],
    },
    {
      group: "Run For Covers",
      links: [
        { icon: "instagram", label: "Instagram", url: "https://www.instagram.com/run4covers" },
        { icon: "linktree",  label: "All Links", url: "https://linktr.ee/Runforcovers" },
      ],
    },
  ],

  footer: "© Kyle on Kit",
};
