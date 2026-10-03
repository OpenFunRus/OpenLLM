/** Scrollbar CSS injected into embedded browser tabs — matches global.css / theme.css. */
export function browserWebviewScrollbarCss(theme: 'dark' | 'light'): string {
  const thumb = theme === 'dark' ? 'rgba(0, 122, 204, 0.45)' : 'rgba(0, 122, 204, 0.35)'
  const thumbHover = '#007ACC'
  const track = 'transparent'

  return `
    html {
      scrollbar-width: thin;
      scrollbar-color: ${thumb} ${track};
    }
    *, *::before, *::after {
      scrollbar-width: thin;
      scrollbar-color: ${thumb} ${track};
    }
    ::-webkit-scrollbar {
      width: 4px !important;
      height: 4px !important;
    }
    ::-webkit-scrollbar-track {
      background: ${track} !important;
    }
    ::-webkit-scrollbar-thumb {
      background: ${thumb} !important;
      border-radius: 4px !important;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: ${thumbHover} !important;
    }
    ::-webkit-scrollbar-corner {
      background: transparent !important;
    }
  `.trim()
}
