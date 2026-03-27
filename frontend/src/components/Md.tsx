import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface Props {
  children: string
  className?: string
}

const REMARK_PLUGINS = [remarkMath] as any
const REHYPE_PLUGINS = [rehypeKatex] as any

export default function Md({ children, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
