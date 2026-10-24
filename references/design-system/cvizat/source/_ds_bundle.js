/* @ds-bundle: {"format":4,"namespace":"CVizatDesignSystem_0f8e2e","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Logo","sourcePath":"components/core/Logo.jsx"},{"name":"Pill","sourcePath":"components/core/Pill.jsx"},{"name":"BTN_CSS","sourcePath":"components/core/buttonCss.js"},{"name":"LOGO_WORD_D","sourcePath":"components/core/logoPaths.js"},{"name":"LOGO_W","sourcePath":"components/core/logoPaths.js"},{"name":"DOOR_RAYS","sourcePath":"components/core/logoPaths.js"},{"name":"DOOR_LEAF","sourcePath":"components/core/logoPaths.js"},{"name":"CVDocument","sourcePath":"components/document/CVDocument.jsx"},{"name":"PlanCard","sourcePath":"components/document/PlanCard.jsx"},{"name":"TaskCard","sourcePath":"components/document/TaskCard.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"Dialog","sourcePath":"components/feedback/Dialog.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Spinner","sourcePath":"components/feedback/Spinner.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Dropzone","sourcePath":"components/forms/Dropzone.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"FieldShell","sourcePath":"components/forms/FieldShell.jsx"},{"name":"RadioGroup","sourcePath":"components/forms/RadioGroup.jsx"},{"name":"Segmented","sourcePath":"components/forms/Segmented.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"FIELD_CSS","sourcePath":"components/forms/fieldCss.js"},{"name":"ChangeCard","sourcePath":"components/match/ChangeCard.jsx"},{"name":"FindingGroup","sourcePath":"components/match/FindingGroup.jsx"},{"name":"KeywordRow","sourcePath":"components/match/KeywordRow.jsx"},{"name":"MatchVerdict","sourcePath":"components/match/MatchVerdict.jsx"},{"name":"SideNav","sourcePath":"components/navigation/SideNav.jsx"},{"name":"TopBar","sourcePath":"components/navigation/TopBar.jsx"},{"name":"ProgressBar","sourcePath":"components/progress/ProgressBar.jsx"},{"name":"ScoreRing","sourcePath":"components/progress/ScoreRing.jsx"},{"name":"Stepper","sourcePath":"components/progress/Stepper.jsx"}],"sourceHashes":{"components/core/Button.jsx":"d307644d72d8","components/core/Card.jsx":"68a036792308","components/core/Icon.jsx":"0c0987a71a35","components/core/IconButton.jsx":"4ca5e46f44a1","components/core/Logo.jsx":"9ea507e2d152","components/core/Pill.jsx":"fc4c837fc9c6","components/core/buttonCss.js":"6d97604c0990","components/core/injectCss.js":"e1574583ee92","components/core/logoPaths.js":"2c8644b475b4","components/document/CVDocument.jsx":"001f5aac9933","components/document/PlanCard.jsx":"67110eb4ea32","components/document/TaskCard.jsx":"124a6ac83b2e","components/feedback/Alert.jsx":"c4c6f1a3b701","components/feedback/Dialog.jsx":"9a5705be1ad7","components/feedback/EmptyState.jsx":"1fc04141b2a7","components/feedback/Spinner.jsx":"1ca33b064c1a","components/feedback/Toast.jsx":"9e987b7d9f5a","components/forms/Checkbox.jsx":"4707f453ca7e","components/forms/Dropzone.jsx":"6fb61a5a4c5a","components/forms/Field.jsx":"8d115cbd3e6f","components/forms/FieldShell.jsx":"18bd2db4028d","components/forms/RadioGroup.jsx":"d01acee8a3e3","components/forms/Segmented.jsx":"16bcb35be0f2","components/forms/Select.jsx":"bfc837f4e1fe","components/forms/fieldCss.js":"bca0b7087ac4","components/match/ChangeCard.jsx":"c2e38c6cb7cf","components/match/FindingGroup.jsx":"458e64884ae1","components/match/KeywordRow.jsx":"5767071491cf","components/match/MatchVerdict.jsx":"57cff2d8c03f","components/navigation/SideNav.jsx":"716d675a5255","components/navigation/TopBar.jsx":"ea0651cdabd9","components/progress/ProgressBar.jsx":"dcce68785950","components/progress/ScoreRing.jsx":"954173707145","components/progress/Stepper.jsx":"78cb96a40ae3","ui_kits/web-app/AddJob.jsx":"636748b17488","ui_kits/web-app/App.jsx":"dc13e1c99c45","ui_kits/web-app/Download.jsx":"b2644fe65aaa","ui_kits/web-app/Home.jsx":"9807d1232c4e","ui_kits/web-app/Improve.jsx":"03530e10556f","ui_kits/web-app/MatchReport.jsx":"12b2faeb876d","ui_kits/web-app/data.js":"86649f5b41e5"},"inlinedExternals":[],"unexposedExports":[{"name":"injectCss","sourcePath":"components/core/injectCss.js"}]} */

