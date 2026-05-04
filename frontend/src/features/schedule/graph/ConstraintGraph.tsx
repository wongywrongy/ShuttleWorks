/**
 * Force-directed graph visualization of player constraints
 */
import { useRef, useCallback, useMemo, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { GraphData, GraphNode, GraphEdge } from '../../../api/dto';

interface ConstraintGraphProps {
  data: GraphData;
  width?: number;
  height?: number;
}

const EDGE_COLORS = {
  conflict: '#EF4444',      // red-500
  resolved: '#22C55E',      // green-500
  soft_violation: '#EAB308' // yellow-500
};

const GROUP_COLORS = [
  '#3B82F6', // blue-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#F97316', // orange-500
  '#14B8A6', // teal-500
  '#6366F1', // indigo-500
  '#84CC16', // lime-500
  '#F43F5E', // rose-500
];

export function ConstraintGraph({ data, width = 500, height = 350 }: ConstraintGraphProps) {
  const fgRef = useRef<any>(null);

  // Assign colors to groups
  const groupColorMap = useMemo(() => {
    const uniqueGroups = [...new Set(data.nodes.map(n => n.groupId))];
    return new Map(uniqueGroups.map((g, i) => [g, GROUP_COLORS[i % GROUP_COLORS.length]]));
  }, [data.nodes]);

  // Zoom to fit when data changes
  useEffect(() => {
    if (fgRef.current && data.nodes.length > 0) {
      setTimeout(() => {
        fgRef.current?.zoomToFit(300, 40);
      }, 100);
    }
  }, [data]);

  // Custom node rendering
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const graphNode = node as GraphNode;
    const radius = Math.max(6, 4 + graphNode.matchCount * 2);
    const color = groupColorMap.get(graphNode.groupId) || '#6B7280';

    // Draw node circle with glow effect
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius + 2, 0, 2 * Math.PI);
    ctx.fillStyle = `${color}33`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw label
    const label = graphNode.name.length > 10
      ? graphNode.name.substring(0, 9) + '...'
      : graphNode.name;
    ctx.font = '9px "Geist Variable", system-ui, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, node.x!, node.y! + radius + 4);
  }, [groupColorMap]);

  // Link color based on constraint status
  const linkColor = useCallback((link: any) => {
    const edge = link as GraphEdge;
    return EDGE_COLORS[edge.status];
  }, []);

  // Link width based on status
  const linkWidth = useCallback((link: any) => {
    const edge = link as GraphEdge;
    if (edge.status === 'conflict') return 3;
    if (edge.status === 'soft_violation') return 2;
    return 1;
  }, []);

  // Link particles for conflicts (visual emphasis)
  const linkDirectionalParticles = useCallback((link: any) => {
    const edge = link as GraphEdge;
    return edge.status === 'conflict' ? 4 : 0;
  }, []);

  if (data.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted/40 border border-border rounded-lg"
        style={{ width, height }}
      >
        <span className="text-muted-foreground text-sm">No players to visualize</span>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        width={width}
        height={height}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node, color, ctx) => {
          const radius = 10;
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkDirectionalParticles={linkDirectionalParticles}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}
        cooldownTicks={50}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.3}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        minZoom={0.5}
        maxZoom={4}
      />
    </div>
  );
}
