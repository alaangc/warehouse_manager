import { ArrowLeft, BarChart3, Check, Circle, Home, MapPin, Menu, Package, Phone, ShoppingCart, Store, Truck } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { sampleDeliveries } from '../data/sample-deliveries'
import { getVisitedCustomerIds } from '../services/delivery-visits'

export function DeliveryCustomerDetailPage() {
  const { deliveryId, customerId } = useParams()
  const navigate = useNavigate()
  const delivery = sampleDeliveries.find(({ id }) => id === deliveryId)
  const customer = delivery?.customers.find(({ id }) => id === customerId)
  const [visitedCustomerIds] = useState(() => getVisitedCustomerIds(delivery?.customers.filter(({ status }) => status === 'visited').map(({ id }) => id)))

  if (!delivery || !customer) return <Navigate to="/inicio" replace />

  const isVisited = visitedCustomerIds.has(customer.id)

  return (
    <main className="customer-detail-page">
      <header className="detail-topbar">
        <button type="button" onClick={() => navigate(`/repartos/${delivery.id}`)} aria-label="Volver al reparto"><ArrowLeft size={21} /></button>
        <strong>Detalle del cliente</strong>
        <span aria-hidden="true" />
      </header>

      <div className="customer-detail-shell">
        <section className="customer-profile-card">
          <span className="customer-profile-icon"><Store size={30} aria-hidden="true" /></span>
          <div><p>{customer.id}</p><h1>{customer.name}</h1></div>
          <span className={`customer-detail-status customer-detail-status--${isVisited ? 'visited' : 'pending'}`}>{isVisited ? <Check size={14} /> : <Circle size={14} />}{isVisited ? 'Visitado' : 'Pendiente'}</span>
        </section>

        <section className="customer-information" aria-labelledby="customer-information-title">
          <h2 id="customer-information-title">Información del cliente</h2>
          <dl>
            <div><dt><MapPin size={18} />Dirección</dt><dd>{customer.address}</dd></div>
            <div><dt><Phone size={18} />Teléfono</dt><dd><a href={`tel:${customer.phone.replaceAll(' ', '')}`}>{customer.phone}</a></dd></div>
            <div><dt><Truck size={18} />Reparto asignado</dt><dd>#{delivery.id}</dd></div>
            <div><dt><Check size={18} />Estado de visita</dt><dd>{isVisited ? 'Cliente visitado' : 'Pendiente de visitar'}</dd></div>
          </dl>
        </section>

        <button className="return-delivery-button" type="button" onClick={() => navigate(`/repartos/${delivery.id}`)}>Volver al reparto</button>
      </div>

      <nav className="bottom-navigation" aria-label="Navegación principal">
        <button className="bottom-navigation__item" type="button" onClick={() => navigate('/inicio')}><Home size={20} /><span>Inicio</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Package size={20} /><span>Inventario</span></button>
        <button className="bottom-navigation__item bottom-navigation__item--active" type="button" onClick={() => navigate(`/repartos/${delivery.id}`)}><ShoppingCart size={20} /><span>Repartos</span></button>
        <button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} /><span>Reportes</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Menu size={20} /><span>Más</span></button>
      </nav>
    </main>
  )
}