(() => {

const __ds_ns = (window.CVizatDesignSystem_0f8e2e = window.CVizatDesignSystem_0f8e2e || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Card.jsx
try { (() => {
function Card({
  tone = 'default',
  padding = 'md',
  interactive,
  selected,
  children,
  onClick,
  style
}) {
  const bg = {
    default: 'var(--surface-card)',
    hero: 'var(--surface-hero)',
    sunken: 'var(--surface-sunken)',
    inverse: 'var(--surface-inverse)'
  }[tone];
  const pad = {
    none: 0,
    sm: 'var(--space-6)',
    md: 'var(--pad-card)',
    lg: 'var(--pad-hero)'
  }[padding];
  const border = selected ? '2px solid var(--border-selected)' : tone === 'hero' ? '1px solid #d6e4d9' : tone === 'inverse' ? '1px solid transparent' : '1px solid var(--border-subtle)';
  const Tag = onClick ? 'button' : 'div';
  return /*#__PURE__*/React.createElement(Tag, {
    onClick: onClick,
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      font: 'inherit',
      color: tone === 'inverse' ? 'var(--text-on-inverse)' : 'inherit',
      background: bg,
      border,
      borderRadius: tone === 'hero' ? 'var(--radius-hero)' : 'var(--radius-card)',
      padding: pad,
      minWidth: 0,
      cursor: onClick ? 'pointer' : undefined,
      transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
      boxShadow: interactive ? 'var(--shadow-card)' : 'none',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/buttonCss.js
try { (() => {
const BTN_CSS = ".cvz-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:var(--control-height);padding:10px 16px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);background:var(--surface-card);color:var(--text-strong);font:var(--weight-semibold) var(--text-sm)/1.3 var(--font-sans);cursor:pointer;text-decoration:none;text-align:center;transition:background var(--dur-fast) var(--ease-out),transform var(--dur-fast) var(--ease-out),box-shadow var(--dur-fast) var(--ease-out);box-shadow:var(--shadow-press-secondary);-webkit-tap-highlight-color:transparent}\n.cvz-btn:hover{background:var(--action-secondary-hover)}\n.cvz-btn:active:not(:disabled){transform:translateY(2px);box-shadow:none}\n.cvz-btn--primary{background:var(--action-primary);border-color:var(--action-primary);color:var(--text-on-primary);box-shadow:var(--shadow-press)}\n.cvz-btn--primary:hover{background:var(--action-primary-hover);border-color:var(--action-primary-hover)}\n.cvz-btn--ghost{background:transparent;border-color:transparent;box-shadow:none;color:var(--text-accent)}\n.cvz-btn--ghost:hover{background:var(--surface-sunken)}\n.cvz-btn--danger{background:var(--surface-card);border-color:var(--status-bad-border);color:var(--action-danger)}\n.cvz-btn--danger:hover{background:var(--status-bad-bg)}\n.cvz-btn--sm{min-height:var(--control-height-sm);font-size:.75rem;padding:7px 10px;gap:6px}\n.cvz-btn--lg{min-height:50px;padding:13px 22px;font-size:.95rem;border-radius:var(--radius-lg)}\n.cvz-btn--full{width:100%}\n.cvz-btn:disabled{opacity:.45;cursor:not-allowed}\n.cvz-btn--icon{padding:0;width:var(--control-height);flex-shrink:0}\n.cvz-btn--icon.cvz-btn--sm{width:var(--control-height-sm)}\n.cvz-spin{width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:cvz-spin .8s linear infinite}\n@keyframes cvz-spin{to{transform:rotate(360deg)}}\n@media (max-width:760px){.cvz-btn{min-height:var(--control-height-touch)}}";
Object.assign(__ds_scope, { BTN_CSS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/buttonCss.js", error: String((e && e.message) || e) }); }

// components/core/injectCss.js
try { (() => {
const done = new Set();
function injectCss(id, css) {
  if (typeof document === 'undefined' || done.has(id)) return;
  done.add(id);
  const s = document.createElement('style');
  s.setAttribute('data-cvz', id);
  s.textContent = css;
  document.head.appendChild(s);
}
Object.assign(__ds_scope, { injectCss });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/injectCss.js", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
const CSS = '.cvz-icon{display:inline-block;flex-shrink:0;background:currentColor;-webkit-mask:var(--cvz-icon) center/contain no-repeat;mask:var(--cvz-icon) center/contain no-repeat;vertical-align:middle}';
function Icon({
  name,
  size = 18,
  color,
  label,
  style
}) {
  __ds_scope.injectCss('icon', CSS);
  const url = 'url("https://unpkg.com/lucide-static@0.460.0/icons/' + name + '.svg")';
  return /*#__PURE__*/React.createElement("span", {
    className: "cvz-icon",
    role: label ? 'img' : undefined,
    "aria-label": label,
    "aria-hidden": label ? undefined : true,
    style: {
      width: size,
      height: size,
      color,
      '--cvz-icon': url,
      ...style
    }
  });
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth,
  loading,
  disabled,
  children,
  onClick,
  type = 'button',
  href,
  style
}) {
  __ds_scope.injectCss('btn', __ds_scope.BTN_CSS);
  const cls = ['cvz-btn', 'cvz-btn--' + variant, size !== 'md' && 'cvz-btn--' + size, fullWidth && 'cvz-btn--full'].filter(Boolean).join(' ');
  const isz = size === 'sm' ? 16 : 18;
  const inner = /*#__PURE__*/React.createElement(React.Fragment, null, loading ? /*#__PURE__*/React.createElement("span", {
    className: "cvz-spin",
    "aria-hidden": "true"
  }) : icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: isz
  }), children, iconRight && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: isz
  }));
  if (href) return /*#__PURE__*/React.createElement("a", {
    className: cls,
    href: href,
    style: style
  }, inner);
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    className: cls,
    disabled: disabled || loading,
    "aria-busy": loading || undefined,
    onClick: onClick,
    style: style
  }, inner);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  onClick,
  disabled
}) {
  __ds_scope.injectCss('btn', __ds_scope.BTN_CSS);
  const cls = ['cvz-btn', 'cvz-btn--icon', 'cvz-btn--' + variant, size === 'sm' && 'cvz-btn--sm'].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: cls,
    "aria-label": label,
    title: label,
    onClick: onClick,
    disabled: disabled
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 16 : 18
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Pill.jsx
try { (() => {
const TONES = {
  neutral: 'neutral',
  good: 'good',
  warn: 'warn',
  bad: 'bad',
  info: 'info'
};
function Pill({
  tone = 'neutral',
  icon,
  children,
  size = 'md',
  shape = 'tag'
}) {
  const t = TONES[tone] || 'neutral';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: '1px solid var(--status-' + t + '-border)',
      background: 'var(--status-' + t + '-bg)',
      color: 'var(--status-' + t + '-fg)',
      borderRadius: shape === 'round' ? 'var(--radius-pill)' : 'var(--radius-sm)',
      padding: size === 'sm' ? '2px 7px' : '4px 9px',
      fontSize: size === 'sm' ? '.68rem' : '.72rem',
      fontWeight: 600,
      lineHeight: 1.35,
      fontFamily: 'var(--font-sans)',
      whiteSpace: 'nowrap'
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 12 : 14
  }), children);
}
Object.assign(__ds_scope, { Pill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Pill.jsx", error: String((e && e.message) || e) }); }

// components/core/logoPaths.js
try { (() => {
const LOGO_WORD_D = "M86.91 47L78 47L78 10.47L93.55 10.47Q96.60 10.47 99.09 10.94Q101.58 11.41 103.49 12.32Q105.40 13.24 106.73 14.54Q108.06 15.84 108.72 17.53Q109.38 19.21 109.38 21.26L109.38 21.26Q109.38 23.20 108.77 24.75Q108.17 26.30 106.92 27.46Q105.68 28.62 103.79 29.34Q101.91 30.06 99.42 30.39L99.42 30.39L99.42 31.23Q102.58 31.56 104.32 32.64Q106.06 33.72 107.00 35.49Q107.94 37.26 108.66 39.75L108.66 39.75L110.77 47L100.86 47L99.25 40.30Q98.76 38.09 97.90 36.87Q97.04 35.65 95.71 35.18Q94.38 34.71 92.39 34.71L92.39 34.71L86.91 34.71L86.91 47ZM86.91 17.22L86.91 28.13L92.94 28.13Q96.32 28.13 98.20 26.80Q100.08 25.47 100.08 22.65L100.08 22.65Q100.08 19.88 98.37 18.55Q96.65 17.22 93.17 17.22L93.17 17.22L86.91 17.22ZM129.59 47.77L129.59 47.77Q125.93 47.77 123.06 46.81Q120.18 45.84 118.16 43.96Q116.14 42.07 115.08 39.31Q114.03 36.54 114.03 32.94L114.03 32.94Q114.03 29.45 115.06 26.52Q116.08 23.59 117.99 21.46Q119.90 19.32 122.70 18.16Q125.49 17.00 128.98 17.00L128.98 17.00Q132.52 17.00 135.20 18.13Q137.89 19.27 139.63 21.48Q141.38 23.70 142.21 26.88Q143.04 30.06 142.76 34.16L142.76 34.16L122.61 34.32Q122.89 37.70 124.55 39.36L124.55 39.36Q126.49 41.41 129.53 41.41L129.53 41.41Q131.03 41.41 132.02 40.99Q133.02 40.58 133.65 39.94Q134.29 39.31 134.65 38.53Q135.01 37.76 135.23 37.04L135.23 37.04L142.98 38.70Q142.54 40.75 141.57 42.41Q140.60 44.07 138.97 45.28Q137.34 46.50 135.04 47.14Q132.74 47.77 129.59 47.77ZM122.83 29.68L122.83 29.68L134.62 29.56Q134.62 28.18 134.18 27.13L134.18 27.13Q133.46 25.41 132.08 24.61Q130.69 23.81 129.09 23.81L129.09 23.81Q127.15 23.81 125.68 24.86Q124.22 25.91 123.39 27.90L123.39 27.90Q123.06 28.68 122.83 29.68ZM160.14 47.77L160.14 47.77Q157.21 47.77 154.83 47.25Q152.45 46.72 150.68 45.73Q148.90 44.73 147.77 43.32Q146.63 41.91 146.19 40.19L146.19 40.19L152.83 37.26Q153.22 38.20 154.19 39.17Q155.16 40.14 156.79 40.75Q158.42 41.35 160.75 41.35L160.75 41.35Q162.96 41.35 164.21 40.72Q165.45 40.08 165.45 38.86L165.45 38.86Q165.45 37.98 164.76 37.45Q164.07 36.93 162.69 36.51Q161.30 36.10 159.25 35.71L159.25 35.71Q157.15 35.27 154.99 34.68Q152.83 34.10 150.95 33.08Q149.07 32.06 147.94 30.37Q146.80 28.68 146.80 26.08L146.80 26.08Q146.80 23.37 148.24 21.35Q149.68 19.32 152.53 18.16Q155.38 17.00 159.48 17.00L159.48 17.00Q163.13 17.00 165.90 17.94Q168.66 18.88 170.52 20.63Q172.37 22.37 173.09 24.80L173.09 24.80L165.95 27.35Q165.68 26.13 164.82 25.25Q163.96 24.36 162.66 23.89Q161.36 23.42 159.59 23.42L159.59 23.42Q157.43 23.42 156.24 24.08Q155.05 24.75 155.05 25.86L155.05 25.86Q155.05 26.74 155.85 27.32Q156.65 27.90 158.15 28.29Q159.64 28.68 161.69 29.12L161.69 29.12Q163.85 29.56 165.98 30.15Q168.11 30.73 169.85 31.70Q171.60 32.66 172.62 34.24Q173.65 35.82 173.65 38.31L173.65 38.31Q173.65 41.24 172.10 43.37Q170.55 45.51 167.53 46.64Q164.51 47.77 160.14 47.77ZM188.59 47.77L188.59 47.77Q183.39 47.77 180.76 44.26Q178.13 40.75 178.13 33.55L178.13 33.55L178.13 17.77L187.10 17.77L187.10 32.39Q187.10 36.48 188.31 38.50Q189.53 40.52 192.02 40.52L192.02 40.52Q193.52 40.52 194.60 39.78Q195.68 39.03 196.42 37.67Q197.17 36.32 197.53 34.55Q197.89 32.77 197.89 30.67L197.89 30.67L197.89 17.77L206.80 17.77L206.80 47L199.72 47L199.55 37.98L198.44 37.98Q197.61 41.41 196.37 43.60Q195.12 45.78 193.24 46.78Q191.36 47.77 188.59 47.77ZM222.58 47L213.66 47L213.66 17.77L220.69 17.77L220.80 26.35L221.91 26.35Q222.69 23.20 223.96 21.12Q225.23 19.05 227.06 18.02Q228.89 17.00 231.32 17.00L231.32 17.00Q233.87 17.00 235.56 18.08Q237.24 19.16 238.24 21.23Q239.24 23.31 239.57 26.35L239.57 26.35L240.51 26.35Q241.39 23.09 242.83 21.01Q244.27 18.94 246.27 17.97Q248.26 17.00 250.58 17.00L250.58 17.00Q253.07 17.00 254.93 17.97Q256.78 18.94 258.03 20.85Q259.27 22.76 259.88 25.61Q260.49 28.46 260.49 32.22L260.49 32.22L260.49 47L251.52 47L251.52 33.33Q251.52 30.39 251.05 28.46Q250.58 26.52 249.59 25.55Q248.59 24.58 247.04 24.58L247.04 24.58Q245.27 24.58 244.02 25.75Q242.78 26.91 242.11 28.98Q241.45 31.06 241.45 33.66L241.45 33.66L241.45 47L232.70 47L232.70 33.49Q232.70 30.45 232.18 28.51Q231.65 26.58 230.63 25.58Q229.61 24.58 228.06 24.58L228.06 24.58Q226.28 24.58 225.07 25.75Q223.85 26.91 223.21 28.98Q222.58 31.06 222.58 33.66L222.58 33.66L222.58 47ZM280.42 47.77L280.42 47.77Q275.99 47.77 272.58 46.06Q269.18 44.34 267.24 40.91Q265.31 37.48 265.31 32.33L265.31 32.33Q265.31 27.18 267.24 23.78Q269.18 20.38 272.61 18.69Q276.04 17.00 280.47 17.00L280.47 17.00Q284.90 17.00 288.33 18.72Q291.76 20.43 293.70 23.84Q295.64 27.24 295.64 32.39L295.64 32.39Q295.64 37.65 293.65 41.08Q291.65 44.51 288.19 46.14Q284.73 47.77 280.42 47.77ZM280.69 41.30L280.69 41.30Q282.69 41.30 284.01 40.39Q285.34 39.47 286.01 37.59Q286.67 35.71 286.67 32.94L286.67 32.94Q286.67 30.01 285.95 27.99Q285.23 25.97 283.82 24.89Q282.41 23.81 280.20 23.81L280.20 23.81Q278.31 23.81 276.96 24.72Q275.60 25.63 274.94 27.52Q274.27 29.40 274.27 32.22L274.27 32.22Q274.27 36.76 275.96 39.03Q277.65 41.30 280.69 41.30ZM309.81 47L300.84 47L300.84 17.77L308.15 17.77L308.31 27.68L309.42 27.68Q309.81 23.81 310.89 21.51Q311.97 19.21 313.99 18.16Q316.01 17.11 319.00 17.11L319.00 17.11Q319.44 17.11 319.99 17.14Q320.55 17.17 321.27 17.28L321.27 17.28L320.93 26.80Q320.05 26.35 319.02 26.22Q318.00 26.08 317.23 26.08L317.23 26.08Q315.07 26.08 313.49 26.91Q311.91 27.74 311.00 29.45Q310.08 31.17 309.81 33.77L309.81 33.77L309.81 47ZM332.39 47.77L332.39 47.77Q329.96 47.77 328.07 46.81Q326.19 45.84 325.14 43.98Q324.09 42.13 324.09 39.47L324.09 39.47Q324.09 36.98 325.06 35.35Q326.03 33.72 327.88 32.75Q329.73 31.78 332.34 31.14Q334.94 30.51 338.26 30.01L338.26 30.01Q339.86 29.73 340.94 29.48Q342.02 29.23 342.58 28.68Q343.13 28.13 343.13 27.07L343.13 27.07Q343.13 25.69 342.13 24.69Q341.14 23.70 338.92 23.70L338.92 23.70Q337.37 23.70 336.13 24.25Q334.88 24.80 334.00 25.86Q333.11 26.91 332.67 28.40L332.67 28.40L324.81 26.08Q325.53 23.75 326.83 22.04Q328.13 20.32 329.96 19.19Q331.78 18.05 334.13 17.53Q336.49 17.00 339.14 17.00L339.14 17.00Q343.57 17.00 346.37 18.41Q349.16 19.82 350.52 22.78Q351.87 25.75 351.87 30.39L351.87 30.39L351.87 34.88Q351.87 36.87 351.96 38.89Q352.04 40.91 352.18 42.93Q352.32 44.95 352.54 47L352.54 47L344.68 47Q344.46 45.73 344.24 43.93Q344.01 42.13 343.90 40.25L343.90 40.25L342.85 40.25Q342.08 42.35 340.61 44.09Q339.14 45.84 337.07 46.81Q334.99 47.77 332.39 47.77ZM336.43 41.46L336.43 41.46Q337.43 41.46 338.45 41.11Q339.48 40.75 340.42 40.11Q341.36 39.47 342.13 38.53Q342.91 37.59 343.30 36.48L343.30 36.48L343.18 33.00Q342.69 33.27 342.08 33.44L342.08 33.44Q340.80 33.83 339.50 34.05Q338.20 34.27 336.96 34.52Q335.71 34.77 334.74 35.15Q333.77 35.54 333.22 36.21Q332.67 36.87 332.67 38.03L332.67 38.03Q332.67 39.58 333.72 40.52Q334.77 41.46 336.43 41.46Z";
const LOGO_W = 355;
const DOOR_RAYS = ["M41 14.5L66 5V14L41 21Z", "M41 25L66 23.5V33L41 32Z", "M41 37L66 42.5V53L41 44Z"];
const DOOR_LEAF = "M19 13L30.5 17.5V46.5L19 51Z";
Object.assign(__ds_scope, { LOGO_WORD_D, LOGO_W, DOOR_RAYS, DOOR_LEAF });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/logoPaths.js", error: String((e && e.message) || e) }); }

// components/core/Logo.jsx
try { (() => {
const TONES = {
  default: {
    sq: '#17695d',
    leaf: '#ffffff',
    knob: '#17695d',
    a: '#f9d67a',
    b: '#ffb38a',
    word: '#173b39'
  },
  inverse: {
    sq: '#ffffff',
    leaf: '#17695d',
    knob: '#ffffff',
    a: '#f6c35f',
    b: '#ff9f70',
    word: '#ffffff'
  },
  mono: {
    sq: '#173b39',
    leaf: '#ffffff',
    knob: '#173b39',
    a: '#ffffff',
    b: '#ffffff',
    word: '#173b39'
  }
};
let seq = 0;
function Logo({
  variant = 'full',
  tone = 'default',
  size = 32,
  title = 'Resumora',
  rays
}) {
  const t = TONES[tone] || TONES.default;
  const id = React.useMemo(() => 'rzl' + ++seq, []);
  const showRays = rays ?? size >= 24;
  const mark = /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: id + 'g',
    x1: "0",
    y1: "0",
    x2: "0.35",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: t.a
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: t.b
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: id + 'r',
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: t.b,
    stopOpacity: ".75"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: t.b,
    stopOpacity: "0"
  })), /*#__PURE__*/React.createElement("clipPath", {
    id: id + 'c'
  }, /*#__PURE__*/React.createElement("rect", {
    width: "64",
    height: "64",
    rx: "16"
  }))), /*#__PURE__*/React.createElement("rect", {
    width: "64",
    height: "64",
    rx: "16",
    fill: t.sq
  }), /*#__PURE__*/React.createElement("g", {
    clipPath: 'url(#' + id + 'c)'
  }, showRays && __ds_scope.DOOR_RAYS.map((d, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: d,
    fill: 'url(#' + id + 'r)',
    opacity: [1, .8, .6][i]
  })), /*#__PURE__*/React.createElement("rect", {
    x: "19",
    y: "13",
    width: "22",
    height: "38",
    rx: "3",
    fill: 'url(#' + id + 'g)'
  }), /*#__PURE__*/React.createElement("path", {
    d: __ds_scope.DOOR_LEAF,
    fill: t.leaf,
    stroke: t.leaf,
    strokeWidth: "2",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "27.6",
    cy: "32.5",
    r: "1.9",
    fill: t.knob
  })));
  if (variant === 'mark') return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    role: "img",
    "aria-label": title,
    style: {
      display: 'block',
      flexShrink: 0
    }
  }, mark);
  if (variant === 'wordmark') {
    const w = __ds_scope.LOGO_W - 78;
    return /*#__PURE__*/React.createElement("svg", {
      width: size * w / 64,
      height: size,
      viewBox: '78 0 ' + w + ' 64',
      role: "img",
      "aria-label": title,
      style: {
        display: 'block',
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: __ds_scope.LOGO_WORD_D,
      fill: t.word
    }));
  }
  return /*#__PURE__*/React.createElement("svg", {
    width: size * __ds_scope.LOGO_W / 64,
    height: size,
    viewBox: '0 0 ' + __ds_scope.LOGO_W + ' 64',
    role: "img",
    "aria-label": title,
    style: {
      display: 'block',
      flexShrink: 0
    }
  }, mark, /*#__PURE__*/React.createElement("path", {
    d: __ds_scope.LOGO_WORD_D,
    fill: t.word
  }));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Logo.jsx", error: String((e && e.message) || e) }); }

// components/document/CVDocument.jsx
try { (() => {
function CVDocument({
  template = 'clar',
  name,
  titles = [],
  contact,
  sections = [],
  highlight,
  scale = 1
}) {
  const clar = template === 'clar';
  const accent = 'var(--pine-600)';
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: 'var(--surface-document)',
      color: 'var(--text-document)',
      padding: 36 * scale,
      border: '1px solid #d7dfda',
      borderTop: clar ? '1px solid #d7dfda' : 7 * scale + 'px solid ' + accent,
      borderRadius: 'var(--radius-xs)',
      fontFamily: clar ? 'var(--font-document)' : 'var(--font-sans)',
      fontSize: 13.3 * scale + 'px',
      lineHeight: 1.55,
      boxShadow: 'var(--shadow-document)',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontSize: (clar ? 27 : 30) * scale,
      letterSpacing: 0,
      fontWeight: 700,
      color: clar ? 'var(--text-document)' : accent,
      fontFamily: clar ? 'var(--font-document)' : 'var(--font-display)'
    }
  }, name), titles.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 14 * scale,
      marginTop: 4,
      color: '#334c45'
    }
  }, titles.join(' · ')), contact && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5 * scale,
      margin: 10 * scale + 'px 0',
      color: '#334c45'
    }
  }, contact), sections.map((s, i) => /*#__PURE__*/React.createElement("section", {
    key: i
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12 * scale,
      textTransform: 'uppercase',
      letterSpacing: '.1em',
      padding: clar ? '0 0 ' + 7 * scale + 'px' : 9 * scale + 'px',
      margin: 22 * scale + 'px 0 ' + 10 * scale + 'px',
      borderBottom: clar ? '1px solid #c2d4ca' : 0,
      background: clar ? 'transparent' : '#e9f1eb',
      fontWeight: 700
    }
  }, s.title), s.text && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      color: '#334c45'
    }
  }, s.text), (s.items || []).map((it, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      marginBottom: 10 * scale
    }
  }, it.heading && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      fontWeight: 700
    }
  }, /*#__PURE__*/React.createElement("span", null, it.heading), it.dates && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 400,
      fontSize: 12 * scale,
      color: '#334c45',
      whiteSpace: 'nowrap'
    }
  }, it.dates)), it.sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12 * scale,
      color: '#334c45'
    }
  }, it.sub), it.bullets && /*#__PURE__*/React.createElement("ul", {
    style: {
      paddingLeft: 18 * scale,
      margin: 6 * scale + 'px 0 0'
    }
  }, it.bullets.map((b, k) => {
    const hi = highlight && highlight.includes(b);
    return /*#__PURE__*/React.createElement("li", {
      key: k,
      style: {
        margin: 5 * scale + 'px 0',
        fontSize: 12.8 * scale,
        background: hi ? 'var(--marigold-100)' : 'transparent',
        boxShadow: hi ? '0 0 0 3px var(--marigold-100)' : 'none',
        borderRadius: 2
      }
    }, b);
  })))))));
}
Object.assign(__ds_scope, { CVDocument });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/document/CVDocument.jsx", error: String((e && e.message) || e) }); }

