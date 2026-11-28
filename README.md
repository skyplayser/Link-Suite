<p align="center">
  <img src="docs/assets/icons/link-suite.svg" width="112" alt="Link-Suite icon">
</p>

<h1 align="center">Link-Suite</h1>

<p align="center"><b>The launcher of the Link-Suite</b></p>

<p align="center">
  <b>Free software for event technology – every program in one window.</b><br>
  Install and update them from GitHub, start them, and see who else is on the show network.
</p>

<p align="center">
  <a href="#download-and-install"><img alt="Download Link-Suite 1.0.7" src="https://img.shields.io/badge/Download-Link--Suite%201.0.7-FF5C93?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/skyplayser/Link-Suite/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/skyplayser/Link-Suite?include_prereleases&label=release&color=FFB020"></a>
  <a href="https://github.com/skyplayser/Link-Suite/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/skyplayser/Link-Suite/total?label=downloads&color=22C8F0"></a>
  <img alt="Version 1.0.7" src="https://img.shields.io/badge/version-1.0.7-FF5C93">
  <img alt="macOS 13+, Apple silicon and Intel" src="https://img.shields.io/badge/macOS%2013%2B-Apple%20silicon%20%7C%20Intel-3DDC84">
  <img alt="Windows 10/11, tested on Windows 11 (in a VM)" src="https://img.shields.io/badge/Windows-tested%20on%20Windows%2011%20(VM)-3DDC84">
  <img alt="Free" src="https://img.shields.io/badge/price-free-B45CFF">
  <a href="LICENSE"><img alt="License: EPL-2.0" src="https://img.shields.io/badge/license-EPL--2.0-22C8F0"></a>
</p>

<p align="center">
  <a href="https://link-suite.de/en/launcher/">Website</a> &nbsp;·&nbsp;
  <a href="#download-and-install">Download</a> &nbsp;·&nbsp;
  <a href="#quick-start">Quick start</a> &nbsp;·&nbsp;
  <a href="#the-programs-of-the-suite">The programs</a> &nbsp;·&nbsp;
  <a href="#for-developers">For developers</a> &nbsp;·&nbsp;
  <a href="https://discord.gg/N6DMca4Bjk">Discord</a> &nbsp;·&nbsp;
  <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <img src="docs/assets/shots/programme-nacht-en.png" alt="The PROGRAMS tab of Link-Suite: the numbers update, running and installed at the top, below the programs in the groups Installed, Available and Coming soon, on the right the details of LJ Link">
  <br><sub>Real screenshot of version 1.0.4 in demo mode, with sample data.</sub>
</p>

