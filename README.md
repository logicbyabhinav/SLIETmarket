SLIET Market Project Documentation
This documentation serves as the primary technical reference for the SLIET Market repository. The application is a peer-to-peer marketplace designed for students to trade items within a localized campus environment. It utilizes a serverless architecture powered by Firebase.

Project File Structure
The project follows a modular frontend-focused structure to ensure separation of concerns between styling, database configuration, and business logic.

```
/slietmarket
│
├── /css
│   └── style.css           (Global UI variables, component layouts, and card designs)
│
├── /js
│   ├── app.js              (Application entry point and global UI initializers)
│   ├── auth.js             (User registration, login, and profile creation logic)
│   ├── bids.js             (Buyer dashboard: tracking and managing sent offers)
│   ├── firebase.js         (Firebase SDK initialization and service exports)
│   ├── guard.js            (Route protection: redirects unauthorized users to login)
│   ├── listings.js         (Seller dashboard: accepting bids and atomic relisting)
│   └── market.js           (Marketplace feed: real-time listings, search, and filters)
│
├── bids.html               (Interface for viewing personal bidding history)
├── index.html              (Landing page and navigation hub)
├── listings.html           (Seller-specific dashboard for item management)
├── marketplace.html        (Public browsing interface for all active items)
└── welcome.html            (Onboarding or post-login redirect page)
```
Authentication Workflow
The system implements Firebase Authentication (Email/Password) to secure student transactions.

Registration: New users sign up via auth.js. Upon successful authentication, a corresponding document is created in the /users Firestore collection to store profile metadata such as the display name.

Session Management: The guard.js script runs on every protected page. It checks the current authentication state; if no valid user is detected, it forces a redirect to the index.html/login page.

Access Control: Security is maintained by checking the request.auth.uid against the sellerId or buyerId fields in the database.

Database Structure (Cloud Firestore)
The application uses a NoSQL document-based structure. Data is organized into three core collections.

1. Users (/users)
Document ID: User UID

Fields: name, email, createdAt

2. Listings (/listings)
Fields: title, description, price, category, condition, images (Base64), sellerId, sellerName, status (active/sold), createdAt

3. Offers (/offers)
Fields: listingId, listingTitle, sellerId, buyerId, buyerName, offerPrice, status (pending/accepted/rejected), message, createdAt

Data Management Logic
Offer Submission and Integrity
To prevent database clutter, the submission logic in market.js includes a pre-flight check. Users are restricted from placing multiple bids on a single item if they already have an active offer. This ensures a clean data stream for the seller.

Atomic Deal Closure (Batch Writes)
When a seller accepts an offer in listings.js, the system utilizes a writeBatch to ensure data consistency. As a single atomic transaction:

The listing status is updated to sold.

The winning offer status is updated to accepted.

All other pending offers for that specific listing are automatically updated to rejected.

Dispute and Relisting Flow
The relisting function is designed to handle cancelled deals. When triggered:

The listing status is reverted to active.

The buyerId and soldAt fields are cleared.

All existing offers (including previously accepted ones) are set to rejected, resetting the bidding ecosystem for that item.

Firestore Security Rules
The following rules govern read/write access to ensure students can only modify their own data:

JavaScript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User profiles: Read/Write only by the owner
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }

    // Listings: Public read, but only the seller can update/delete
    match /listings/{listingId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.sellerId;
    }

    // Offers: Private between buyer and seller; seller manages status
    match /offers/{offerId} {
      allow read: if request.auth != null && 
                  (request.auth.uid == resource.data.buyerId || 
                   request.auth.uid == resource.data.sellerId);
      allow create: if request.auth != null;
      allow update: if request.auth != null && 
                    request.auth.uid == resource.data.sellerId;
    }
  }
}
Image Storage Configuration
Due to standard tier constraints on Cloud Storage buckets, the project utilizes Base64 encoding for product images.

Processing: Images are compressed and converted to Base64 strings on the client side before submission.

Storage: Encoded strings are stored directly within the listing document in Firestore.

Optimization: The system limits document size to ensure stay within the 1MB Firestore limit.

Firestore rules work on a Request vs. Resource logic. Every time your code tries to touch a document, the "Security Guard" checks two things:

Request: Who is asking? (request.auth.uid)

Resource: What does the data currently say? (resource.data.sellerId)

1. The Listing Protection Logic
In your listings rules, we use the following logic:
allow update, delete: if request.auth.uid == resource.data.sellerId;

Scenario: Abhinav wants to delete a listing.

The Check: The Guard looks at the listing document. If the sellerId field inside that document is Abhinav_123 and his login ID is also Abhinav_123, the action is Allowed.

Prevention: If Aryan tries to send a "Delete" command for Abhinav's item, the IDs won't match, and Firestore returns a Permission Denied error instantly.

2. The Private Offer Logic
Offers are sensitive because they contain private prices and messages. We use a Logical OR (||) to ensure privacy:
allow read: if (request.auth.uid == resource.data.buyerId || request.auth.uid == resource.data.sellerId);

The Check: This rule ensures that a "Third Party" (like Satyam) cannot see the price Abhinav offered to Aryan.

Result: Only the two people involved in the potential deal have the "Key" to read that specific document.

Data Management and Status Updates
The rules also control what can be changed, not just who can change it.

The Seller’s Authority
In the offers collection, we have a specific rule:
allow update: if request.auth.uid == resource.data.sellerId;

This is critical for your "Accept" and "Relist" functions. Even though Abhinav (the buyer) created the offer, he cannot change the status to "Accepted" himself. Only the Seller has the authority to flip that switch.

Why the "Relist" and "Accept" Functions were failing before
When we were debugging the "Aryan vs. Abhimanyu" incident, the "Missing or Insufficient Permissions" error happened because of Rule-Query Alignment:

The Rule Requirement: The rule says: "You can only update if you are the seller."

The Code Mistake: Initially, our code asked for "All pending offers for Item A."

The Security Conflict: The Guard blocked this because the query was too broad. It didn't "prove" it was only looking for the seller's items.

The Fix: By adding where('sellerId', '==', currentUser.uid) to your JavaScript, the code "proved" to the Guard that it was only touching authorized data, allowing the batch to pass.

Summary of Rules Working
Authentication: Every rule starts with request.auth != null, ensuring no anonymous "guest" can mess with the market.

Ownership: The resource.data check ensures that once an ID is stamped on a piece of data, only that ID can modify it.

Atomic Integrity: During a Batch Write, the rules check every single document in the batch. If even one "Reject" update for a losing bidder fails the ownership test, the entire transaction is cancelled to prevent data corruption.
