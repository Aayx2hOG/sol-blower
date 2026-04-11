'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function Reveal({
    children,
    className,
    delay = 0,
}: {
    children: ReactNode
    className?: string
    delay?: number
}) {
    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-70px' }}
            transition={{ duration: 0.45, ease: 'easeOut', delay }}
        >
            {children}
        </motion.div>
    )
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <motion.div
            className={cn(className)}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-70px' }}
            variants={{
                hidden: {},
                show: {
                    transition: {
                        staggerChildren: 0.08,
                    },
                },
            }}
        >
            {children}
        </motion.div>
    )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <motion.div
            className={className}
            variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
            }}
        >
            {children}
        </motion.div>
    )
}
