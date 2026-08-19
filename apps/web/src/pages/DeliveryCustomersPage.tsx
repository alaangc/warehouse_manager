import { ArrowLeft, BarChart3, Check, Circle, Home, Menu, Package, Search, ShoppingCart, Store } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { sampleDeliveries } from '../data/sample-deliveries'
import { getVisitedCustomerIds } from '../services/delivery-visits'

export function DeliveryCustomersPage() {
  const { deliveryId } = useParams()
  const navigate = useNavigate()
  const delivery = sampleDeliveries.find(({ id }) => id === deliveryId)
  const [query, setQuery] = useState('')
  const [visitedCustomerIds] = useState(() => getVisitedCustomerIds(delivery?.customers.filter(({ status }) => status === 'visited').map(({ id }) => id)))

  if (!delivery) return <Navigate to="/inicio" replace />

  const normalizedQuery = query.trim().toLocaleLowerCase('es-MX')
  const filteredCustomers = normalizedQuery
    ? delivery.customers.filter(({ name, id }) => `${name} ${id}`.toLocaleLowerCase('es-MX').includes(normalizedQuery))
    : delivery.customers
  const visitedCount = visitedCustomerIds.size
  const pendingCount = delivery.customers.length - visitedCount

  return (
    <main className="delivery-customers-page">
      <header className="detail-topbar">
        <button type="button" onClick={() => navigate(`/repartos/${delivery.id}`)} aria-label="Volver al reparto"><ArrowLeft size={21} /></button>
        <strong>Clientes del reparto</strong>
        <span aria-hidden="true" />
      </header>

      <div className="delivery-customers-shell">
        <section className="customers-heading">
          <span><Store size={27} aria-hidden="true" /></span>
          <div><h1>Clientes asignados</h1><p>Reparto #{delivery.id}</p></div>
        </section>

        <section className="customer-progress" aria-label="Resumen de clientes">
          <div><strong>{delivery.customers.length}</strong><span>Total</span></div>
          <div><strong>{visitedCount}</strong><span>Visitados</span></div>
          <div><strong>{pendingCount}</strong><span>Pendientes</span></div>
        </section>

        <label className="customer-search">
          <Search size={19} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente o código" aria-label="Buscar clientes" />
        </label>

        <section aria-labelledby="customer-results-title">
          <div className="customer-results-heading"><h2 id="customer-results-title">Clientes ({filteredCustomers.length})</h2><span>{delivery.origin}</span></div>
          {filteredCustomers.length ? (
            <div className="customers-page-list">
              {filteredCustomers.map((customer, index) => {
                const isVisited = visitedCustomerIds.has(customer.id)
                return (
                <article className="customers-page-card" key={customer.id}>
                  <button
                    className="customer-card-main"
                    type="button"
                    onClick={() => navigate(`/repartos/${delivery.id}/clientes/${customer.id}`)}
                    aria-label={`Ver cliente ${customer.name}`}
                  >
                  <span className={`visit-marker visit-marker--${isVisited ? 'visited' : 'pending'}`}>{isVisited ? <Check size={13} /> : <Circle size={16} />}</span>
                  <span className="customer-avatar"><Store size={20} /></span>
                  <span className="customer-copy">
                    <strong>{customer.name}</strong>
                    <small>{customer.id} · Parada {index + 1}</small>
                    <small>{isVisited ? 'Visita realizada' : 'Pendiente de visita'}</small>
                  </span>
                  <span className={`customer-status customer-status--${isVisited ? 'visited' : 'pending'}`}>{isVisited ? 'VISITADO' : 'PENDIENTE'}</span>
                  <strong className="customer-amount">{customer.amount ?? '—'}</strong>
                  </button>
                </article>
                )
              })}
            </div>
          ) : <div className="customers-empty"><Search size={28} aria-hidden="true" /><p>No encontramos clientes con esa búsqueda.</p></div>}
        </section>
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
