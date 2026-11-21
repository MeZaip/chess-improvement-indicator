# Chrome Web Store – listing and privacy answers

Text to paste into the Developer Dashboard. Not part of the extension package.

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
