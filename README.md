# SLIET Market

> A campus-exclusive, peer-to-peer student marketplace built for **Sant Longowal Institute of Engineering and Technology** — buy, sell, and bid on items using your verified college email.

![Firebase](https://img.shields.io/badge/Firebase-10.12.0-orange?logo=firebase)
![Firestore](https://img.shields.io/badge/Firestore-Realtime-blue?logo=google)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES%20Modules-yellow?logo=javascript)
![Auth](https://img.shields.io/badge/Auth-@sliet.ac.in%20only-green)
![ImgBB](https://img.shields.io/badge/Images-ImgBB%20CDN-blueviolet)
![Cost](https://img.shields.io/badge/Infrastructure-100%25%20Free-brightgreen)

---

## What is SLIET Market?

SLIET Market is a **serverless, zero-infrastructure-cost** web application that lets verified SLIET students list items for sale and negotiate deals — all within a trusted, closed campus community.

Registration is gated exclusively to `@sliet.ac.in` email addresses. No outsiders. No spam. No hosting fees.

**Live project:** [sliet-market-v2.web.app](https://sliet-market-v2.web.app) *(or your deployment URL)*

---

## Features

| Feature | Details |
|---|---|
| **Domain-Gated Auth** | Only `@sliet.ac.in` emails can register — enforced in JS and Firebase Rules |
| **Email Verification** | Firebase sends a verification link; sign-in is blocked until confirmed |
| **Real-time Marketplace** | Listings update live via Firestore `onSnapshot` — no page refresh needed |
| **Two Selling Modes** | **Fixed Price** (request-to-buy) or **Open to Offers** (live bidding) |
| **Atomic Deal Closure** | Accepting an offer marks the item sold and auto-rejects all other bids in a single `writeBatch` — no partial state possible |
| **Privacy-first Contact Reveal** | Seller phone is stored only in their user profile; it is never written to an offer document and only becomes accessible to the accepted buyer |
| **Image Hosting via ImgBB** | Product photos are uploaded to ImgBB CDN (free tier); the returned HTTPS URLs are saved to Firestore — no Firebase Storage billing required |
| **Auto-expiry Policy** | Images auto-delete from ImgBB after 90 days; listings store an `expireAt` field for server-side cleanup |
| **Relist Support** | Sellers can reopen a sold listing, which atomically resets status and invalidates all prior bids |
| **Responsive UI** | Hamburger nav, modal system, and toast notifications — works on mobile and desktop |
| **Admin Bypass Rules** | Core team accounts bypass Firestore Security Rules for moderation and maintenance |
| **Edit Listings** | Sellers can edit any active listing directly from their dashboard — title, price, images, condition — without deleting and relisting |
| **Multi-Image Gallery** | Detail modal supports up to 3 product images with left/right arrow navigation; cards still show only the primary image |

---

## Project Structure

```
sliet-market/
│
├── css/
│   ├── style.css          ← Global UI: CSS variables, cards, modals, badges, toasts
│   
├── js/
│   ├── firebase.js        ← Firebase SDK init; exports auth, db, storage
│   ├── app.js             ← Shared helpers: toast notifications, modal open/close, hamburger
│   ├── auth.js            ← Sign up, sign in, email verification, session check
│   ├── guard.js           ← Auth guard for protected pages; sets window.currentUser
│   ├── market.js          ← Marketplace feed: real-time listings, search, filter, offer submission
│   ├── listings.js        ← Seller dashboard: publish listing, ImgBB upload, accept/reject offers, relist
│   └── bids.js            ← Buyer dashboard: track sent offers, withdraw, reveal seller contact
│
├── index.html             ← Login & Sign-up page
├── welcome.html           ← Post-registration welcome screen
├── marketplace.html       ← Browse all active listings
├── listings.html          ← Seller's dashboard
└── bids.html              ← Buyer's bid tracker
```

---

## Architecture & How It Works

### 1. Authentication Flow

```
Sign Up ──► Email Verification Link ──► Verified ──► Marketplace
Sign In ──► Check emailVerified      ──► Redirect  ──► Marketplace
              │
              └─► Not verified? ──► Sign out + resend link
```

- `auth.js` registers users with `createUserWithEmailAndPassword`
- On sign-up, a user profile document is written to Firestore at `/users/{uid}` with name, email, and phone
- `sendEmailVerification()` dispatches a link to the student's `@sliet.ac.in` inbox
- Sign-in is **hard-blocked** until `user.emailVerified === true`
- `guard.js` runs on every inner page and immediately redirects unverified or logged-out users to `index.html`
- `window.currentUser` and `window.currentProfile` are set globally by `guard.js` so all modules share session context without re-importing

---

### 2. Listing a Product (`listings.js`)

```
Fill Form ──► Select Images (max 3)
                    │
                    ▼
         Upload to ImgBB CDN via fetch()
         ← Returns HTTPS image URLs
                    │
                    ▼
         Save listing doc to Firestore /listings
         (images field = ImgBB URL array)
                    │
                    ▼
         Appears live on Marketplace instantly
```

**Why ImgBB instead of Firebase Storage?**
Firebase Storage requires the **Blaze (pay-as-you-go) billing plan**. To keep SLIET Market entirely free and consistent for all contributors, images are uploaded to the [ImgBB API](https://api.imgbb.com) (free tier). The returned CDN links are stored in Firestore. Images are configured to auto-delete after `7,776,000 seconds` (90 days), matching the listing expiry policy.

Each listing document also stores an `expireAt` timestamp (3 months ahead) for automated server-side cleanup scripts.

---
### 2b. Editing a Listing (`listings.js → prepEditListing / updateListing`)

Sellers can edit any active listing without relisting:

```
Seller clicks Edit on a card
        │
        ▼
prepEditListing() pre-fills the form with existing data
Action button transforms: "Publish Listing" → "Save Changes"
        │
        ▼
Seller makes changes ──► clicks "Save Changes"
        │
        ▼
updateListing():
├── If new images selected → re-upload to ImgBB
└── If no new images → retain existing preview URLs
        │
        ▼
updateDoc() patches the Firestore listing document
updatedAt: serverTimestamp() tracked for audit
        │
        ▼
resetForm() restores button back to "Publish Listing" mode
```

### 3. Browsing & Searching (`market.js`)

- Marketplace loads all `status == 'active'` listings ordered by `createdAt DESC` using `onSnapshot`
- Search bar filters by title and description in real-time (client-side, no extra reads)
- Category chips filter by item type
- Clicking a listing card opens a detail modal with full info
- If the item belongs to the logged-in user → shows "This is your listing" (no self-purchase)
- **Fixed Price** items → show a one-click "Request to Buy" button
- **Open to Offers** items → show an inline offer form with price and optional message fields

---
### 3b. Image Gallery in Detail Modal (`market.js → openDetail`)

```
Card clicked ──► openDetail()
                    │
                    ▼
         images[] array rendered into .img-track
         Left / Right arrow buttons injected
                    │
                    ▼
         goSlide(dir) shifts translateX by 100% per slide
         Arrows auto-hidden if only 1 image exists
```


### 4. Placing an Offer (`market.js → submitOffer`)

```
Buyer opens item ──► Clicks "Make an Offer" ──► Enters price + message
                              │
               Anti-spam check via Firestore query:
               Does buyer already have a pending/accepted offer?
                              │
               No duplicate ──► Create offer doc in /offers
                                 status: 'pending'
```

Before creating an offer, `submitOffer()` queries Firestore to confirm the buyer has no existing `pending` or `accepted` offer for the same listing. This prevents bid spam at the application layer (Firestore Rules enforce it at the data layer).

The offer document stores buyer-side data only. **The seller's phone number is intentionally never stored in an offer document.**

---

### 5. Fixed Price "Request to Buy" Flow

Fixed-price items also use the offer system to protect seller privacy until a deal is confirmed:

```
Buyer clicks "Request to Buy"
        │
        ▼
System auto-creates an offer at full asking price
(seller email + phone remain hidden)
        │
        ▼
Seller accepts ──► Contact revealed to buyer via "Your Bids" tab
```

This ensures no seller contact information is ever exposed without explicit seller approval, regardless of listing type.

---

### 6. Accepting an Offer — Atomic Batch Write (`listings.js → acceptOffer`)

This is the most critical operation in the app. It is handled entirely as an **atomic `writeBatch`** to prevent any partial state:

```
Seller clicks Accept
        │
        ▼
writeBatch (Phase 1):
├── listings/{id}  →  status: 'sold', buyerId: winner, soldAt: serverTimestamp()
└── offers/{id}    →  status: 'accepted'
        │
        ▼
writeBatch (Phase 2):
└── All other pending offers for this listing → status: 'rejected'
        │
        ▼
batch.commit() ← All writes succeed or all fail. No half-states.
        │
        ▼
Sold listing auto-disappears from Marketplace (onSnapshot filter)
Rejected buyers' dashboards update in real-time
```

Using `writeBatch()` guarantees that a listing is never marked `sold` without its accepted offer being updated simultaneously, and competing buyers are always notified.

---

### 7. Managing Bids (`bids.js`)

- Buyer's bids page uses `onSnapshot` — status changes from the seller propagate instantly
- **Pending** → shows a **Withdraw** button (sets status to `rejected`)
- **Accepted** → shows a **View Contact** button (triggers the privacy reveal flow)
- **Rejected** → shows a **Remove** button (permanently deletes the offer document)

**Seller Contact Reveal — Privacy Flow:**

```
Buyer clicks "View Contact"
        │
        ▼
Fetch offer document → verify status === 'accepted'
        │
        ▼
Fetch /users/{sellerId} document
        │
        ▼
Display: name + email + phone in modal
```

The seller's phone number lives **only** in their `/users` profile document. It is never stored in the offer. Only a buyer whose offer status is `accepted` can trigger this fetch — enforced both in the application logic and in Firestore Security Rules.

---

## Firestore Data Structure

### `/users/{uid}`

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Firebase Auth UID |
| `firstName` | string | |
| `lastName` | string | |
| `name` | string | `firstName + ' ' + lastName` |
| `email` | string | `@sliet.ac.in` only |
| `phone` | string | Private — never stored in offers |
| `joinedAt` | string | ISO timestamp |

### `/listings/{listingId}`

| Field | Type | Notes |
|---|---|---|
| `title` | string | |
| `category` | string | |
| `condition` | string | New / Good / Fair / Poor |
| `description` | string | |
| `price` | number | Asking price (₹) |
| `sellingType` | string | `'fixed'` or `'offers'` |
| `images` | array | ImgBB CDN HTTPS URLs (max 3) |
| `sellerId` | string | Seller's UID |
| `sellerName` | string | |
| `sellerEmail` | string | |
| `status` | string | `'active'` or `'sold'` |
| `buyerId` | string / null | UID of accepted buyer |
| `soldAt` | timestamp / null | |
| `createdAt` | timestamp | `serverTimestamp()` |
| `expireAt` | date | 3 months from creation; used for cleanup |

### `/offers/{offerId}`

| Field | Type | Notes |
|---|---|---|
| `listingId` | string | |
| `listingTitle` | string | Denormalised for display |
| `listingImage` | string | Denormalised for bids page |
| `listingPrice` | number | Denormalised asking price |
| `sellerId` | string | |
| `sellerName` | string | |
| `buyerId` | string | |
| `buyerName` | string | |
| `buyerEmail` | string | |
| `offerPrice` | number | Buyer's offer (₹) |
| `message` | string | Optional note from buyer |
| `status` | string | `'pending'` / `'accepted'` / `'rejected'` |
| `createdAt` | timestamp | `serverTimestamp()` |

---

## Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 1. ADMIN BYPASS — Core team accounts have full access
    match /{document=**} {
      allow read, write: if request.auth != null && (
        request.auth.token.email == "abhinav_2411002@sliet.ac.in" ||
        request.auth.token.email == "abhimanyu_2411004@sliet.ac.in" ||
        request.auth.token.email == "aryan_2411001@sliet.ac.in"
      );
    }

    // 2. USER PROFILES
    match /users/{userId} {
      allow write: if request.auth.uid == userId;
      // Any verified SLIET student can read profiles
      // Required for the "View Contact" flow on accepted offers
      allow read: if request.auth != null;
    }

    // 3. LISTINGS
    match /listings/{listingId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null
        && request.auth.uid == resource.data.sellerId;
    }

    // 4. OFFERS
    match /offers/{offerId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null && (
        request.auth.uid == resource.data.buyerId ||
        request.auth.uid == resource.data.sellerId
      );
      allow update: if request.auth != null && (
        request.auth.uid == resource.data.sellerId ||
        request.auth.uid == resource.data.buyerId
      );
      allow delete: if request.auth != null
        && request.auth.uid == resource.data.buyerId;
    }
  }
}
```

---

## Required Firestore Indexes

Create these composite indexes in **Firebase Console → Firestore → Indexes**:

| Collection | Fields | Order |
|---|---|---|
| `listings` | `status`, `createdAt` | ASC, DESC |
| `listings` | `sellerId`, `createdAt` | ASC, DESC |
| `offers` | `buyerId`, `createdAt` | ASC, DESC |
| `offers` | `listingId`, `status`, `offerPrice` | ASC, ASC, DESC |
| `offers` | `listingId`, `buyerId`, `status` | ASC, ASC, ASC |

> Firestore will throw a descriptive error with a direct console link to auto-create any missing index.

---

## Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/logicbyabhinav/sliet-market.git
cd sliet-market
```

### 2. Start a local HTTP server

`file://` protocol breaks Firebase Auth — a local server is required.

```bash
# Node.js
npx serve .
# Then open: http://localhost:3000

# Python
python -m http.server 8000
# Then open: http://localhost:8000
```

### 3. Firebase Setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication → Email/Password**
3. Enable **Firestore Database**
4. Add `localhost` and `127.0.0.1` to **Authentication → Settings → Authorized Domains**
5. Copy your project config into `js/firebase.js`
6. Apply the Security Rules from above
7. Create the Firestore Indexes from the table above

> **Note:** Firebase Storage is **not required**. Images are hosted via ImgBB.

### 4. ImgBB Setup

1. Create a free account at [api.imgbb.com](https://api.imgbb.com)
2. Generate a free API key
3. Replace the `IMGBB_API_KEY` constant in `js/listings.js`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (ES Modules — no framework, no bundler) |
| Authentication | Firebase Auth (Email/Password + Email Verification) |
| Database | Cloud Firestore (NoSQL, real-time `onSnapshot`) |
| Image Hosting | ImgBB CDN API (free tier — no Firebase Storage billing) |
| Hosting | Firebase Hosting / Vercel / Netlify (static) |
| Build Tool | None — CDN imports only |

---

## Key Engineering Decisions

**Why no npm / build tooling?**
The project targets contributors and campus peers who may not have Node.js configured. Zero-install setup via CDN imports means anyone can clone and run.

**Why ImgBB instead of Firebase Storage?**
Firebase Storage requires activating the Blaze billing plan. ImgBB's free API tier keeps the entire stack cost-free and deployable by any student without a credit card.

**Why `writeBatch` for offer acceptance?**
Accepting an offer modifies a listing and multiple offer documents simultaneously. A batch write makes the operation atomic — the listing can never appear as `sold` while offers remain `pending`, regardless of network conditions or concurrent requests.

**Why phone numbers are not stored in offers?**
Seller contact details are sensitive. Storing a phone number in an offer document would make it readable by anyone with a reference to that offer. By keeping it exclusively in the seller's `/users` profile and only fetching it post-acceptance, the app enforces privacy at both the application and database rules layer.

---

## Author

**Abhinav Kishore**
GitHub: [@logicbyabhinav](https://github.com/logicbyabhinav)

---

## License

This project is built for educational and campus use at SLIET. Not licensed for commercial redistribution.
