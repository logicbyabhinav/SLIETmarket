/*// ═══════════════════════════════════════════════════════════════
// js/firebase.js — THE FOUNDATION
// This file starts Firebase and exports the 3 services we need.
// Every other JS file imports from here.
// ═══════════════════════════════════════════════════════════════

// WHY IMPORT FROM URL?
// Because we're using plain HTML/JS (no npm, no build tool).
// Firebase provides its SDK hosted on Google's CDN.
// We just import directly from that URL — no installation needed.

// We use version 10.12.0 (NOT 12.x from your config).
// Reason: Firebase 12.x CDN URLs are not yet publicly available.
// Version 10.x is the latest stable production version and works identically.

import { initializeApp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import { getAuth }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { getFirestore }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { getStorage }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── YOUR PROJECT CREDENTIALS ────────────────────────────────────
// These are copied from your Firebase Console.
// They tell Firebase WHICH project to connect to.
// It's safe to have these in frontend code — Firebase Security
// Rules (set in the console) are what actually protect your data.

const firebaseConfig = {
  apiKey:            "AIzaSyDq5FmmWw60UGMrTTE9sIRdN71qvRtxA58",
  authDomain:        "sliet-market.firebaseapp.com",
  projectId:         "sliet-market",
  storageBucket:     "sliet-market.firebasestorage.app",
  messagingSenderId: "808628647801",
  appId:             "1:808628647801:web:769067a8323a1d123061a8"
};

// ── INITIALISE FIREBASE ─────────────────────────────────────────
// initializeApp() boots up Firebase with your config.
// This runs ONCE. All other files import the result.

const app = initializeApp(firebaseConfig);

// ── CREATE THE 3 SERVICES WE USE ───────────────────────────────

// 1. AUTH — handles sign up, sign in, sign out, user sessions
const auth = getAuth(app);

// 2. DB (Firestore) — our database. Stores users, listings, offers.
const db = getFirestore(app);

// 3. STORAGE — stores uploaded images (item photos)
const storage = getStorage(app);

// ── EXPORT ─────────────────────────────────────────────────────
// 'export' makes these available to other files via:
// import { auth, db, storage } from './firebase.js';

export { app, auth, db, storage };
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZ8QPemhW2QTqJAvTkikcm828FN5Qsbq4",
  authDomain: "sliet-market-v2.firebaseapp.com",
  projectId: "sliet-market-v2",
  storageBucket: "sliet-market-v2.firebasestorage.app",
  messagingSenderId: "487813704766",
  appId: "1:487813704766:web:30eb0973c137717005356f",
  measurementId: "G-PSEBJM6613"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export instances to use in other files
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);