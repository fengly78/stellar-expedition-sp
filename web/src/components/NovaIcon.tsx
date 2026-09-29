import type { SVGProps } from 'react'

export type NovaIconName =
  | 'logo' | 'metal' | 'crystal' | 'fuel' | 'energy' | 'research' | 'base' | 'building'
  | 'defense' | 'fleet' | 'reports' | 'more' | 'galaxy' | 'campaign' | 'achievement'
  | 'officer' | 'ranking' | 'codex' | 'merchant' | 'save' | 'planet' | 'moon' | 'shield'
  | 'reactor' | 'propulsion' | 'computing' | 'military' | 'science' | 'thermal' | 'espionage'
  | 'armor' | 'laser' | 'ion' | 'hull' | 'engine' | 'weapon' | 'ship' | 'fighter'
  | 'cruiser' | 'battleship' | 'bomber' | 'deathstar' | 'transport' | 'colony'
  | 'recycler' | 'probe' | 'satellite' | 'turret' | 'gauss' | 'plasma' | 'missile'
  | 'radar' | 'drag' | 'zoom' | 'orbit' | 'focus' | 'storm' | 'alert' | 'check' | 'lock'

type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: NovaIconName
  size?: number | string
  title?: string
}

function Glyph({ name }: { name: NovaIconName }) {
  switch (name) {
    case 'logo': return <><circle cx="11.5" cy="11.5" r="6.5"/><path d="M2 14c3.2 2.3 9.8 2 15.1-.7 5.2-2.6 6.3-5.8 3.6-7.1-2-1-5.2-.3-8.3 1.3"/><path d="M4.2 8.7c-2 1.3-2.9 2.7-2.2 4.1"/><circle cx="18.5" cy="6.5" r="1.1"/></>
    case 'metal': return <><path d="m4 8 5-5h8l3 5-4 12H8L4 8Z"/><path d="m4 8 5 3h7l4-3M9 3v8m7 0v9M8 20l1-9"/></>
    case 'crystal': return <><path d="m12 2 5 5-1.5 12L12 22 8.5 19 7 7l5-5Z"/><path d="m7 7 5 4 5-4m-5 4v11M8.5 19 12 11l3.5 8"/></>
    case 'fuel': return <><path d="M8 3h8v4l2 3v10H6V10l2-3V3Z"/><path d="M8 7h8M9 14c1.8-3 4.2-3 6 0-.3 2.5-1.3 4-3 4s-2.7-1.5-3-4Z"/></>
    case 'energy': return <><path d="m13.5 2-7 11H12l-1.5 9 7-12H12l1.5-8Z"/></>
    case 'base': return <><path d="M3 19h18M5 19v-5l3-2v7m8 0v-7l3 2v5M9 19V8l3-5 3 5v11"/><path d="M10.5 11h3m-3 3h3"/></>
    case 'building': return <><path d="M3 20h18M5 20V8l5-4v16m4 0V3h5v17"/><path d="M7 10h1m-1 4h1m8-7h1m-1 4h1m-1 4h1"/></>
    case 'defense': case 'shield': return <><path d="M12 2 20 5v6c0 5.3-3.2 8.6-8 11-4.8-2.4-8-5.7-8-11V5l8-3Z"/><path d="m8.2 11.5 2.3 2.3 5.3-5.6"/></>
    case 'fleet': return <><path d="m3 14 8-9 10 6-10 2-4 5-4-4Z"/><path d="m11 13 4 5m-8-1-3 3m12-4 4 2"/></>
    case 'reports': return <><path d="M6 3h9l4 4v14H6V3Z"/><path d="M15 3v5h4M9 12h7m-7 4h7"/></>
    case 'more': return <><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></>
    case 'galaxy': return <><circle cx="12" cy="12" r="2"/><path d="M3.5 9.5c3.5-4 9.5-5 14-2.5 4 2.3 3 5.7-.6 7.7-4.2 2.3-10.6 1.8-13.4-1.3-2-2.2.1-5 3.8-6.5M20 15c-3 4.5-9.4 6.2-14 3.5"/><circle cx="18.5" cy="6" r=".8"/></>
    case 'campaign': return <><path d="M6 4h12l-2 6 2 6H6l2-6-2-6Z"/><path d="M12 2v20M8 10h8"/></>
    case 'achievement': return <><path d="M8 3h8v5a4 4 0 0 1-8 0V3Z"/><path d="M8 5H4v2c0 3 2 4 5 4m7-6h4v2c0 3-2 4-5 4M12 12v5m-4 4h8m-7-4h6"/></>
    case 'officer': return <><circle cx="12" cy="7" r="3.5"/><path d="M5 21c.5-5 3-8 7-8s6.5 3 7 8M9 14l3 3 3-3"/></>
    case 'ranking': return <><path d="M5 21v-7h4v7m2 0V8h4v13m2 0V3h4v18M3 21h20"/></>
    case 'codex': return <><path d="M4 4h6c1.2 0 2 .8 2 2v15c0-1.2-.8-2-2-2H4V4Zm16 0h-6c-1.2 0-2 .8-2 2v15c0-1.2.8-2 2-2h6V4Z"/></>
    case 'merchant': return <><path d="M4 7h13l-2-2m2 2-2 2M20 17H7l2 2m-2-2 2-2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/></>
    case 'save': return <><path d="M4 3h14l2 2v16H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>
    case 'planet': return <><circle cx="12" cy="12" r="7"/><path d="M4 9c4 2 11 2 15-1M5 16c4-2 10-2 14 0M12 5c-3 4-3 10 0 14m0-14c3 4 3 10 0 14"/></>
    case 'moon': return <><path d="M18.5 16.5A8 8 0 0 1 8 5.5a8.2 8.2 0 1 0 10.5 11Z"/></>
    case 'research': return <><circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9" ry="3.7"/><ellipse cx="12" cy="12" rx="3.7" ry="9" transform="rotate(35 12 12)"/><circle cx="19" cy="12" r=".8"/></>
    case 'reactor': return <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v5m0 6v5M4 12h5m6 0h5"/></>
    case 'thermal': return <><path d="M12 3c3 4 4 6.5 1 9 2-1 4-2 5-4 2 7-1 13-6 13S4 17 6 12c.7-2 2-4 4-6-.2 3 .2 5 2 6 2-3 1-6 0-9Z"/></>
    case 'propulsion': case 'engine': return <><path d="M8 17 5 21m6-4-1 5m6-7 3-3-1-6-6-1-3 3 1 5 6 2Z"/><path d="m12 5 7-3-1 7"/></>
    case 'computing': return <><rect x="5" y="5" width="14" height="14" rx="1"/><path d="M9 9h6v6H9V9ZM8 2v3m4-3v3m4-3v3M8 19v3m4-3v3m4-3v3M2 8h3m-3 4h3m-3 4h3m14-8h3m-3 4h3m-3 4h3"/></>
    case 'military': case 'weapon': return <><path d="m4 20 5-5m6-6 5-5-1 5-5 5-5 1-5 5Z"/><path d="m7 17 3 3m4-7 4 4"/></>
    case 'science': return <><path d="M9 3h6M10 3v6l-5 9c-.8 1.5 0 3 2 3h10c2 0 2.8-1.5 2-3l-5-9V3"/><path d="M8 15h8m-6-3h4"/></>
    case 'espionage': case 'radar': return <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 12 18 7M2 12h3m14 0h3M12 2v3m0 14v3"/></>
    case 'armor': return <><path d="M5 4h14l2 6-3 10H6L3 10l2-6Z"/><path d="m5 4 7 5 7-5M3 10h18M8 20l4-11 4 11"/></>
    case 'laser': return <><path d="M3 18 15 6l3 3L6 21l-3-3Z"/><path d="m15 6 3-3m0 6 3 3m-6-6-3-3"/></>
    case 'ion': return <><circle cx="12" cy="12" r="3"/><path d="M3 12c2.3-4.5 5.3-7 9-7s6.7 2.5 9 7c-2.3 4.5-5.3 7-9 7s-6.7-2.5-9-7Z"/><path d="m19 4-2 3m3 1-3 1"/></>
    case 'hull': return <><path d="M3 15 8 6h8l5 9-4 5H7l-4-5Z"/><path d="m8 6 4 5 4-5m-9 14 5-9 5 9"/></>
    case 'ship': case 'cruiser': return <><path d="M2 15 8 8l8-3 6 7-7 4-8 1-5-2Z"/><path d="m8 8 4 4 4-7m-9 12-2 4m10-5 3 3"/></>
    case 'fighter': return <><path d="m3 16 7-5 2-8 2 8 7 5-7-1-2 6-2-6-7 1Z"/></>
    case 'battleship': return <><path d="M2 15 7 8l8-4 7 8-4 5-11 2-5-4Z"/><path d="M7 8h9m-7-3 2 2m4 10 4 3M6 19l-2 3"/></>
    case 'bomber': return <><path d="m3 17 4-7 5-7 5 7 4 7-7-3-2 7-2-7-7 3Z"/><path d="M7 10h10"/></>
    case 'deathstar': return <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-3 3-4 6-4 9s1 6 4 9m0-18c3 3 4 6 4 9s-1 6-4 9"/><circle cx="15.5" cy="8.5" r="2.2"/><path d="m17.2 7.2 4-3"/></>
    case 'transport': return <><path d="M3 15 7 8h10l4 7-3 4H6l-3-4Z"/><path d="M7 8v7m10-7v7M6 15h12"/></>
    case 'colony': return <><path d="M4 17 7 7h10l3 10-4 4H8l-4-4Z"/><path d="M8 12h8M12 7v14"/><circle cx="12" cy="12" r="2"/></>
    case 'recycler': return <><path d="m7 5 3-2 2 3m5 3 2 3-2 2M8 20H5l-2-3m6-9 3-2 3 2m2 5-1 4-4 2-4-2-1-4 2-5Z"/></>
    case 'probe': return <><circle cx="12" cy="12" r="3"/><path d="M12 2v7m0 6v7M2 12h7m6 0h7M5 5l5 5m4 4 5 5m0-14-5 5m-4 4-5 5"/></>
    case 'satellite': return <><rect x="9" y="8" width="6" height="8"/><path d="m9 9-6-3v5l6 3m6-5 6-3v5l-6 3M12 4v4m0 8v4"/></>
    case 'turret': return <><path d="M4 21h16M7 21v-5h10v5M9 16v-4h6v4"/><path d="m12 12 7-5 2 2-6 5M10 9h5"/></>
    case 'gauss': return <><path d="M4 21h16M7 21v-5h10v5M9 16v-4h6v4M11 12 17 3h3l-5 9"/><path d="m17 3 4 1"/></>
    case 'plasma': return <><path d="M4 21h16M7 21v-6h10v6M9 15v-4h6v4"/><circle cx="12" cy="7" r="3"/><path d="M12 1v3m-5 1 2 1m6 0 2-1"/></>
    case 'missile': return <><path d="M8 17c-2 0-4 1-5 4 3 0 5-1 6-3M10 15 7 12l8-8 4 1 1 4-8 8-2-2Z"/><path d="m15 4 5 5"/></>
    case 'drag': return <><path d="M8 11V5a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 8-8 8-4 0-6-2-8-5l-2-3a2 2 0 0 1 3-2l3 2"/></>
    case 'zoom': return <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></>
    case 'orbit': return <><circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5"/><circle cx="20" cy="10" r="1"/></>
    case 'focus': return <><circle cx="12" cy="12" r="3"/><path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/></>
    case 'storm': return <><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2"/></>
    case 'alert': return <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v1"/></>
    case 'check': return <><circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-7"/></>
    case 'lock': return <><rect x="5" y="10" width="14" height="11" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/></>
  }
}

export default function NovaIcon({ name, size = '1em', title, className = '', ...props }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      className={`nova-icon nova-icon--${name} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {title && <title>{title}</title>}
      <Glyph name={name} />
    </svg>
  )
}
