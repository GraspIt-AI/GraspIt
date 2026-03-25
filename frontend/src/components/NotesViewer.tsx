import ReactMarkdown from 'react-markdown'

interface Props {
  notes: string
}

export default function NotesViewer({ notes }: Props) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <ReactMarkdown>{notes}</ReactMarkdown>
    </div>
  )
}
