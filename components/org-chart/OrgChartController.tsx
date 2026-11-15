'use client'

import { useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'

export interface OrgChartControls {
  fitToNode: (id: string) => void
}

interface OrgChartControllerProps {
  controlsRef: React.MutableRefObject<OrgChartControls | null>
}

/**
 * Thin wrapper that must live inside <ReactFlow> so useReactFlow() is in context.
 * Exposes fitToNode via ref so OrgChartShell can call it from outside the canvas.
 */
export function OrgChartController({ controlsRef }: OrgChartControllerProps) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    controlsRef.current = {
      fitToNode: (id: string) => {
        if (id) {
          fitView({ nodes: [{ id }], duration: 600, padding: 0.5 })
        } else {
          fitView({ duration: 600, padding: 0.25 })
        }
      },
    }
  }, [fitView, controlsRef])

  return null
}