// components/document/PlanCard.jsx
try { (() => {
function PlanCard({
  term,
  price = '— RON',
  note,
  features = [],
  selected,
  badge,
  onSelect
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onSelect,
    "aria-pressed": !!selected,
    style: {
      position: 'relative',
      textAlign: 'left',
      font: 'inherit',
      color: 'var(--text-body)',
      background: 'var(--surface-card)',
      border: selected ? '2px solid var(--border-selected)' : '1px solid var(--border-subtle)',
      padding: selected ? 24 : 25,
      borderRadius: 'var(--radius-card)',
      cursor: 'pointer',
      display: 'grid',
      gap: 6,
      minWidth: 0,
      transition: 'border-color var(--dur-fast)'
    }
  }, badge && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -11,
      left: 22,
      background: 'var(--marigold-300)',
      color: 'var(--pine-900)',
      fontSize: '.7rem',
      fontWeight: 750,
      padding: '3px 9px',
      borderRadius: 'var(--radius-pill)'
    }
  }, badge), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 650,
      fontSize: '.95rem',
      color: 'var(--text-strong)'
    }
  }, term), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: '2rem',
      fontWeight: 700,
      letterSpacing: 'var(--tracking-stat)',
      color: 'var(--text-strong)',
      margin: '10px 0 0'
    }
  }, price), note && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '.78rem',
      color: 'var(--text-muted)'
    }
  }, note), features.length > 0 && /*#__PURE__*/React.createElement("ul", {
    style: {
      listStyle: 'none',
      padding: 0,
      margin: '14px 0 0',
      display: 'grid',
      gap: 8
    }
  }, features.map((f, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: 'flex',
      gap: 8,
      fontSize: '.83rem',
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 16,
    color: "var(--text-accent)",
    style: {
      marginTop: 2
    }
  }), f))));
}
Object.assign(__ds_scope, { PlanCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/document/PlanCard.jsx", error: String((e && e.message) || e) }); }

// components/document/TaskCard.jsx
try { (() => {
function TaskCard({
  icon = 'briefcase',
  title,
  children,
  meta,
  onClick,
  emphasis
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'flex',
      gap: 14,
      alignItems: 'flex-start',
      width: '100%',
      padding: 19,
      textAlign: 'left',
      font: 'inherit',
      color: 'var(--text-body)',
      background: emphasis ? 'var(--surface-hero)' : 'var(--surface-card)',
      border: '1px solid ' + (emphasis ? '#d6e4d9' : 'var(--border-subtle)'),
      borderRadius: 'var(--radius-card)',
      cursor: 'pointer',
      transition: 'border-color var(--dur-fast), transform var(--dur-fast) var(--ease-out)'
    },
    onMouseEnter: e => e.currentTarget.style.borderColor = 'var(--border-strong)',
    onMouseLeave: e => e.currentTarget.style.borderColor = emphasis ? '#d6e4d9' : 'var(--border-subtle)'
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: emphasis ? 'var(--action-primary)' : 'var(--surface-hero)',
      color: emphasis ? 'var(--text-on-primary)' : 'var(--text-accent)',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      display: 'block',
      fontSize: '.95rem',
      fontWeight: 650,
      color: 'var(--text-strong)'
    }
  }, title), children && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: '.82rem',
      color: 'var(--text-muted)',
      marginTop: 4,
      lineHeight: 1.5
    }
  }, children), meta && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 6,
      marginTop: 10,
      flexWrap: 'wrap'
    }
  }, meta)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 18
  })));
}
Object.assign(__ds_scope, { TaskCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/document/TaskCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
const MAP = {
  info: ['info', 'info'],
  good: ['good', 'circle-check'],
  warn: ['warn', 'circle-alert'],
  bad: ['bad', 'circle-x'],
  neutral: ['neutral', 'info']
};
function Alert({
  tone = 'info',
  title,
  children,
  action,
  icon
}) {
  const [t, ic] = MAP[tone] || MAP.info;
  return /*#__PURE__*/React.createElement("div", {
    role: tone === 'bad' ? 'alert' : 'status',
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      padding: '14px 16px',
      background: 'var(--status-' + t + '-bg)',
      border: '1px solid var(--status-' + t + '-border)',
      borderRadius: 'var(--radius-lg)',
      color: 'var(--text-body)',
      fontSize: '.84rem',
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--status-' + t + '-fg)',
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon || ic,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: 'var(--status-' + t + '-fg)',
      marginBottom: children ? 2 : 0
    }
  }, title), children), action && /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      alignSelf: 'center'
    }
  }, action));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Dialog.jsx
try { (() => {
function Dialog({
  open = true,
  title,
  children,
  footer,
  onClose,
  width = 560,
  inline
}) {
  if (!open) return null;
  const box = /*#__PURE__*/React.createElement("div", {
    role: "dialog",
    "aria-modal": !inline,
    "aria-label": typeof title === 'string' ? title : undefined,
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-dialog)',
      width: '100%',
      maxWidth: width,
      boxShadow: inline ? 'none' : 'var(--shadow-raised)',
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      padding: '22px 22px 0 25px'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-section-title)',
      color: 'var(--text-strong)',
      letterSpacing: 'var(--tracking-heading)'
    }
  }, title), onClose && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Close",
    size: "sm",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 25px 0',
      fontSize: '.9rem',
      lineHeight: 1.6
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      padding: '22px 25px 25px'
    }
  }, footer), !footer && /*#__PURE__*/React.createElement("div", {
    style: {
      height: 25
    }
  }));
  if (inline) return box;
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => e.target === e.currentTarget && onClose && onClose(),
    style: {
      position: 'fixed',
      inset: 0,
      background: 'var(--backdrop)',
      display: 'grid',
      placeItems: 'center',
      padding: 16,
      zIndex: 40
    }
  }, box);
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function EmptyState({
  icon = 'file-plus',
  title,
  children,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '46px 25px',
      display: 'grid',
      justifyItems: 'center',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: 16,
      background: 'var(--surface-hero)',
      color: 'var(--text-accent)',
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 26
  })), /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-section-title)',
      color: 'var(--text-strong)'
    }
  }, title), children && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      color: 'var(--text-muted)',
      maxWidth: 420,
      lineHeight: 1.6,
      fontSize: '.9rem'
    }
  }, children), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      justifyContent: 'center',
      marginTop: 4
    }
  }, actions));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Spinner.jsx
try { (() => {
function Spinner({
  size = 40,
  label
}) {
  __ds_scope.injectCss('spinner', '@keyframes cvz-ring{to{transform:rotate(360deg)}}');
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      justifyItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    role: "progressbar",
    "aria-label": label || 'Working',
    style: {
      width: size,
      height: size,
      border: (size > 24 ? 4 : 2) + 'px solid var(--pine-200)',
      borderTopColor: 'var(--action-primary)',
      borderRadius: '50%',
      animation: 'cvz-ring 1s linear infinite',
      display: 'block'
    }
  }), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '.85rem',
      color: 'var(--text-muted)'
    }
  }, label));
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
function Toast({
  children,
  icon = 'check',
  action,
  onAction,
  floating = true
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    "aria-live": "polite",
    style: {
      position: floating ? 'fixed' : 'relative',
      bottom: floating ? 22 : undefined,
      left: floating ? '50%' : undefined,
      transform: floating ? 'translateX(-50%)' : undefined,
      zIndex: 50,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--surface-inverse)',
      color: 'var(--text-on-inverse)',
      padding: '11px 14px 11px 16px',
      borderRadius: 'var(--radius-md)',
      fontSize: '.85rem',
      boxShadow: 'var(--shadow-toast)',
      maxWidth: 'calc(100vw - 30px)'
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16,
    color: "var(--pine-200)"
  }), /*#__PURE__*/React.createElement("span", null, children), action && /*#__PURE__*/React.createElement("button", {
    onClick: onAction,
    style: {
      marginLeft: 6,
      background: 'transparent',
      border: 0,
      color: 'var(--marigold-300)',
      font: '700 .82rem var(--font-sans)',
      cursor: 'pointer',
      padding: '4px 6px'
    }
  }, action));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/FieldShell.jsx
