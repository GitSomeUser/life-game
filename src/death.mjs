/** Original noir stills. PG. No faces, no gore. One scene per five-year band. */

export function deathMarkup(animation) {
  const scenes = {
    "paper-boat": `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <line class="water" x1="16" y1="96" x2="184" y2="96"/>
        <g class="boat"><path d="M46 78 L100 98 L154 78 L100 66 Z"/></g>
      </svg>`,
    streetlamp: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <path d="M78 118 V46 H124"/>
        <circle class="lamp" cx="124" cy="40" r="10"/>
      </svg>`,
    clock: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <circle cx="100" cy="70" r="36"/>
        <line class="hand" x1="100" y1="70" x2="100" y2="42"/>
      </svg>`,
    coat: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <path d="M92 28 h16"/>
        <path class="coat" d="M78 36 L70 108 H130 L122 36 Q100 52 78 36 Z"/>
      </svg>`,
    window: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <rect x="48" y="28" width="104" height="84"/>
        <rect class="pane" x="70" y="44" width="60" height="40"/>
      </svg>`,
    leaf: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <line x1="100" y1="18" x2="100" y2="36"/>
        <path class="leaf" d="M100 36 Q124 52 100 78 Q76 52 100 36 Z"/>
      </svg>`,
    static: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <rect x="46" y="78" width="108" height="28"/>
        <path class="arc a1" d="M70 70 Q100 48 130 70"/>
        <path class="arc a2" d="M58 64 Q100 34 142 64"/>
        <path class="arc a3" d="M46 58 Q100 20 154 58"/>
      </svg>`,
    chair: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <path d="M62 108 V70 H138 V108"/>
        <path d="M62 86 H138"/>
        <path class="drape" d="M86 48 L80 86 H120 L114 48 Z"/>
      </svg>`,
    doorway: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <path d="M48 18 V122 H152 V18"/>
        <rect class="slit" x="92" y="28" width="16" height="84"/>
      </svg>`,
    page: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <path class="page" d="M58 24 H142 V116 H58 Z"/>
        <line x1="72" y1="48" x2="128" y2="48"/>
        <line x1="72" y1="64" x2="120" y2="64"/>
      </svg>`,
    aperture: `
      <svg viewBox="0 0 200 140" aria-hidden="true">
        <circle class="iris" cx="100" cy="70" r="40"/>
      </svg>`,
  };
  return scenes[animation] || scenes.aperture;
}
