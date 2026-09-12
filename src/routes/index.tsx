import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import GuestRoute from '../components/auth/GuestRoute'
import SellerRoute from '../components/seller/SellerRoute'
import HomePage from '../pages/HomePage'
import NotFoundPage from '../pages/NotFoundPage'
import LoginPage from '../pages/auth/LoginPage'
import RegisterPage from '../pages/auth/RegisterPage'
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '../pages/auth/ResetPasswordPage'
import DashboardPage from '../pages/DashboardPage'
import AccountSuspendedPage from '../pages/AccountSuspendedPage'
import ProfilePage from '../pages/account/ProfilePage'
import PreferencesPage from '../pages/account/PreferencesPage'
import FavoritesPage from '../pages/account/FavoritesPage'
import InquiriesPage from '../pages/account/InquiriesPage'
import InquiryDetailPage from '../pages/account/InquiryDetailPage'
import ApplicationErrorPage from '../components/common/ApplicationErrorPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <ApplicationErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        element: <GuestRoute />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'cart', lazy: async () => ({ Component: (await import('../pages/cart/CartPage')).default }) },
          { path: 'checkout', lazy: async () => ({ Component: (await import('../pages/cart/CheckoutPage')).default }) },
          { path: 'order/review/:listingId', lazy: async () => ({ Component: (await import('../pages/orders/ReviewOrderPage')).default }) },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'preferences', element: <PreferencesPage /> },
          { path: 'favorites', element: <FavoritesPage /> },
          { path: 'inquiries', element: <InquiriesPage /> },
          { path: 'inquiries/:inquiryId', element: <InquiryDetailPage /> },
          { path: 'orders', lazy: async () => ({ Component: (await import('../pages/orders/BuyerOrdersPage')).default }) },
          { path: 'orders/:orderId', lazy: async () => ({ Component: (await import('../pages/orders/BuyerOrderDetailPage')).default }) },
          { path: 'orders/:orderId/dispute', lazy: async () => ({ Component: (await import('../pages/disputes/OpenOrderDisputePage')).default }) },
          { path: 'orders/:orderId/review/:orderItemId', lazy: async () => ({ Component: (await import('../pages/orders/ReviewItemPage')).default }) },
          { path: 'disputes', lazy: async () => ({ Component: (await import('../pages/disputes/BuyerDisputesPage')).default }) },
          { path: 'disputes/:disputeId', lazy: async () => ({ Component: (await import('../pages/disputes/BuyerDisputeDetailPage')).default }) },
          { path: 'seller/onboarding', lazy: async () => ({ Component: (await import('../pages/seller/SellerOnboardingPage')).default }) },
          { path: 'seller/status', lazy: async () => ({ Component: (await import('../pages/seller/SellerStatusPage')).default }) },
          {
            path: 'seller',
            element: <SellerRoute />,
            children: [
              { index: true, element: <Navigate to="dashboard" replace /> },
              { path: 'dashboard', lazy: async () => ({ Component: (await import('../pages/seller/SellerDashboardPage')).default }) },
              { path: 'profile', lazy: async () => ({ Component: (await import('../pages/seller/SellerProfilePage')).default }) },
              { path: 'payment-methods', lazy: async () => ({ Component: (await import('../pages/seller/SellerPaymentSettingsPage')).default }) },
              { path: 'orders', lazy: async () => ({ Component: (await import('../pages/orders/SellerOrdersPage')).default }) },
              { path: 'orders/:orderId', lazy: async () => ({ Component: (await import('../pages/orders/SellerOrderDetailPage')).default }) },
              { path: 'listings', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingsPage')).default }) },
              { path: 'listings/new', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingFormPage')).default }) },
              { path: 'listings/:listingId', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingDetailPage')).default }) },
              { path: 'listings/:listingId/edit', lazy: async () => ({ Component: (await import('../pages/seller/SellerListingFormPage')).default }) },
              { path: 'reviews', lazy: async () => ({ Component: (await import('../pages/seller/SellerReviewsPage')).default }) },
              { path: 'disputes', lazy: async () => ({ Component: (await import('../pages/disputes/SellerDisputesPage')).default }) },
              { path: 'disputes/:disputeId', lazy: async () => ({ Component: (await import('../pages/disputes/SellerDisputeDetailPage')).default }) },
            ],
          },
        ],
      },
      { path: 'marketplace', lazy: async () => ({ Component: (await import('../pages/marketplace/MarketplacePage')).default }) },
      { path: 'marketplace/:listingId', lazy: async () => ({ Component: (await import('../pages/marketplace/ListingDetailPage')).default }) },
      { path: 'recommendations', lazy: async () => ({ Component: (await import('../pages/recommendations/RecommendationsPage')).default }) },
      { path: 'sellers/:sellerId', lazy: async () => ({ Component: (await import('../pages/seller/PublicSellerProfilePage')).default }) },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'account-suspended', element: <AccountSuspendedPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
