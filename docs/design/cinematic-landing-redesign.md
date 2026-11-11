# Fillin cinematic landing-page redesign

Date: 2026-11-11. Status: implementation and validation complete; publishing authorized.

## 1. Objective and boundaries

Rework Fillin around the supplied Velorah reference: a cinematic full-screen video, expressive serif typography, restrained navigation, and translucent pill buttons. Carry that visual language through the entire landing page, while keeping Fillin's working product demonstrations and the interactive halftone horse at the bottom.

Keep the Fillin name, its existing logo glyph, truthful product claims, versioned extension download, installation instructions, backup information, and Light / Dark / System preference. Use product-specific copy and navigation rather than the reference's studio labels. Keep the previously removed hero taglines out of the hero.

Implementation stays in the landing frontend. Extension behavior, backend deployment, shared package boundaries, and extension release version remain unchanged.

## 2. Reference study

### Materials inspected

- Animated GIF: `hero-velorah-preview-CJNTtbpd.gif`, supplied by the user: 800 × 589, 157 frames. Inspected its composition, text hierarchy, navigation, button treatment, and relationship between foreground content and the scene.
- Background MP4: the exact CloudFront URL supplied in the request. Viewed the actual footage in a browser and inspected its metadata and delivery headers.
- Current source: App, Navbar, Hero, ThemeControl, DownloadButtons, SocialProof, InteractivePlayground, CommandPaletteShowcase, HowItWorks, Features, Privacy, CTA, FAQ, Footer, the installation page, theme bootstrap, global styles, and existing browser tests.
- Horse implementation: original supplied WebM, canvas rendering, pointer interaction, pause controls, viewport pausing, reduced-motion handling, and browser coverage.

### What gives the reference its character

1. The upper sky is a relatively quiet place for the headline and supporting text. Stars provide texture while the people, books, and warm screens occupy the lower part of the frame.
2. The image carries the visual richness. The interface itself is sparse: one logo, small navigation, a headline, a short paragraph, and one clear action.
3. Instrument Serif uses a normal weight and narrow, elegant shapes. Muted words create hierarchy within a sentence without adding another badge or graphic.
4. Transparent buttons have a very thin reflective edge. Their glass treatment feels connected to the scene rather than looking like opaque product-dashboard controls.
5. The camera's gradual movement and the restrained text entrance establish the pace. Content remains stationary and readable after entering.

### Verified media and font facts

| Item | Observation | Design implication |
|---|---|---|
| Hero video | 1924 × 1076; approximately 12.04 seconds | Landscape composition needs deliberate mobile cropping |
| Video size | 14,142,575 bytes, approximately 14.14 MB | A lightweight poster and controlled loading are necessary |
| Delivery | HTTP 200, MP4, byte-range support, long-lived immutable caching | The supplied URL can stream and cache; rendering must not wait for the full file |
| Display font | Google Fonts accepts `Instrument Serif`, normal 400 | Use the actual family name; `Instrumental Serif` is not the requested font family |
| Body font | Google Fonts accepts Inter 400 and 500 | Limit font downloads to the weights that will be used |

## 3. Proposed page composition

### A. Cinematic entry

One shared visual scene contains the navigation and hero. The video fills that scene using absolute positioning and `object-fit: cover`. Use a stable `100svh` baseline, with content-driven growth on short screens. Keep all actions in normal content layout so they cannot be cut off by a fixed hero height.

- Navigation container: maximum width 1280px; horizontal padding about 32px on desktop, 20–24px on mobile; vertical padding about 24px.
- Branding: existing Fillin glyph and a serif Fillin wordmark. The logo remains a working home/top link.
- Navigation links: How it works, Features, and Privacy, linking to real sections.
- Right side: compact theme control, restrained GitHub access, and a glass download action. At narrow widths, prioritize the logo and download; use a compact accessible theme menu and avoid squeezing the full desktop navigation into the row.
- Headline: **“Fill in your own blanks.”** Use Instrument Serif normal weight, centered, with “own blanks.” in the muted foreground color. Desktop can use a single line when it fits; tablet and phone layouts use deliberate line breaks.
- Supporting copy: **“Create shortcuts for the things you type every day. Expand your words across the web, instantly.”** Keep to two or three short lines, with a maximum width near 640px.
- Primary hero action: **Download Fillin**, using the supplied liquid-glass treatment. Keep the actual release version and accessible download label tied to release metadata.
- Secondary information: a quiet text link to try the demo and a small release-notes link. Place the unavailable Web Store information with installation/download details instead of giving a disabled button equal prominence in the hero.
- Reserve the lower portion of the scene for the people and warm screens. Position the text in the upper-middle sky rather than over the central person's head.

