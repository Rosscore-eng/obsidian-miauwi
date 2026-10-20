/** Original code-native Miauwi artwork; no copied assets or external requests. */
export function createCatArt(doc: Document): SVGSVGElement {
  const holder = doc.createElement('div');
  holder.innerHTML = `<svg class="miauwi-cat-art" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <ellipse class="miauwi-shadow" cx="50" cy="92" rx="29" ry="4" fill="currentColor" opacity=".14"/>
    <g class="miauwi-facing">
      <g class="miauwi-tail"><path d="M69 75C94 82 99 57 88 48C82 43 80 48 84 52C93 63 82 70 70 65" fill="none" stroke="#17191e" stroke-width="9" stroke-linecap="round"/><path d="M88 49q5 4 4 10" fill="none" stroke="#444953" stroke-width="2.4" stroke-linecap="round"/></g>
      <g class="miauwi-torso"><path d="M30 57C24 66 25 81 32 88L69 88C79 73 73 58 63 53Z" fill="#15171c"/><path d="M39 59Q31 72 36 80" fill="none" stroke="#333842" stroke-width="3" stroke-linecap="round"/>
        <g class="miauwi-back-leg"><path d="M61 72q13-1 11 15q-3 6-15 2" fill="#1c1f25"/><path d="M59 89h12" stroke="#08090c" stroke-width="3" stroke-linecap="round"/></g>
        <g class="miauwi-leg miauwi-leg-back"><path d="M48 72L50 89Q49 94 39 91L40 71" fill="#101216"/><path d="M41 90h7" stroke="#464b54" stroke-width="1.3"/></g>
        <g class="miauwi-leg miauwi-leg-front"><path d="M32 69L29 88Q29 94 40 91L43 72" fill="#20232a"/><path d="M31 90h7" stroke="#464b54" stroke-width="1.3"/></g>
      </g>
      <g class="miauwi-head">
        <path d="M23 39L18 13Q19 9 23 13L39 25Q48 22 59 25L74 12Q78 9 78 16L75 42Q76 62 52 65Q28 66 23 48Z" fill="#15171c" stroke="#080a0e" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M23 19l4 17l8-8Z" fill="#51404b"/><path d="M73 20l-2 16l-8-8Z" fill="#51404b"/>
        <path d="M34 28q14-6 27 0" fill="none" stroke="#343943" stroke-width="2.2" stroke-linecap="round"/>
        <g class="miauwi-eyes"><ellipse cx="36" cy="43" rx="8.3" ry="7" fill="#c1df97"/><ellipse cx="62" cy="43" rx="8.3" ry="7" fill="#c1df97"/>
          <g class="miauwi-pupils"><ellipse cx="37" cy="43" rx="2.8" ry="6" fill="#10151a"/><ellipse cx="63" cy="43" rx="2.8" ry="6" fill="#10151a"/><circle cx="39" cy="41" r="1.5" fill="#fff"/><circle cx="65" cy="41" r="1.5" fill="#fff"/></g></g>
        <g class="miauwi-closed-eyes" fill="none" stroke="#d4e5bf" stroke-width="2.3" stroke-linecap="round"><path d="M29 44q7 6 14 0"/><path d="M55 44q7 6 14 0"/></g>
        <path d="M46 52q3-3 6 0l-3 3Z" fill="#bb929d"/><path class="miauwi-mouth" d="M49 55q-3 5-6 1m6-1q3 5 6 1" fill="none" stroke="#d1b4b8" stroke-width="1.3" stroke-linecap="round"/>
        <g fill="none" stroke="#707780" stroke-width="1.2" stroke-linecap="round"><path d="M34 52L17 48m17 7l-18 1m46-4l18-4m-18 7l19 1"/></g>
      </g>
    </g>
    <g class="miauwi-hearts" fill="#e3a7bc"><path d="M76 24c-6-8-15 1 0 10c15-9 6-18 0-10"/><path d="M89 40c-4-6-10 1 0 7c10-6 4-13 0-7"/></g>
    <g class="miauwi-sleep-marks" fill="currentColor" font-size="13" font-family="system-ui,sans-serif" font-weight="600"><text x="72" y="26">z</text><text x="83" y="15" font-size="9">z</text></g>
  </svg>`;
  return holder.firstElementChild as unknown as SVGSVGElement;
}
