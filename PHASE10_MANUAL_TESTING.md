# Phase 10 — Manual Browser Test Checklist

Run these flows against the local dev server (`npm run dev`) using the
confirmed Phase 7/8/9 test accounts (the same ones used by
`verify-phase10.mjs`; their credentials live in the gitignored `.env.local`).
Automated coverage already exists for the DB boundaries (`verify-phase10.mjs`)
and the UI wiring (`tests/unit/*`); this checklist validates the in-browser
journey a real user experiences.

**Accounts** (use separate/incognito windows):

| Window  | Account                          |
| ------- | -------------------------------- |
| 1       | `PHASE7_TEST_SELLER_EMAIL`       |
| 2       | `PHASE7_TEST_BUYER_EMAIL`        |
| 3 (optional) | `PHASE8_TEST_BUYER_B_EMAIL` / `PHASE8_TEST_SELLER_B_EMAIL` |

## 0. Pre-flight

- [ ] `npm run dev` starts and loads `http://localhost:5173` ("Buy. Sell. Play Better.").
- [ ] Sign in as the buyer in window 2 and as the seller in window 1.
- [ ] As the seller, confirm there is at least one active listing that a buyer
      can order (create one in Seller Dashboard if needed).

## 1. Completed order → review happy path

1. Buyer window: open the seller's listing, add to cart, check out (pickup or
   delivery — both work).
2. Drive the order to **Completed** (confirm → pay (cash at pickup or
   manual-transfer proof) → prepare/ship/ready → **Confirm received**). This
   is the Phase 9 journey; see `PHASE9_MANUAL_TESTING.md` if a step escapes you.
3. On the buyer order detail page each completed order item must show a
   **Review this item** link.
4. Click **Review this item** → the review page shows the product title.
5. Pick a product star (1–5) and a seller star (1–5) and type a comment.
   Submit → you land back on the order with **✓ Reviewed** next to that item
   (only for completed orders; a not-yet-completed item must never show a
   review link).

## 2. Validation (review form)

1. Open a review link and click **Submit review** without picking stars →
   inline "… is required." errors; nothing submits until both ratings are
   chosen (test in the app: the form is `noValidate`, so try submitting both
   empty and half-filled).
2. Type a comment > 2000 characters → inline character error.
3. As the buyer, review a second distinct item of the same completed order →
   allowed (each item is independently reviewable).

## 3. One review per item (server)

1. After submitting a review, revisit the review URL (paste the same
   `/orders/:id/review/:itemId`). The product/seller stars may re-render from
   the empty default, but **submitting again must fail** with the "You have
   already reviewed this item." error (the RPC + DB unique constraint reject
   it) — a second review is never created.
2. Back on the order page, the reviewed item shows **✓ Reviewed** and no
   second review link.

## 4. Listing review section (storefront)

1. Open the reviewed listing's detail page (window 2, or logged-out window).
   Expect the review section: average rating, exact star distribution, and the
   review card showing the buyer's display name (or "Verified Buyer"),
   **Verified purchase** label, the comment, and stars, newest first.
2. With 2+ items reviewed across orders, pagination arrows/page links present
   if more than the page size.
3. Logged-out (anonymous) window reloads the listing page → the same review
   section renders for visitors.

## 5. Seller profile reviews

1. Open the seller's **public profile page** (`/sellers/:id` or via the store
   link on a listing). Expect the **Seller reviews** panel with the aggregate
   header (average of the **seller** stars) and the review list with the
   listing title shown on each card.

## 6. Guardrails (UI visibility only; the DB already enforces these)

1. As the seller, open a buyer's completed order URL. Never attempt a review —
   the review link/button must simply not be present in the seller's UI.
2. As a stranger (window 3 or incognito without the buyer session), open the
   buyer's review URL → "Order not found".
3. Try to force a review of a pending/confirmed order item via the URL → the
   page shows the "Order not completed yet" empty state.

## 7. Regression sanity

- Marketplace listing card/badges and the home page must be unchanged; search
  still works.
- An order that is not yet completed keeps its Phase 9 payment/fulfillment
  UI intact; the review link appears **only** once `Completed`.

## Report back

Mark each box ✅/❌ (with the failing step + console errors if any). I'll
fold the results into the final Phase 10 build report.