// GitHub's theme markers follow the page theme, including an explicit theme
// that differs from the operating system preference. No JavaScript is needed.
export function themedImage(dark, light, alt, attributes = 'width="100%"') {
  const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return `<a href="${dark}#gh-dark-mode-only"><img src="${dark}" alt="${escape(alt)}" ${attributes}></a>\n<a href="${light}#gh-light-mode-only"><img src="${light}" alt="${escape(alt)}" ${attributes}></a>`;
}