try { (() => {
function FieldShell({
  id,
  label,
  hint,
  error,
  success,
  optional,
  children
}) {
  const msg = error || success || hint;
  const kind = error ? 'error' : success ? 'success' : 'hint';
  return /*#__PURE__*/React.createElement("div", {
    className: "rz-field"
  }, label && /*#__PURE__*/React.createElement("div", {
    className: "rz-lrow"
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    className: "rz-label"
  }, label), optional && /*#__PURE__*/React.createElement("span", {
    className: "rz-opt"
  }, "Optional")), children, msg && /*#__PURE__*/React.createElement("div", {
    id: id + '-msg',
    className: 'rz-msg rz-msg--' + kind
  }, kind !== 'hint' && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: error ? 'circle-alert' : 'circle-check',
    size: 14
  }), /*#__PURE__*/React.createElement("span", null, msg)));
}
Object.assign(__ds_scope, { FieldShell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FieldShell.jsx", error: String((e && e.message) || e) }); }

// components/forms/Segmented.jsx
try { (() => {
function Segmented({
  options = [],
  value,
  onChange,
  size = 'md',
  fullWidth
}) {
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: fullWidth ? 'flex' : 'inline-flex',
      gap: 4,
      padding: 4,
      background: 'var(--sage-100)',
      borderRadius: 12,
      border: '1px solid var(--sage-150)'
    }
  }, options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    const ic = typeof o === 'string' ? null : o.icon;
    const on = v === value;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange && onChange(v),
      style: {
        flex: fullWidth ? 1 : undefined,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        border: 0,
        borderRadius: 9,
        padding: size === 'sm' ? '6px 12px' : '9px 16px',
        minHeight: size === 'sm' ? 32 : 40,
        font: '650 ' + (size === 'sm' ? '.78rem' : '.86rem') + '/1.2 var(--font-sans)',
        cursor: 'pointer',
        background: on ? 'var(--surface-card)' : 'transparent',
        color: on ? 'var(--text-strong)' : 'var(--sage-600)',
        boxShadow: on ? '0 1px 3px rgba(23,59,57,.12), 0 0 0 1px rgba(23,59,57,.05)' : 'none',
        transition: 'background var(--dur-fast), color var(--dur-fast), box-shadow var(--dur-fast)',
        whiteSpace: 'nowrap'
      }
    }, ic && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: ic,
      size: 16,
      color: on ? 'var(--pine-600)' : undefined
    }), l);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/forms/fieldCss.js
try { (() => {
const FIELD_CSS = ".rz-field{display:grid;gap:8px;min-width:0}\n.rz-lrow{display:flex;justify-content:space-between;align-items:baseline;gap:8px}\n.rz-label{font:650 .86rem/1.35 var(--font-sans);color:var(--text-strong)}\n.rz-opt{font:500 .74rem var(--font-sans);color:var(--text-muted)}\n.rz-control{position:relative;display:flex;align-items:center;gap:10px;min-height:48px;padding:0 14px;background:var(--sage-25);border:1.5px solid var(--sage-200);border-radius:12px;color:var(--text-body);transition:border-color var(--dur-fast) var(--ease-out),background var(--dur-fast) var(--ease-out),box-shadow var(--dur-base) var(--ease-out)}\n.rz-control:hover{border-color:var(--sage-300);background:#fff}\n.rz-control:focus-within{background:#fff;border-color:var(--pine-600);box-shadow:0 0 0 4px var(--pine-100)}\n.rz-control[data-state=error]{border-color:var(--rose-400);background:#fffafa}\n.rz-control[data-state=error]:focus-within{box-shadow:0 0 0 4px var(--rose-50)}\n.rz-control[data-state=success]{border-color:var(--pine-300)}\n.rz-control[data-disabled=true]{background:var(--sage-100);border-color:var(--sage-150);color:var(--text-muted);box-shadow:none}\n.rz-control--multi{align-items:stretch;padding:13px 14px 32px}\n.rz-control--sm{min-height:40px;border-radius:10px}\n.rz-native{flex:1;min-width:0;width:100%;border:0;outline:0;background:transparent;padding:12px 0;font:450 .95rem/1.5 var(--font-sans);color:inherit}\n.rz-native:focus-visible{outline:none}\n.rz-control--sm .rz-native{padding:8px 0;font-size:.88rem}\n.rz-native::placeholder{color:var(--sage-500)}\ntextarea.rz-native{resize:vertical;min-height:96px;padding:0}\nselect.rz-native{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:26px}\n.rz-adorn{color:var(--sage-500);display:flex;flex-shrink:0;transition:color var(--dur-fast)}\n.rz-control:focus-within .rz-adorn{color:var(--pine-600)}\n.rz-chev{position:absolute;right:14px;pointer-events:none;color:var(--sage-600)}\n.rz-suffix{font:500 .82rem var(--font-sans);color:var(--text-muted);flex-shrink:0}\n.rz-count{position:absolute;right:14px;bottom:9px;font:500 .72rem var(--font-sans);color:var(--text-muted)}\n.rz-count[data-over=true]{color:var(--status-bad-fg)}\n.rz-msg{display:flex;gap:6px;align-items:flex-start;font:500 .78rem/1.45 var(--font-sans);color:var(--text-muted)}\n.rz-msg>span:first-child{margin-top:1px}\n.rz-msg--error{color:var(--status-bad-fg)}.rz-msg--success{color:var(--status-good-fg)}\n.rz-check{position:relative;display:flex;gap:12px;align-items:flex-start;cursor:pointer;font:450 .9rem/1.45 var(--font-sans);color:var(--text-body);-webkit-tap-highlight-color:transparent}\n.rz-check input{position:absolute;opacity:0;width:1px;height:1px;margin:0}\n.rz-box{width:22px;height:22px;border-radius:7px;border:1.5px solid var(--sage-300);background:#fff;display:grid;place-items:center;flex-shrink:0;color:transparent;transition:background var(--dur-fast),border-color var(--dur-fast),box-shadow var(--dur-fast),transform var(--dur-fast) var(--ease-spring)}\n.rz-box--radio{border-radius:50%}\n.rz-check:hover .rz-box{border-color:var(--pine-500)}\n.rz-check input:checked+.rz-box{background:var(--pine-600);border-color:var(--pine-600);color:#fff;box-shadow:0 2px 0 var(--pine-800)}\n.rz-check input:checked+.rz-box--radio{background:#fff;border:7px solid var(--pine-600);box-shadow:none}\n.rz-check:active .rz-box{transform:scale(.92)}\n.rz-check input:focus-visible+.rz-box{outline:3px solid var(--focus-ring);outline-offset:2px}\n.rz-check input:disabled~*{opacity:.5}.rz-check:has(input:disabled){cursor:not-allowed}\n.rz-check--card{padding:14px 16px;border:1.5px solid var(--sage-200);border-radius:14px;background:#fff;transition:border-color var(--dur-fast),background var(--dur-fast)}\n.rz-check--card:hover{border-color:var(--sage-300)}\n.rz-check--card:has(input:checked){border-color:var(--pine-600);background:var(--pine-50)}\n.rz-check-t{display:grid;gap:2px;min-width:0}.rz-check-d{font-size:.8rem;color:var(--text-muted)}\n.rz-drop{display:grid;justify-items:center;gap:10px;text-align:center;padding:30px 24px;border:2px dashed var(--sage-300);border-radius:16px;background:var(--sage-25);cursor:pointer;transition:border-color var(--dur-fast),background var(--dur-fast)}\n.rz-drop:hover,.rz-drop[data-drag=true]{border-color:var(--pine-600);background:var(--pine-50)}\n.rz-drop:focus-within{outline:3px solid var(--focus-ring);outline-offset:3px}\n.rz-drop input{position:absolute;opacity:0;width:1px;height:1px}\n.rz-drop-ic{width:52px;height:52px;border-radius:16px;background:var(--pine-100);color:var(--pine-600);display:grid;place-items:center;transition:transform var(--dur-base) var(--ease-spring)}\n.rz-drop[data-drag=true] .rz-drop-ic{transform:translateY(-4px)}\n.rz-file{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border:1.5px solid var(--pine-300);border-radius:14px;background:#fff}\n.rz-select{position:relative;min-width:0}\n.rz-trigger{width:100%;text-align:left;cursor:pointer;font:inherit;-webkit-tap-highlight-color:transparent}\n.rz-trigger:focus-visible{outline:none}\n.rz-trigger[data-open=true]{background:#fff;border-color:var(--pine-600);box-shadow:0 0 0 4px var(--pine-100)}\n.rz-trigger:disabled{cursor:not-allowed}\n.rz-val{flex:1;min-width:0;padding:12px 0;font:500 .95rem/1.5 var(--font-sans);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-body)}\n.rz-val[data-ph=true]{color:var(--sage-500);font-weight:450}\n.rz-control--sm .rz-val{padding:8px 0;font-size:.88rem}\n.rz-chev2{color:var(--sage-600);display:flex;transition:transform var(--dur-base) var(--ease-out),color var(--dur-fast)}\n.rz-trigger[data-open=true] .rz-chev2{transform:rotate(180deg);color:var(--pine-600)}\n.rz-pop{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:30;background:#fff;border:1px solid var(--sage-200);border-radius:14px;box-shadow:0 14px 34px rgba(23,59,57,.14),0 2px 6px rgba(23,59,57,.06);padding:6px;animation:rz-pop 160ms var(--ease-out);transform-origin:top center}\n.rz-pop[data-up=true]{top:auto;bottom:calc(100% + 6px);transform-origin:bottom center}\n@keyframes rz-pop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}\n.rz-list{list-style:none;margin:0;padding:0;max-height:264px;overflow:auto;display:grid;gap:2px;overscroll-behavior:contain}\n.rz-oi{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:9px;cursor:pointer;color:var(--text-body);font:500 .9rem/1.35 var(--font-sans);transition:background var(--dur-fast)}\n.rz-oi[data-active=true]{background:var(--sage-50)}\n.rz-oi[aria-selected=true]{color:var(--pine-700);font-weight:650;background:var(--pine-50)}\n.rz-oi[aria-selected=true][data-active=true]{background:var(--pine-100)}\n.rz-oi[aria-disabled=true]{opacity:.45;cursor:not-allowed}\n.rz-oi-ic{width:32px;height:32px;border-radius:9px;background:var(--sage-100);color:var(--sage-600);display:grid;place-items:center;flex-shrink:0;transition:background var(--dur-fast),color var(--dur-fast)}\n.rz-oi[aria-selected=true] .rz-oi-ic{background:#fff;color:var(--pine-600);box-shadow:0 0 0 1px var(--pine-200)}\n.rz-oi-t{flex:1;min-width:0}\n.rz-oi-d{display:block;font-weight:450;font-size:.77rem;color:var(--text-muted);margin-top:2px;line-height:1.4}\n.rz-oi-ck{color:var(--pine-600);display:flex;flex-shrink:0}\n.rz-search{display:flex;align-items:center;gap:8px;padding:2px 10px 8px;margin:0 0 6px;border-bottom:1px solid var(--sage-150);color:var(--sage-500)}\n.rz-search input{flex:1;min-width:0;border:0;outline:0;font:450 .9rem var(--font-sans);padding:7px 0;background:transparent;color:var(--text-body)}\n.rz-empty{padding:14px 12px;font-size:.84rem;color:var(--text-muted)}\n.rz-grp{padding:9px 10px 4px;font:700 .66rem var(--font-sans);letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted)}";
Object.assign(__ds_scope, { FIELD_CSS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/fieldCss.js", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  label,
  description,
  checked,
  defaultChecked,
  onChange,
  disabled,
  variant = 'plain'
}) {
  __ds_scope.injectCss('field', __ds_scope.FIELD_CSS);
  return /*#__PURE__*/React.createElement("label", {
    className: 'rz-check' + (variant === 'card' ? ' rz-check--card' : '')
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: checked,
    defaultChecked: defaultChecked,
    disabled: disabled,
    onChange: onChange && (e => onChange(e.target.checked, e))
  }), /*#__PURE__*/React.createElement("span", {
    className: "rz-box"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14,
    style: {
      strokeWidth: 3
    }
  })), /*#__PURE__*/React.createElement("span", {
    className: "rz-check-t"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: description ? 650 : 450,
      color: 'var(--text-strong)'
    }
  }, label), description && /*#__PURE__*/React.createElement("span", {
    className: "rz-check-d"
  }, description)));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Dropzone.jsx
