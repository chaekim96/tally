// WCAG 2.x contrast for Tally's brand palette. Run: node contrast.mjs
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const themes = {
  light: {
    grouped: '#F8F8F6', surface: '#FEFEFC', ink: '#111110', ink2: '#3E3D3A', muted: '#6B6862', control: '#85827B', danger: '#B42318', onInk: '#FEFEFC',
    fillA: 0.06, fill2A: 0.12, blockA: 0.07, otherA: 0.03, fg: '#111110', raised: '#FEFEFC',
  },
  dark: {
    grouped: '#111110', surface: '#1A1A19', ink: '#F8F8F6', ink2: '#D6D4CE', muted: '#A19E97', control: '#7C7972', danger: '#FF8A7A', onInk: '#111110',
    fillA: 0.1, fill2A: 0.18, blockA: 0.1, otherA: 0.04, raised: '#363532',
  },
};
const rows = [];
for (const [name, t] of Object.entries(themes)) {
  const G = hex(t.grouped), S = hex(t.surface), I = hex(t.ink);
  const fillOnS = mix(I, t.fillA, S), fillOnG = mix(I, t.fillA, G), fill2OnG = mix(I, t.fill2A, G);
  const block = mix(I, t.blockA, S), other = mix(I, t.otherA, S);
  const add = (kind, label, fg, bg, min) => { const r = cr(fg, bg); rows.push({ theme: name, kind, label, ratio: r.toFixed(2), min, pass: r >= min ? 'pass' : 'FAIL' }); };
  add('text', 'ink on surface', I, S, 4.5);
  add('text', 'ink on page', I, G, 4.5);
  add('text', 'ink-2 on surface', hex(t.ink2), S, 4.5);
  add('text', 'ink-2 on page', hex(t.ink2), G, 4.5);
  add('text', 'muted on surface', hex(t.muted), S, 4.5);
  add('text', 'muted on page', hex(t.muted), G, 4.5);
  add('text', 'muted on fill (search, stepper, chip) over surface', hex(t.muted), fillOnS, 4.5);
  add('text', 'muted on fill over page', hex(t.muted), fillOnG, 4.5);
  add('text', 'ink-2 on chip fill over surface', hex(t.ink2), fillOnS, 4.5);
  add('text', 'ink on Day block', I, block, 4.5);
  add('text', 'ink-2 on Day block', hex(t.ink2), block, 4.5);
  add('text', 'muted on Day block', hex(t.muted), block, 4.5);
  add('text', 'ink-2 on other-note Day block', hex(t.ink2), other, 4.5);
  add('text', 'muted on other-note Day block', hex(t.muted), other, 4.5);
  add('text', 'on-ink text on ink button', hex(t.onInk), I, 4.5);
  add('text', 'ink on selected segment', I, hex(t.raised), 4.5);
  add('text', 'ink-2 on segmented track over page', hex(t.ink2), fillOnG, 4.5);
  add('text', 'danger on surface', hex(t.danger), S, 4.5);
  add('text', 'danger on page', hex(t.danger), G, 4.5);
  add('text', 'danger on menu glass (surface)', hex(t.danger), S, 4.5);
  add('ui', 'checkbox ring (control) on surface', hex(t.control), S, 3);
  add('ui', 'switch off ring (control) on page/card', hex(t.control), S, 3);
  add('ui', 'ink fill (checked box, meter, focus ring) on surface', I, S, 3);
  add('ui', 'ink fill on page', I, G, 3);
  add('ui', 'danger meter fill on track over surface', hex(t.danger), mix(I, t.fillA, S), 3);
  add('ui', 'danger fill on surface', hex(t.danger), S, 3);
  add('ui', 'Day block edge (ink) on block', I, block, 3);
  add('ui', 'meter fill ink on track fill2', I, mix(I, t.fillA, S), 3);
  // category bar tones: ink at alpha steps on surface; lightest must hold 3:1
  const ramp = [1, 0.85, 0.72, 0.62, 0.54, 0.5];
  const lightest = mix(I, ramp[ramp.length - 1], S);
  add('ui', 'category bar, lightest tone (ink at 50%) on surface', lightest, S, 3);
}
const w = (s, n) => String(s).padEnd(n);
console.log(w('theme', 6), w('kind', 5), w('pair', 56), w('ratio', 6), w('min', 4), 'result');
for (const r of rows) console.log(w(r.theme, 6), w(r.kind, 5), w(r.label, 56), w(r.ratio, 6), w(r.min, 4), r.pass);
const fails = rows.filter((r) => r.pass === 'FAIL');
console.log(fails.length ? `\n${fails.length} FAIL` : '\nAll pairs pass.');
process.exitCode = fails.length ? 1 : 0;
