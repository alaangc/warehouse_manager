import { ArrowLeft, BarChart3, Box, Check, ChevronDown, ChevronRight, Circle, Home, Menu, Package, Pencil, Plus, Printer, ShoppingBag, ShoppingCart, Store, Truck, X } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { getVisitedCustomerIds, setCustomerVisitStatus } from '../services/delivery-visits'
import { addDeliveryCustomer, getDeliveryCustomers } from '../services/delivery-customers'
import { getDeliveries } from '../services/deliveries'

export function ActiveDeliveryPage() {
  const { deliveryId } = useParams()
  const navigate = useNavigate()
  const delivery = getDeliveries().find(({ id }) => id === deliveryId)
  const [customers, setCustomers] = useState(() => getDeliveryCustomers(delivery))
  const [finished, setFinished] = useState(false)
  const [visitedCustomerIds, setVisitedCustomerIds] = useState(() => getVisitedCustomerIds(customers.filter(({ status }) => status === 'visited').map(({ id }) => id)))
  const [openCustomerMenuId, setOpenCustomerMenuId] = useState<string | null>(null)
  const [isAddingCustomer, setIsAddingCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', address: '', phone: '' })

  if (!delivery) return <Navigate to="/inicio" replace />

  function finishDelivery() {
    if (window.confirm('¿Deseas finalizar este reparto? Esta acción cerrará el reparto de muestra.')) setFinished(true)
  }

  function markAsVisited(customerId: string) {
    setVisitedCustomerIds((currentIds) => {
      const nextIds = new Set(currentIds).add(customerId)
      setCustomerVisitStatus(customerId, true)
      return nextIds
    })
    setOpenCustomerMenuId(null)
  }

  function markAsPending(customerId: string) {
    setVisitedCustomerIds((currentIds) => {
      const nextIds = new Set(currentIds)
      nextIds.delete(customerId)
      setCustomerVisitStatus(customerId, false)
      return nextIds
    })
    setOpenCustomerMenuId(null)
  }

  function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const customer = {
      id: `CLI-${String(Date.now()).slice(-5)}`,
      name: newCustomer.name.trim(),
      status: 'pending' as const,
      note: 'Pendiente de visita',
      address: newCustomer.address.trim(),
      phone: newCustomer.phone.trim(),
      deliveredProducts: [],
    }
    addDeliveryCustomer(delivery!.id, customer)
    setCustomers((currentCustomers) => [...currentCustomers, customer])
    setNewCustomer({ name: '', address: '', phone: '' })
    setIsAddingCustomer(false)
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
            {delivery.observations ? <div><dt>Observaciones</dt><dd>{delivery.observations}</dd></div> : null}
          </dl>
        </section>

        <section className="detail-section" aria-labelledby="delivery-customers-title">
          <div className="detail-section-heading">
            <h2 id="delivery-customers-title">Clientes del reparto ({customers.length})</h2>
            <button className="add-customer-trigger" type="button" onClick={() => setIsAddingCustomer((isOpen) => !isOpen)} aria-expanded={isAddingCustomer} aria-controls="new-delivery-customer-form">{isAddingCustomer ? <X size={16} /> : <Plus size={16} />}{isAddingCustomer ? 'Cancelar' : 'Nuevo cliente'}</button>
          </div>
          {isAddingCustomer ? <form className="new-customer-form" id="new-delivery-customer-form" onSubmit={createCustomer}>
            <div className="new-customer-form-heading"><span><Store size={20} /></span><div><strong>Agregar cliente al reparto</strong><small>Se añadirá como pendiente de visita</small></div></div>
            <label>Nombre del cliente<input required value={newCustomer.name} onChange={(event) => setNewCustomer((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Abarrotes San José" /></label>
            <label>Dirección<input required value={newCustomer.address} onChange={(event) => setNewCustomer((current) => ({ ...current, address: event.target.value }))} placeholder="Calle, número y colonia" /></label>
            <label>Teléfono<input required type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer((current) => ({ ...current, phone: event.target.value }))} placeholder="632 000 0000" /></label>
            <button type="submit"><Plus size={17} /> Agregar cliente</button>
          </form> : null}
          <div className="customer-list">
            {customers.map((customer) => {
              const isVisited = visitedCustomerIds.has(customer.id)
              const isMenuOpen = openCustomerMenuId === customer.id
              return (
              <article className={`customer-row${isMenuOpen ? ' customer-row--open' : ''}`} key={customer.id}>
                <button
                  className="customer-row-toggle"
                  type="button"
                  onClick={() => setOpenCustomerMenuId(isMenuOpen ? null : customer.id)}
                  aria-expanded={isMenuOpen}
                  aria-controls={`customer-menu-${customer.id}`}
                  aria-label={`${isMenuOpen ? 'Ocultar' : 'Mostrar'} opciones de ${customer.name}`}
                >
                  <span className={`visit-marker visit-marker--${isVisited ? 'visited' : 'pending'}`}>{isVisited ? <Check size={13} /> : <Circle size={16} />}</span>
                  <span className="customer-avatar"><Store size={19} /></span>
                  <span className="customer-copy"><strong>{customer.name}</strong><small>{isVisited ? 'Visita realizada' : 'Pendiente de visita'}</small></span>
                  <span className="customer-expand-hint"><small>{isMenuOpen ? 'Cerrar' : 'Ver opciones'}</small><ChevronDown className={isMenuOpen ? 'customer-menu-chevron--open' : ''} size={18} aria-hidden="true" /></span>
                </button>
                {isMenuOpen ? (
                  <div className="customer-row-actions" id={`customer-menu-${customer.id}`}>
                    {!isVisited ? <button className="mark-visited-button" type="button" onClick={() => markAsVisited(customer.id)}><Check size={14} /> Marcar visitado</button> : null}
                    {isVisited ? <button className="edit-visit-button" type="button" onClick={() => markAsPending(customer.id)}><Pencil size={14} /> Editar estado</button> : null}
                    <button className="view-customer-button" type="button" onClick={() => navigate(`/repartos/${delivery.id}/clientes/${customer.id}`)}>Detalles</button>
                  </div>
                ) : null}
              </article>
              )
            })}
          </div>
          <button className="view-customers-button" type="button" onClick={() => navigate(`/repartos/${delivery.id}/clientes`)}>Ver todos los clientes <ChevronRight size={17} aria-hidden="true" /></button>
        </section>

        <button className="print-ticket-button" type="button" onClick={() => window.print()}><Printer size={20} aria-hidden="true" /> Imprimir ticket</button>
      </div>

      <nav className="bottom-navigation detail-navigation" aria-label="Navegación principal">
        <button className="bottom-navigation__item" type="button" onClick={() => navigate('/inicio')}><Home size={20} /><span>Inicio</span></button>
        <button className="bottom-navigation__item" type="button" onClick={() => navigate('/inventario')}><Package size={20} /><span>Inventario</span></button>
        <button className="bottom-navigation__item bottom-navigation__item--active" type="button"><ShoppingCart size={20} /><span>Repartos</span></button>
        <button className="bottom-navigation__item" type="button" disabled><BarChart3 size={20} /><span>Reportes</span></button>
        <button className="bottom-navigation__item" type="button" disabled><Menu size={20} /><span>Más</span></button>
      </nav>
    </main>
  )
}