The video supplies the hero's depth. Respect the requested absence of decorative blobs, radial gradients, tint overlays, and added particle layers. Use the specified linear reflective edge only on glass controls.

### B. Quiet product facts

A compact transition into the content: free, local-first, open source, and a real GitHub link/count when available. Remove the current mock contributor avatars and the implied five-star rating. A failed GitHub request should leave a useful repository link rather than an indefinite loading count.

### C. Try Fillin

Make the existing playground the first substantial content section. Use an editorial two-column layout: concise serif heading and instructions on the left, a crisp, dark text editor on the right. On phones, stack the explanation before the editor.

Keep typing, Ctrl+Space, cursor preservation, Reset, the button alternative, success feedback, and the live saved-keystroke counter. Style keyboard keys consistently with thin borders and a small raised bottom edge.

### D. How it works

Use three numbered steps with open spacing and thin separators: save a phrase, type the trigger, expand it. Give each step one sentence and one concrete example. Replace the current large enclosing dashboard-style card with a calmer layout.

### E. Product story and features

The command-palette demonstration becomes the main visual focus of the feature story. Keep its sequence and pause control, and place a shorter explanation beside it at desktop sizes.

Follow with a restrained feature grid covering tags, local backups, supported editors, and the real demo counter. Keep tag selection and shortcut previews functional with hover, focus, and tap. Use consistent neutral panels, smaller radii, fine borders, and fewer competing pills. Avoid repeating the same benefit in multiple section introductions.

### F. Privacy

An open three-column row communicates local storage, no tracking, and no required account. Match the new type scale and use simple icons. Preserve the advice to export a backup before removing the extension or switching browsers.

### G. FAQ and final action

Present the existing questions with clear typographic hierarchy and separators. Keep the useful compatibility details, including excluded password fields and browser settings pages. A short final download section follows the FAQ, using the same action vocabulary as the hero.

### H. Horse footer

Keep the animated halftone horse as the closing visual. Retain its cursor repulsion, blue interaction highlight, pause/resume control, still-frame reduced-motion behavior, and lazy loading. Fit the footer's background and typography to the new palette. Retain the large Fillin wordmark and working GitHub/home links.

## 4. Design system specification

### Typography

Load Instrument Serif regular 400 and Inter 400/500 through a Google Fonts stylesheet in the HTML head, using `display=swap` and preconnect hints. Avoid a nested CSS-import loading waterfall.

| Use | Desktop target | Small-screen target | Treatment |
|---|---|---|---|
| Hero headline | About 80–112px, capped to available width | About 44–56px | Instrument Serif 400, 0.95–1.02 line height |
| Section headline | About 44–64px | About 32–40px | Instrument Serif 400 |
| Body copy | 16–18px | 15–16px | Inter 400, 1.55–1.7 line height |
| Navigation and buttons | 14–16px | 13–15px | Inter 500 |
| Labels and metadata | 11–13px | 11–12px | Inter 400/500; restrained letter spacing |

Use the supplied -2.46px headline tracking as the desktop reference, scaling tracking with type size on smaller screens. Font fallbacks must remain readable while Google Fonts loads or if it fails.

### Colors and token migration

Use the supplied dark HSL tokens as the primary visual reference:

| Token | Dark value | Role |
|---|---|---|
| `--background` | `201 100% 13%` | Deep navy page foundation |
| `--foreground` | `0 0% 100%` | Primary text |
| `--muted-foreground` | `240 4% 66%` | Supporting text |
| `--primary` / `--primary-foreground` | `0 0% 100%` / `0 0% 4%` | Solid action fallback |
| `--secondary`, `--muted`, `--accent` | `0 0% 10%` | Neutral component surfaces |
| `--border`, `--input` | `0 0% 18%` | Fine borders and input boundaries |

The existing stylesheet uses `--muted` as a text color and `--accent` as electric blue. Those names cannot simply be overwritten with the new HSL surface values. Migrate their consumers together: text uses muted foreground, surfaces use HSL surface tokens, and the horse/focus highlight gets a distinct brand-color token. Canvas color reads must receive valid resolved CSS colors, not bare HSL channel strings.

