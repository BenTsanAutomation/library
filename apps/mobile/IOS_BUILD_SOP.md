# iOS Build SOP — Library Mobile

How to get a test version of the Library app installed on your iPhone. No technical background required.

---

## Before you start (one-time)

You need **all four** of these. If any is missing, the build fails.

| Item | How to get it |
|---|---|
| iPhone with iOS 16 or newer | Already have it |
| Apple Developer account ($99/year) | https://developer.apple.com/programs/ — must be the paid one, not free |
| Expo account (free) | Sign up at https://expo.dev |
| EAS CLI installed on this machine | `npm install -g eas-cli` |

---

## Step 1 — Get an Expo access token (do this once)

This is a "password" your computer uses to talk to Expo so you don't have to log in every time.

1. Open https://expo.dev/settings/access-tokens in your browser
2. Click **Create token**
3. Name it `library-mobile` and click Create
4. **Copy the token immediately** — Expo only shows it once, ever
5. Save it permanently to your shell so every terminal sees it:
   ```bash
   echo 'export EXPO_TOKEN="paste-your-token-here"' >> ~/.bashrc
   source ~/.bashrc
   ```
6. Test it works:
   ```bash
   eas whoami
   ```
   Should print your Expo username. If it does, the token works.

---

## Step 2 — Register your iPhone with Apple (do this once per device)

Apple needs to know which physical phone is allowed to run the test build.

```bash
cd ~/.openclaw/workspace/apps/library/apps/mobile
eas device:create
```

When prompted:
- Pick **Website**
- It prints a URL (and QR code)
- On your iPhone, open the URL in Safari
- Safari prompts: "This website is trying to download a configuration profile" → tap **Allow**
- Open iPhone **Settings** → tap the **Profile Downloaded** banner near the top → tap **Install** → enter your passcode
- Done. Your iPhone's identifier is now registered with Apple.

---

## Step 3 — Build the test version (every time native code changes)

```bash
cd ~/.openclaw/workspace/apps/library/apps/mobile
eas build --profile development --platform ios
```

EAS will ask:
- **Apple ID** → your Apple Developer email
- **Apple password** → your password
- **2FA code** → 6-digit code that pops up on your iPhone or trusted device
- **Generate certificates?** → Yes (only first time)

Then it uploads your code and builds in the cloud. **Takes 15–25 minutes.** You can close the terminal — it keeps going.

To check progress:
```bash
eas build:list --limit 1
```

---

## Step 4 — Install the test build on your iPhone

When the build finishes, EAS prints a URL and a QR code.

1. On your iPhone, **open the Camera app**
2. Point it at the QR code on your computer screen
3. Tap the yellow notification banner that appears
4. The build page opens in Safari — tap **Install**
5. Switch to iPhone home screen — you'll see a half-installed icon for **Library (Dev)**
6. Wait ~30 seconds for it to finish installing

You may see a "Untrusted Developer" warning the first time you tap the app:
- iPhone **Settings** → **General** → **VPN & Device Management** → tap your Apple ID → **Trust**

Open **Library (Dev)** — you're done.

---

## Daily use (after build is installed)

For changing code (no rebuild needed):

```bash
cd ~/.openclaw/workspace/apps/library/apps/mobile
pnpm exec expo start --dev-client
```

Open **Library (Dev)** on your iPhone, scan the QR. Edit code on your computer → app updates instantly on the phone.

You only need to **rebuild** (Step 3 again) when:
- You add a new native module (line in `package.json` that requires `eas build`)
- You change `app.config.js` plugins
- Once a year — provisioning profiles expire annually

---

## Common problems

| Problem | Fix |
|---|---|
| "No registered devices" during build | Run `eas device:create` (Step 2) and re-trigger build |
| 2FA code times out | Restart `eas build`, have iPhone unlocked and ready |
| "Untrusted Developer" alert when opening app | Settings → General → VPN & Device Management → Trust your Apple ID |
| App crashes immediately on launch | Native module added without rebuild — re-run Step 3 |
| Bundle download stuck on phone | Phone + server on different networks — add `--tunnel` flag to `expo start` |
| `eas: command not found` | `npm install -g eas-cli` |

---

## Quick reference

```bash
# Set token (once, ever)
export EXPO_TOKEN="<your-token>"

# Register a new iPhone
eas device:create

# Build a fresh installable version
eas build --profile development --platform ios

# Run dev server for live code editing
pnpm exec expo start --dev-client

# Check build status
eas build:list --limit 5
```
