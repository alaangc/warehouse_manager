const STORAGE_KEY = 'stock-control:visited-customers'

export function getVisitedCustomerIds(initialIds: string[] = []) {
  try {
    const savedStatuses = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    const visitedIds = new Set(initialIds)

    if (Array.isArray(savedStatuses)) {
      savedStatuses.filter((id): id is string => typeof id === 'string').forEach((id) => visitedIds.add(id))
      return visitedIds
    }

    if (savedStatuses && typeof savedStatuses === 'object') {
      Object.entries(savedStatuses).forEach(([id, isVisited]) => isVisited ? visitedIds.add(id) : visitedIds.delete(id))
    }

    return visitedIds
  } catch {
    return new Set(initialIds)
  }
}

export function setCustomerVisitStatus(customerId: string, isVisited: boolean) {
  let savedStatuses: Record<string, boolean> = {}

  try {
    const storedValue = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    if (storedValue && typeof storedValue === 'object' && !Array.isArray(storedValue)) savedStatuses = storedValue as Record<string, boolean>
  } catch {
    savedStatuses = {}
  }

  savedStatuses[customerId] = isVisited
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedStatuses))
}
