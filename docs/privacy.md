---
title: Privacy Policy – Chess Improvement Indicator
---

# Privacy Policy

**Chess Improvement Indicator** (browser extension)
Effective date: 22 November 2026

## Summary

The extension does not collect, sell or share personal data. It has no
server of its own, no accounts, no analytics, no ads and no trackers.
Everything it computes stays in your browser.

## What the extension does

When you open a player profile on **lichess.org** or **chess.com**, the
extension reads the player's username from the page address and requests
that player's **public** statistics (ratings and number of games) from the
sites' public APIs. It then computes an improvement indicator in your
browser and shows it next to the player's name.

## What is sent, and to whom

All requests go directly from your browser to Lichess or Chess.com. No data
is ever sent to the developer or to anyone else.

| When you view… | Request sent to | Contains |
|---|---|---|
| a Lichess profile | `lichess.org/api` | the username of that profile |
| a Chess.com profile | `api.chess.com` | the username of that profile |
| a Lichess profile | `api.chess.com` | the Chess.com username linked in that player's Lichess profile, or, if none is linked, the same username, to find the player's account on the other site |
| a Chess.com profile | `lichess.org/api` | the same username, to find the player's account on the other site |

The last two rows mean that the *other* site receives the username of the
profile you are viewing. These requests use only public data and are made
without your cookies or login: the extension never sends your Lichess or
Chess.com session to either site. As with any web request, the sites can see
your IP address and browser type. Lichess and Chess.com handle requests under
their own privacy policies.

## What is stored on your device

Computed results are cached in your browser's extension storage
(`chrome.storage.local`) for about 10 minutes, to avoid repeating the same
requests, and are then deleted automatically. The cache never leaves your
device and is removed completely when you uninstall the extension.

## What the extension does not do

- It does not read your browsing history. Its script runs only on
  lichess.org and chess.com, where it checks the page address to recognise
  player profiles; on all other pages of those sites it does nothing.
- It does not read or use your Lichess or Chess.com account, messages or
  games.
- It does not load or run code from the internet.
- It does not sell, transfer or use data for advertising, credit or any
  purpose other than showing the indicator.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Short-lived local cache of computed results (see above). |
| Access to `lichess.org` | Show the indicator on Lichess profiles and read public player data from the Lichess API. |
| Access to `api.chess.com` | Read public player data from the Chess.com public API. |
| Runs on `www.chess.com` pages | Show the indicator on Chess.com profiles. |

## Changes

If this policy changes, the new version will be published on this page with
a new effective date.

## Contact

Questions or concerns: open an issue at
<https://github.com/MeZaip/chess-improvement-indicator/issues>.
