'use client'

import type { HTMLAttributes, MouseEvent } from 'react'

import { cn } from '@/lib/utils'

export function SpotlightCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
    function handleMove(event: MouseEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top

        event.currentTarget.style.setProperty('--spotlight-x', `${x}px`)
        event.currentTarget.style.setProperty('--spotlight-y', `${y}px`)
    }

    return (
        <div onMouseMove={handleMove} className={cn('spotlight-card', className)} {...props}>
            {children}
        </div>
    )
}