Retain Light / Dark / System and existing persistence behavior. The cinematic hero stays dark and readable in every preference. Supporting sections and the horse footer receive a coordinated light-mode palette when Light is selected.

### Glass, borders, and spacing

- Use the exact supplied glass background, 4px backdrop blur, subtle inset highlight, and masked reflective edge for hero/nav actions.
- Provide a thin ordinary border fallback when mask compositing or backdrop filtering is unavailable.
- Keep the reflective pseudo-element non-interactive so it cannot block the link underneath.
- Use pill radii for actions, approximately 16–24px radii for product examples, and thin neutral separators for editorial sections.
- Use a consistent 8px spacing rhythm, approximately 96–128px between desktop sections and 56–72px on phones.
- Keep lower-section surfaces mostly solid; backdrop filtering is reserved for the small controls where it adds value.

## 5. Motion, loading, and accessibility

### Hero motion

- Full-screen video attributes: `autoPlay`, `loop`, `muted`, and `playsInline`, using the supplied source URL.
- Headline entrance: 24px upward travel with opacity, 0.8 seconds, ease-out.
- Supporting copy: the same entrance with a 0.2-second delay.
- Hero action: the same entrance with a 0.4-second delay.
- Glass hover/focus response: subtle brightness/edge change and scale up to 1.03, with a short easing transition.
- Include a discreet, accessible background-video pause/play control. Content and downloads are usable regardless of playback state.
- Pause the hero video when the hero is off-screen or the document is hidden. The horse remains independently controlled and visible only at the footer.

### Media and performance

- Create a lightweight poster from the same footage. Show it immediately over the navy base, while text renders independently of video readiness.
- Use the supplied URL as the video source. Its 14.14 MB size means the initial experience must not depend on downloading the full clip.
- Under reduced motion, display the poster and suppress entrance transforms and autoplay. Honor data-saving signals with a still-image experience where supported.
- Handle blocked autoplay and media/network failure with the poster and a usable page.
- Test cropping at desktop, tablet, and mobile sizes. Adjust `object-position` to keep the central figure in frame without putting text over the bright screens.
- Avoid a new animation framework or WebGL dependency. CSS handles entrances; small, cleaned-up browser listeners handle video lifecycle.
- Keep the existing horse's bounded canvas resolution, 30fps drawing cap, lazy source assignment, and off-screen pause behavior.

### Accessibility

Maintain one clear H1, semantic navigation and main/footer landmarks, keyboard access, visible focus, and meaningful link names. Use adequate touch targets for compact controls. Test contrast over multiple frames of the actual video; adjust text colors and placement to meet contrast requirements without introducing an overlay. Preserve theme changes before React loads, cross-tab synchronization, and graceful behavior when local storage is unavailable.

## 6. File-level implementation map

| Area | Planned responsibility |
|---|---|
| `App.tsx` | Group the cinematic entry and reorder the content story while preserving the playground-to-counter data flow |
| `Hero.tsx` | Centered serif headline, concise product copy, glass action, reference-aligned composition |
| New `HeroVideo.tsx` | Video, poster, autoplay fallback, visibility/reduced-motion handling, pause control, cleanup |
| `Navbar.tsx` | Cinematic styling, compact responsive layout, working anchors, current repository link |
| `ThemeControl.tsx` | Retain preference logic; provide a compact presentation where space is limited |
| `DownloadButtons.tsx` | Hero/content variants sharing the same versioned ZIP and installation behavior |
| `SocialProof.tsx` | Truthful product facts and graceful GitHub data handling |
| Existing demo and content components | Restyle and simplify composition while preserving working interactions |
| `Footer.tsx` / `HalftoneHorse.tsx` | Preserve the horse and adapt typography and color bindings |
| `index.css`, `index.html`, `public/theme.js` as needed | Migrate tokens, load fonts, remove obsolete hero rules, retain early theme initialization |
| Browser tests | Update presentation expectations and cover video lifecycle, responsive navigation, existing product behavior, and horse regressions |

## 7. Implementation phases and completion criteria

