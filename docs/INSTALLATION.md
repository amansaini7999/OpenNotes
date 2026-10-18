# Installation

[OpenNotes](../README.md) · [User guide](./USER_GUIDE.md) · [Development](./DEVELOPMENT.md)

## Use the hosted app

Open **https://amansaini7999.github.io/OpenNotes/** in a current browser.
No account or local server is required.

### iPad

1. Open the address in Safari.
2. Choose **Share → Add to Home Screen**.
3. Enable **Open as Web App** if shown, then tap **Add**.
4. Launch OpenNotes from its Home Screen icon.
5. Check **Help** for offline readiness before disconnecting.

Installation instructions are available under Help rather than as a persistent
button in the workspace. There is no iPad application package to download.

### Desktop

Use Chrome's install icon or its app-installation menu. Installation is optional;
you can also use OpenNotes in a browser tab.

## Run locally

Requires Node.js **24.11+ in the 24.x line** (tested), npm, and a browser with
IndexedDB, service workers, and Web Locks. Internet access is needed for the
initial dependency download.

```powershell
git clone https://github.com/amansaini7999/OpenNotes.git
Set-Location OpenNotes
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:4173**. Do not open `dist/index.html` directly.

After the production app finishes caching, it can reopen offline while its
browser data is retained. Keep the same address and port: `localhost` and
`127.0.0.1` have separate notebooks.

## Serve to iPad over local Wi-Fi

Use the hosted app for the simplest setup. For a private local setup, both
devices must be on the same network and the PC must serve **trusted HTTPS**.
An iPad's `localhost` refers to the iPad, not the PC.

Install [mkcert](https://github.com/FiloSottile/mkcert) from its official source:

```powershell
mkcert -install
New-Item -ItemType Directory -Force .local
# Replace the example IP with your PC's stable LAN IP.
mkcert -cert-file .local\tls.crt -key-file .local\tls.key localhost 127.0.0.1 192.168.1.20
$env:OPENNOTES_HTTPS = '1'
npm run preview -- --host 0.0.0.0
```

- Allow access only on your private network if Windows Firewall prompts.
- Follow mkcert's iOS instructions to install and trust its root CA
  **certificate** on your iPad.
- Never transfer or publish `rootCA-key.pem` or your TLS private key.
  `.local` is git-ignored.
- Open `https://192.168.1.20:4173` in Safari and add it to the Home Screen.
- Resolve certificate warnings; do not rely on bypassing them or on plain HTTP.
- To restore normal HTTP mode, run `Remove-Item Env:OPENNOTES_HTTPS`.

## Offline use and updates

Check Help for offline readiness, then test reopening in Airplane Mode.
For an update, finish writing, wait for **Saved on this device**, close all
OpenNotes windows, and reopen online. Do not clear site data to update.

Each browser, device, and origin has its own library. Use editable backups to
transfer notebooks. GitHub Pages serves application files and may log normal
website requests, including IP addresses; notebooks are not uploaded.

Physical iPad testing is still needed for Apple Pencil responsiveness, palm
rejection, installation behavior, and large-document performance.