try { (() => {
function Dropzone({
  title = 'Drop your CV here',
  accept = '.pdf,.docx',
  acceptLabel = 'PDF or DOCX, up to 10 MB',
  file,
  onFile,
  onRemove
}) {
  __ds_scope.injectCss('field', __ds_scope.FIELD_CSS);
  const [drag, setDrag] = React.useState(false);
  if (file) return /*#__PURE__*/React.createElement("div", {
    className: "rz-file"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: 'var(--pine-100)',
      color: 'var(--pine-600)',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "file-text",
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      display: 'block',
      fontSize: '.9rem',
      fontWeight: 650,
      color: 'var(--text-strong)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, file.name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      fontSize: '.76rem',
      color: 'var(--status-good-fg)',
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "circle-check",
    size: 13
  }), "Uploaded", file.size ? ' · ' + file.size : '')), onRemove && /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    label: "Remove file",
    size: "sm",
    onClick: onRemove
  }));
  const pick = f => f && onFile && onFile({
    name: f.name,
    size: Math.max(1, Math.round(f.size / 1024)) + ' KB',
    file: f
  });
  return /*#__PURE__*/React.createElement("label", {
    className: "rz-drop",
    "data-drag": drag,
    onDragOver: e => {
      e.preventDefault();
      setDrag(true);
    },
    onDragLeave: () => setDrag(false),
    onDrop: e => {
      e.preventDefault();
      setDrag(false);
      pick(e.dataTransfer.files[0]);
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: accept,
    onChange: e => pick(e.target.files[0])
  }), /*#__PURE__*/React.createElement("span", {
    className: "rz-drop-ic"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "upload",
    size: 24
  })), /*#__PURE__*/React.createElement("b", {
    style: {
      font: '650 1rem var(--font-display)',
      color: 'var(--text-strong)'
    }
  }, drag ? 'Drop to upload' : title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '.82rem',
      color: 'var(--text-muted)'
    }
  }, "or ", /*#__PURE__*/React.createElement("u", {
    style: {
      color: 'var(--text-accent)',
      fontWeight: 650,
      textUnderlineOffset: 2
    }
  }, "browse files"), " \xB7 ", acceptLabel));
}
Object.assign(__ds_scope, { Dropzone });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Dropzone.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
let n = 0;
function Field({
  id,
  label,
  hint,
  error,
  success,
  optional,
  icon,
  suffix,
  multiline,
  rows = 4,
  maxLength,
  value,
  defaultValue,
  placeholder,
  onChange,
  type = 'text',
  disabled,
  size = 'md'
}) {
  __ds_scope.injectCss('field', __ds_scope.FIELD_CSS);
  const fid = React.useMemo(() => id || 'rz-f' + ++n, [id]);
  const [len, setLen] = React.useState(String(value ?? defaultValue ?? '').length);
  const cur = value != null ? String(value).length : len;
  const state = error ? 'error' : success ? 'success' : undefined;
  const p = {
    id: fid,
    className: 'rz-native',
    value,
    defaultValue,
    placeholder,
    disabled,
    onChange: e => {
      setLen(e.target.value.length);
      onChange && onChange(e.target.value, e);
    },
    'aria-invalid': !!error,
    'aria-describedby': error || success || hint ? fid + '-msg' : undefined
  };
  return /*#__PURE__*/React.createElement(__ds_scope.FieldShell, {
    id: fid,
    label: label,
    hint: hint,
    error: error,
    success: success,
    optional: optional
  }, /*#__PURE__*/React.createElement("div", {
    className: 'rz-control' + (multiline ? ' rz-control--multi' : '') + (size === 'sm' ? ' rz-control--sm' : ''),
    "data-state": state,
    "data-disabled": !!disabled
  }, icon && !multiline && /*#__PURE__*/React.createElement("span", {
    className: "rz-adorn"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18
  })), multiline ? /*#__PURE__*/React.createElement("textarea", _extends({
    rows: rows
  }, p)) : /*#__PURE__*/React.createElement("input", _extends({
    type: type
  }, p)), suffix && !multiline && /*#__PURE__*/React.createElement("span", {
    className: "rz-suffix"
  }, suffix), success && !multiline && /*#__PURE__*/React.createElement("span", {
    className: "rz-adorn",
    style: {
      color: 'var(--status-good-fg)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "circle-check",
    size: 18
  })), maxLength && /*#__PURE__*/React.createElement("span", {
    className: "rz-count",
    "data-over": cur > maxLength
  }, cur, " / ", maxLength)));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/RadioGroup.jsx
try { (() => {
let n = 0;
function RadioGroup({
  label,
  name,
  options = [],
  value,
  onChange,
  variant = 'card',
  direction = 'column'
}) {
  __ds_scope.injectCss('field', __ds_scope.FIELD_CSS);
  const nm = React.useMemo(() => name || 'rz-r' + ++n, [name]);
  return /*#__PURE__*/React.createElement("fieldset", {
    style: {
      border: 0,
      padding: 0,
      margin: 0,
      display: 'grid',
      gap: 10,
      minWidth: 0
    }
  }, label && /*#__PURE__*/React.createElement("legend", {
    className: "rz-label",
    style: {
      padding: 0,
      marginBottom: 8
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: direction,
      gap: 10,
      flexWrap: 'wrap'
    }
  }, options.map(o => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("label", {
      key: v,
      className: 'rz-check' + (variant === 'card' ? ' rz-check--card' : ''),
      style: {
        flex: direction === 'row' ? '1 1 0' : undefined
      }
    }, /*#__PURE__*/React.createElement("input", {
      type: "radio",
      name: nm,
      value: v,
      checked: value === v,
      onChange: () => onChange && onChange(v)
    }), /*#__PURE__*/React.createElement("span", {
      className: "rz-box rz-box--radio"
    }), /*#__PURE__*/React.createElement("span", {
      className: "rz-check-t"
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: o.description ? 650 : 500,
        color: 'var(--text-strong)'
      }
    }, l), o.description && /*#__PURE__*/React.createElement("span", {
      className: "rz-check-d"
    }, o.description)));
  })));
}
Object.assign(__ds_scope, { RadioGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RadioGroup.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
let n = 0;
const norm = s => String(s || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function Select({
  id,
  label,
  hint,
  error,
  optional,
  icon,
  options = [],
  value,
  defaultValue,
  onChange,
  disabled,
  size = 'md',
  placeholder = 'Choose an option',
  searchable,
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  defaultOpen = false
}) {
  __ds_scope.injectCss('field', __ds_scope.FIELD_CSS);
  const fid = React.useMemo(() => id || 'rz-s' + ++n, [id]);
  const opts = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  const [inner, setInner] = React.useState(defaultValue ?? '');
  const cur = value !== undefined ? value : inner;
  const [open, setOpen] = React.useState(defaultOpen);
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(() => Math.max(0, opts.findIndex(o => o.value === (value !== undefined ? value : defaultValue))));
  const [up, setUp] = React.useState(false);
  const root = React.useRef(null),
    trig = React.useRef(null),
    list = React.useRef(null),
    typed = React.useRef({
      s: '',
      t: 0
    });
  const shown = searchable && q ? opts.filter(o => norm(o.label + ' ' + (o.description || '') + ' ' + (o.group || '')).includes(norm(q))) : opts;
  const sel = opts.find(o => o.value === cur);
  React.useEffect(() => {
    if (!open) return;
    const h = e => {
      if (root.current && !root.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  React.useEffect(() => {
    const l = list.current;
    if (!open || !l || active < 0) return;
    const el = l.querySelector('[data-idx="' + active + '"]');
    if (!el) return;
    if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop - 4;else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight + 4;
  }, [active, open]);
  const openIt = () => {
    if (disabled) return;
    const r = trig.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 300 && r.top > 300);
    setQ('');
    setActive(Math.max(0, opts.findIndex(o => o.value === cur)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trig.current && trig.current.focus();
  };
  const pick = o => {
    if (!o || o.disabled) return;
    if (value === undefined) setInner(o.value);
    onChange && onChange(o.value);
    close();
  };
  const move = d => {
    if (!shown.length) return;
    let i = active;
    for (let k = 0; k < shown.length; k++) {
      i = (i + d + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };
  const onKey = e => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openIt();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Home' && !searchable) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End' && !searchable) {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ' && !searchable) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Tab') setOpen(false);else if (!searchable && e.key.length === 1) {
      const now = Date.now();
      typed.current.s = (now - typed.current.t > 600 ? '' : typed.current.s) + norm(e.key);
      typed.current.t = now;
      const i = shown.findIndex(o => norm(o.label).startsWith(typed.current.s));
      if (i >= 0) setActive(i);
    }
  };
  const lead = icon || sel && sel.icon;
  const actId = open && active >= 0 && shown[active] ? fid + '-o' + active : undefined;
  return /*#__PURE__*/React.createElement(__ds_scope.FieldShell, {
    id: fid,
    label: label,
    hint: hint,
    error: error,
    optional: optional
  }, /*#__PURE__*/React.createElement("div", {
    className: "rz-select",
    ref: root,
    onKeyDown: onKey
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    ref: trig,
    id: fid,
    className: 'rz-control rz-trigger' + (size === 'sm' ? ' rz-control--sm' : ''),
    "data-open": open,
    "data-state": error ? 'error' : undefined,
    "data-disabled": !!disabled,
    disabled: disabled,
    role: "combobox",
    "aria-haspopup": "listbox",
    "aria-expanded": open,
    "aria-controls": fid + '-list',
    "aria-activedescendant": searchable ? undefined : actId,
    "aria-invalid": !!error,
    "aria-describedby": error || hint ? fid + '-msg' : undefined,
    onClick: () => open ? setOpen(false) : openIt()
  }, lead && /*#__PURE__*/React.createElement("span", {
    className: "rz-adorn"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: lead,
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    className: "rz-val",
    "data-ph": !sel
  }, sel ? sel.label : placeholder), /*#__PURE__*/React.createElement("span", {
    className: "rz-chev2"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 18
  }))), open && /*#__PURE__*/React.createElement("div", {
    className: "rz-pop",
    "data-up": up
  }, searchable && /*#__PURE__*/React.createElement("div", {
    className: "rz-search"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    value: q,
    placeholder: searchPlaceholder,
    "aria-label": searchPlaceholder,
    "aria-controls": fid + '-list',
    "aria-activedescendant": actId,
    onChange: e => {
      setQ(e.target.value);
      setActive(0);
    }
  })), /*#__PURE__*/React.createElement("ul", {
    className: "rz-list",
    role: "listbox",
    id: fid + '-list',
    "aria-labelledby": fid,
    ref: list
  }, shown.length ? shown.map((o, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: o.value
  }, o.group && (i === 0 || shown[i - 1].group !== o.group) && /*#__PURE__*/React.createElement("li", {
    role: "presentation",
    className: "rz-grp"
  }, o.group), /*#__PURE__*/React.createElement("li", {
    id: fid + '-o' + i,
    "data-idx": i,
    role: "option",
    className: "rz-oi",
    "aria-selected": o.value === cur,
    "aria-disabled": !!o.disabled,
    "data-active": i === active,
    onMouseEnter: () => setActive(i),
    onMouseDown: e => e.preventDefault(),
    onClick: () => pick(o)
  }, o.icon && /*#__PURE__*/React.createElement("span", {
    className: "rz-oi-ic"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: o.icon,
    size: 17
  })), /*#__PURE__*/React.createElement("span", {
    className: "rz-oi-t"
  }, o.label, o.description && /*#__PURE__*/React.createElement("span", {
    className: "rz-oi-d"
  }, o.description)), o.value === cur && /*#__PURE__*/React.createElement("span", {
    className: "rz-oi-ck"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 18
  }))))) : /*#__PURE__*/React.createElement("li", {
    className: "rz-empty",
    role: "presentation"
  }, emptyText)))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/match/ChangeCard.jsx
try { (() => {
function ChangeCard({
  section,
  source,
  before,
  after,
  checked,
  onChange,
  why
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: checked ? '2px solid var(--border-selected)' : '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-card)',
      background: 'var(--surface-card)',
      padding: checked ? 19 : 20,
      display: 'grid',
      gap: 14,
      transition: 'border-color var(--dur-fast)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Checkbox, {
    checked: checked,
    onChange: onChange,
    label: /*#__PURE__*/React.createElement("b", {
      style: {
        color: 'var(--text-strong)'
      }
    }, section)
  }), source && /*#__PURE__*/React.createElement(__ds_scope.Pill, {
    size: "sm",
    tone: "good",
    icon: "shield-check"
  }, source)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: before ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
      gap: 10
    }
  }, before && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#f6f7f3',
      borderRadius: 'var(--radius-md)',
      padding: '12px 14px',
      fontSize: '.84rem',
      lineHeight: 1.55,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '.68rem',
      fontWeight: 750,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      marginBottom: 6
    }
  }, "Now"), before), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#ecf5ee',
      border: '1px solid #b8d4c1',
      borderRadius: 'var(--radius-md)',
      padding: '12px 14px',
      fontSize: '.84rem',
      lineHeight: 1.55,
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '.68rem',
      fontWeight: 750,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      marginBottom: 6,
      color: 'var(--text-accent)'
    }
  }, before ? 'Suggested' : 'Add'), after)), why && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '.78rem',
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, why));
}
Object.assign(__ds_scope, { ChangeCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/match/ChangeCard.jsx", error: String((e && e.message) || e) }); }

// components/match/FindingGroup.jsx
try { (() => {
const TONE = {
  good: ['var(--status-good-bg)', 'var(--status-good-fg)'],
  info: ['var(--status-info-bg)', 'var(--status-info-fg)'],
  warn: ['var(--status-warn-bg)', 'var(--status-warn-fg)'],
  neutral: ['var(--status-neutral-bg)', 'var(--status-neutral-fg)']
};
function FindingGroup({
  tone = 'good',
  icon = 'check',
  title,
  count,
  subtitle,
  children,
  defaultOpen = true
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [bg, fg] = TONE[tone] || TONE.good;
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(!open),
    "aria-expanded": open,
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '18px 22px',
      background: 'transparent',
      border: 0,
      cursor: 'pointer',
      textAlign: 'left',
      font: 'inherit',
      color: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 11,
      background: bg,
      color: fg,
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      gap: 8,
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 650,
      fontSize: '1.05rem',
      color: 'var(--text-strong)'
    }
  }, title), count != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '.8rem',
      color: 'var(--text-muted)',
      fontWeight: 600
    }
  }, count)), subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: '.8rem',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, subtitle)), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)',
      transform: open ? 'rotate(180deg)' : 'none',
      transition: 'transform var(--dur-base) var(--ease-out)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 18
  }))), open && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 22px 6px',
      borderTop: '1px solid var(--border-subtle)'
    }
  }, children));
}
Object.assign(__ds_scope, { FindingGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/match/FindingGroup.jsx", error: String((e && e.message) || e) }); }

// components/match/KeywordRow.jsx
try { (() => {
const STATE = {
  included: {
    tone: 'good',
    icon: 'check',
    label: 'In your CV'
  },
  equivalent: {
    tone: 'good',
    icon: 'languages',
    label: 'In your CV · similar wording'
  },
  omitted: {
    tone: 'info',
    icon: 'archive',
    label: 'You have it · not in this CV'
  },
  confirm: {
    tone: 'warn',
    icon: 'circle-help',
    label: 'Is this true for you?'
  },
  gap: {
    tone: 'neutral',
    icon: 'minus',
    label: 'Not in your experience'
  }
};
function KeywordRow({
  term,
  state = 'included',
  required,
  detail,
  action,
  last
}) {
  const s = STATE[state] || STATE.included;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 15,
      padding: '15px 0',
      borderBottom: last ? 0 : '1px solid var(--border-subtle)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      flex: '1 1 260px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontSize: '.92rem',
      color: 'var(--text-strong)',
      fontWeight: 650
    }
  }, term), required ? /*#__PURE__*/React.createElement(__ds_scope.Pill, {
    size: "sm",
    tone: "neutral"
  }, "Required") : /*#__PURE__*/React.createElement(__ds_scope.Pill, {
    size: "sm",
    tone: "neutral"
  }, "Nice to have")), detail && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      fontSize: '.8rem',
      lineHeight: 1.55,
      color: 'var(--text-muted)'
    }
  }, detail)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Pill, {
    tone: s.tone,
    icon: s.icon
  }, s.label), action));
}
Object.assign(__ds_scope, { KeywordRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/match/KeywordRow.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SideNav.jsx
try { (() => {
function SideNav({
  items = [],
  value,
  onChange,
  footer
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width: 'var(--sidebar-width)',
      flexShrink: 0,
      background: 'var(--surface-card)',
      borderRight: '1px solid var(--border-subtle)',
      padding: '22px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      minHeight: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 12px 22px'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    size: 28
  })), items.map(it => {
    const on = it.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      onClick: () => onChange && onChange(it.value),
      "aria-current": on ? 'page' : undefined,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px',
        border: 0,
        borderRadius: 'var(--radius-md)',
        background: on ? 'var(--surface-selected)' : 'transparent',
        color: on ? 'var(--text-accent)' : 'var(--text-muted)',
        fontWeight: on ? 700 : 500,
        fontSize: '.88rem',
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)'
      },
      onMouseEnter: e => {
        if (!on) e.currentTarget.style.background = 'var(--surface-hover)';
      },
      onMouseLeave: e => {
        if (!on) e.currentTarget.style.background = 'transparent';
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 18
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, it.label), it.badge && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: '.7rem',
        fontWeight: 700,
        background: 'var(--marigold-300)',
        color: 'var(--pine-900)',
        borderRadius: 'var(--radius-pill)',
        padding: '1px 7px'
      }
    }, it.badge));
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), footer);
}
Object.assign(__ds_scope, { SideNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SideNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopBar.jsx
try { (() => {
function TopBar({
  title,
  back,
  right,
  children
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      justifyContent: 'space-between',
      padding: '14px 28px',
      background: 'var(--surface-card)',
      borderBottom: '1px solid var(--border-subtle)',
      minHeight: 64
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      minWidth: 0
    }
  }, back, title && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 650,
      fontSize: '.95rem',
      color: 'var(--text-strong)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, title)), children && /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      justifyContent: 'center',
      minWidth: 0
    }
  }, children), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, right));
}
Object.assign(__ds_scope, { TopBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopBar.jsx", error: String((e && e.message) || e) }); }

// components/progress/ProgressBar.jsx
try { (() => {
function ProgressBar({
  value = 0,
  max = 100,
  label,
  valueLabel,
  tone = 'primary',
  height = 7
}) {
  const pct = Math.max(0, Math.min(100, value / max * 100));
  const fill = {
    primary: 'var(--action-primary)',
    warn: 'var(--marigold-500)',
    muted: 'var(--sage-400)'
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, (label || valueLabel) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      fontSize: '.79rem',
      marginBottom: 8,
      color: 'var(--text-body)'
    }
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 650
    }
  }, valueLabel)), /*#__PURE__*/React.createElement("div", {
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemin": 0,
    "aria-valuemax": max,
    style: {
      height,
      background: 'var(--sage-150)',
      borderRadius: height,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      display: 'block',
      height: '100%',
      width: pct + '%',
      background: fill,
      borderRadius: height,
      transition: 'width var(--dur-slow) var(--ease-out)'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/progress/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/progress/ScoreRing.jsx
try { (() => {
function ScoreRing({
  value,
  size = 120,
  label,
  caption,
  previous,
  untested
}) {
  const stroke = size >= 100 ? 10 : 7,
    r = (size - stroke) / 2,
    c = 2 * Math.PI * r;
  const pct = untested || value == null ? 0 : Math.max(0, Math.min(100, value));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-grid',
      justifyItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: 'rotate(-90deg)'
    },
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: untested ? 'var(--sage-200)' : 'var(--score-track)',
    strokeWidth: stroke,
    strokeDasharray: untested ? '4 6' : undefined
  }), !untested && /*#__PURE__*/React.createElement("circle", {
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    stroke: "var(--score-fill)",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: c * (1 - pct / 100),
    style: {
      transition: 'stroke-dashoffset var(--dur-celebrate) var(--ease-out)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'grid',
      placeContent: 'center',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: untested ? size * .13 : size * .28,
      letterSpacing: 'var(--tracking-stat)',
      color: untested ? 'var(--text-muted)' : 'var(--text-strong)',
      lineHeight: 1,
      fontWeight: 700
    }
  }, untested ? 'Not tested' : Math.round(value)), previous != null && !untested && /*#__PURE__*/React.createElement("small", {
    style: {
      fontSize: '.68rem',
      color: 'var(--text-muted)',
      marginTop: 3
    }
  }, "was ", previous))), label && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '.8rem',
      fontWeight: 650,
      color: 'var(--text-strong)',
      textAlign: 'center'
    }
  }, label), caption && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '.74rem',
      color: 'var(--text-muted)',
      textAlign: 'center',
      maxWidth: size + 40,
      lineHeight: 1.4
    }
  }, caption));
}
Object.assign(__ds_scope, { ScoreRing });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/progress/ScoreRing.jsx", error: String((e && e.message) || e) }); }

