import type { Customer, Site, Contact, Device, Intervention } from '@/types'

// ============================================================
// CUSTOMERS (billing entities)
// ============================================================

export const customers: Customer[] = [
  {
    id: 'c1',
    name: 'Rustoord Ennea',
    phone: '03 776 12 34',
    address: 'Gasthuisstraat 12',
    city: 'Sint-Niklaas',
    vatNumber: 'BE0412345678',
  },
  {
    id: 'c2',
    name: 'WZC Helianthus',
    phone: '09 252 67 89',
    address: 'Wellingstraat 5',
    city: 'Melle',
    vatNumber: 'BE0498765432',
  },
  {
    id: 'c3',
    name: 'AZ Nikolaas',
    phone: '03 760 00 00',
    address: 'Moerlandstraat 1',
    city: 'Sint-Niklaas',
    vatNumber: 'BE0455112233',
  },
]

// ============================================================
// SITES (physical locations — where the work happens)
// ============================================================

export const sites: Site[] = [
  // Rustoord Ennea has one site (same address as customer)
  {
    id: 's1',
    customerId: 'c1',
    name: 'Rustoord Ennea',
    address: 'Gasthuisstraat 12',
    city: 'Sint-Niklaas',
    phones: ['03 776 12 34', '03 776 12 35'],
  },

  // WZC Helianthus has two sites
  {
    id: 's2',
    customerId: 'c2',
    name: 'WZC Helianthus — Melle',
    address: 'Wellingstraat 5',
    city: 'Melle',
    phones: ['09 252 67 89'],
  },
  {
    id: 's3',
    customerId: 'c2',
    name: 'WZC Helianthus — Merelbeke',
    address: 'Hundelgemsesteenweg 44',
    city: 'Merelbeke',
    phones: ['09 231 44 56', '09 231 44 57'],
  },

  // AZ Nikolaas has one site
  {
    id: 's4',
    customerId: 'c3',
    name: 'AZ Nikolaas — Campus Sint-Niklaas',
    address: 'Moerlandstraat 1',
    city: 'Sint-Niklaas',
    phones: ['03 760 00 00'],
  },
]

// ============================================================
// CONTACTS (per site)
// ============================================================

export const contacts: Contact[] = [
  {
    id: 'ct1',
    siteId: 's1',
    name: 'Marie Declercq',
    phone: '0478 12 34 56',
    email: 'marie.declercq@ennea.be',
    role: 'Verantwoordelijke keuken',
  },
  {
    id: 'ct2',
    siteId: 's2',
    name: 'Luc Van den Berg',
    phone: '0495 23 45 67',
    role: 'Technieker ter plaatse',
  },
  {
    id: 'ct3',
    siteId: 's3',
    name: 'Sofie Janssens',
    phone: '0472 98 76 54',
    email: 'sofie.janssens@helianthus.be',
    role: 'Verantwoordelijke',
  },
  {
    id: 'ct4',
    siteId: 's4',
    name: 'Peter Goossens',
    phone: '0499 11 22 33',
    email: 'p.goossens@azniko.be',
    role: 'Facility manager',
  },
]

// ============================================================
// DEVICES (per site)
// ============================================================

export const devices: Device[] = [
  // Rustoord Ennea (s1)
  {
    id: 'd1',
    siteId: 's1',
    brand: 'Electrolux',
    model: 'Glasswasher 50',
    serialNumber: 'ELX-2019-00123',
    installDate: '2019-03-15',
  },
  {
    id: 'd2',
    siteId: 's1',
    brand: 'Rational',
    model: 'SelfCooking Center 61',
    serialNumber: 'RAT-2020-00456',
    installDate: '2020-06-01',
    notes: 'Regelmatig kalkaanslag op stoomgenerator',
  },

  // WZC Helianthus Melle (s2)
  {
    id: 'd3',
    siteId: 's2',
    brand: 'Rational',
    model: 'iCombi Pro 10-1/1',
    serialNumber: 'RAT-2021-00789',
    installDate: '2021-09-10',
  },
  {
    id: 'd4',
    siteId: 's2',
    brand: 'Meiko',
    model: 'FV 130.2',
    serialNumber: 'MEI-2018-00321',
    installDate: '2018-11-20',
    notes: 'Pomp vervangen in 2022',
  },

  // WZC Helianthus Merelbeke (s3)
  {
    id: 'd5',
    siteId: 's3',
    brand: 'MKN',
    model: 'FlexiCombi 10.1',
    serialNumber: 'MKN-2022-00654',
    installDate: '2022-02-14',
  },

  // AZ Nikolaas (s4)
  {
    id: 'd6',
    siteId: 's4',
    brand: 'Winterhalter',
    model: 'UC-M',
    serialNumber: 'WIN-2020-00987',
    installDate: '2020-01-08',
  },
  {
    id: 'd7',
    siteId: 's4',
    brand: 'Rational',
    model: 'iCombi Pro 20-1/1',
    serialNumber: 'RAT-2023-01234',
    installDate: '2023-05-22',
    notes: 'Groot toestel — 2 techniekers nodig voor onderhoud',
  },
]

// ============================================================
// INTERVENTIONS (pre-assigned by admin — demo data)
// ============================================================

