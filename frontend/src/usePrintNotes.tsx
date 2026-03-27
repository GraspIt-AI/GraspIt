import { createPortal } from 'react-dom'
import NotesViewer from './components/NotesViewer'

const PRINT_CSS = `
  @media print {
    body > * { display: none !important; }
    #bj-print-root { display: block !important; }
    @page {
      margin: 0.85in 1in;
      @bottom-center {
        content: counter(page) " / " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 9pt;
        color: #9ca3af;
      }
    }

    #bj-print-root { font-family: Georgia, 'Times New Roman', serif; font-size: 13pt; line-height: 1.7; color: #111; }
    #bj-print-root .doc-title { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 22pt; font-weight: 700; margin-bottom: 0.4in; padding-bottom: 10px; border-bottom: 2px solid #e5e7eb; }
    #bj-print-root h1, #bj-print-root h2, #bj-print-root h3, #bj-print-root h4 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-weight: 700; margin-top: 1.3em; margin-bottom: 0.3em; page-break-after: avoid; }
    #bj-print-root h2 { font-size: 14pt; }
    #bj-print-root h3 { font-size: 12pt; }
    #bj-print-root p { margin-bottom: 0.7em; }
    #bj-print-root ul, #bj-print-root ol { padding-left: 1.6em; margin-bottom: 0.7em; }
    #bj-print-root li { margin-bottom: 0.25em; }
    #bj-print-root strong { font-weight: 700; }
    #bj-print-root em { font-style: italic; }
    #bj-print-root code { font-family: 'Courier New', monospace; font-size: 11pt; background: #f3f4f6; padding: 1px 4px; border-radius: 3px; }
    #bj-print-root pre { background: #f3f4f6; padding: 12px 16px; border-radius: 6px; margin-bottom: 0.7em; }
    #bj-print-root pre code { background: none; padding: 0; }
    #bj-print-root blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; color: #555; margin-bottom: 0.7em; }
    .katex-mathml { display: none !important; }
    .katex-display { display: block !important; margin: 0.6em 0; }
  }
`

export function usePrintNotes(title: string, notes: string) {
  function triggerPrint() {
    const style = document.createElement('style')
    style.textContent = PRINT_CSS
    document.head.appendChild(style)
    window.print()
    window.addEventListener('afterprint', () => style.remove(), { once: true })
  }

  const printPortal = createPortal(
    <div id="bj-print-root" aria-hidden="true" style={{ display: 'none' }}>
      <p className="doc-title">{title}</p>
      <NotesViewer notes={notes} />
    </div>,
    document.body
  )

  return { triggerPrint, printPortal }
}