// components/match/MatchVerdict.jsx
try { (() => {
function MatchVerdict({
  headline,
  summary,
  score,
  previous,
  scoreLabel = 'This CV vs the job',
  counts,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0,1fr)',
      gap: 28,
      alignItems: 'center',
      background: 'var(--surface-hero)',
      border: '1px solid #d6e4d9',
      borderRadius: 'var(--radius-hero)',
      padding: '28px 32px'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.ScoreRing, {
    value: score,
    previous: previous,
    label: scoreLabel,
    size: 128
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: '1.7rem',
      lineHeight: 1.15,
      letterSpacing: '-0.03em',
      color: 'var(--text-strong)',
      textWrap: 'balance'
    }
  }, headline), summary && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      color: 'var(--text-muted)',
      fontSize: '.92rem',
      lineHeight: 1.6,
      maxWidth: 560,
      textWrap: 'pretty'
    }
  }, summary), counts && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 22,
      marginTop: 18,
      flexWrap: 'wrap'
    }
  }, counts.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'grid',
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: '1.5rem',
      fontWeight: 700,
      color: c.color || 'var(--text-strong)',
      lineHeight: 1
    }
  }, c.value), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '.76rem',
      color: 'var(--text-muted)'
    }
  }, c.label)))), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 20,
      flexWrap: 'wrap'
    }
  }, actions)));
}
Object.assign(__ds_scope, { MatchVerdict });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/match/MatchVerdict.jsx", error: String((e && e.message) || e) }); }