The Link-Suite is a family of free programs for event technology: [LJ Link](https://github.com/skyplayser/LJ-Link),
[LJL Link](https://github.com/skyplayser/LJL-Link), [VJ-Link](https://github.com/skyplayser/VJ-LINK), [VD-Link](https://github.com/skyplayser/VD-Link) and [Crew Link](https://github.com/skyplayser/Crew-Link) today,
NET Link, PL Link and dB Link coming soon. **Link-Suite** is the launcher that holds them together. It shows
every program of the suite in groups, installs and updates them straight from their GitHub releases, starts the ones on
this computer, and lists the suite programs it hears on the show network. It also brings the suite chat with
**EMERGENCY**, so the booth has the chat even without another suite program open.

Link-Suite is the way to get the suite: the websites of the programs offer Link-Suite for download, and Link-Suite fetches
the programs from GitHub and checks every file with SHA-256. The single downloads stay in the GitHub releases of each
program. Every program of the suite now shares the same start animation and points to Link-Suite.

Link-Suite listens, like every program of the suite. It controls no device and no other program on the network. It
connects to GitHub (to ask for new releases and download the ones you choose) and – only if you start it – to the AI help
assistant at `api.link-suite.de`. No telemetry, no account.

> [!NOTE]
> **Version 1.0.7.** On macOS the QA of 0.3.1 called Link-Suite ready for release: installing and updating a real
> program twice in a row worked. Some parts were only checked in the code or in a developer build (see
> [What is tested](#what-is-tested)). The Windows version was **tested on Windows 11 (in a VM)**.
> Link-Suite is not signed with Apple or Microsoft, so macOS and Windows warn once on the first start
> ([how to get past it](#first-start-getting-past-the-warning)).

**Part of the [Link-Suite](#the-programs-of-the-suite)** – LJ Link · LJL Link · VJ-Link · VD-Link · NET Link · Crew Link · PL Link · dB Link

## Highlights

<table>
<tr>
<td width="50%" valign="top">

**🧭 Every program at a glance**<br>
A hero with the numbers that matter – updates, running, installed, in development – and below it the programs in groups:
*Installed*, *Development*, *Available* and *Coming soon*. Every card has one pill for its state, so you see at once what
needs you.

</td>
<td width="50%" valign="top">

**⬇️ Install and update from GitHub**<br>
LJ Link, VJ-Link and VD-Link come straight from their GitHub releases, with one click. Every file is checked with SHA-256 against the
checksum GitHub gives. Updating works again and again, and a download that stalls stops cleanly instead of hanging.
Link-Suite updates itself the same way.

</td>
</tr>
<tr>
<td valign="top">

**🔌 LJL Link for the club stick**<br>
LJL Link runs from the club's USB stick. *To the stick* puts the checked app into a folder or straight onto the
stick, with a short guide. The club's `club.json` still goes next to it by hand.

</td>
<td valign="top">

**✨ Start animation**<br>
The suite start animation, now with an ending of its own: the program icons fly into their cards. At most about 2 seconds,
skip it with a key or a click, calm with “reduce motion”, and it can be switched off.

</td>
</tr>
<tr>
<td valign="top">

**🍎 Feels at home on the Mac**<br>
Window without a title bar, menus with shortcuts, an About window, progress and the number of updates on the Dock icon,
quiet notifications, a menu bar icon, a welcome card on the first start and a proper DMG window.

</td>
<td valign="top">

**🪟 Windows without admin rights**<br>
The Windows installer installs Link-Suite for your user only, in German or English, and needs no administrator rights.

</td>
</tr>
<tr>
<td valign="top">

**▶️ Start installed programs**<br>
Link-Suite finds LJ Link, VJ-Link and VD-Link (also under older app names) and starts them with one click. If a program is
already running, the button brings it to the front.

</td>
<td valign="top">

**🛠️ Developer view, only when you need it**<br>
New suite programs can be started as a developer project, straight from their folder, with a log bar and *Stop*. This view
appears only once you set developer folders; without them Link-Suite shows no npm commands and no developer pills.

</td>
</tr>
<tr>
<td valign="top">

**💬 Suite chat with EMERGENCY**<br>
The same chat room as LJ Link, LJL Link and VJ-Link, without a server. The **EMERGENCY** button opens a pop-up for everyone.
Optionally Link-Suite keeps running in the menu bar, so the booth stays in the chat with the window closed (off by default).

</td>
<td valign="top">

**📡 ON THE NETWORK**<br>
Which suite program runs on which computer, at which place, in which version – grouped by computer, with “gone since” for
programs that stopped. If a computer runs an older version, Link-Suite says so; it never touches other computers.

</td>
</tr>
<tr>
<td valign="top">

**✋ Asks before it changes anything**<br>
Nothing is installed without your click. Link-Suite does not touch project folders: no `npm install`, no build on its own.

</td>
<td valign="top">

**⚙️ Settings for the whole suite**<br>
Language, day or night, your name and place in the chat and the start animation – set once and saved in `suite.json`.
**English and German**, day and night mode.

</td>
</tr>
</table>

<table>
  <tr>
    <td width="50%"><img src="docs/assets/shots/intro-nacht-de.png" alt="Still of the start animation: the program icons on their way into the cards"><br><sub><b>Start animation:</b> the icons fly into their cards (still at 1.2 s, German interface).</sub></td>
    <td width="50%"><img src="docs/assets/shots/willkommen-nacht-de.png" alt="Welcome card on the first start: all programs in one place, not signed on purpose, allow local network"><br><sub><b>Welcome</b> on the first start (German interface).</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/shots/im-netz-en.png" alt="ON THE NETWORK tab with suite programs on four computers"><br><sub><b>ON THE NETWORK.</b> Name and addresses of this computer are blurred.</sub></td>
    <td><img src="docs/assets/shots/chat-de.png" alt="Suite chat panel with two messages and the EMERGENCY button"><br><sub><b>Suite chat</b> with EMERGENCY (German interface).</sub></td>
  </tr>
  <tr>
    <td><img src="docs/assets/shots/programme-tag-en.png" alt="PROGRAMS tab in day mode"><br><sub><b>Day mode</b> for bright rooms.</sub></td>
    <td><img src="docs/assets/shots/einstellungen-en.png" alt="SETTINGS tab with interface, suite chat and programs"><br><sub><b>Settings</b> for all suite programs.</sub></td>
  </tr>
</table>
<sub>All screenshots: demo mode with sample data; the start animation and the welcome card were taken with version 0.3.1.</sub>

## The programs of the suite

| Program | What it does | State | Through Link-Suite | Links |
|---|---|---|---|---|
| <img src="docs/assets/icons/lj-link.svg" width="28" alt=""> **LJ Link** | Shows the lighting jockey every deck, waveform and cue from Pioneer and Denon gear and sends the tempo to the light desk | released, macOS and Windows | install and update | [GitHub](https://github.com/skyplayser/LJ-Link) · [Website](https://link-suite.de/en/lj-link/) |
| <img src="docs/assets/icons/ljl-link-256.png" width="28" alt=""> **LJL Link** | Brings the Serato decks from the DJ's Mac into LJ Link, straight from the club's USB stick | alpha, macOS | into a folder or onto the stick | [GitHub](https://github.com/skyplayser/LJL-Link) · [Website](https://link-suite.de/en/ljl-link/) |
| <img src="docs/assets/icons/vj-link.svg" width="28" alt=""> **VJ-Link** | Live visuals run by the light desk, in time with the music | beta, macOS and Windows | install and update | [GitHub](https://github.com/skyplayser/VJ-LINK) · [Website](https://link-suite.de/en/vj-link/) |
| <img src="docs/assets/icons/vd-link.svg" width="28" alt=""> **VD-Link** | 3D lighting visualiser for Art-Net and sACN: see the show before the rig hangs | beta, macOS and Windows | install and update | [GitHub](https://github.com/skyplayser/VD-Link) |
| <img src="docs/assets/icons/net-link.svg" width="28" alt=""> **NET Link** | Who is on the show network? Finds IP conflicts, wrong subnets and missing multicast | coming soon | – | – |
| <img src="docs/assets/icons/crew-link.svg" width="28" alt=""> **Crew Link** | Tonight's timetable: who plays when, one clock for everyone | alpha, macOS and Windows | install and update (from Link-Suite 1.0.6) | [GitHub](https://github.com/skyplayser/Crew-Link) · [Website](https://link-suite.de/en/crew-link/) |
| <img src="docs/assets/icons/pl-link.svg" width="28" alt=""> **PL Link** | Patch and power load: DMX addresses, circuits and packing lists | coming soon | – | – |
| <img src="docs/assets/icons/db-link.svg" width="28" alt=""> **dB Link** | Sound levels to DIN 15905-5: measure, warn, log | coming soon | – | – |

There are no dates for the programs that are coming soon.

## How it works

```mermaid
flowchart LR
  U["You"] -->|click| L["Link-Suite<br/>this computer"]
  G["GitHub releases<br/>LJ Link · LJL Link · VJ-Link · Link-Suite"] -->|"download, checked with SHA-256"| L
  L -->|"install · update · open"| A["LJ Link · VJ-Link · VD-Link"]
  L -->|"folder or USB stick"| K["LJL Link<br/>for the club stick"]
  L -->|"start from folder<br/>log · stop"| D["developer projects<br/>NET Link · Crew Link · …"]
  L -->|writes| S[("suite.json<br/>language · theme · chat name")]
  S -.->|"read (new programs)"| D
  L <-.->|"suite chat · here · EMERGENCY<br/>local network only"| N["suite programs<br/>on other computers"]
```

Only the release check and the downloads go to the internet, and only to GitHub. Link-Suite only contacts the AI help
assistant when you use it (see the table). Everything else stays on this computer and in the local network.

### How a download is checked

1. Link-Suite asks GitHub for the latest release of the program and picks the file for your system and chip.
2. It only downloads from GitHub addresses that belong to that program's repository.
3. After the download the size has to match, and **Link-Suite checks every file with SHA-256 against the checksum GitHub
   gives for the release.** If a release has no checksum for the file, Link-Suite installs nothing and only opens the page.
4. **A suite signature of its own comes later** (`SHA256SUMS` with `SHA256SUMS.sig`). If a release already carries one,
   Link-Suite checks it today, and a wrong signature stops the install.
5. The content has to fit: on macOS exactly one app, the right program in the right version; a zip may not point outside
   its folder. Only then is the old version replaced. If replacing fails, the old version is put back.
6. A program that is still running is never replaced and never quit by Link-Suite: it asks you to quit it first.
   A download that gets no data for 60 seconds stops, and nothing is replaced.
7. On Windows, Link-Suite starts the program's installer and you click through it.

The SHA-256 check protects against broken and swapped downloads, **but not against a GitHub account that has been taken
over**: whoever controls the account could publish a different file with a matching checksum. That is what the suite
signature is for, once it is there. The checks also do not replace a signature from Apple or Microsoft.

## What leaves your computer

Link-Suite sends into the local network while the suite chat is on (on by default, switch it off under *Settings → Suite
chat*), and it talks to GitHub for releases.

| Data | Who gets it |
|---|---|
| “I am here” every 5 seconds: program name *Link-Suite*, its version, your name and place from the settings (if set), a random id | every suite program in the local network (multicast `239.255.76.76:47676`) |
| Chat messages and EMERGENCY you send | every suite program in the local network |
| An answer to NET Link's network check (`echo`), with the IPv4 address of each network adapter | the NET Link that asked |
| “Bye” when you close Link-Suite | every suite program in the local network |
| The question for the latest releases of the suite programs and the downloads you start | GitHub (`api.github.com`, `github.com` and GitHub's download servers). Like every website, GitHub sees your IP address. No name, no list of your programs is sent |
| Only in the AI help assistant, after you confirm its notice: your messages, with the first one the chosen program with version and your system, a random ID (kept in memory only) | our server `api.link-suite.de` (sees your IP address); messages and program/system go on to Anthropic (USA). Deleted on our server 24 h after the last message |
| Only if you tick “Send diagnostics”: state, checks and recent error messages of the program; for Link-Suite itself also the installed suite programs with version and error lines from `main.log` | as above, as part of the message; you see the exact text first, user folders, email and public IP addresses removed |
| The list of your installed programs, your folders, the log of developer projects | never – except in the Link-Suite diagnostics, if you tick them in the assistant |
| Usage data, crash reports, telemetry | none; error lines only in the diagnostics, if you tick them |

The chat is **not encrypted**. Anyone in the same network can read along, and the programs in the room keep the latest
messages and pass up to 20 on to newcomers. Do not write anything confidential. Messages stay in memory and are never
written to a file or a log.

A developer project you start is its own program. Whatever it does, including `npm` loading packages from the internet, is
decided by that project, not by Link-Suite. That is why Link-Suite asks first.

## What it does not do

- It does not control any device, any light desk or any other program on the network.
- It does not touch other computers. ON THE NETWORK only shows them.
- It installs nothing without your click, and only from the GitHub releases of the suite.
- It does not change files in project folders by itself: no `npm install`, no build, no git.
- It does not switch off Gatekeeper or SmartScreen and changes no system setting.
- It needs no admin rights and asks for no password. Without admin rights, programs go to `~/Applications`.

## State of version 1.0.7

### What is new in 0.3

| Area | State |
|---|---|
| Interface | hero with the numbers update, running, installed and in development; programs in groups (installed, development, available, coming soon); one pill per card |
| Start animation | the programs fly into their cards; skippable, calm with “reduce motion”, can be switched off |
| Mac polish | window without title bar, menus with shortcuts, About window, Dock progress and badge, quiet notifications, menu bar icon, welcome card, DMG window |
| Updates | updating the same program several times in a row works cleanly; a download stops after 60 seconds without data instead of after a fixed total time |
| Developer view | only with developer folders; off by default without them |
| Windows (0.3.2) | installer per user, German/English, no admin rights; updates of programs that need admin rights open their installer with the Windows prompt. Firewall rules that Windows creates on the first start stay after uninstalling |

### What it does

| Area | State |
|---|---|
| Check for releases | asks GitHub at start and when you press the button; the check at start can be switched off |
| Install and update | LJ Link, VJ-Link, VD-Link and Crew Link from their GitHub releases (VD-Link from 1.0.0 on, Crew Link from 1.0.6 on, also as a pre-release) |
| LJL Link | *To the stick*: into a folder or straight onto the club's USB stick, with a short guide; `club.json` still by hand |
| Self-update | from [its own releases](https://github.com/skyplayser/Link-Suite/releases) (`skyplayser/Link-Suite`); the checked new version is put in place when you quit or click **Restart now** (macOS: replaced by a script; Windows from 1.0.3: the installer runs silently for your user) |
| Start programs | installed apps, and developer projects with log bar when the developer view is on |
| Help assistant (from 1.0.7) | the AI help assistant of [link-suite.de](https://link-suite.de/en/helpdesk/) in the app (question mark at the top right); sends the chosen program, its version and the system along; sends nothing before you confirm the notice; a program's diagnostics only with a tick (off by default, text visible first); at most 25 messages per chat, then a prepared email you send yourself; reset under Settings → AI help assistant |
| Suite chat, ON THE NETWORK, shared settings | as in 0.1 |

### Not yet

| Planned | When |
|---|---|
| A suite signature of its own on every release (`SHA256SUMS.sig`), then required for every install | later |
| *Prepare club stick* with `club.json` for LJL Link | later |
| Bonjour: find web interfaces of suite programs, *Open in browser* | later |
| Installers signed with Apple and Microsoft, notarized by Apple | later |
| *Report a problem* inside Link-Suite | not yet |

### What is tested

From the QA of 0.3 and 0.3.1 and the Windows test of 0.3.2. **Result for macOS: ready for release.** Installing VD-Link, new in 1.0.0, is not covered by these reports.

- **Build and tests:** `npm run check` with 146 unit tests passes; `npm run dist:mac` builds both DMGs.
- **Install and update, for real:** VJ-Link from GitHub installed, then updated twice in a row – each time clean, without
  leftovers, no disk image left mounted. Cancelling a download leaves the installed app unchanged. This ran in a developer
  build with the same code, because the packaged app does not allow remote control (on purpose).
- **Slow downloads:** checked against a throttled local server, in Node and under Electron. A throttled real GitHub
  download could not be tested.
- **Interface:** all tabs in day and night, German and English, at four window sizes; the start animation measured and
  checked frame by frame.
- **Packaged app:** started with real data and screenshots taken; the installed programs and the numbers matched.
- **Security review:** download allowlist, preload, About window, log without user paths; from 0.1 and 0.2: fuzzing of
  network messages and checks of the Electron settings.
- **Only in the code, not live:** Dock progress and notifications, the DMG window in the Finder, the system light mode
  at start.
- **Self-update:** 1.0.0 → 1.0.1 tested on macOS. On Windows it exists from 1.0.3 on, tested on Windows 11 (in a VM) with a test build of 1.0.3 updating itself to 1.0.2 and to the real 1.0.3.
- **Not tested:** Link-Suite between two real computers or in a
  club.
- **Windows:** tested on Windows 11, in a VM: install, update (also with the admin prompt), start, uninstall.

## Download and install

Download Link-Suite for your computer. The files come straight from the
[latest release](https://github.com/skyplayser/Link-Suite/releases/latest); all versions and changes are on the [releases page](https://github.com/skyplayser/Link-Suite/releases).

| System | File | State |
|---|---|---|
| macOS 13 or newer, Apple silicon (M1 and newer) | [`Link-Suite-macos-arm64.dmg`](https://github.com/skyplayser/Link-Suite/releases/latest/download/Link-Suite-macos-arm64.dmg) | tested |
| macOS 13 or newer, Intel | [`Link-Suite-macos-intel.dmg`](https://github.com/skyplayser/Link-Suite/releases/latest/download/Link-Suite-macos-intel.dmg) | built, not tried on an Intel Mac |
| Windows 10 / 11, 64 bit | [`Link-Suite-windows.exe`](https://github.com/skyplayser/Link-Suite/releases/latest/download/Link-Suite-windows.exe) | tested on Windows 11 (in a VM) |

The single downloads of each program also stay in its GitHub releases. Then open Link-Suite, go to **PROGRAMS** and press
**Install** on the program you want.

### First start: getting past the warning

Link-Suite is **not signed with Apple or Microsoft** (on macOS it is ad-hoc signed, not notarized). Signing costs money and
says nothing about safety, but both systems warn once on the first start because of it. Only download Link-Suite from this
GitHub page or from [the website](https://link-suite.de/en/launcher/).

**macOS** (“Link-Suite” Not Opened – Apple could not verify “Link-Suite” is free of malware):

1. Open the `.dmg` and drag Link-Suite onto *Applications*.
2. Start Link-Suite once. At the warning click *Done* (not *Move to Trash*).
3. Open *System Settings → Privacy & Security* and scroll all the way down.
4. Next to “Link-Suite was blocked …” click **Open Anyway** and confirm with your password or Touch ID, then *Open*.
5. **Allow the local network** when macOS asks. Link-Suite needs it for the suite chat and ON THE NETWORK. Missed it?
   *System Settings → Privacy & Security → Local Network*.

**After an update macOS may ask about the local network again**, because the app is not signed and macOS sees the new
version as a new app. Allow it again.

On macOS 14 and older, right-click the app → *Open* → *Open* also works. Terminal alternative:
`xattr -dr com.apple.quarantine "/Applications/Link-Suite.app"`. This switches off macOS's download check for this app, so
only use it for a copy from this GitHub page or the official website.

**Windows** (“Windows protected your PC”, Microsoft Defender SmartScreen):

1. Run `Link-Suite-windows.exe`.
2. In the blue window click **More info**, then **Run anyway**.
3. Click through the installer. It installs for your user only and needs no admin rights.
4. If the Windows Firewall asks, tick *Private networks* and choose *Allow access* (for the suite chat).

Some virus scanners flag unknown, unsigned programs as a precaution. When in doubt, download the file from GitHub.

**The programs Link-Suite installs** are written to disk by Link-Suite itself, the same way the built-in updaters of LJ Link
and VJ-Link work, so macOS does not check them itself. Link-Suite checks every file with SHA-256 first (see
[How a download is checked](#how-a-download-is-checked)); the programs are not signed with Apple or Microsoft either.

## Quick start

1. Start Link-Suite. The start animation shows the suite, the program list builds up below.
2. **PROGRAMS:** press **Install** on a program you do not have yet, **Update** when a new version is out, or **Start** on an
   installed one. With the developer view on, **Start (developer)** starts a project from its folder; the log bar opens at the bottom.
3. **LJL Link:** on its card choose **To the stick** and pick a folder or the club's USB stick. Put the club's
   `club.json` next to the app, as the [LJL Link README](https://github.com/skyplayser/LJL-Link#clubjson) explains.
4. **ON THE NETWORK:** see which suite programs run on which computer.
5. **SETTINGS:** set your name and place for the chat (for example “Max” and “Booth”), language and day or night.
6. Chat: the speech bubble at the top right. **EMERGENCY** is the yellow button.

> [!IMPORTANT]
> EMERGENCY is a heads-up pop-up for the team, not an alarm or safety system. It is an alpha, can fail or arrive late, and
> anyone in the same network can trigger it. It does not replace announcements, radios or the event's safety plan.

## Problems?

Link-Suite has no *Report a problem* of its own yet. Tell us on [Discord](https://discord.gg/N6DMca4Bjk) or by email to
fehlermelden@nextphilm.de: what you did, what happened, the Link-Suite version and your system (macOS or Windows, and which
version). Copy the log of a developer project only if it contains nothing private.

An install or update stops? Link-Suite says why (for example “Checksum wrong. The file was deleted, nothing was replaced.”).
You can always use **Open page** and get the program from its GitHub release instead.

Network trouble? That is NET Link's job. It is in development; until then the footer of Link-Suite says so.

---

## For developers

Version **1.0.7**: everything from 0.1 and 0.2 (program list, starting installed apps and developer projects, suite
chat with EMERGENCY, ON THE NETWORK, installing and updating from GitHub, the club stick, the self-update), plus the new
interface, the start animation with its launcher ending, the macOS polish and the per-user Windows installer. 1.0.1 brings the fixes from the Windows test, 1.0.2 a DE/EN
switch in the title bar, 1.0.3 the self-update on Windows.
Concept, research, design and QA reports are kept outside this repo. Release notes: [`docs/releases/`](docs/releases/) (German).

### Requirements

Node.js 22+, macOS (tested on Apple silicon). Windows: tested on Windows 11 (in a VM).

### Commands

| Command | What |
|---|---|
| `npm install` | dependencies (build tools and Electron only) |
| `npm run check` | generate the start animation, type check, tests (vitest) |
| `npm run build` | start animation module, main process/preload (esbuild → `dist-electron/`), interface (Vite → `dist/`) |
| `npm start` | build and start (real programs, real suite chat on 47676) |
| `npm run demo` | build and start in demo mode |
| `npm run shots` | screenshots of all tabs in demo mode to `shots/` |
| `npm run dist:dir` | `release/mac-arm64/Link-Suite.app` (unsigned, ad hoc `identity: "-"`) |
| `npm run dist:mac` | macOS Apple silicon and Intel as `.dmg` |
| `npm run dist:win` | Windows `.exe` (NSIS) |
| `.github/workflows/release.yml` | the only way to publish: a tag `v*` builds all three packages, writes `SHA256SUMS` and creates the release with the text from `docs/releases/<tag>.md` |
| `scripts/release.sh` | checks that `docs/releases/v<version>.md` exists, prints local checksums for testing and the tag command; publishes nothing |

Copying to `/Applications` is up to you: `ditto release/mac-arm64/Link-Suite.app /Applications/Link-Suite.app`.

### Demo mode and screenshots

`electron . --demo` creates test folders under `$TMPDIR/link-suite-demo-*`: two “installed” apps (only `Info.plist`) and
six developer projects in every state (VJ-Link built → direct start of a demo “Electron” (shell script), VD-Link not built →
`npm run dev` after asking, NET Link without `package.json`, Crew Link without `node_modules`, dB Link without a script,
PL Link without a folder). Made-up participants on the network come in the same way as real datagrams (`ChatNet.inject`).
Chat on test port 47684, own data folder in the temp folder (the real `suite.json` is not touched). The demo folder is
deleted on quit.

Screenshot for QA: render, `capturePage()`, quit.

```
npx electron . --demo --shot=shots/programme.png --tab=programs --theme=dark --lang=de
```

| Switch | Values |
|---|---|
| `--shot=<file.png>` | target (window 1480 × 920) |
| `--tab=` | `programs` · `network` · `stick` · `settings` |
| `--theme=` / `--lang=` | `light`/`dark` · `de`/`en` |
| `--open=<id>` | detail column for a program (`lj`, `vj`, `vd`, `ljl`, `net`, `crew`, `pl`, `db`) |
| `--run=<id>` | start a developer project, show the log bar |
| `--menu=<id>` · `--chat` | ⋯ menu open · chat panel open |
| `--intro=<ms>` | show the start animation and capture after that many ms (e.g. 1200) |

The pictures in `docs/assets/shots/` were taken this way with `TMPDIR=/tmp`, so no personal paths appear; on ON THE NETWORK
the name and addresses of the computer were blurred afterwards.

Without `--demo`, `--shot` shows the real programs of this computer (data also only in the temp folder, chat on the test port).

### Structure

```
src/core/       pure logic, no Electron, fully tested
  catalog.ts    the eight programs (ids, app names, developer folders, one-liners)
  release.ts    install and update: release sources per program, GitHub digest, SHA256SUMS and signature,
                allowed hosts, size, zip and bundle checks
  devproject.ts can a developer project start (package.json, node_modules/electron/path.txt, build)
  plist.ts      parsing plutil -convert json
  procs.ts      ps -axo pid=,comm= → apps and developer starts
  env.ts        clean environment, login shell with marker, PATH
  ringlog.ts    log ring buffer (5000 lines), lines, ANSI stripped
  finder.ts     Spotlight filter, best match, registry (Windows)
  settings.ts   suite.json / launcher.json
  suitechat.ts  chat room (from VJ-Link)
  suitenet.ts   ON THE NETWORK list, probe/echo
  i18n.ts       texts DE/EN
src/main/       main process (esbuild)
  main.ts       window, IPC (ids only), demo, screenshots, menu bar, quit dialog
  apps.ts       find (/Applications, ~/Applications, mdfind, /Volumes for LJL Link), open -a
  devrun.ts     developer starts: spawn detached, log, SIGTERM to the group, SIGKILL after 5 s
  suitechat.ts  chat sockets (from VJ-Link) + roster + echo
  store.ts      settings on disk (atomic)
  demo.ts       demo test folders and made-up participants
  preload.ts    narrow bridge window.suite
src/renderer/   interface (Vite), launcher.css from design/, intro/ generated from vendor/startanimation
tests/          vitest
```

Settings: `~/Library/Application Support/Link-Suite/suite.json` (for all suite programs: language, display, chat, start
animation) and `launcher.json` (developer folders as `~/…` or absolute, how to start each program, background mode).

Ports: suite chat 47676 with `reuseAddr` (siblings keep running). Tests: `LINKSUITE_TEST_PORT` (default 47683),
demo/screenshots 47684, otherwise `LINKSUITE_CHAT_PORT`. `LINKSUITE_INSTALL_DIR=<folder>` sets the install target, for
tests only; `LINKSUITE_USER_DATA=<folder>` uses a data folder of its own. `LINKSUITE_OFFLINE=1` (developer build or demo
only) acts as if GitHub could not be reached; `LINKSUITE_WELCOME=1` shows the welcome card in the demo and in screenshots. In the demo Link-Suite answers no `probe` (a demo network sends
neither `probe` nor `echo`).

**Open (QA 0.1, finding 6):** the test ports 47683 (tests) and 47684 (demo/screenshots) are not yet in the test port register
of `suite-net/spec/suite-net.md`. Please add them there (repo `suite-net`, not part of this project).

Packaged app: Electron fuses via `build.electronFuses` (electron-builder): RunAsNode, `NODE_OPTIONS` and `--inspect` off,
OnlyLoadAppFromAsar and the embedded asar integrity check on.

### Website

The website is [link-suite.de/en/launcher](https://link-suite.de/en/launcher/). [`docs/`](docs/) only holds the release
notes and the pages that forward the old GitHub Pages addresses there.

## Credits and notices

Built with [Electron](https://www.electronjs.org/) (MIT). Suite chat code and parts of the update logic from VJ-Link
(EPL-2.0); details in [THIRD_PARTY.md](THIRD_PARTY.md). Logo lettering: [Inter](https://github.com/rsms/inter) (SIL Open
Font License 1.1), as paths in the SVGs, no font software included.

Link-Suite is an independent project and not an official product of, or endorsed by, Apple, Microsoft, GitHub, AlphaTheta /
Pioneer DJ, inMusic / Denon DJ, Serato, MA Lighting or any other maker named here. All product names and trademarks belong to
their owners and are used only to describe compatibility. Art-Net™ Designed by and Copyright Artistic Licence Holdings Ltd.
The Link-Suite is not related to the LightJockey software by Martin.

Link-Suite is free and comes without warranty. Software, network and devices can fail: always keep a fallback ready.

## License

© 2026 Philipp Spruck. Link-Suite is distributed under the [Eclipse Public License 2.0](LICENSE), without any warranty.

<br>

<p align="center">
  <sub>Idea SKYPLAYSER/NEXTPHILM<br>
  Prompted with ❤️ made by Claude<br>
  <a href="https://link-suite.de/en/impressum/">Legal notice (Impressum)</a> ·
  <a href="https://link-suite.de/en/datenschutz/">Privacy</a></sub>
</p>
