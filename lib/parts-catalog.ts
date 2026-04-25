export interface CatalogSupplier {
  name: string
  ref: string
}

export interface CatalogPart {
  partNumber: string
  description: string
  brand: string
  suppliers: CatalogSupplier[]
}

export const PARTS_CATALOG: CatalogPart[] = [
  {
    partNumber: '20.73.586',
    description: 'Ontsteekelectrode assembly',
    brand: 'Rational',
    suppliers: [
      { name: 'SparePart.be', ref: 'RAT-20-73-586' },
      { name: 'GastroPart', ref: 'GP-RAT-586' },
      { name: 'Rational Direct', ref: '20.73.586' },
    ],
  },
  {
    partNumber: '40.03.580',
    description: 'NTC temperatuurvoeler 100°C',
    brand: 'Rational',
    suppliers: [
      { name: 'SparePart.be', ref: 'RAT-40-03-580' },
      { name: 'Rational Direct', ref: '40.03.580' },
    ],
  },
  {
    partNumber: '56.00.210',
    description: 'Scharnier deur links',
    brand: 'Rational',
    suppliers: [
      { name: 'GastroPart', ref: 'GP-RAT-210' },
      { name: 'Rational Direct', ref: '56.00.210' },
    ],
  },
  {
    partNumber: '000007179',
    description: 'Waterinlaatklep 230V solenoid',
    brand: 'Manitowoc',
    suppliers: [
      { name: 'GastroPart', ref: 'MAN-000007179' },
      { name: 'Horeca Parts', ref: 'HP-MAN-7179' },
      { name: 'Manitowoc Direct', ref: '000007179' },
    ],
  },
  {
    partNumber: '000007268',
    description: 'IJsdiktesensor / dikte probe',
    brand: 'Manitowoc',
    suppliers: [
      { name: 'GastroPart', ref: 'MAN-000007268' },
      { name: 'Manitowoc Direct', ref: '000007268' },
    ],
  },
  {
    partNumber: '000001805',
    description: 'Koelwaterpomp 230V 50Hz',
    brand: 'Manitowoc',
    suppliers: [
      { name: 'Horeca Parts', ref: 'HP-MAN-1805' },
      { name: 'Manitowoc Direct', ref: '000001805' },
    ],
  },
  {
    partNumber: '00-875882',
    description: 'Waspomp motor 0.35 kW',
    brand: 'Hobart',
    suppliers: [
      { name: 'SparePart.be', ref: 'HOB-875882' },
      { name: 'Horeca Parts', ref: 'HP-HOB-882' },
    ],
  },
  {
    partNumber: '00-267591',
    description: 'Deurpakking boven vaatwasser',
    brand: 'Hobart',
    suppliers: [
      { name: 'SparePart.be', ref: 'HOB-267591' },
      { name: 'GastroPart', ref: 'GP-HOB-591' },
    ],
  },
  {
    partNumber: '12FAG015',
    description: 'Verwarmingselement 2200W 230V',
    brand: 'Fagor',
    suppliers: [
      { name: 'GastroPart', ref: 'FAG-12FAG015' },
      { name: 'Horeca Parts', ref: 'HP-FAG-015' },
    ],
  },
  {
    partNumber: '12FAG092',
    description: 'Thermostaat verstelbaar 50-300°C',
    brand: 'Fagor',
    suppliers: [
      { name: 'GastroPart', ref: 'FAG-12FAG092' },
      { name: 'SparePart.be', ref: 'SP-FAG-092' },
    ],
  },
  {
    partNumber: '140026571014',
    description: 'Deurmanset / deurpakking',
    brand: 'Electrolux Professional',
    suppliers: [
      { name: 'SparePart.be', ref: 'ELP-140026571014' },
      { name: 'Electrolux Direct', ref: '140026571014' },
    ],
  },
  {
    partNumber: '9726310',
    description: 'Sproeiarm was — onderste',
    brand: 'Meiko',
    suppliers: [
      { name: 'Horeca Parts', ref: 'MEI-9726310' },
      { name: 'GastroPart', ref: 'GP-MEI-310' },
    ],
  },
  {
    partNumber: '30000584',
    description: 'Waspomp impeller / waaier',
    brand: 'Winterhalter',
    suppliers: [
      { name: 'SparePart.be', ref: 'WIN-30000584' },
      { name: 'Winterhalter Direct', ref: '30000584' },
    ],
  },
  {
    partNumber: '5009284',
    description: 'Scharnierveer deur combi',
    brand: 'Convotherm',
    suppliers: [
      { name: 'GastroPart', ref: 'CON-5009284' },
      { name: 'Horeca Parts', ref: 'HP-CON-284' },
    ],
  },
  {
    partNumber: '0K1020',
    description: 'Thermoelektrisch element gas 600mm',
    brand: 'Zanussi Professional',
    suppliers: [
      { name: 'SparePart.be', ref: 'ZAN-0K1020' },
      { name: 'Electrolux Direct', ref: 'ZAN-0K1020' },
    ],
  },
]

export function lookupPart(partNumber: string): CatalogPart | undefined {
  if (!partNumber) return undefined
  return PARTS_CATALOG.find(
    p => p.partNumber.toLowerCase() === partNumber.trim().toLowerCase(),
  )
}
