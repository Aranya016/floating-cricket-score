# Floating Cricket Score

The live Cricinfo score in a small window that floats in the corner of your screen,
above every tab and app, the way videos do in picture-in-picture.

## Install (2 minutes)

1. Open `brave://extensions` (Chrome: `chrome://extensions`, Edge: `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and pick this `cricket-float` folder.
4. Pin the red ball icon from the puzzle-piece menu. The toolbar badge then shows the score too.

It starts out following **Bangladesh vs West Indies, 1st Test**.
After changing any file here, press the reload ↻ icon on the extension in `brave://extensions`.

## Using it

| You want to… | Do this |
| --- | --- |
| Float the score | Click the red ball icon → **Float score**. A small window opens in the bottom-right corner and stays above everything |
| See batters, bowler and recent balls | Click the floating score. Click **–** to go back to just the score |
| Stop floating | Close the small window, or icon → **Stop floating** |
| Change match | Icon → pick from the live list, paste any Cricinfo match link, or **Float the match in this tab** while viewing one on Cricinfo |
| A score card inside web pages as well | Icon → Settings → **Also show a score card inside web pages**, or **Alt+Shift+C**. It steps aside while the score is floating; its **⧉** button floats it too |

Wickets, fours and sixes flash.

The floating window belongs to the tab you floated it from, so it closes if that tab closes or
goes to a different site. The browser labels every floating window (videos too) with that tab's
site, and no extension can hide the label. If the match is open in a Cricinfo tab, the extension
floats from there, so the label reads "cricinfo.com". It can't start from the new-tab page or browser settings pages;
switch to any normal website first.

## How it gets the score

The extension's background worker loads the match's public Cricinfo page every 20 seconds
(you can change this) and reads the score data that is embedded in the page.

- That page data can run **about a minute behind** the live ball-by-ball feed.
  If you keep the match open in a Cricinfo tab (pinning it is handy), the extension also reads
  that tab's live title, which updates within seconds.
- If Cricinfo ever refuses the background request, the score shows ⚠. Opening any cricinfo.com tab
  fixes it, because the extension then loads the page through that tab.
- It only works for matches on Cricinfo, and it will need updating if Cricinfo changes its page layout.

## Files

- `background.js`: fetching, refresh timing, badge, wicket/boundary detection
- `parser.js`: turns Cricinfo's page data into a small score object
- `widget.js`: how the score looks (floating window, page card and menu share it)
- `content.js`: opens the floating window; also draws the optional card inside pages
- `popup.*`: the toolbar menu
