# Chrome Web Store – listing and privacy answers

Text to paste into the Developer Dashboard. Not part of the extension package.

## Store listing

**Name:** Chess Improvement Indicator

**Summary** (manifest `description`, max 132 characters – currently 132):
> Shows an improvement indicator on Lichess and Chess.com profiles: how far a player has climbed vs. players with the same experience.

**Category:** pick the closest one in the dashboard (e.g. Entertainment / Games).

**Language:** English

**Detailed description:**

```
See at a glance how fast a chess player is improving.

Chess Improvement Indicator adds a small badge next to the username on Lichess and Chess.com player profiles. The number shows how far the player has climbed compared with a typical player who has the same amount of experience on that site:

• 1.00x – typical for their experience
• 2.00x – climbed about twice as far as typical
• 0.50x – half as far

Click the badge to see the details for bullet, blitz, rapid and classical.

HOW IT WORKS
• Experience counts games in the time control plus a share of games in the other time controls, mostly the faster ones (e.g. blitz games count towards rapid). The weights are fitted on thousands of real players.
• "Typical" is the median rating of players with the same experience, measured separately for Lichess and Chess.com – ratings from the two sites are never mixed.
• Near the typical rating every Elo counts the same, so normal rating swings barely move the number. Far above it, every Elo counts more, because fewer players get there.
• If a Lichess profile links to the player's Chess.com account, games from both sites are counted.
• Colours follow familiar move-quality colours, from red (well below typical) to teal (exceptional).

PRIVACY
No account, no tracking, no ads, no server. The extension only reads public player statistics from the official Lichess and Chess.com public APIs; results are cached on your device for about 10 minutes. Full policy: https://mezaip.github.io/chess-improvement-indicator/privacy

OPEN SOURCE
https://github.com/MeZaip/chess-improvement-indicator

Not affiliated with, endorsed by or sponsored by Lichess or Chess.com.
```

## Images

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `icons/icon-128.png` (also in the package) |
| Small promo tile (required) | 440×280 | `store/images/promo-small-440x280.png` |
| Screenshots (1–5, at least 1) | 1280×800, full bleed | `store/images/screenshot-*.png` |

## Privacy policy URL

https://mezaip.github.io/chess-improvement-indicator/privacy

(Enable GitHub Pages first: repository Settings → Pages → Deploy from a
branch → `main`, folder `/docs`.)

## Single purpose

> Shows an improvement indicator on Lichess and Chess.com player profiles:
> how far the player has climbed compared with a typical player with the same
> amount of experience, computed from the sites' public player statistics.

## Permission justifications

**storage**
> Caches computed results locally for about 10 minutes so the same public
> data is not requested again on every page view. Expired entries are deleted
> automatically; nothing leaves the device.

**Host permission: https://lichess.org/\***
> Needed to show the indicator on Lichess profile pages and to read public
> player statistics from the Lichess public API (lichess.org/api/user).

**Host permission: https://api.chess.com/\***
> Needed to read public player statistics from the Chess.com Published-Data
> API (api.chess.com/pub/player/…/stats).

**Content script on https://www.chess.com/\***
> Needed to show the indicator next to the username on Chess.com profile
> pages. Matches all chess.com pages because the site navigates between pages
> without reloading; the script only acts on /member/… profile pages.

**Remote code**
> No. All code is included in the package; no remote scripts, eval or
> WebAssembly.

## Data usage

The extension has no backend and sends nothing to the developer. It reads the
username from the address of the profile page being viewed and sends it to
the Lichess / Chess.com public APIs (including the other site, to find the
same player's account there).

Suggested answers. The developer has to confirm these: the categories are
defined by Google, and this is not legal advice.

- Data categories: **Website content** (the username of the viewed profile,
  read from the page address and sent to the sites' public APIs). Leave all
  other categories (personally identifiable information, health, financial,
  authentication, personal communications, location, web history, user
  activity) unchecked.
- Certify all three statements:
  - I do not sell or transfer user data to third parties, outside of the
    approved use cases.
  - I do not use or transfer user data for purposes that are unrelated to my
    item's single purpose.
  - I do not use or transfer user data to determine creditworthiness or for
    lending purposes.
