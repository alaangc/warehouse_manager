import { AlertTriangle, BarChart3, Box, CalendarCheck, ChevronRight, Home, LogOut, Menu, PackagePlus, ShoppingCart, Truck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getVisitedCustomerIds } from '../services/delivery-visits'
import { clearTemporarySession, getTemporaryUser } from '../services/temporary-auth'
import { getDeliveries } from '../services/deliveries'

const currencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export function HomePage() {
  const navigate = useNavigate()
  const user = getTemporaryUser()
  const [deliveries] = useState(getDeliveries)
  const [moreOpen, setMoreOpen] = useState(false)
  const [visitedCustomerIds] = useState(() => getVisitedCustomerIds(
    deliveries.flatMap(({ customers }) => customers.filter(({ status }) => status === 'visited').map(({ id }) => id)),
  ))
  const dailySalesCents = deliveries
    .flatMap(({ customers }) => customers)
    .reduce((total, customer) => visitedCustomerIds.has(customer.id) ? total + (customer.amountCents ?? 0) : total, 0)
  const summaryItems = [
    { label: 'Repartos activos', value: String(deliveries.length), icon: Box, tone: 'blue' },
    { label: 'Repartos finalizados', value: '0', icon: CalendarCheck, tone: 'green' },
    { label: 'Alertas de inventario', value: '0', icon: AlertTriangle, tone: 'orange' },
    { label: 'Ganancia del día', value: currencyFormatter.format(dailySalesCents / 100), icon: BarChart3, tone: 'purple' },
  ]

  function logout() {
    clearTemporarySession()
    navigate('/iniciar-sesion', { replace: true })
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-shell" aria-labelledby="welcome-title">
        <button className="dashboard-logout" type="button" onClick={logout}>
          <LogOut size={18} aria-hidden="true" /> <span>Cerrar sesión</span>
        </button>
        <header className="dashboard-welcome">
          <img className="dashboard-logo" src="/stock-control-logo.png" alt="" aria-hidden="true" />
          <div>
            <h1 id="welcome-title">¡Hola, {user?.displayName ?? 'Usuario'}!</h1>
            <p>Resumen general del día</p>
          </div>
        </header>

        <section className="summary-panel" aria-labelledby="summary-title">
          <h2 id="summary-title">Resumen rápido</h2>
          <div className="summary-grid">
            {summaryItems.map(({ label, value, icon: Icon, tone }) => (
              <article className="summary-item" key={label}>
                <span className={`summary-icon summary-icon--${tone}`}><Icon size={23} aria-hidden="true" /></span>
                <strong>{value}</strong>
                <span>{label}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="deliveries-section" aria-labelledby="deliveries-title">
          <div className="section-heading">
            <h2 id="deliveries-title">Repartos activos</h2>
            <button type="button" disabled>Ver todos <ChevronRight size={17} aria-hidden="true" /></button>
          </div>
          <div className="delivery-list">
            {deliveries.map((delivery) => (
              <button className="delivery-card" type="button" key={delivery.id} onClick={() => navigate(`/repartos/${delivery.id}`)}>
                <span className="delivery-card__icon"><Truck size={31} aria-hidden="true" /></span>
                <span className="delivery-card__content">
                  <strong>Reparto #{delivery.id}</strong>
                  <small>Repartidor: {delivery.driverName}</small>
                  <small>Inicio: {delivery.startTime}</small>
                </span>
                <span className="delivery-status">En ruta</span>
                <ChevronRight className="delivery-card__arrow" size={25} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <button className="add-delivery-button" type="button" onClick={() => navigate('/repartos/nuevo')}>
          <PackagePlus size={19} aria-hidden="true" /> Agregar reparto <ChevronRight size={18} aria-hidden="true" />
        </button>
      </section>

      {moreOpen && (
        <div className="more-menu" id="more-menu">
          <button type="button" onClick={logout}><LogOut size={18} aria-hidden="true" /> Cerrar sesión</button>
        </div>
      )}
      <nav className="bottom-navigation" aria-label="Navegación principal">
        <button className="bottom-navigation__item bottom-navigation__item--active" type="button"><Home size={20} aria-hidden="true" /><span>Inicio</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Box size={20} aria-hidden="true" /><span>Inventario</span></button>
        <button className="bottom-navigation__item" type="button" disabled><ShoppingCart size={20} aria-hidden="true" /><span>Repartos</span></button>
        <button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} aria-hidden="true" /><span>Reportes</span></button>
        <button className="bottom-navigation__item" type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-controls="more-menu"><Menu size={20} aria-hidden="true" /><span>Más</span></button>
      </nav>
    </main>
  )
}
