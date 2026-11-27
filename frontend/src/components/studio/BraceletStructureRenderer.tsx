import React, { useMemo } from 'react';
import { getAssetUrl } from '@/lib/queryClient';
import type {
  IBraceletStructure,
  IStructureNode,
  IAttachmentPoint,
  IComponentConnection,
} from '@/types/structure';

export interface SelectedCharmDetail {
  sku: string;
  name: string;
  imageUrl?: string | null;
  price?: number;
}

export interface BraceletStructureRendererProps {
  structure: IBraceletStructure;
  selections?: Record<string, string | string[]>;
  charmDetailsMap?: Map<string, SelectedCharmDetail>;
  className?: string;
  editorMode?: boolean;
  selectedNodeId?: string | null;
  selectedPointId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onSelectPoint?: (pointId: string | null) => void;
  showAttachmentGuides?: boolean;
  showConnections?: boolean;
}

/**
 * Calculates a point along a quadratic Bézier curve at parameter t (0 <= t <= 1)
 */
function getQuadraticBezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number
): { x: number; y: number; angleDeg: number } {
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;

  // Tangent vector dx/dt, dy/dt
  const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  return { x, y, angleDeg };
}

export const BraceletStructureRenderer: React.FC<BraceletStructureRendererProps> = ({
  structure,
  selections = {},
  charmDetailsMap = new Map(),
  className = '',
  editorMode = false,
  selectedNodeId = null,
  selectedPointId = null,
  onSelectNode,
  onSelectPoint,
  showAttachmentGuides = editorMode,
  showConnections = editorMode,
}) => {
  const { canvas, nodes = [], connections = [], attachmentPoints = [] } = structure;
  const viewBox = canvas?.viewBox || '0 0 480 480';

  // Sort nodes by zIndex ascending for correct SVG stacking
  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  }, [nodes]);

  // Index nodes by id for fast lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, IStructureNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  /**
   * Renders a realistic parametric extension chain using alternating vector links
   */
  const renderExtensionChain = (node: IStructureNode) => {
    const chainCfg = node.chainConfig || {
      lengthMm: 45,
      curvature: 25,
      linkSpacingPx: 7,
      linkWidthPx: 5,
      linkHeightPx: 8,
      color: '#C0A888',
    };

    const linkSpacing = chainCfg.linkSpacingPx || 7;
    const linkWidth = chainCfg.linkWidthPx || 5;
    const linkHeight = chainCfg.linkHeightPx || 8;
    const strokeColor = chainCfg.color || '#C0A888';

    // Start coordinate is node (x, y)
    const p0 = { x: node.x, y: node.y };

    // End coordinate hangs downward by lengthMm * scale, shifted slightly outward
    const hangLen = Math.max(20, (chainCfg.lengthMm || 45) * 1.4);
    const rad = ((node.rotationDeg || 0) * Math.PI) / 180;
    const p2 = {
      x: node.x + Math.sin(rad) * hangLen * 0.4,
      y: node.y + Math.cos(rad) * hangLen,
    };

    // Control point P1 determines natural gravitational drape/curvature
    const curvature = chainCfg.curvature !== undefined ? chainCfg.curvature : 20;
    const p1 = {
      x: (p0.x + p2.x) / 2 + curvature * 0.6,
      y: (p0.y + p2.y) / 2 + Math.abs(curvature) * 0.8,
    };

    // Estimate arc length
    const chord = Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const linkCount = Math.max(3, Math.round(chord / linkSpacing));

    const links = [];
    for (let i = 0; i <= linkCount; i++) {
      const t = i / linkCount;
      const pt = getQuadraticBezierPoint(p0, p1, p2, t);
      const isFacing = i % 2 === 0;

      links.push(
        <g
          key={`link-${node.id}-${i}`}
          transform={`translate(${pt.x}, ${pt.y}) rotate(${pt.angleDeg})`}
        >
          {isFacing ? (
            // Face-on oval chain link
            <ellipse
              cx={0}
              cy={0}
              rx={linkWidth / 2}
              ry={linkHeight / 2}
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.4"
            />
          ) : (
            // Side-profile interlocked link
            <line
              x1={0}
              y1={-linkHeight / 2}
              x2={0}
              y2={linkHeight / 2}
              stroke={strokeColor}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          )}
        </g>
      );
    }

    return (
      <g key={node.id} className={node.visible === false ? 'opacity-30' : ''}>
        {/* Subtle drape guideline */}
        <path
          d={`M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="0.8"
          strokeOpacity="0.4"
        />
        {/* Rendered alternating chain links */}
        {links}
      </g>
    );
  };

  /**
   * Renders a standard structural node (clasp, jump ring, bead, wire, or custom asset)
   */
  const renderNode = (node: IStructureNode) => {
    if (!node.visible && !editorMode) return null;
    if (node.role === 'extension_chain') {
      return renderExtensionChain(node);
    }

    const isSelected = editorMode && selectedNodeId === node.id;
    const halfW = node.width / 2;
    const halfH = node.height / 2;
    const transform = `translate(${node.x}, ${node.y}) rotate(${node.rotationDeg || 0}) ${
      node.mirrorX ? 'scale(-1, 1)' : ''
    } ${node.mirrorY ? 'scale(1, -1)' : ''}`;

    const rawSrc = node.customAssetUrl;
    const resolvedSrc = rawSrc ? getAssetUrl(rawSrc) : null;

    return (
      <g
        key={node.id}
        transform={transform}
        className={editorMode ? 'cursor-pointer select-none' : ''}
        onClick={(e) => {
          if (editorMode && onSelectNode) {
            e.stopPropagation();
            onSelectNode(node.id);
          }
        }}
      >
        {resolvedSrc ? (
          <image
            href={resolvedSrc}
            x={-halfW}
            y={-halfH}
            width={node.width}
            height={node.height}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          // Vector fallbacks for core structural shapes
          renderNodeVectorFallback(node, halfW, halfH)
        )}

        {/* Editor Selection Box & Resize indicator */}
        {isSelected && (
          <g className="pointer-events-none">
            <rect
              x={-halfW - 3}
              y={-halfH - 3}
              width={node.width + 6}
              height={node.height + 6}
              fill="none"
              stroke="#B66F72"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              rx={4}
            />
            {/* Corner handle dots */}
            <circle cx={-halfW - 3} cy={-halfH - 3} r="3.5" fill="#B66F72" />
            <circle cx={halfW + 3} cy={-halfH - 3} r="3.5" fill="#B66F72" />
            <circle cx={halfW + 3} cy={halfH + 3} r="3.5" fill="#B66F72" />
            <circle cx={-halfW - 3} cy={halfH + 3} r="3.5" fill="#B66F72" />
            {/* Rotation indicator stem */}
            <line x1={0} y1={-halfH - 3} x2={0} y2={-halfH - 14} stroke="#B66F72" strokeWidth="1.5" />
            <circle cx={0} cy={-halfH - 14} r="4" fill="#B66F72" />
          </g>
        )}
      </g>
    );
  };

  /**
   * Vector fallbacks for jewelry assembly parts when no custom transparent PNG is provided
   */
  const renderNodeVectorFallback = (node: IStructureNode, halfW: number, halfH: number) => {
    switch (node.role) {
      case 'jump_ring':
        return (
          <ellipse
            cx={0}
            cy={0}
            rx={Math.max(3, halfW * 0.8)}
            ry={Math.max(3, halfH * 0.8)}
            fill="none"
            stroke="#C0A888"
            strokeWidth={Math.max(1.8, halfW * 0.22)}
          />
        );
      case 'lobster_clasp':
        return (
          <path
            d={`M ${-halfW * 0.6} ${halfH * 0.7} 
               C ${-halfW * 0.9} ${halfH * 0.3}, ${-halfW * 0.9} ${-halfH * 0.4}, ${-halfW * 0.4} ${-halfH * 0.8}
               C ${halfW * 0.3} ${-halfH * 0.9}, ${halfW * 0.9} ${-halfH * 0.3}, ${halfW * 0.7} ${halfH * 0.4}
               C ${halfW * 0.5} ${halfH * 0.9}, ${-halfW * 0.1} ${halfH * 0.9}, ${-halfW * 0.6} ${halfH * 0.7} Z`}
            fill="#D4BF90"
            stroke="#9E7E5A"
            strokeWidth="1.2"
          />
        );
      case 'end_cap':
        return (
          <path
            d={`M ${-halfW} ${halfH * 0.5} 
               L ${-halfW} ${-halfH * 0.5} 
               C ${-halfW * 0.3} ${-halfH * 0.8}, ${halfW * 0.3} ${-halfH * 0.8}, ${halfW} ${-halfH * 0.5}
               L ${halfW} ${halfH * 0.5} Z`}
            fill="#C0A888"
            stroke="#8E7860"
            strokeWidth="1"
          />
        );
      case 'memory_wire':
      case 'bracelet_base':
      case 'elastic_cord':
        return (
          <circle
            cx={0}
            cy={0}
            r={halfW}
            fill="none"
            stroke="#D4BAA8"
            strokeWidth={Math.max(2, halfW * 0.05)}
            opacity="0.8"
          />
        );
      case 'bead':
        return (
          <circle
            cx={0}
            cy={0}
            r={halfW}
            fill={node.beadConfig?.color || '#F4B0C0'}
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="1"
          />
        );
      default:
        return (
          <rect
            x={-halfW}
            y={-halfH}
            width={node.width}
            height={node.height}
            fill="#FAF6F0"
            stroke="#C0A888"
            strokeWidth="1"
            rx="3"
          />
        );
    }
  };

  /**
   * Renders customer-selectable or decorative charms attached to an AttachmentPoint
   */
  const renderAttachmentPoint = (point: IAttachmentPoint) => {
    // 1. Resolve selected charm from customer selections or default variant
    let selectedSku: string | null = null;
    if (point.linkedFieldKey && selections[point.linkedFieldKey]) {
      const val = selections[point.linkedFieldKey];
      selectedSku = Array.isArray(val) ? val[0] : String(val);
    } else if (selections['extensionEndCharm']) {
      const val = selections['extensionEndCharm'];
      selectedSku = Array.isArray(val) ? val[0] : String(val);
    } else if (selections['charm']) {
      const val = selections['charm'];
      selectedSku = Array.isArray(val) ? val[0] : String(val);
    } else if (point.defaultVariantSku) {
      selectedSku = point.defaultVariantSku;
    }

    const charmDetail = selectedSku
      ? charmDetailsMap.get(selectedSku) ||
        charmDetailsMap.get(selectedSku.toUpperCase()) ||
        charmDetailsMap.get(selectedSku.toLowerCase())
      : null;
    const isPointSelected = editorMode && selectedPointId === point.id;

    // Charm position hangs outward based on hangDirectionDeg
    const rad = ((point.hangDirectionDeg || 90) * Math.PI) / 180;
    const dropDist = 18; // px offset for hanging charm
    const charmCx = point.x + Math.cos(rad) * dropDist;
    const charmCy = point.y + Math.sin(rad) * dropDist;
    const charmR = 14;

    return (
      <g
        key={point.id}
        onClick={(e) => {
          if (editorMode && onSelectPoint) {
            e.stopPropagation();
            onSelectPoint(point.id);
          }
        }}
      >
        {/* Render charm if selected */}
        {charmDetail && (
          <g className="transition-all duration-300">
            {/* Jump ring connector line */}
            <line
              x1={point.x}
              y1={point.y}
              x2={charmCx}
              y2={charmCy - charmR * 0.7}
              stroke="#C0A888"
              strokeWidth="1.5"
              strokeDasharray="2 1"
            />
            {charmDetail.imageUrl ? (
              <>
                <defs>
                  <clipPath id={`charm-clip-${point.id}`}>
                    <circle cx={charmCx} cy={charmCy} r={charmR} />
                  </clipPath>
                </defs>
                <image
                  href={getAssetUrl(charmDetail.imageUrl)}
                  x={charmCx - charmR}
                  y={charmCy - charmR}
                  width={charmR * 2}
                  height={charmR * 2}
                  clipPath={`url(#charm-clip-${point.id})`}
                  preserveAspectRatio="xMidYMid meet"
                />
                <circle
                  cx={charmCx}
                  cy={charmCy}
                  r={charmR}
                  fill="none"
                  stroke="#C0A888"
                  strokeWidth="1.2"
                />
              </>
            ) : (
              // Polished charm fallback medal
              <g>
                <circle
                  cx={charmCx}
                  cy={charmCy}
                  r={charmR}
                  fill="#D4BF90"
                  stroke="#B99A72"
                  strokeWidth="1.5"
                />
                <text
                  x={charmCx}
                  y={charmCy + charmR * 0.35}
                  textAnchor="middle"
                  fontSize={charmR * 1.1}
                  fill="#342824"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  ✦
                </text>
              </g>
            )}
          </g>
        )}

        {/* Attachment Point Guide Dot (shown in editor mode or when guides are requested) */}
        {showAttachmentGuides && (
          <g className="cursor-pointer">
            <circle
              cx={point.x}
              cy={point.y}
              r={isPointSelected ? 6 : 4.5}
              fill={isPointSelected ? '#B66F72' : '#2D8A68'}
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            {/* Direction pointer tick */}
            <line
              x1={point.x}
              y1={point.y}
              x2={point.x + Math.cos(rad) * 9}
              y2={point.y + Math.sin(rad) * 9}
              stroke={isPointSelected ? '#B66F72' : '#2D8A68'}
              strokeWidth="1.5"
            />
            {isPointSelected && (
              <text
                x={point.x}
                y={point.y - 9}
                textAnchor="middle"
                fontSize="10"
                fill="#B66F72"
                fontWeight="600"
              >
                {point.label}
              </text>
            )}
          </g>
        )}
      </g>
    );
  };

  /**
   * Renders logical connection lines between components in editor mode
   */
  const renderConnections = () => {
    if (!showConnections || connections.length === 0) return null;

    return (
      <g className="pointer-events-none opacity-60">
        {connections.map((conn) => {
          const fromNode = nodeMap.get(conn.fromNodeId);
          const toNode = nodeMap.get(conn.toNodeId);
          if (!fromNode || !toNode) return null;

          return (
            <line
              key={conn.id}
              x1={fromNode.x}
              y1={fromNode.y}
              x2={toNode.x}
              y2={toNode.y}
              stroke="#B99A72"
              strokeWidth="1.2"
              strokeDasharray="3 3"
            />
          );
        })}
      </g>
    );
  };

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center ${className}`}
      onClick={() => {
        if (editorMode && onSelectNode) {
          onSelectNode(null);
        }
        if (editorMode && onSelectPoint) {
          onSelectPoint(null);
        }
      }}
    >
      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        className="overflow-visible select-none"
      >
        {/* Subtle grid pattern for editor view */}
        {editorMode && (
          <pattern id="editor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="0.8" fill="#E2D6CC" opacity="0.6" />
          </pattern>
        )}
        {editorMode && <rect width="100%" height="100%" fill="url(#editor-grid)" />}

        {/* 1. Logical connections */}
        {renderConnections()}

        {/* 2. Structural nodes sorted by zIndex */}
        {sortedNodes.map(renderNode)}

        {/* 3. Attachment points & attached customer charms */}
        {attachmentPoints.map(renderAttachmentPoint)}
      </svg>
    </div>
  );
};

export default BraceletStructureRenderer;
