import { ArrowLeft, BarChart3, Box, Check, ChevronRight, Circle, Home, Menu, Package, Printer, ShoppingBag, ShoppingCart, Store, Truck } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { sampleDeliveries } from '../data/sample-deliveries'

export function ActiveDeliveryPage() {
  const { deliveryId } = useParams()
  const navigate = useNavigate()
  const delivery = sampleDeliveries.find(({ id }) => id === deliveryId)
  const [finished, setFinished] = useState(false)

  if (!delivery) return <Navigate to="/inicio" replace />

  function finishDelivery() {
    if (window.confirm('¿Deseas finalizar este reparto? Esta acción cerrará el reparto de muestra.')) setFinished(true)
  }

  return (
    <main className="delivery-detail-page">
      <header className="detail-topbar">
        <button type="button" onClick={() => navigate('/inicio')} aria-label="Volver al inicio"><ArrowLeft size={21} /></button>
        <strong>Detalle del reparto</strong>
        <span aria-hidden="true" />
      </header>

      <div className="delivery-detail-shell">
        <section className="detail-title">
          <span><Box size={28} aria-hidden="true" /></span>
          <div><h1>Reparto activo</h1><p>Resumen general del reparto</p></div>
        </section>

        <section className="delivery-state-bar">
          <span className={`state-pill ${finished ? 'state-pill--closed' : ''}`}>{finished ? 'FINALIZADO' : 'EN CURSO'}</span>
          <small>Iniciado hoy, {delivery.startedAt}</small>
          <button type="button" onClick={finishDelivery} disabled={finished}>{finished ? 'Reparto finalizado' : 'Finalizar reparto'}</button>
        </section>

        <section className="detail-section" aria-labelledby="delivery-summary-title">
          <h2 id="delivery-summary-title">Resumen del reparto</h2>
          <div className="delivery-summary-card">
            <div className="account-summary">
              <span><Store size={25} aria-hidden="true" /></span>
              <div><strong>{delivery.accountName}</strong><small>Código: {delivery.accountCode}</small></div>
              <em>ACTIVO</em>
            </div>
            <div className="delivery-metrics">
              <div><span><Box size={22} /></span><small>Total de artículos</small><strong>{delivery.totalItems}</strong><em>unidades</em></div>
              <div><span><Truck size={22} /></span><small>Productos cargados</small><strong>{delivery.loadedProducts}</strong><em>unidades</em></div>
              <div><span><ShoppingBag size={22} /></span><small>Productos vendidos</small><strong>{delivery.soldProducts}</strong><em>unidades</em></div>
            </div>
          </div>
        </section>

        <section className="detail-section" aria-labelledby="delivery-info-title">
          <h2 id="delivery-info-title">Información del reparto</h2>
          <dl className="delivery-info-card">
            <div><dt>Repartidor</dt><dd>{delivery.driverName}</dd></div>
            <div><dt>Vehículo</dt><dd>{delivery.vehicle}</dd></div>
            <div><dt>Sucursal de origen</dt><dd>{delivery.origin}</dd></div>
            <div><dt>Fecha de inicio</dt><dd>{delivery.startedAt}</dd></div>
          </dl>
        </section>

        <section className="detail-section" aria-labelledby="delivery-customers-title">
          <div className="detail-section-heading"><h2 id="delivery-customers-title">Clientes del reparto ({delivery.customers.length})</h2><button type="button">Ver ruta <ChevronRight size={15} /></button></div>
          <div className="customer-list">
            {delivery.customers.map((customer) => (
              <article className="customer-row" key={customer.id}>
                <span className={`visit-marker visit-marker--${customer.status}`}>{customer.status === 'visited' ? <Check size={13} /> : <Circle size={16} />}</span>
                <span className="customer-avatar"><Store size={19} /></span>
                <span className="customer-copy"><strong>{customer.name}</strong><small>{customer.note}</small></span>
                <span className={`customer-status customer-status--${customer.status}`}>{customer.status === 'visited' ? 'VISITADO' : 'PENDIENTE'}</span>
                <strong className="customer-amount">{customer.amount ?? '—'}</strong>
              </article>
            ))}
          </div>
        </section>

        <button className="print-ticket-button" type="button" onClick={() => window.print()}><Printer size={20} aria-hidden="true" /> Imprimir ticket</button>
      </div>

      <nav className="bottom-navigation detail-navigation" aria-label="Navegación principal">
        <button className="bottom-navigation__item" type="button" onClick={() => navigate('/inicio')}><Home size={20} /><span>Inicio</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Package size={20} /><span>Inventario</span></button>
        <button className="bottom-navigation__item bottom-navigation__item--active" type="button"><ShoppingCart size={20} /><span>Repartos</span></button>
        <button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} /><span>Reportes</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Menu size={20} /><span>Más</span></button>
      </nav>
    </main>
  )
}
