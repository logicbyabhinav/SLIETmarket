// ═══════════════════════════════════════════════════════════════
// js/listings.js — YOUR LISTINGS PAGE
// Handles: Publish listing, upload images, view offers, accept offer
// Used by: listings.html
// ═══════════════════════════════════════════════════════════════

import { db, storage } from "./firebase.js";

// Firestore functions
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch, // lets us update multiple documents at once atomically
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Storage functions (for uploading images)
import {
  ref, // creates a reference to a file location in Storage
  uploadBytes, // uploads a file
  getDownloadURL, // gets the public URL of an uploaded file
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── STATE ───────────────────────────────────────────────────────
let myListings = []; // seller's own listings
let sellingType = "fixed"; // currently selected selling type toggle
let uploadedFiles = []; // files selected for upload (max 3)

// ── TOGGLE: Fixed Price / Open to Offers ─────────────────────────
window.setToggle = function (type) {
  sellingType = type;
  document
    .getElementById("togFixed")
    .classList.toggle("active", type === "fixed");
  document
    .getElementById("togOffers")
    .classList.toggle("active", type === "offers");
};

// ── IMAGE PREVIEW ────────────────────────────────────────────────
// When user selects files, show small previews before uploading

window.previewImages = function (input) {
  const container = document.getElementById("previews");
  container.innerHTML = "";
  uploadedFiles = Array.from(input.files).slice(0, 3); // max 3 images

  uploadedFiles.forEach((file, i) => {
    const reader = new FileReader();
    // FileReader reads the file locally (in browser memory, no upload yet)
    reader.onload = (e) => {
      const div = document.createElement("div");
      div.className = "upload-preview-item";
      div.innerHTML = `
        <img src="${e.target.result}" alt="Preview"/>
        <div class="upload-preview-remove" onclick="removePreview(${i})">✕</div>`;
      container.appendChild(div);
    };
    reader.readAsDataURL(file); // converts image to base64 data URL for preview
  });
};

window.removePreview = function (index) {
  uploadedFiles.splice(index, 1);
  // Re-trigger preview with remaining files
  const dt = new DataTransfer();
  uploadedFiles.forEach((f) => dt.items.add(f));
  document.getElementById("fileInput").files = dt.files;
  window.previewImages(document.getElementById("fileInput"));
};

// ── UPLOAD IMAGES TO EXTERNAL STORAGE (ImgBB) ────────────────────────────
// Replaces Firebase Storage to avoid Billing/Blaze Plan requirements.
// Returns an array of direct HTTPS links.

async function uploadImages(userId) {
  const urls = [];
  const IMGBB_API_KEY = "8f85241389bb25cb235f7b8255f00365" || "d0fd8fb9709976aa0919b3e3aff64abf" ; // <-- Get from api.imgbb.com

  for (const file of uploadedFiles) {
    const formData = new FormData();
    formData.append("image", file);

    // Auto-delete the image from ImgBB after 90 days (3 months)
    // 7776000 seconds = 90 days
    formData.append("expiration", "7776000");

    try {
      // We use standard 'fetch' instead of Firebase SDK here
      const response = await fetch(
        `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
        {
          method: "POST",
          body: formData,
        },
      );

      const result = await response.json();

      if (result.success) {
        // ImgBB returns the direct link in result.data.url
        urls.push(result.data.url);
        console.log("Successfully hosted at ImgBB:", result.data.url);
      } else {
        console.error("ImgBB Error:", result.error.message);
      }
    } catch (error) {
      console.error("Network Error during image upload:", error);
    }
  }

  return urls;
}

// ── PUBLISH LISTING ──────────────────────────────────────────────
// Called when seller clicks "Publish Listing".
// Uploads images then saves the listing to Firestore.

window.publishListing = async function () {
  // 1. Read all form values
  const title = document.getElementById("fTitle").value.trim();
  const category = document.getElementById("fCat").value;
  const condition = document.getElementById("fCond").value;
  const description = document.getElementById("fDesc").value.trim();
  const price = document.getElementById("fPrice").value;

  // 2. Basic Validation
  if (!title) {
    showToast("Please enter a product title", "error");
    return;
  }
  if (!category) {
    showToast("Please select a category", "error");
    return;
  }
  if (!condition) {
    showToast("Please select item condition", "error");
    return;
  }
  if (!description) {
    showToast("Please describe your item", "error");
    return;
  }
  if (!price || price <= 0) {
    showToast("Please enter a valid price", "error");
    return;
  }
  if (!window.currentUser) {
    showToast("You must be logged in", "error");
    return;
  }

  // 3. UI Loading State
  const btn = document.getElementById("action");
  const originalHTML = btn.innerHTML;
  btn.innerHTML =
    '<span class="material-symbols-outlined">hourglass_empty</span> Processing...';
  btn.disabled = true;

  try {
    // 4. STEP 1: Upload images to External Storage (ImgBB)
    // We call the new uploadImages function we refactored earlier
    let imageUrls = [];
    if (uploadedFiles.length > 0) {
      showToast("Hosting images externally...", "info");
      imageUrls = await uploadImages(window.currentUser.uid);
    }

    if (imageUrls.length === 0 && uploadedFiles.length > 0) {
      throw new Error("Image hosting failed. Check API key or connection.");
    }

    // 5. STEP 2: Calculate Expiry Date (3 months from now)
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 3);

    // 6. STEP 3: Save listing to Firestore
    await addDoc(collection(db, "listings"), {
      title: title,
      category: category,
      condition: condition,
      description: description,
      price: Number(price),
      sellingType: sellingType,
      images: imageUrls, // Now containing i.ibb.co links

      sellerId: window.currentUser.uid,
      sellerName: window.currentProfile?.name || "Unknown",
      sellerEmail: window.currentUser.email,

      status: "active",
      buyerId: null,
      soldAt: null,

      createdAt: serverTimestamp(),
      expireAt: expiryDate, // Used for the auto-deletion policy
    });

    showToast("Listing is live! (Auto-expires in 3 months)", "success");

    // 7. Clear Form
    document.getElementById("fTitle").value = "";
    document.getElementById("fCat").value = "";
    document.getElementById("fCond").value = "";
    document.getElementById("fDesc").value = "";
    document.getElementById("fPrice").value = "";
    document.getElementById("previews").innerHTML = "";
    uploadedFiles = [];
  } catch (error) {
    console.error("Publish error:", error);
    showToast("Publish failed. Check console for details.", "error");
  } finally {
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
};

// ── LOAD MY LISTINGS (REAL-TIME) ─────────────────────────────────
// Fetches only the listings that belong to the logged-in seller.

function loadMyListings() {
  const user = window.currentUser;
  if (!user) return;

  // Query: listings WHERE sellerId == my UID, ordered by newest first
  const q = query(
    collection(db, "listings"),
    where("sellerId", "==", user.uid),
    orderBy("createdAt", "desc"),
  );

  // onSnapshot: real-time listener
  onSnapshot(q, (snapshot) => {
    myListings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderMyListings();
  });
}

// -- STATE TRACKER --
let editingListingId = null; // Stores the ID of the item being edited

// ── STEP 1: PRE-FILL THE FORM ───────────────────────────────────
window.prepEditListing = function (listingId) {
  const item = myListings.find((i) => i.id === listingId);
  if (!item) return;

  editingListingId = listingId; // "Lock" the form to this ID
  document.getElementById("cancelEditBtn").style.display = "block";
  // Fill existing inputs
  document.getElementById("fTitle").value = item.title;
  document.getElementById("fCat").value = item.category;
  document.getElementById("fCond").value = item.condition;
  document.getElementById("fDesc").value = item.description;
  document.getElementById("fPrice").value = item.price;
  setToggle(item.sellingType || "fixed");

  // Show existing images in the preview area
  const container = document.getElementById("previews");
  container.innerHTML = (item.images || [])
    .map(
      (url) => `
    <div class="upload-preview-item">
      <img src="${url}" alt="Existing Image"/>
      <div class="upload-preview-remove" onclick="this.parentElement.remove()">✕</div>
    </div>
  `,
    )
    .join("");

  // UI Change: Transform the Publish button into an Update button
  const actionBtn = document.getElementById("action");
  actionBtn.innerHTML = '<span class="material-symbols-outlined">save</span> Save Changes';
  actionBtn.onclick = window.updateListing;
  // Scroll the seller up to the form
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast("Editing: " + item.title, "info");
};

// ── STEP 2: SEND UPDATES TO FIREBASE ────────────────────────────
window.updateListing = async function () {
  if (!editingListingId) return;

  // 1. Collect updated values
  const title = document.getElementById("fTitle").value.trim();
  const category = document.getElementById("fCat").value;
  const condition = document.getElementById("fCond").value;
  const description = document.getElementById("fDesc").value.trim();
  const price = document.getElementById("fPrice").value;

 const btn = document.getElementById('action');
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Saving...";

  try {
    // 2. Handle Images
    let finalImages = [];
    if (uploadedFiles.length > 0) {
      // If user selected NEW files, upload them
      finalImages = await uploadImages(window.currentUser.uid);
    } else {
      // Otherwise, keep the ones currently shown in the preview div
      const imgs = document.querySelectorAll("#previews img");
      finalImages = Array.from(imgs).map((img) => img.src);
    }

    // 3. Update Firestore Document
    // updateDoc and doc are already imported at the top of this file
    const listingRef = doc(db, "listings", editingListingId);

    await updateDoc(listingRef, {
      title: title,
      category: category,
      condition: condition,
      description: description,
      price: Number(price),
      sellingType: sellingType,
      images: finalImages,
      updatedAt: serverTimestamp(), // Track when it was edited
    });

    showToast("Listing updated successfully!", "success");

    // 4. Reset everything back to "Publish" mode
    resetForm();
  } catch (error) {
    console.error("Firebase Update Error:", error);
    showToast("Failed to update listing", "error");
  } finally {
    btn.disabled = false;
  }
};

// ── STEP 3: RESET HELPER ────────────────────────────────────────
window.resetForm = function resetForm() {
  editingListingId = null;

  ["fTitle", "fCat", "fCond", "fDesc", "fPrice"].forEach(id => {
    document.getElementById(id).value = "";
  });

  document.getElementById("previews").innerHTML = "";
  uploadedFiles = [];

  document.getElementById("cancelEditBtn").style.display = "none";

  const actionBtn = document.getElementById("action");
  actionBtn.innerHTML =
    '<span class="material-symbols-outlined">publish</span> Publish Listing';
  // Reset onclick back to publishListing
  actionBtn.onclick = window.publishListing;
}

// ── RENDER MY LISTINGS GRID ──────────────────────────────────────
function renderMyListings() {
  const grid = document.getElementById("myListingsGrid");

  if (!myListings.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--txt-3);">
        <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:8px;">inventory_2</span>
        No listings yet. List your first item above!
      </div>`;
    return;
  }

  grid.innerHTML = myListings
    .map((item) => {
      const isSold = item.status === "sold";

      // The Logic: If sold, show Relist button. If active, show View Offers.
      const actionButton = isSold
        ? `<button class="btn btn-outline btn-sm" style="width:50%; margin-top:10px; border-color:var(--danger); color:var(--danger);" 
                 onclick="event.stopPropagation(); relistListing('${item.id}')">
           <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle;">refresh</span> 
           Relist
         </button>`
        : `<div style="display:flex; flex-direction:row; gap:8px; margin-top: auto; width:100%; justify-content:space-between; ">
      <button class="btn btn-primary btn-sm" style="width:46%; flex:1; margin-top:10px;" 
                 onclick="event.stopPropagation(); openOffersDialog('${item.id}')">
          Offers
         </button>
         <button class="btn btn-primary btn-sm" style="width:46%; flex:1; margin-top:10px;" 
                 onclick="event.stopPropagation(); prepEditListing('${item.id}')">
           Edit
         </button>
         </div>`;
      return `
      <article class="card" style="display:flex; flex-direction:column; ${isSold ? "opacity:.85;" : ""}">
        <div style="position:relative;aspect-ratio:4/3;overflow:hidden;background:var(--bg-input);">
          <img src="${item.images?.[0] || "https://via.placeholder.com/300x225?text=No+Image"}"
               alt="${item.title}" loading="lazy"
               style="width:100%;height:100%;object-fit:cover;${isSold ? "filter:grayscale(.8)" : ""}"/>
          
          <span class="badge-img badge-img-left ${isSold ? "badge-sold" : "badge-active"}" 
                style="background:${isSold ? "var(--danger)" : "var(--success)"}">
            ${isSold ? "Sold" : "Active"}
          </span>

          <div style="position:absolute;bottom:8px;right:8px;background:rgba(15,15,20,.88);
                      padding:4px 10px;border-radius:var(--r-sm);backdrop-filter:blur(8px);">
            <span class="txt-price" style="font-size:14px;">
              ₹${Number(item.price).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
        <div style="padding:10px 12px; display:flex; flex-direction:column; flex:1;">
          <div class="item-card-title">${item.title}</div>
          <div class="txt-muted" style="margin-top:3px; font-size:12px;">
            ${item.category} · ${isSold ? "Deal Closed" : "Accepting Bids"}
          </div>
          ${actionButton}
        </div>
      </article>`;
    })
    .join("");

  // For each active listing, fetch offer count to show badge
  myListings.forEach((item) => {
    if (item.status === "active") fetchOfferCount(item.id);
  });
}

// ── FETCH OFFER COUNT ────────────────────────────────────────────
// Gets how many pending offers exist for a listing
// and adds an orange badge to the card

async function fetchOfferCount(listingId) {
  const { getDocs } =
    await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const q = query(
    collection(db, "offers"),
    where("listingId", "==", listingId),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  // We can't easily add badges dynamically here without tracking DOM elements
  // This is a placeholder — in a full build you'd use offer subcollections
}

// ── OPEN OFFERS DIALOG ───────────────────────────────────────────
// Called when seller clicks on one of their listing cards.
// Fetches all pending offers for that listing from Firestore.

window.openOffersDialog = async function (listingId) {
  const item = myListings.find((i) => i.id === listingId);
  if (!item) return;

  // Fill dialog header
  document.getElementById("offerModalTitle").textContent = item.title;
  document.getElementById("offerModalPrice").textContent =
    `Asking price: ₹${Number(item.price).toLocaleString("en-IN")}`;

  const list = document.getElementById("offersList");
  list.innerHTML = `<p style="color:var(--txt-3);text-align:center;padding:20px;">Loading offers...</p>`;

  openModal("offersModal");

  try {
    // Fetch all PENDING offers for this specific listing
    const { getDocs } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const q = query(
      collection(db, "offers"),
      where("listingId", "==", listingId),
      where("status", "==", "pending"),
      where("sellerId", "==", window.currentUser.uid),
      orderBy("offerPrice", "desc"), // highest offer first
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      list.innerHTML = `
        <div style="text-align:center;padding:32px 0;color:var(--txt-3);">
          <span class="material-symbols-outlined" style="font-size:40px;display:block;margin-bottom:8px;">inbox</span>
          No offers yet
        </div>`;
      return;
    }

    // Render each offer row
    const offers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.innerHTML = offers
      .map(
        (offer) => `
      <div class="offer-row" id="offer-${offer.id}">
        <div class="offer-avatar">${offer.buyerName?.charAt(0) || "?"}</div>
        <div class="offer-info">
          <div class="offer-name">${offer.buyerName}</div>
          <div class="offer-msg">${offer.message || "No message"}</div>
        </div>
        <div class="offer-price">₹${Number(offer.offerPrice).toLocaleString("en-IN")}</div>
        <button class="btn btn-success btn-sm"
                onclick="acceptOffer('${listingId}', '${offer.id}', '${offer.buyerId}', '${offer.buyerName}')">
          Accept
        </button>
      </div>
    `,
      )
      .join("");
  } catch (error) {
    console.error("Fetch offers error:", error);
    list.innerHTML = `<p style="color:var(--danger);text-align:center;">Failed to load offers.</p>`;
  }
};

// ── ACCEPT OFFER ─────────────────────────────────────────────────
// The most important seller action.
// When seller clicks Accept, we need to:
// 1. Update the listing status to 'sold'
// 2. Set the listing's buyerId to the accepted buyer
// 3. Set the accepted offer status to 'accepted'
// 4. Set ALL other pending offers on this listing to 'rejected'
//
// We use writeBatch() to do all of this in ONE atomic operation.
// "Atomic" means: either ALL changes succeed, or NONE do.
// No half-updated state.

window.acceptOffer = async function (listingId, offerId, buyerId, buyerName) {
  const confirmed = confirm(`Accept offer from ${buyerName}?`);
  if (!confirmed) return;

  const btn = document
    .getElementById(`offer-${offerId}`)
    ?.querySelector(".btn-success");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Finalizing...";
  }

  try {
    const batch = writeBatch(db);

    // 1. Mark the LISTING as sold
    const listingRef = doc(db, "listings", listingId);
    batch.update(listingRef, {
      status: "sold",
      buyerId: buyerId,
      soldAt: serverTimestamp(),
    });

    // 2. Mark the WINNING offer (Abhinav) as accepted
    const acceptedOfferRef = doc(db, "offers", offerId);
    batch.update(acceptedOfferRef, { status: "accepted" });

    // 3. FETCH & REJECT ALL OTHERS (Satyam, etc.)
    // We do this INSIDE the same process to ensure Satyam is updated
    const { getDocs } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const otherOffersSnap = await getDocs(
      query(
        collection(db, "offers"),
        where("listingId", "==", listingId),
        where("status", "==", "pending"),
        where("sellerId", "==", window.currentUser.uid),
      ),
    );

    otherOffersSnap.docs.forEach((offerDoc) => {
      // If it's not the one we just accepted, it MUST be rejected
      if (offerDoc.id !== offerId) {
        batch.update(offerDoc.ref, { status: "rejected" });
      }
    });

    // 4. COMMIT EVERYTHING
    // This is the "Atomic" part. All updates happen at once.
    await batch.commit();

    showToast(`Deal closed! Other bidders have been notified.`, "success");
    closeModal("offersModal");
  } catch (error) {
    console.error("Accept offer error:", error);
    showToast("Failed to close deal. Check your console.", "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Accept";
    }
  }
};

// ── DELETE LISTING ────────────────────────────────────────────────
window.deleteListing = async function (listingId) {
  if (!confirm("Delete this listing? This cannot be undone.")) return;

  try {
    await deleteDoc(doc(db, "listings", listingId));
    showToast("Listing deleted", "info");
  } catch (error) {
    showToast("Failed to delete listing", "error");
  }
};

window.relistListing = async function (listingId) {
  if (!confirm("Relist and clear all old bids?")) return;

  try {
    const batch = writeBatch(db);

    // 1. Reset the Listing
    batch.update(doc(db, "listings", listingId), {
      status: "active",
      buyerId: null,
      soldAt: null,
    });

    // 2. Clear the "Accepted" status from the previous winner
    // This ensures no one thinks they still have a deal.
    const { getDocs } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const q = query(
      collection(db, "offers"),
      where("listingId", "==", listingId),
      where("sellerId", "==", window.currentUser.uid),
    );
    const snap = await getDocs(q);

    snap.docs.forEach((offerDoc) => {
      // Set everyone back to 'rejected' or 'pending' so the seller starts fresh
      batch.update(offerDoc.ref, { status: "rejected" });
    });

    await batch.commit();
    showToast("Relisted! All previous bids cleared.", "success");
  } catch (error) {
    console.error("Relist Batch Error:", error);
    showToast("Relist failed.", "error");
  }
};

// ── INIT ─────────────────────────────────────────────────────────
// Wait for guard.js to finish auth check before loading data.
// guard.js sets window.currentUser — we poll until it's ready.

function waitForUserThenLoad() {
  if (window.currentUser) {
    loadMyListings();
  } else {
    // Check again in 200ms — guard.js is still working
    setTimeout(waitForUserThenLoad, 200);
  }
}

document.addEventListener("DOMContentLoaded", waitForUserThenLoad);