1. **Design foundation:** introduce the typography and token contract, migrate affected color consumers, and validate the light/dark installation page.
2. **Cinematic entry:** implement the poster/video lifecycle, navigation, hero composition, glass controls, and exact entrance timing. Review wide, tall, and narrow screens before changing the lower sections.
3. **Page-wide redesign:** restyle the playground, how-it-works section, product story, features, privacy, FAQ, and final download. Remove obsolete floating-card styling and duplicate introductions.
4. **Horse integration:** retain and visually verify the interactive horse in the new footer palette. Check that the hero and footer do not both keep decoding while off-screen.
5. **Validation:** run typechecks, production build, landing browser suite, and release verification. Inspect real screenshots and moving footage in both themes.
6. **Publishing:** prepare the reviewed changes for GitHub and deployment when the publishing phase is requested. Verify the live site and downloadable archive after deployment.

Acceptance checks:

- Reference-like video-led composition at 320, 390, 768, 1280, and 1440px; no horizontal overflow or clipped actions.
- Readable hero copy throughout the clip, with predictable wrapping and a usable font fallback.
- No blank hero when the video is slow, blocked, or unavailable.
- Reduced-motion behavior, pause controls, off-screen suspension, and clean listener/frame cleanup.
- Working navigation, theme preference, versioned download, release notes, and `/install` route.
- Playground expansion preserves the cursor; counters count real expansions; tags and previews work with mouse, keyboard, and touch.
- Horse remains visible, animated, and cursor-responsive in normal motion; shows a still frame under reduced motion; fails gracefully if its media is unavailable.
- No extension/backend/shared architectural changes and no modification of the staged 0.0.5 extension ZIP.

## 8. Current phase

Phases 1–3 are complete in the local working tree.

### Phase 1: design foundation

- Added the Google Fonts stylesheet and preconnect hints for Instrument Serif 400 and Inter 400/500, with system fallbacks.
- Applied serif typography to display headings, the installation title, and wordmarks; aligned active UI text with the requested body weights.
- Introduced the HSL theme contract and the supplied deep navy dark palette, keeping the existing Light / Dark / System preference and warm light palette.
- Migrated text, action, surface, focus, and canvas color consumers so the new neutral `--accent` and `--muted` values do not break text or the horse highlight.
- Preserved the horse animation and its independent blue highlight.
- Passed frontend typechecks, the production build, all 19 landing browser checks, and extension release verification. Browser checks intentionally exercise font fallback without depending on Google Fonts availability in CI.

### Phase 2: cinematic entry

- Added the supplied full-screen video, transparent navigation, centered Fillin headline, liquid-glass download actions, and staggered entrance animation without decorative overlays.
- Created a 193 KB local poster so unavailable, blocked, or paused video leaves a useful hero. Reduced-motion and data-saving preferences avoid requesting the background video.
- Added explicit playback controls and off-screen/document-hidden suspension. Kept the footer's playback independent.
- Preserved Light / Dark / System, with a compact keyboard-accessible chooser on small screens, and fixed navigation back from installation instructions to homepage sections.
- Verified the versioned download and matching archive hash. Passed all 33 browser checks at the end of this phase.

### Phase 3: page-wide redesign

- Reordered the page into product facts, the live playground, three setup steps, a library tour and interactive features, privacy, FAQ, and a final download.
- Applied serif headings, open layouts, shared borders, quieter cards, and consistent keyboard keys in both themes. Kept the editor dark and readable in either theme.
- Removed mock contributor avatars and the five-star rating. The repository link shows the real GitHub star count when available and a useful open-source fallback when it is not.
- Preserved expansion/cursor behavior, real demo counts, tag selection, and hover/focus/touch previews.
- Made the library tour respect reduced motion, stop off-screen, and pause when a visitor selects a step. Replaced FAQ cards with native keyboard-accessible disclosures.
- Passed frontend typechecks, production build, all 37 landing browser checks, whitespace validation, and extension release verification for 0.0.5. Reviewed the lower-page composition in both themes; responsive checks cover 320, 390, 768, and 1440 px.

### Phases 4–5: footer integration and validation

- Removed the oversized footer wordmark at the user's request. The horse is the final page element, with the caption, pause control, and footer links above it.
- Reviewed both footer palettes and verified cursor response, pause/resume, reduced motion, media failure, mobile width, and alignment with the bottom of the document.
- Re-ran all 37 landing browser checks after the footer change. All pass. Frontend typechecks, production build, release verification, and whitespace checks also pass.

### Phase 6: publishing

The user explicitly authorized pushing the completed redesign to GitHub and deploying it to the existing Vercel production project. Publish the tested frontend build, then verify the public homepage, installation route, media, and downloadable archive against the local release.