// components/progress/Stepper.jsx
try { (() => {
function Stepper({
  steps = [],
  current = 0,
  onStepClick
}) {
  return /*#__PURE__*/React.createElement("ol", {
    style: {
      display: 'flex',
      gap: 6,
      listStyle: 'none',
      margin: 0,
      padding: 0,
      flexWrap: 'wrap',
      alignItems: 'center'
    }
  }, steps.map((s, i) => {
    const done = i < current,
      on = i === current;
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      disabled: !onStepClick || i > current,
      onClick: () => onStepClick && onStepClick(i),
      "aria-current": on ? 'step' : undefined,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        border: 0,
        borderRadius: 'var(--radius-pill)',
        padding: '6px 12px 6px 6px',
        background: on ? 'var(--action-primary)' : done ? 'var(--surface-hero)' : 'var(--sage-150)',
        color: on ? 'var(--text-on-primary)' : done ? 'var(--text-accent)' : 'var(--text-muted)',
        font: '600 .78rem/1 var(--font-sans)',
        cursor: onStepClick && i <= current ? 'pointer' : 'default'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 20,
        height: 20,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: on ? 'rgba(255,255,255,.2)' : done ? 'var(--surface-card)' : 'var(--surface-card)',
        fontSize: '.7rem'
      }
    }, done ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "check",
      size: 12
    }) : i + 1), s), i < steps.length - 1 && /*#__PURE__*/React.createElement("span", {
      "aria-hidden": "true",
      style: {
        width: 14,
        height: 2,
        background: done ? 'var(--pine-300)' : 'var(--sage-200)',
        borderRadius: 2
      }
    }));
  }));
}
Object.assign(__ds_scope, { Stepper });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/progress/Stepper.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web-app/AddJob.jsx
try { (() => {
function AddJobScreen({
  onDone
}) {
  const {
    Card,
    Button,
    Field,
    Segmented,
    Spinner,
    Dropzone
  } = window.CVizatDesignSystem_0f8e2e;
  const D = window.CVZ_DATA;
  const [mode, setMode] = React.useState('paste');
  const [text, setText] = React.useState(D.job.ad);
  const [url, setUrl] = React.useState('');
  const [file, setFile] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const ready = mode === 'paste' ? text.length >= 30 : mode === 'link' ? /^https?:\/\/.+\..+/.test(url) : !!file;
  const go = () => {
    setBusy(true);
    setTimeout(onDone, 1400);
  };
  if (busy) return /*#__PURE__*/React.createElement(Card, {
    style: {
      maxWidth: 640,
      margin: '40px auto',
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px 0'
    }
  }, /*#__PURE__*/React.createElement(Spinner, {
    label: "Reading the job ad and comparing it with your CV\u2026"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => setBusy(false)
  }, "Cancel"))));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 680,
      margin: '0 auto',
      display: 'grid',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      font: '700 2rem/1.15 var(--font-display)',
      letterSpacing: '-0.04em',
      color: 'var(--text-strong)'
    }
  }, "Which job are you applying for?"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      color: 'var(--text-muted)',
      lineHeight: 1.6
    }
  }, "We only read what you give us. Nothing is sent to the employer.")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(Segmented, {
    fullWidth: true,
    value: mode,
    onChange: setMode,
    options: [{
      value: 'paste',
      label: 'Paste the ad',
      icon: 'clipboard-paste'
    }, {
      value: 'link',
      label: 'From a link',
      icon: 'link'
    }, {
      value: 'file',
      label: 'Upload a file',
      icon: 'file-up'
    }]
  }), mode === 'paste' && /*#__PURE__*/React.createElement(Field, {
    label: "Job ad",
    multiline: true,
    rows: 9,
    maxLength: 6000,
    value: text,
    onChange: setText,
    hint: "Copy the whole ad, including the requirements.",
    error: text.length > 0 && text.length < 30 ? 'Paste a bit more — at least a few sentences.' : undefined
  }), mode === 'link' && /*#__PURE__*/React.createElement(Field, {
    label: "Link to the job ad",
    icon: "link",
    type: "url",
    value: url,
    onChange: setUrl,
    placeholder: "https://www.ejobs.ro/\u2026",
    hint: "If the page needs a login, we\u2019ll ask you to paste the text instead.",
    success: /^https?:\/\/.+\..+/.test(url) ? 'Looks like a valid link' : undefined
  }), mode === 'file' && /*#__PURE__*/React.createElement(Dropzone, {
    title: "Drop the job ad here",
    acceptLabel: "PDF, DOCX or screenshot",
    accept: ".pdf,.docx,image/*",
    file: file,
    onFile: setFile,
    onRemove: () => setFile(null)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Job title",
    icon: "briefcase",
    defaultValue: D.job.title,
    optional: true
  }), /*#__PURE__*/React.createElement(Field, {
    label: "Company",
    icon: "building-2",
    defaultValue: D.job.company,
    optional: true
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconRight: "arrow-right",
    disabled: !ready,
    onClick: go
  }, "Check my match")));
}
window.AddJobScreen = AddJobScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web-app/AddJob.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web-app/App.jsx
try { (() => {
function App() {
  const {
    SideNav,
    TopBar,
    Stepper,
    IconButton,
    Button,
    Toast,
    Pill,
    Logo
  } = window.CVizatDesignSystem_0f8e2e;
  const saved = JSON.parse(localStorage.getItem('rz-kit') || '{}');
  const [view, setView] = React.useState(saved.view || 'home');
  const [step, setStep] = React.useState(saved.step || 0);
  const [accepted, setAccepted] = React.useState(['sum', 'api', 'out']);
  const [rtw, setRtw] = React.useState(false);
  const [applied, setApplied] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    localStorage.setItem('rz-kit', JSON.stringify({
      view,
      step
    }));
  }, [view, step]);
  const flash = m => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  const steps = ['Add job', 'See your match', 'Improve CV', 'Download'];
  if (view === 'flow') return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement(TopBar, {
    back: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(IconButton, {
      icon: "x",
      label: "Exit to Home",
      onClick: () => setView('home')
    }), /*#__PURE__*/React.createElement(Logo, {
      variant: "mark",
      size: 28
    })),
    title: "Northstar People",
    right: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      onClick: () => setView('home')
    }, "Save & exit")
  }, /*#__PURE__*/React.createElement(Stepper, {
    steps: steps,
    current: step,
    onStepClick: setStep
  })), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      padding: '36px 44px 60px'
    }
  }, step === 0 && /*#__PURE__*/React.createElement(AddJobScreen, {
    onDone: () => setStep(1)
  }), step === 1 && /*#__PURE__*/React.createElement(MatchReportScreen, {
    rtw: rtw,
    setRtw: setRtw,
    onNext: () => setStep(2)
  }), step === 2 && /*#__PURE__*/React.createElement(ImproveScreen, {
    accepted: accepted,
    setAccepted: setAccepted,
    onNext: base => {
      setStep(3);
      flash(base ? 'Saved — Base CV is now v4' : 'Saved — Base CV unchanged');
    }
  }), step === 3 && /*#__PURE__*/React.createElement(DownloadScreen, {
    accepted: accepted,
    rtw: rtw,
    onSent: () => {
      setApplied(true);
      setView('home');
      setStep(0);
      flash('Marked as sent. Good luck, Mara!');
    }
  })), toast && /*#__PURE__*/React.createElement(Toast, {
    action: "Undo",
    onAction: () => setToast(null)
  }, toast));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      minHeight: '100vh'
    }
  }, /*#__PURE__*/React.createElement(SideNav, {
    value: "home",
    items: [{
      value: 'home',
      label: 'Home',
      icon: 'house'
    }, {
      value: 'cv',
      label: 'My CV',
      icon: 'file-user'
    }, {
      value: 'jobs',
      label: 'Jobs',
      icon: 'briefcase',
      badge: '2'
    }, {
      value: 'account',
      label: 'Account',
      icon: 'circle-user'
    }],
    footer: /*#__PURE__*/React.createElement("div", {
      style: {
        padding: '0 12px',
        fontSize: '.72rem',
        color: 'var(--text-muted)'
      }
    }, "resumora.ro \xB7 demo data")
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      padding: '36px 44px 60px',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(HomeScreen, {
    applied: applied,
    onStart: () => {
      setView('flow');
      setStep(applied ? 3 : 0);
    }
  })), toast && /*#__PURE__*/React.createElement(Toast, {
    icon: "party-popper"
  }, toast));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web-app/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web-app/Download.jsx
