# PalitPaddleBai Mart Responsive UI QA

Responsive hardening checklist for the Phase 0-10 UI. This document does not
authorize changes to transaction logic, order lifecycle, reviews, RPCs, RLS, or
seller ownership.

## Automated Browser Checks

Run against the Vite development server with Chrome DevTools device metrics.
The viewport passes when `documentElement.scrollWidth` and `body.scrollWidth`
do not exceed `documentElement.clientWidth`.

| Viewport | Page edge | Horizontal overflow | Navigation |
|---|---:|---|---|
| 375px | 16px | PASS | Drawer |
| 390px | 16px | PASS | Drawer |
| 430px | 16px | PASS | Drawer |
| 768px | 24px | PASS | Drawer |
| 1024px | 24px | PASS | Drawer |
| 1440px | 32px | PASS | Desktop nav |

Browser-checked public routes:

- [x] Home
- [x] Marketplace
- [x] Paddle recommendations
- [x] Sign in
- [x] Register
- [x] Mobile navigation drawer locks body scroll and keeps focus contained
- [x] Marketplace filter drawer locks body scroll and keeps focus contained
- [x] Text inputs remain 16px at mobile widths
- [x] Cards and forms retain internal padding

## Authenticated Route Checks

Run these with reusable buyer and seller accounts. Repeat at 375px, 390px,
430px, 768px, 1024px, and 1440px.

- [ ] Profile
- [ ] Preferences
- [ ] Favorites
- [ ] Inquiries and inquiry detail
- [ ] Cart
- [ ] Checkout
- [ ] Buyer orders
- [ ] Buyer order detail and payment submission
- [ ] Review form
- [ ] Seller dashboard
- [ ] Seller listings and listing editor
- [ ] Seller profile and payment methods
- [ ] Seller orders and order detail
- [ ] Seller payment approval/rejection
- [ ] Seller fulfillment actions
- [ ] Seller reviews

## Per-Page Checklist

Apply every check to every route above.

- [ ] Page content has 16px minimum mobile edge spacing
- [ ] Cards have 16-20px mobile and 20-32px tablet/desktop padding
- [ ] Text inputs have 14-16px internal padding and 16px text
- [ ] Buttons and icon controls have a 44px minimum touch target
- [ ] Primary mobile actions are full width where appropriate
- [ ] Unrelated sections have 20-48px responsive separation
- [ ] Multi-column forms collapse to one column on mobile
- [ ] Order details and summaries stack without compressed sidebars
- [ ] Long references, tracking values, addresses, and reviews wrap
- [ ] Images preserve their aspect ratio
- [ ] Dialogs fit inside the dynamic viewport and scroll internally
- [ ] Focus indicators remain visible
- [ ] Loading, error, and empty states use finished-content padding
- [ ] No unwanted horizontal document scrolling

## Transaction Regression

Run sequentially because the hosted verifiers share accounts.

- [ ] `node verify-phase8.mjs`
- [ ] `node verify-phase9.mjs`
- [ ] `node verify-phase10.mjs`

## Required Validation

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run build`
