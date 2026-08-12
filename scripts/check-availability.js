#!/usr/bin/env node
/**
 * Checks centroarlington.com/floorplans/ for availability of specific
 * floorplan codes, and sends an SMS-via-email alert the moment a tracked
 * floorplan flips from "no units" to "units available".
 *
 * State (what was available last time we checked) is persisted to
 * state.json so we only text you on a *change*, not every 15 minutes.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as cheerio from "cheerio";
import nodemailer from "nodemailer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "..", "state.json");
const FLOORPLANS_URL = "https://centroarlington.com/floorplans/";

// Comma-separated list of floorplan codes to watch, e.g. "f-1,f-1a"
// Set via the FLOORPLAN_CODES repo variable. Defaults to f-1.
const TRACKED_CODES = (process.env.FLOORPLAN_CODES || "f-1")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

async function fetchAvailability() {
  const res = await fetch(FLOORPLANS_URL, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${FLOORPLANS_URL}: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const results = {};

  for (const code of TRACKED_CODES) {
    // Match hrefs like /floorplans/f-1/ or /floorplans/f-1 (end of string)
    const pattern = new RegExp(`/floorplans/${code}/?$`, "i");
    let link = null;

    $("a[href]").each((_, el) => {
      if (link) return;
      const href = $(el).attr("href") || "";
      if (pattern.test(href)) {
        link = $(el);
      }
    });

    if (!link) {
      results[code] = {
        available: false,
        detail: "floorplan code not found on page (site layout may have changed)",
      };
      continue;
    }

    const text = link.text().replace(/\s+/g, " ").trim();

    // "Contact Us" == 0 units available. Anything showing a price
    // or an "X left!" style string means units exist.
    const isAvailable = !text.toLowerCase().includes("contact us");

    results[code] = { available: isAvailable, detail: text };
  }

  return results;
}

/**
 * Sends a text via email-to-SMS gateway using Gmail SMTP.
 * Requires these environment variables (set as GitHub Actions secrets):
 *   GMAIL_ADDRESS      - the Gmail account to send from
 *   GMAIL_APP_PASSWORD - a Gmail App Password (not your normal password)
 *   SMS_GATEWAY_EMAIL  - e.g. 5551234567@vtext.com (see README for carrier list)
 */
async function sendSmsAlert(subject, body) {
  const gmailAddress = process.env.GMAIL_ADDRESS;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  const smsGatewayEmail = process.env.SMS_GATEWAY_EMAIL;

  if (!gmailAddress || !gmailAppPassword || !smsGatewayEmail) {
    throw new Error(
      "Missing one of GMAIL_ADDRESS, GMAIL_APP_PASSWORD, SMS_GATEWAY_EMAIL env vars"
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: gmailAddress,
      pass: gmailAppPassword,
    },
  });

  await transporter.sendMail({
    from: gmailAddress,
    to: smsGatewayEmail,
    subject,
    text: body,
  });
}

async function main() {
  const previousState = loadState();
  const current = await fetchAvailability();

  const newlyAvailable = [];

  for (const [code, info] of Object.entries(current)) {
    const wasAvailable = previousState[code]?.available ?? false;
    const isAvailable = info.available;

    if (isAvailable && !wasAvailable) {
      newlyAvailable.push([code, info.detail]);
    }

    console.log(`[${code}] available=${isAvailable} :: ${info.detail}`);
  }

  if (newlyAvailable.length > 0) {
    const lines = newlyAvailable.map(([code, detail]) => `${code.toUpperCase()}: ${detail}`);
    const body = `Centro Arlington unit available!\n${lines.join("\n")}\n${FLOORPLANS_URL}`;
    console.log("ALERT:", body);

    try {
      await sendSmsAlert("Centro Arlington availability alert", body);
    } catch (err) {
      console.error(`Failed to send alert: ${err.message}`);
      saveState(current);
      process.exit(1);
    }
  } else {
    console.log("No new availability.");
  }

  saveState(current);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
