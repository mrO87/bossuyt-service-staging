/**
 * Een knopje in de kop van de werkbon dat een bestand opent.
 *
 * Het icoon zegt wát je krijgt vóór je tikt: een rood PDF-vel, een wit
 * fototeken, of een groen vinkje voor de afgewerkte bon. In een bestelwagen op
 * mobiele data is een PDF van twee megabyte per ongeluk openen duur.
 *
 * De tekeningen staan als losse bestanden in `public/icons` en komen binnen via
 * een gewone `<img>`. Dat is met opzet: als inline SVG zou React bij elke
 * hertekening honderden tekens padgegevens opnieuw moeten uitschrijven, terwijl
 * de browser een bestand gewoon één keer ophaalt en bewaart. Ze veranderen
 * nooit, dus er valt niets te berekenen.
 */

export type BonFileKind = 'origineel-pdf' | 'origineel-foto' | 'afgewerkt'

const ICONEN: Record<BonFileKind, { src: string; woord: string; wat: string }> = {
  'origineel-pdf':  { src: '/icons/bon-origineel-pdf.svg',  woord: 'origineel', wat: 'de originele bon (PDF)' },
  'origineel-foto': { src: '/icons/bon-origineel-foto.svg', woord: 'origineel', wat: 'de originele bon (foto)' },
  'afgewerkt':      { src: '/icons/bon-afgewerkt.svg',      woord: 'afgewerkt', wat: 'de afgewerkte bon (PDF)' },
}

/** Of het bestand achter dit pad een PDF is, of een foto. */
export function kindForPath(path: string): BonFileKind {
  // Uit de bestandsnaam en niet uit een apart veld: de bon staat opgeslagen
  // onder zijn eigen extensie, en dat is de waarheid die er al ligt.
  return path.toLowerCase().endsWith('.pdf') ? 'origineel-pdf' : 'origineel-foto'
}

export function BonFileButton({ kind, href }: { kind: BonFileKind; href: string }) {
  const icoon = ICONEN[kind]

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${icoon.wat} in een nieuw venster`}
      className="flex min-w-[38px] shrink-0 flex-col items-center gap-0.5 rounded-lg bg-white/10 px-1.5 pb-0.5 pt-0.5 active:bg-white/20"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icoon.src} alt="" width={16} height={16} className="block" />
      {/*
        Een bijschrift, geen knoptekst. Het icoon doet het werk en is wat je van
        een halve meter herkent; dit woordje lees je van dichtbij, en alleen op
        het moment dat je twijfelt welk van de twee je moet hebben.
      */}
      <span className="text-[6px] font-bold uppercase leading-none tracking-tight text-white/75">
        {icoon.woord}
      </span>
    </a>
  )
}