export const interventions: Intervention[] = [
  {
    id: 'i1',
    customerId: 'c1',
    customerName: 'Rustoord Ennea',
    siteId: 's1',
    siteName: 'Rustoord Ennea',
    siteAddress: 'Gasthuisstraat 12',
    siteCity: 'Sint-Niklaas',
    deviceId: 'd1',
    deviceBrand: 'Electrolux',
    deviceModel: 'Glasswasher 50',
    plannedDate: new Date().toISOString(),
    status: 'gepland',
    type: 'warm',
    description: 'Vaat wordt niet proper — resten blijven achter na wascyclus',
    estimatedMinutes: 120,
    isUrgent: false,
    source: 'planned',
    technicians: [
      { technicianId: 'u1', name: 'Olivier Bossuyt', initials: 'OB', isLead: true, accepted: true, plannedOrder: 1 },
    ],
  },
  {
    id: 'i2',
    customerId: 'c2',
    customerName: 'WZC Helianthus',
    siteId: 's2',
    siteName: 'WZC Helianthus — Melle',
    siteAddress: 'Wellingstraat 5',
    siteCity: 'Melle',
    deviceId: 'd3',
    deviceBrand: 'Rational',
    deviceModel: 'iCombi Pro 10-1/1',
    plannedDate: new Date().toISOString(),
    status: 'gepland',
    type: 'montage',
    description: 'Installatie waterontharder',
    estimatedMinutes: 60,
    isUrgent: false,
    source: 'planned',
    technicians: [
      { technicianId: 'u1', name: 'Olivier Bossuyt', initials: 'OB', isLead: true, accepted: true, plannedOrder: 2 },
      { technicianId: 'u2', name: 'Jonas Declercq', initials: 'JD', isLead: false, accepted: true, plannedOrder: 2 },
    ],
  },
  {
    id: 'i3',
    customerId: 'c3',
    customerName: 'AZ Nikolaas',
    siteId: 's4',
    siteName: 'AZ Nikolaas — Campus Sint-Niklaas',
    siteAddress: 'Moerlandstraat 1',
    siteCity: 'Sint-Niklaas',
    deviceId: 'd7',
    deviceBrand: 'Rational',
    deviceModel: 'iCombi Pro 20-1/1',
    plannedDate: new Date().toISOString(),
    status: 'gepland',
    type: 'preventief',
    description: 'Jaarlijks onderhoud groot toestel',
    estimatedMinutes: 150,
    isUrgent: false,
    source: 'planned',
    technicians: [
      { technicianId: 'u1', name: 'Olivier Bossuyt', initials: 'OB', isLead: true, accepted: true, plannedOrder: 3 },
    ],
  },
  {
    id: 'i4',
    customerId: 'c1',
    customerName: 'Rustoord Ennea',
    siteId: 's1',
    siteName: 'Rustoord Ennea',
    siteAddress: 'Gasthuisstraat 12',
    siteCity: 'Sint-Niklaas',
    deviceId: 'd2',
    deviceBrand: 'Rational',
    deviceModel: 'SelfCooking Center 61',
    plannedDate: new Date().toISOString(),
    status: 'gepland',
    type: 'warm',
    description: 'Ontkalking stoomgenerator',
    estimatedMinutes: 90,
    isUrgent: false,
    source: 'planned',
    technicians: [
      { technicianId: 'u1', name: 'Olivier Bossuyt', initials: 'OB', isLead: true, accepted: true, plannedOrder: 4 },
    ],
  },
  // --- Open pool — flexibele extra jobs die de technieker zelf kan oppikken ---
  {
    id: 'i5',
    customerId: 'c2',
    customerName: 'WZC Helianthus',
    siteId: 's3',
    siteName: 'WZC Helianthus — Merelbeke',
    siteAddress: 'Hundelgemsesteenweg 44',
    siteCity: 'Merelbeke',
    deviceId: 'd5',
    deviceBrand: 'MKN',
    deviceModel: 'FlexiCombi 10.1',
    plannedDate: new Date().toISOString(),
    status: 'gepland',
    type: 'warm',
    description: 'Stoomt opnieuw niet — foutcode E-07 op display',
    estimatedMinutes: 180,
    isUrgent: true,
    source: 'reactive',
    technicians: [
      { technicianId: 'u2', name: 'Jonas Declercq', initials: 'JD', isLead: true, accepted: false, plannedOrder: 0 },
    ],
  },
  {
    id: 'i6',
    customerId: 'c2',
    customerName: 'WZC Helianthus',
    siteId: 's2',
    siteName: 'WZC Helianthus — Melle',
    siteAddress: 'Wellingstraat 5',
    siteCity: 'Melle',
    deviceId: 'd4',
    deviceBrand: 'Meiko',
    deviceModel: 'FV 130.2',
    plannedDate: new Date().toISOString(),
    status: 'gepland',
    type: 'warm',
    description: 'Pomp maakt geluid — check dringend',
    estimatedMinutes: 60,
    isUrgent: false,
    source: 'reactive',
    technicians: [
      { technicianId: 'u1', name: 'Olivier Bossuyt', initials: 'OB', isLead: true, accepted: false, plannedOrder: 0 },
    ],
  },
]

// ============================================================
// HELPER FUNCTIONS
// used to look up related data without a database
// ============================================================

// Get all sites for a customer
export function getSitesByCustomer(customerId: string): Site[] {
  return sites.filter(site => site.customerId === customerId)
}

// Get all devices for a site
export function getDevicesBySite(siteId: string): Device[] {
  return devices.filter(device => device.siteId === siteId)
}

// Get all contacts for a site
export function getContactsBySite(siteId: string): Contact[] {
  return contacts.filter(contact => contact.siteId === siteId)
}

// Get a single customer by id
export function getCustomerById(id: string): Customer | undefined {
  return customers.find(customer => customer.id === id)
}

// Get a single site by id
export function getSiteById(id: string): Site | undefined {
  return sites.find(site => site.id === id)
}

// Get a single device by id
export function getDeviceById(id: string): Device | undefined {
  return devices.find(device => device.id === id)
}
