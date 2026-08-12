# Centro Arlington Availability Alert (Node.js)

Polls https://centroarlington.com/floorplans/ on a schedule and texts you
the moment a tracked floorplan (default: **F-1**) goes from 0 units to
1+ units available.

## How it works

- A GitHub Actions workflow runs `scripts/check-availability.js` every
  15 minutes.
- The script scrapes the floorplans page with `cheerio`, and checks
  whether your tracked floorplan code(s) show "Contact Us" (= 0
  available) or an actual price/unit count (= available).
- It compares against `state.json` (committed to the repo) to detect a
  *change*, and only texts you when a unit newly becomes available —
  not on every run.
- The text is sent via **email-to-SMS** using `nodemailer` + Gmail's
  SMTP server: the script emails
  `yourphonenumber@your-carrier-gateway.com`, and your carrier
  delivers it as a text message. Free, no third-party SMS API needed.

## One-time setup

### 1. Create the repo

Create a new **private** GitHub repo and push these files to it
(root of the repo, keep the folder structure as-is: `scripts/`,
`.github/workflows/`, `package.json`, `state.json`).

### 2. Get a Gmail App Password

You cannot use your normal Gmail password for this — Google requires
an "App Password" for SMTP access from scripts.

1. Go to https://myaccount.google.com/security
2. Turn on 2-Step Verification if it isn't already on (required for
   App Passwords).
3. Go to https://myaccount.google.com/apppasswords
4. Create a new app password (name it something like "centro-alert").
5. Copy the 16-character password it gives you — you won't see it again.

*(If you'd rather not use your main Gmail, create a free throwaway
Gmail account just for this.)*

### 3. Find your carrier's email-to-SMS gateway

Replace `5551234567` with your 10-digit number, no dashes:

| Carrier | Gateway |
|---|---|
| Verizon | `5551234567@vtext.com` |
| AT&T | `5551234567@txt.att.net` |
| T-Mobile | `5551234567@tmomail.net` |
| Sprint (now T-Mobile) | `5551234567@messaging.sprintpcs.com` |
| Boost Mobile | `5551234567@sms.myboostmobile.com` |
| Cricket | `5551234567@sms.cricketwireless.net` |
| Google Fi | `5551234567@msg.fi.google.com` |
| Mint Mobile | `5551234567@tmomail.net` |
| Metro by T-Mobile | `5551234567@mymetropcs.com` |
| Visible | `5551234567@vtext.com` |

If your carrier isn't listed, search "[carrier name] email to SMS
gateway" — nearly all of them have one.

> **Deliverability note:** email-to-SMS is free but occasionally gets
> delayed or dropped by carrier spam filters, especially for
> Verizon/AT&T. If you find alerts unreliable, swap in Twilio later —
> the `sendSmsAlert` function in `scripts/check-availability.js` is the
> only place you'd need to change.

### 4. Add repo secrets

In your GitHub repo: **Settings → Secrets and variables → Actions →
New repository secret**. Add:

| Name | Value |
|---|---|
| `GMAIL_ADDRESS` | the Gmail address you're sending from |
| `GMAIL_APP_PASSWORD` | the 16-character app password from step 2 |
| `SMS_GATEWAY_EMAIL` | your carrier gateway address from step 3 |

### 5. (Optional) Track different/multiple floorplans

Under **Settings → Secrets and variables → Actions → Variables**, add a
repo variable:

| Name | Value |
|---|---|
| `FLOORPLAN_CODES` | `f-1` (or e.g. `f-1,f-1a` to track more than one) |

Codes are whatever appears in the floorplan's URL, e.g.
`centroarlington.com/floorplans/f-1/` → `f-1`. If this variable isn't
set, it defaults to `f-1`.

### 6. Enable Actions and test it

1. Go to the **Actions** tab in your repo, enable workflows if prompted.
2. Click "Check Centro Arlington Availability" → **Run workflow** to
   trigger it manually and confirm it runs clean (check the logs).
3. It'll then run automatically every 15 minutes.

## Adjusting the poll frequency

Edit the `cron` line in
`.github/workflows/check-availability.yml`. Examples:

- Every 10 min: `*/10 * * * *`
- Every 30 min: `*/30 * * * *`
- Every hour: `0 * * * *`

Note: GitHub disables scheduled workflows automatically after **60
days of repo inactivity** (no commits). The workflow's own commits to
`state.json` count as activity, so this should keep it alive
indefinitely as long as it's actually running.

## Local testing

```bash
npm install
export FLOORPLAN_CODES=f-1
export GMAIL_ADDRESS=you@gmail.com
export GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
export SMS_GATEWAY_EMAIL=5551234567@vtext.com
npm run check
```
