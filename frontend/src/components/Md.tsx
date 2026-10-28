import ReactMarkdown, { type Options } from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface Props {
  children: string
  className?: string
}

const REMARK_PLUGINS: Options['remarkPlugins'] = [remarkMath]
const REHYPE_PLUGINS: Options['rehypePlugins'] = [rehypeKatex]

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
