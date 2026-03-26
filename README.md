#  SLIET Market

> A peer-to-peer student marketplace exclusively for SLIET campus — buy, sell, and bid on items with your college email.

![Firebase](https://img.shields.io/badge/Firebase-10.12.0-orange?logo=firebase)
![Firestore](https://img.shields.io/badge/Firestore-Realtime-blue?logo=google)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES%20Modules-yellow?logo=javascript)
![Auth](https://img.shields.io/badge/Auth-@sliet.ac.in%20only-green)

---

##  What is SLIET Market?

SLIET Market is a campus-exclusive, serverless web application that allows students of **Sant Longowal Institute of Engineering and Technology** to list items for sale and place offers on each other's listings — all within a secure, verified student community.

Only `@sliet.ac.in` email addresses can register. No outsiders. No spam.

---

##  Features

-  **Gated Authentication** — Sign up and sign in restricted to `@sliet.ac.in` emails only
-  **Email Verification** — Firebase sends a verification link before any access is granted
-  **Real-time Marketplace** — Listings update live using Firestore `onSnapshot` — no refresh needed
-  **Two Selling Modes** — Sellers choose between **Fixed Price** (contact only) or **Open to Offers** (bidding)
-  **Offer / Bidding System** — Buyers submit offers with a price and optional message
-  **Atomic Deal Closure** — Accepting an offer marks the item as sold and auto-rejects all other bids in one batch write
-  **Privacy-first Contact Reveal** — Seller's phone number is only visible to the accepted buyer, never stored in offer documents
-  **Image Upload** — Up to 3 product photos uploaded to Firebase Storage per listing
-  **Responsive UI** — Works on mobile and desktop with a hamburger nav

---

##  Project Structure

```
/slietmarket
│
├── /css
│   ├── style.css          ← Global UI: variables, cards, modals, badges, toasts
│   └── auth.css           ← Login/Signup page specific styles
│
├── /js
│   ├── firebase.js        ← Firebase SDK init; exports auth, db, storage
│   ├── app.js             ← Shared helpers: toast, modal open/close, hamburger menu
│   ├── auth.js            ← Sign up, sign in, email verification, session check
│   ├── guard.js           ← Auth guard for protected pages; sets window.currentUser
│   ├── market.js          ← Marketplace feed: real-time listings, search, filter, offer submission
│   ├── listings.js        ← Seller dashboard: publish listing, image upload, accept/reject offers
│   └── bids.js            ← Buyer dashboard: track sent offers, withdraw, reveal seller contact
│
├── index.html             ← Login & Sign Up page
├── welcome.html           ← Post-registration welcome screen
├── marketplace.html       ← Browse all active listings
├── listings.html          ← Seller's dashboard
└── bids.html              ← Buyer's bid tracker
```

---

##  How It Works

### 1. Authentication Flow

```
Sign Up → Email Verification Link → Verified → Marketplace
Sign In → Check emailVerified → Redirect to Marketplace
```

- `auth.js` handles registration using `createUserWithEmailAndPassword`
- On signup, a user profile document is saved to Firestore (`/users/{uid}`) with name, email, and phone
- `sendEmailVerification()` sends a link to the student's `@sliet.ac.in` inbox
- Sign in is **blocked** until the email is verified — `emailVerified` is checked on every login
- `guard.js` runs on all inner pages (`marketplace`, `listings`, `bids`) and redirects unverified or logged-out users back to `index.html`

---

### 2. Listing a Product (`listings.js`)

```
Fill Form → Select Images → Click Publish
         ↓
   Upload images to Firebase Storage (parallel)
         ↓
   Save listing document to Firestore /listings
         ↓
   Appears live on Marketplace instantly
```

- Seller fills in title, category, condition, description, and price
- Chooses selling type: **Fixed Price** or **Open to Offers**
- Up to 3 images are uploaded to Firebase Storage under `listings/{userId}/`
- Listing document saved to `/listings` with status `active`
- The seller's own listings page uses `onSnapshot` for real-time updates

---

### 3. Browsing & Searching (`market.js`)

- Marketplace loads all `status == 'active'` listings ordered by `createdAt DESC` using `onSnapshot`
- Search bar filters by title and description in real time (client-side)
- Category chips filter by item type
- Clicking a card opens a detail modal with full info and action buttons
- If the item belongs to the logged-in user → shows "This is your listing" (no self-purchase)
- **Fixed Price** items → show seller's email on click
- **Open to Offers** items → show an inline offer form

---

### 4. Placing an Offer (`market.js → submitOffer`)

```
Buyer opens item → Clicks "Make an Offer" → Enters price + message
         ↓
   Anti-spam check: already have a pending/accepted offer for this item?
         ↓ (if not)
   Create document in /offers with status: 'pending'
```

- Before submitting, `submitOffer()` queries Firestore to check if the buyer already has a `pending` or `accepted` offer on the same listing — preventing duplicate bids
- Offer document stores: `listingId`, `listingTitle`, `sellerId`, `sellerName`, `buyerId`, `buyerName`, `buyerEmail`, `offerPrice`, `message`, `status`, `createdAt`
- **Note:** Seller's phone number is intentionally NOT stored here for privacy

---

### 5. Accepting an Offer (`listings.js → acceptOffer`)

This is the most critical operation — handled as an **atomic batch write**:

```
Seller clicks Accept on an offer
         ↓
   writeBatch:
   ├── listings/{id}  →  status: 'sold', buyerId: winner, soldAt: now
   └── offers/{id}    →  status: 'accepted'
         ↓
   Second batch: all remaining pending offers → status: 'rejected'
         ↓
   Buyer's bids page auto-updates via onSnapshot
```

- Uses `writeBatch()` so the listing and accepted offer are updated atomically — no partial state
- A second batch then rejects all other pending offers for that listing
- Once sold, the listing disappears from the marketplace automatically

---

### 6. Viewing & Managing Bids (`bids.js`)

- Buyer's bids page listens in real time using `onSnapshot` — status changes appear instantly
- **Pending** bids show a **Withdraw** button
- **Accepted** bids show a **View Contact** button
- **Rejected** bids show a **Remove** button (deletes the document)

**Seller Contact Reveal (Privacy Flow):**

```
Buyer clicks "View Contact"
         ↓
   Fetch offer document → verify status == 'accepted'
         ↓
   Fetch seller's /users/{uid} document
         ↓
   Display name + email + phone in modal
```

The seller's phone number lives **only** in their `/users` profile document. It is never stored in the offer. Only a buyer with an `accepted` offer can trigger this fetch — enforced both in JS logic and Firestore Security Rules.

---

##  Firestore Data Structure

### `/users/{uid}`
| Field | Type | Description |
|---|---|---|
| `uid` | string | Firebase Auth UID |
| `firstName` | string | First name |
| `lastName` | string | Last name |
| `name` | string | Full name (firstName + lastName) |
| `email` | string | College email |
| `phone` | string | Phone number (private) |
| `joinedAt` | string | ISO timestamp |

### `/listings/{listingId}`
| Field | Type | Description |
|---|---|---|
| `title` | string | Item title |
| `category` | string | Item category |
| `condition` | string | New / Good / Fair / Poor |
| `description` | string | Item description |
| `price` | number | Asking price (₹) |
| `sellingType` | string | `'fixed'` or `'offers'` |
| `images` | array | Firebase Storage URLs (max 3) |
| `sellerId` | string | Seller's UID |
| `sellerName` | string | Seller's display name |
| `sellerEmail` | string | Seller's email |
| `status` | string | `'active'` or `'sold'` |
| `buyerId` | string / null | UID of accepted buyer |
| `soldAt` | timestamp / null | When the deal was closed |
| `createdAt` | timestamp | Server timestamp |

### `/offers/{offerId}`
| Field | Type | Description |
|---|---|---|
| `listingId` | string | Reference to the listing |
| `listingTitle` | string | Denormalized title for display |
| `listingImage` | string | Denormalized image URL for bids page |
| `listingPrice` | number | Denormalized asking price for bids page |
| `sellerId` | string | Seller's UID |
| `sellerName` | string | Seller's display name |
| `buyerId` | string | Buyer's UID |
| `buyerName` | string | Buyer's display name |
| `buyerEmail` | string | Buyer's email |
| `offerPrice` | number | Buyer's offered price (₹) |
| `message` | string | Optional message from buyer |
| `status` | string | `'pending'` / `'accepted'` / `'rejected'` |
| `createdAt` | timestamp | Server timestamp |

---

##  Firestore Security Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User profiles: only the owner can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    // Listings: any verified user can read/create;
    // only the seller can update or delete their own listing
    match /listings/{listingId} {
      allow read:          if request.auth != null;
      allow create:        if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.sellerId;
    }

    // Offers: only the buyer and seller involved can read;
    // any verified user can create; only the seller can update status
    match /offers/{offerId} {
      allow read:   if request.auth != null &&
                    (request.auth.uid == resource.data.buyerId ||
                     request.auth.uid == resource.data.sellerId);
      allow create: if request.auth != null;
      allow update: if request.auth != null &&
                    request.auth.uid == resource.data.sellerId;
    }
  }
}
```

---

##  Required Firestore Indexes

These composite indexes must be created in the Firebase Console under **Firestore → Indexes**:

| Collection | Fields | Order |
|---|---|---|
| `listings` | `status`, `createdAt` | ASC, DESC |
| `listings` | `sellerId`, `createdAt` | ASC, DESC |
| `offers` | `buyerId`, `createdAt` | ASC, DESC |
| `offers` | `listingId`, `status`, `offerPrice` | ASC, ASC, DESC |
| `offers` | `listingId`, `buyerId`, `status` | ASC, ASC, ASC |

> Without these, Firestore will throw an error and provide a direct link to create the missing index automatically.

---

##  Running Locally

**1. Clone the repository**
```bash
git clone https://github.com/logicbyabhinav/sliet-market.git
cd sliet-market
```

**2. Start a local HTTP server** (required — `file://` protocol breaks Firebase Auth)

Using Node.js:
```bash
npx serve .
```
Then open `http://localhost:3000` in your browser.

Or using Python:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000`.

**3. Firebase Setup**

- Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
- Enable **Authentication → Email/Password**
- Enable **Firestore Database**
- Enable **Storage**
- Copy your config into `js/firebase.js`
- Add `localhost` and `127.0.0.1` to **Authentication → Settings → Authorized Domains**
- Apply the Security Rules from above
- Create the Firestore Indexes from the table above

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (ES Modules) |
| Authentication | Firebase Auth (Email/Password) |
| Database | Cloud Firestore (NoSQL, real-time) |
| File Storage | Firebase Storage |
| Hosting | Any static host (Firebase Hosting, Vercel, Netlify) |
| Build Tool | None — CDN imports only |

---

##  Author

**Abhinav Kishore**
GitHub: [@logicbyabhinav](https://github.com/logicbyabhinav)

---

##  License

This project is for educational and campus use. Not licensed for commercial redistribution.
