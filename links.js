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
//    { group: "Band", logo, subtitle, links: [{ icon, label, url }] }
//                                              → card with a row of chips
// ─────────────────────────────────────────────────────────────
window.SITE = {
  name: "Kyle on Kit",
  tagline: "Drummer | Audio/Video Engineer | Gig Vlogs",

  // Small round icons under the logo (Kyle's own profiles)
  socials: [
    { icon: "instagram", label: "Instagram", url: "https://www.instagram.com/kyleonkit" },
    { icon: "youtube",   label: "YouTube",   url: "https://www.youtube.com/@kyleonkitdrums" },
    { icon: "tiktok",    label: "TikTok",    url: "https://www.tiktok.com/@kyleonkitdrums" },
    { icon: "mail",      label: "Email",     url: "mailto:kyleonkit@gmail.com" },
  ],

  links: [
    { icon: "instagram", title: "Instagram", subtitle: "@kyleonkit", url: "https://www.instagram.com/kyleonkit", featured: true },
    { icon: "youtube",   title: "YouTube",   subtitle: "Gig vlogs & drum covers", url: "https://www.youtube.com/@kyleonkitdrums" },
    // style: "game" → animated button. Game lives in /game (songs in game/songs/).
    { icon: "drum", title: "Be Kyle", subtitle: "Play my drum parts", url: "game/", style: "game" },
    { icon: "tiktok",    title: "TikTok",    subtitle: "@kyleonkitdrums", url: "https://www.tiktok.com/@kyleonkitdrums" },
    { icon: "mail",      title: "Email",     subtitle: "kyleonkit@gmail.com", url: "mailto:kyleonkit@gmail.com" },

    { heading: "Bands" },

    {
      group: "Lame Genie",
      logo: "assets/band-lame-genie.png?v=20261126120926",
      logoStyle: "wide",
      subtitle: "Video game music covers",
      links: [
        // stat/statLabel → shown as a tile. Last updated 2026-11-24.
        { icon: "youtube",   label: "YouTube",   stat: "75.7K", statLabel: "Subscribers",       url: "https://www.youtube.com/@lamegenie" },
        { icon: "spotify",   label: "Spotify",   stat: "67.1K", statLabel: "Monthly listeners", url: "https://open.spotify.com/artist/0LTTK6hdRk3ksLfnuppOHm" },
        { icon: "youtubemusic", label: "YouTube Music", stat: "105K", statLabel: "Monthly audience", url: "https://music.youtube.com/channel/UC6UZbLR7eB-al3oaxgvKcsg" },
        { icon: "tiktok",    label: "TikTok",    stat: "27.8K", statLabel: "Followers",         url: "https://www.tiktok.com/@lamegenie" },
        { icon: "instagram", label: "Instagram", stat: "7.7K",  statLabel: "Followers",         url: "https://www.instagram.com/lamegenie" },
        { icon: "globe",     label: "Website",   url: "https://lamegenie.com" },
      ],
    },
    {
      group: "Run For Covers",
      logo: "assets/band-run-for-covers.png?v=20261126120926",
      logoStyle: "boxed",
      subtitle: "Your favorite cover band's favorite cover band",
      links: [
        { icon: "instagram", label: "Instagram", url: "https://www.instagram.com/run4covers" },
        { icon: "linktree",  label: "All Links", url: "https://linktr.ee/Runforcovers" },
      ],
    },
  ],

  footer: "© Kyle on Kit",
};
