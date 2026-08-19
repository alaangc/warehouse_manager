import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ActiveDeliveryPage } from './pages/ActiveDeliveryPage'
import { DeliveryCustomersPage } from './pages/DeliveryCustomersPage'
import { DeliveryCustomerDetailPage } from './pages/DeliveryCustomerDetailPage'
import { hasTemporarySession } from './services/temporary-auth'

function ProtectedRoute() {
  return hasTemporarySession()
    ? <Outlet />
    : <Navigate to="/iniciar-sesion" replace />
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/iniciar-sesion" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/inicio" element={<HomePage />} />
          <Route path="/repartos/:deliveryId" element={<ActiveDeliveryPage />} />
          <Route path="/repartos/:deliveryId/clientes" element={<DeliveryCustomersPage />} />
          <Route path="/repartos/:deliveryId/clientes/:customerId" element={<DeliveryCustomerDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/iniciar-sesion" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
