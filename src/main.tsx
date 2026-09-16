import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { AuthProvider } from './features/auth/AuthProvider'
import { SellerProvider } from './features/seller/SellerProvider'
import { FavoritesProvider } from './features/favorites/FavoritesProvider'
import { CartProvider } from './features/cart/CartProvider'
import { NotificationsProvider } from './features/notifications/NotificationsProvider'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <SellerProvider>
        <FavoritesProvider>
          <CartProvider>
            <NotificationsProvider>
              <RouterProvider router={router} />
            </NotificationsProvider>
          </CartProvider>
        </FavoritesProvider>
      </SellerProvider>
    </AuthProvider>
  </StrictMode>,
)
