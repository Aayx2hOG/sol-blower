'use client'

import { useEffect, useMemo, useState } from 'react'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { ISourceOptions } from '@tsparticles/engine'

export function LiveBackdrop() {
    const [ready, setReady] = useState(false)

    useEffect(() => {
        initParticlesEngine(async (engine) => {
            await loadSlim(engine)
        }).then(() => setReady(true))
    }, [])

    const options = useMemo<ISourceOptions>(
        () => ({
            fullScreen: { enable: false },
            fpsLimit: 60,
            pauseOnOutsideViewport: true,
            background: {
                color: '#050506',
            },
            particles: {
                number: {
                    value: 60,
                    density: {
                        enable: true,
                        width: 1400,
                        height: 900,
                    },
                },
                color: {
                    value: ['#9ca3af', '#d4d4d8', '#71717a'],
                },
                links: {
                    enable: true,
                    distance: 150,
                    color: '#6b7280',
                    opacity: 0.14,
                    width: 1,
                },
                move: {
                    enable: true,
                    speed: 0.5,
                    direction: 'none',
                    outModes: {
                        default: 'out',
                    },
                },
                opacity: {
                    value: { min: 0.12, max: 0.3 },
                },
                size: {
                    value: { min: 0.8, max: 2.1 },
                },
            },
            interactivity: {
                events: {
                    onHover: {
                        enable: true,
                        mode: 'grab',
                    },
                    resize: {
                        enable: true,
                    },
                },
                modes: {
                    grab: {
                        distance: 170,
                        links: {
                            opacity: 0.22,
                        },
                    },
                },
            },
            detectRetina: true,
        }),
        []
    )

    if (!ready) {
        return <div className="h-full w-full bg-black" aria-hidden="true" />
    }

    return <Particles id="live-backdrop" options={options} className="h-full w-full" aria-hidden="true" />
}
