import { useEffect } from 'react'
import NotesViewer from './NotesViewer'

interface Props {
  title: string
  notes: string
  onClose: () => void
}

export default function PrintModal({ title, notes, onClose }: Props) {
  // Inject print CSS: hide everything except #bj-print-root; @page margin:0 kills browser headers/footers
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'bj-print-style'
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        #bj-print-root { display: block !important; }
        @page { margin: 0; }
      }
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  return (
    <>
      {/* Print-only content — hidden on screen, shown only when printing */}
      <div id="bj-print-root" style={{ display: 'none' }}>
        <div style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: '13pt',
          lineHeight: '1.7',
          color: '#111',
          padding: '0.85in 1in',
        }}>
          <h1 style={{
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: '22pt',
            fontWeight: 700,
            marginBottom: '0.4in',
            paddingBottom: '10px',
            borderBottom: '2px solid #e5e7eb',
          }}>{title}</h1>
          {/* Inline styles for prose elements since Tailwind classes won't render cleanly in print */}
          <style>{`
            #bj-print-root h1:not(.doc-title), #bj-print-root h2, #bj-print-root h3 {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-weight: 700; margin-top: 1.3em; margin-bottom: 0.3em;
            }
            #bj-print-root h2 { font-size: 14pt; }
            #bj-print-root h3 { font-size: 12pt; }
            #bj-print-root p { margin-bottom: 0.7em; }
            #bj-print-root ul, #bj-print-root ol { padding-left: 1.6em; margin-bottom: 0.7em; }
            #bj-print-root li { margin-bottom: 0.25em; }
            #bj-print-root strong { font-weight: 700; }
            #bj-print-root em { font-style: italic; }
            #bj-print-root code {
              font-family: 'Courier New', monospace; font-size: 11pt;
              background: #f3f4f6; padding: 1px 4px; border-radius: 3px;
            }
            #bj-print-root pre {
              background: #f3f4f6; padding: 12px 16px; border-radius: 6px;
              overflow-x: auto; margin-bottom: 0.7em;
            }
            #bj-print-root pre code { background: none; padding: 0; }
            #bj-print-root blockquote {
              border-left: 3px solid #d1d5db; padding-left: 1em; color: #555;
              margin-bottom: 0.7em;
            }
          `}</style>
          <NotesViewer notes={notes} />
        </div>
      </div>

      {/* Modal overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[88vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="font-semibold text-gray-800">Export notes as PDF</h2>
              <p className="text-xs text-gray-400 mt-0.5">In the print dialog, set destination to "Save as PDF"</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-sm bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-semibold"
              >
                Save as PDF
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="overflow-y-auto px-8 py-6">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-4">{title}</p>
            <div className="prose prose-sm max-w-none text-gray-800">
              <NotesViewer notes={notes} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
