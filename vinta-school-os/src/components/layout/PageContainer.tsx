import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('animate-fade-in', className)}>
      {children}
    </div>
  )
}

export default PageContainer
