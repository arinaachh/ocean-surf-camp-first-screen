# Ocean Surf Camp: first screen

Concept hero for a one-week surf camp for beginners. On load the photo zooms out, "CATCH YOUR" rises and "FIRST WAVE" slides up word by word. Then a liquid wave runs from the surfer through FIRST and WAVE (WebGL2). Move the cursor over the screen to push the water yourself; after a few idle seconds the wave runs again.

## Structure

- `index.html`: markup
- `styles.css`: layout and responsive rules
- `script.js`: mobile menu and the WebGL water effect
- `assets/`: photo, surfer cut-out, headline words, button plates, Inter font

Static site, no build step.

## Layout

- The photo fills the whole screen at any size, cropped around the surfer.
- All rows share one container: max width 1920 px, side paddings 30 px on desktop (16 to 20 px on smaller screens). On wider screens the content stays 1860 px and is centered.
- Desktop and laptop: matches the 1920 × 1080 Figma frame, scaled down proportionally.
- Tablets and landscape phones (761 to 1100 px): headline on one line, copy and buttons at the bottom.
- Phones (up to 760 px): FIRST and WAVE on two lines, the surfer below the headline, buttons full width, menu in a full-screen panel.
- Without WebGL the photo and headline show as plain images.
