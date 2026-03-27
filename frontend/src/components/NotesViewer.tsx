import Md from './Md'

interface Props {
  notes: string
}

export default function NotesViewer({ notes }: Props) {
  return (
    <div className="prose prose-sm max-w-none text-gray-700">
      <Md>{notes}</Md>
    </div>
  )
}