try { (() => {
function DownloadScreen({
  accepted,
  rtw,
  onSent
}) {
  const {
    CVDocument,
    Button,
    Segmented,
    ScoreRing,
    Alert,
    Card,
    Select,
    Spinner
  } = window.CVizatDesignSystem_0f8e2e;
  const [tpl, setTpl] = React.useState('Clar');
  const [state, setState] = React.useState('idle');
  const dl = () => {
    setState('busy');
    setTimeout(() => setState('done'), 1300);
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '320px minmax(0,1fr)',
      gap: 24,
      alignItems: 'start',
      maxWidth: 1120,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement(ScoreRing, {
    value: 90,
    previous: 62,
    label: "This CV vs the job",
    size: 132
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '14px 0 0',
      fontSize: '.88rem',
      lineHeight: 1.55
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: '1.15rem',
      color: 'var(--text-strong)',
      display: 'block'
    }
  }, "Your CV now shows your fit."), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, "Same facts, better chosen."))), !rtw && /*#__PURE__*/React.createElement(Alert, {
    tone: "warn",
    title: "Still to check"
  }, "Right to work in Romania \u2014 the job requires it."), /*#__PURE__*/React.createElement(Card, {
    padding: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-label)',
      marginBottom: 7
    }
  }, "Template"), /*#__PURE__*/React.createElement(Segmented, {
    fullWidth: true,
    options: ['Clar', 'Contur'],
    value: tpl,
    onChange: setTpl
  })), /*#__PURE__*/React.createElement(Select, {
    label: "CV language",
    icon: "languages",
    options: ['English', 'Română'],
    hint: "Separate from the app language"
  }), state === 'busy' ? /*#__PURE__*/React.createElement(Spinner, {
    size: 28,
    label: "Preparing PDF and checking it reads correctly\u2026"
  }) : /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    fullWidth: true,
    icon: "download",
    onClick: dl
  }, state === 'done' ? 'Download again' : 'Download PDF'), state === 'done' && /*#__PURE__*/React.createElement(Button, {
    fullWidth: true,
    icon: "send",
    onClick: onSent
  }, "I\u2019ve sent this application")))), /*#__PURE__*/React.createElement(CVDocument, {
    template: tpl.toLowerCase(),
    scale: .9,
    name: "Mara Ionescu",
    titles: ['Business Systems Analyst'],
    contact: "Cluj-Napoca \xB7 mara.ionescu@example.com \xB7 +40 7xx xxx xxx",
    sections: window.CVZ_cv(accepted)
  }));
}
window.DownloadScreen = DownloadScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web-app/Download.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web-app/Home.jsx
try { (() => {
function HomeScreen({
  onStart,
  applied
}) {
  const {
    Card,
    Button,
    TaskCard,
    Pill,
    ProgressBar,
    Icon
  } = window.CVizatDesignSystem_0f8e2e;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 24,
      maxWidth: 1040
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,.85fr)',
      gap: 30,
      background: 'var(--surface-hero)',
      border: '1px solid #d6e4d9',
      borderRadius: 'var(--radius-hero)',
      padding: '38px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: '750 .73rem var(--font-sans)',
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--text-accent)',
      marginBottom: 12
    }
  }, "Good afternoon, Mara"), /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      font: '700 2.65rem/1.1 var(--font-display)',
      letterSpacing: '-0.045em',
      color: 'var(--text-strong)',
      textWrap: 'balance'
    }
  }, "Prepare your next application"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      color: 'var(--text-muted)',
      fontSize: '1rem',
      lineHeight: 1.6,
      maxWidth: 460
    }
  }, "Paste a job ad. We\u2019ll show how well you fit, what your CV is missing, and make you a version for that job \u2014 your Base CV stays as it is."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 24,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconRight: "arrow-right",
    onClick: onStart
  }, "Start with a job"), /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    icon: "file-user"
  }, "Edit my Base CV"))), /*#__PURE__*/React.createElement("div", {
    style: {
      alignSelf: 'center',
      background: '#fff',
      padding: 24,
      boxShadow: 'var(--shadow-paper)',
      transform: 'rotate(2deg)',
      borderRadius: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: '700 1.1rem var(--font-document)',
      color: 'var(--text-document)'
    }
  }, "Mara Ionescu"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '.75rem',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, "Business Systems Analyst"), [100, 86, 64, 92, 70].map((w, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      height: 6,
      width: w + '%',
      background: 'var(--pine-200)',
      borderRadius: 3,
      margin: '13px 0'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,.85fr)',
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 12,
      alignContent: 'start'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-section-title)',
      color: 'var(--text-strong)'
    }
  }, "Your applications"), /*#__PURE__*/React.createElement(TaskCard, {
    emphasis: !applied,
    icon: "briefcase",
    title: "Northstar People \xB7 Business Systems Analyst",
    onClick: onStart,
    meta: applied ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Pill, {
      size: "sm",
      tone: "good",
      icon: "send"
    }, "Sent today"), /*#__PURE__*/React.createElement(Pill, {
      size: "sm"
    }, "Tailored CV v1")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Pill, {
      size: "sm",
      tone: "info"
    }, "Not tailored yet"), /*#__PURE__*/React.createElement(Pill, {
      size: "sm",
      tone: "warn",
      icon: "circle-help"
    }, "1 thing to check"))
  }, applied ? 'Next: follow up with Ana Pop · 30 Oct' : 'Next: see your match and improve your CV'), /*#__PURE__*/React.createElement(TaskCard, {
    icon: "briefcase",
    title: "Lumen Bank \xB7 Process Analyst",
    meta: /*#__PURE__*/React.createElement(Pill, {
      size: "sm"
    }, "Interview \xB7 28 Oct")
  }, "Tailored CV v2 \xB7 sent 14 Oct")), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: 'var(--type-section-title)',
      color: 'var(--text-strong)'
    }
  }, "Base CV"), /*#__PURE__*/React.createElement(Pill, {
    size: "sm",
    tone: "good",
    icon: "shield-check"
  }, "Confirmed by you")), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 16px',
      fontSize: '.82rem',
      color: 'var(--text-muted)'
    }
  }, "v3 \xB7 saved 23 Oct. Every job version starts here."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 10
    }
  }, [['Content', 'circle-check', 'good', 'Looks good'], ['Structure', 'circle-check', 'good', 'Looks good'], ['Writing', 'circle-alert', 'warn', '2 bullets could be clearer']].map(([k, ic, t, v]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: '.85rem'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: ic,
    size: 18,
    color: 'var(--status-' + t + '-fg)'
  }), /*#__PURE__*/React.createElement("b", {
    style: {
      fontWeight: 600,
      width: 80
    }
  }, k), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, v)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 18
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    iconRight: "arrow-right"
  }, "Improve these")))));
}
window.HomeScreen = HomeScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web-app/Home.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web-app/Improve.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function ImproveScreen({
  accepted,
  setAccepted,
  onNext
}) {
  const {
    ChangeCard,
    CVDocument,
    Button,
    Dialog
  } = window.CVizatDesignSystem_0f8e2e;
  const C = window.CVZ_DATA.changes;
  const [ask, setAsk] = React.useState(false);
  const toggle = id => setAccepted(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
      gap: 24,
      alignItems: 'start',
      maxWidth: 1180,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      font: '700 2rem/1.15 var(--font-display)',
      letterSpacing: '-0.04em',
      color: 'var(--text-strong)'
    }
  }, "Keep what feels right"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '10px 0 0',
      color: 'var(--text-muted)',
      lineHeight: 1.6
    }
  }, "Every change uses facts you\u2019ve already confirmed. Untick anything you don\u2019t want \u2014 this only changes the CV for Northstar People.")), C.map(c => /*#__PURE__*/React.createElement(ChangeCard, _extends({
    key: c.id
  }, c, {
    checked: accepted.includes(c.id),
    onChange: () => toggle(c.id)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '.82rem',
      color: 'var(--text-muted)'
    }
  }, accepted.length, " of ", C.length, " changes kept"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg",
    iconRight: "arrow-right",
    onClick: () => setAsk(true)
  }, "Save this job\u2019s CV"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 20
    }
  }, /*#__PURE__*/React.createElement(CVDocument, {
    template: "clar",
    scale: .82,
    name: "Mara Ionescu",
    titles: ['Business Systems Analyst'],
    contact: "Cluj-Napoca \xB7 mara.ionescu@example.com \xB7 +40 7xx xxx xxx",
    sections: window.CVZ_cv(accepted),
    highlight: C.filter(c => accepted.includes(c.id)).map(c => c.after)
  })), ask && /*#__PURE__*/React.createElement(Dialog, {
    title: "Also improve your Base CV?",
    onClose: () => setAsk(false),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      onClick: () => {
        setAsk(false);
        onNext(false);
      }
    }, "Only this job"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: () => {
        setAsk(false);
        onNext(true);
      }
    }, "Update Base too"))
  }, "The new summary and the outcome bullet could help future applications. Your Base CV is where every new job starts \u2014 we\u2019ll save it as a new version you can undo."));
}
window.ImproveScreen = ImproveScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web-app/Improve.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web-app/MatchReport.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function MatchReportScreen({
  onNext,
  rtw,
  setRtw
}) {
  const {
    Button,
    Alert,
    FindingGroup,
    KeywordRow,
    MatchVerdict,
    Card,
    ProgressBar,
    ScoreRing,
    Dialog,
    Pill,
    RadioGroup
  } = window.CVizatDesignSystem_0f8e2e;
  const [ans, setAns] = React.useState('yes');
  const F = window.CVZ_DATA.findings;
  const [how, setHow] = React.useState(false);
  const [ask, setAsk] = React.useState(false);
  const rows = list => list.map((k, i) => /*#__PURE__*/React.createElement(KeywordRow, _extends({
    key: k.term
  }, k, {
    last: i === list.length - 1
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1fr) 300px',
      gap: 24,
      alignItems: 'start',
      maxWidth: 1120,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 16,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(MatchVerdict, {
    score: 62,
    headline: "Good fit \u2014 your CV just doesn\u2019t show it yet.",
    summary: "You have the experience for 9 of 10 requirements. 3 of them aren\u2019t in this CV. Adding them takes about two minutes.",
    counts: [{
      value: 4,
      label: 'Already in your CV'
    }, {
      value: 3,
      label: 'Ready to add',
      color: 'var(--status-info-fg)'
    }, {
      value: rtw ? 0 : 1,
      label: 'To check',
      color: 'var(--status-warn-fg)'
    }],
    actions: /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "lg",
      iconRight: "arrow-right",
      onClick: onNext
    }, "Add the 3 missing things")
  }), !rtw && /*#__PURE__*/React.createElement(Alert, {
    tone: "warn",
    title: "Can you work in Romania?",
    action: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      onClick: () => setAsk(true)
    }, "Answer")
  }, "The job requires it. We don\u2019t know yet, so we\u2019ll keep reminding you \u2014 your score doesn\u2019t change."), rtw && /*#__PURE__*/React.createElement(Alert, {
    tone: "good",
    title: "Right to work in Romania: yes"
  }, "Based on what you told us. Employers may ask for proof."), /*#__PURE__*/React.createElement(FindingGroup, {
    tone: "info",
    icon: "sparkles",
    title: "Ready to add",
    count: "3",
    subtitle: "You have these \u2014 they\u2019re just not in this CV."
  }, rows(F.add)), /*#__PURE__*/React.createElement(FindingGroup, {
    tone: "good",
    icon: "circle-check",
    title: "Already strong",
    count: "4",
    subtitle: "Requirements your CV already shows.",
    defaultOpen: false
  }, rows(F.strong)), /*#__PURE__*/React.createElement(FindingGroup, {
    tone: "neutral",
    icon: "minus",
    title: "Not in your experience",
    count: "1",
    subtitle: "Nothing to fix \u2014 we won\u2019t add things you haven\u2019t done.",
    defaultOpen: false
  }, rows(F.gap))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 16,
      position: 'sticky',
      top: 20
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-around'
    }
  }, /*#__PURE__*/React.createElement(ScoreRing, {
    value: 90,
    size: 88,
    label: "You vs the job"
  }), /*#__PURE__*/React.createElement(ScoreRing, {
    untested: true,
    size: 88,
    label: "PDF readability"
  })), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '14px 0 0',
      fontSize: '.78rem',
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, "You vs the job"), " uses everything you\u2019ve confirmed. ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)'
    }
  }, "This CV"), " (62) only counts what\u2019s on the page. Readability is tested on the real PDF."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: how ? 'chevron-up' : 'chevron-down',
    onClick: () => setHow(!how)
  }, "How this is calculated")), how && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gap: 12,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    label: "Tools & technical",
    valueLabel: "2 of 3",
    value: 2,
    max: 3
  }), /*#__PURE__*/React.createElement(ProgressBar, {
    label: "Responsibilities",
    valueLabel: "2 of 3",
    value: 2,
    max: 3
  }), /*#__PURE__*/React.createElement(ProgressBar, {
    label: "Experience",
    valueLabel: "1 of 1",
    value: 1,
    max: 1
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: '.72rem',
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, "Required items count 3\xD7, nice-to-haves 1\xD7. Rewording alone never raises the score. This is an estimate, not an employer\u2019s ATS or a hiring prediction."))), /*#__PURE__*/React.createElement(Card, {
    padding: "sm",
    tone: "sunken"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: '.8rem',
      color: 'var(--text-muted)',
      lineHeight: 1.5
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--text-strong)',
      display: 'block',
      marginBottom: 4
    }
  }, "Northstar People"), "Business Systems Analyst \u2014 Automation", /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 8,
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Pill, {
    size: "sm"
  }, "6 required"), /*#__PURE__*/React.createElement(Pill, {
    size: "sm"
  }, "2 nice to have"))))), ask && /*#__PURE__*/React.createElement(Dialog, {
    title: "Can you legally work in Romania?",
    onClose: () => setAsk(false),
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      onClick: () => setAsk(false)
    }, "Later"), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      onClick: () => {
        if (ans === 'yes') setRtw(true);
        setAsk(false);
      }
    }, "Save answer"))
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '0 0 16px',
      color: 'var(--text-muted)'
    }
  }, "We\u2019ll note this for this job only. It isn\u2019t added to your CV and doesn\u2019t change your score."), /*#__PURE__*/React.createElement(RadioGroup, {
    value: ans,
    onChange: setAns,
    options: [{
      value: 'yes',
      label: 'Yes',
      description: 'Citizen, EU national or valid permit'
    }, {
      value: 'no',
      label: 'No',
      description: 'We’ll flag it as a requirement gap'
    }, {
      value: 'unsure',
      label: 'Not sure',
      description: 'We’ll keep reminding you'
    }]
  })));
}
window.MatchReportScreen = MatchReportScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web-app/MatchReport.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web-app/data.js
try { (() => {
window.CVZ_DATA = {
  user: {
    name: 'Mara Ionescu',
    first: 'Mara'
  },
  job: {
    title: 'Business Systems Analyst — Automation',
    company: 'Northstar People',
    city: 'Bucharest · hybrid',
    ad: 'Northstar People is hiring a Business Systems Analyst to automate HR and payroll workflows.\n\nRequired: process automation, SQL, REST APIs, stakeholder management, 4+ years in business/systems analysis, right to work in Romania.\nNice to have: HRIS experience (Workday or SAP SuccessFactors), Power BI.'
  },
  findings: {
    add: [{
      term: 'REST APIs',
      required: true,
      state: 'omitted',
      detail: 'Payroll API project at BridgeWorks is in your Base CV, not this one.'
    }, {
      term: 'HR / payroll systems',
      required: false,
      state: 'omitted',
      detail: 'You automated payroll exports for 3 HR teams.'
    }, {
      term: 'Outcome of your automation work',
      required: true,
      state: 'omitted',
      detail: 'You confirmed it cut manual approvals — say so in the summary.'
    }],
    check: [{
      term: 'Right to work in Romania',
      required: true,
      state: 'confirm',
      detail: 'The job requires it. We don’t know yet — your score doesn’t change either way.'
    }],
    strong: [{
      term: 'Process automation',
      required: true,
      state: 'included',
      detail: 'Two roles describe it.'
    }, {
      term: 'SQL',
      required: true,
      state: 'included',
      detail: 'Listed in technical skills and used at BridgeWorks.'
    }, {
      term: 'Stakeholder management',
      required: true,
      state: 'equivalent',
      detail: 'Your CV says “gestionarea părților interesate” — counted as the same.'
    }, {
      term: '4+ years in analysis',
      required: true,
      state: 'included',
      detail: 'About 6 years, as of Oct 2026 (overlaps counted once).'
    }],
    gap: [{
      term: 'Power BI',
      required: false,
      state: 'gap',
      detail: 'Not in your experience. Fine to leave out — it’s a nice-to-have.'
    }]
  },
  changes: [{
    id: 'sum',
    section: 'Summary',
    source: 'Uses confirmed facts',
    before: 'Analyst with 6 years in HR operations and process improvement.',
    after: 'Business systems analyst with 6 years automating HR and payroll workflows — from requirements to REST API integrations.',
    why: 'Names automation and APIs, both required.'
  }, {
    id: 'api',
    section: 'BridgeWorks · add bullet',
    source: 'From your Base CV',
    after: 'Automated payroll exports via REST APIs for 3 HR teams.',
    why: 'Shows REST APIs and payroll — currently missing.'
  }, {
    id: 'out',
    section: 'BridgeWorks · add bullet',
    source: 'You confirmed this',
    after: 'Replaced manual approval emails with a tracked workflow, so requests no longer got lost.',
    why: 'Adds an outcome. No number — you said it wasn’t measured.'
  }]
};
window.CVZ_cv = function (accepted) {
  const D = window.CVZ_DATA.changes;
  const has = id => accepted.includes(id);
  const bw = ['Mapped approval workflows with stakeholders across finance and HR.', 'Wrote SQL reports used in monthly payroll reconciliation.'];
  if (has('api')) bw.unshift(D[1].after);
  if (has('out')) bw.push(D[2].after);
  return [{
    title: 'Summary',
    text: has('sum') ? D[0].after : D[0].before
  }, {
    title: 'Experience',
    items: [{
      heading: 'Systems Analyst — BridgeWorks',
      dates: '2021 — Present',
      sub: 'Cluj-Napoca',
      bullets: bw
    }, {
      heading: 'HR Operations Specialist — Carpatia Retail',
      dates: 'Mar 2019 — 2021',
      sub: 'Cluj-Napoca',
      bullets: ['Coordinated onboarding for 40+ hires per quarter.']
    }]
  }, {
    title: 'Skills',
    text: 'Process automation · SQL · Requirements analysis · Gestionarea părților interesate · Excel'
  }];
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web-app/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.BTN_CSS = __ds_scope.BTN_CSS;

__ds_ns.LOGO_WORD_D = __ds_scope.LOGO_WORD_D;

__ds_ns.LOGO_W = __ds_scope.LOGO_W;

__ds_ns.DOOR_RAYS = __ds_scope.DOOR_RAYS;

__ds_ns.DOOR_LEAF = __ds_scope.DOOR_LEAF;

__ds_ns.CVDocument = __ds_scope.CVDocument;

__ds_ns.PlanCard = __ds_scope.PlanCard;

__ds_ns.TaskCard = __ds_scope.TaskCard;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Dropzone = __ds_scope.Dropzone;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.FieldShell = __ds_scope.FieldShell;

__ds_ns.RadioGroup = __ds_scope.RadioGroup;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.FIELD_CSS = __ds_scope.FIELD_CSS;

__ds_ns.ChangeCard = __ds_scope.ChangeCard;

__ds_ns.FindingGroup = __ds_scope.FindingGroup;

__ds_ns.KeywordRow = __ds_scope.KeywordRow;

__ds_ns.MatchVerdict = __ds_scope.MatchVerdict;

__ds_ns.SideNav = __ds_scope.SideNav;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.ScoreRing = __ds_scope.ScoreRing;

__ds_ns.Stepper = __ds_scope.Stepper;

})();
