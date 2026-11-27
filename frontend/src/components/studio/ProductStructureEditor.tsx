import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, formatApiErrorMessage } from '@/lib/queryClient';
import BraceletStructureRenderer from './BraceletStructureRenderer';
import type {
  IBraceletStructure,
  IStructureNode,
  IAttachmentPoint,
  IComponentConnection,
  StructureComponentRole,
} from '@/types/structure';
import {
  Undo2,
  Redo2,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Layers,
  Link as LinkIcon,
  Sparkles,
  Move,
  RotateCw,
  Maximize2,
  Minimize2,
  Check,
  AlertCircle,
  HelpCircle,
  X,
} from 'lucide-react';

interface ProductStructureEditorProps {
  productId: string;
  productName: string;
  productSku: string;
  initialStructure?: IBraceletStructure | null;
  onSaveSuccess?: (saved: IBraceletStructure) => void;
  onSave?: (saved: IBraceletStructure) => void;
  onClose?: () => void;
}

const DEFAULT_EMPTY_STRUCTURE: IBraceletStructure = {
  version: 1,
  updatedAt: new Date().toISOString(),
  canvas: { width: 480, height: 480, viewBox: '0 0 480 480' },
  baseType: 'circular_bead',
  baseConfig: { cordDiameterMm: 160, openGapAngleDeg: 0, rotationDeg: 0 },
  nodes: [],
  connections: [],
  attachmentPoints: [],
};

export const ProductStructureEditor: React.FC<ProductStructureEditorProps> = ({
  productId,
  productName,
  productSku,
  initialStructure,
  onSaveSuccess,
  onSave,
  onClose,
}) => {
  const { toast } = useToast();

  // Working structure state
  const [structure, setStructure] = useState<IBraceletStructure>(
    initialStructure ? JSON.parse(JSON.stringify(initialStructure)) : DEFAULT_EMPTY_STRUCTURE
  );

  // Undo / Redo history stacks
  const [history, setHistory] = useState<IBraceletStructure[]>([]);
  const [redoStack, setRedoStack] = useState<IBraceletStructure[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  // View modes
  const [previewMode, setPreviewMode] = useState<boolean>(false);
  const [showConnections, setShowConnections] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'nodes' | 'points' | 'presets'>('nodes');

  // Canvas interaction refs
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number }>({
    mouseX: 0,
    mouseY: 0,
    nodeX: 0,
    nodeY: 0,
  });

  // Track unsaved changes
  const pushState = (newStructure: IBraceletStructure) => {
    setHistory((prev) => [...prev.slice(-30), JSON.parse(JSON.stringify(structure))]);
    setRedoStack([]);
    setStructure(newStructure);
    setIsSaved(false);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack((prev) => [JSON.parse(JSON.stringify(structure)), ...prev]);
    setHistory((prev) => prev.slice(0, -1));
    setStructure(previous);
    setIsSaved(false);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory((prev) => [...prev, JSON.parse(JSON.stringify(structure))]);
    setRedoStack((prev) => prev.slice(1));
    setStructure(next);
    setIsSaved(false);
  };

  // Selected entities
  const selectedNode = structure.nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedPoint = structure.attachmentPoints.find((p) => p.id === selectedPointId) || null;

  // Add Component Node
  const handleAddNode = (role: StructureComponentRole, defaultName?: string) => {
    const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let width = 24;
    let height = 24;
    let defaultX = 240;
    let defaultY = 240;

    if (role === 'lobster_clasp') {
      width = 28;
      height = 42;
      defaultX = 240;
      defaultY = 80;
    } else if (role === 'jump_ring') {
      width = 16;
      height = 16;
      defaultX = 220;
      defaultY = 80;
    } else if (role === 'extension_chain') {
      width = 30;
      height = 80;
      defaultX = 260;
      defaultY = 85;
    } else if (role === 'end_cap') {
      width = 18;
      height = 20;
      defaultX = 240;
      defaultY = 70;
    }

    const newNode: IStructureNode = {
      id,
      role,
      displayName: defaultName || role.replace(/_/g, ' ').toUpperCase(),
      x: defaultX,
      y: defaultY,
      width,
      height,
      rotationDeg: 0,
      zIndex: structure.nodes.length + 1,
      visible: true,
      chainConfig:
        role === 'extension_chain'
          ? {
              lengthMm: 45,
              curvature: 22,
              linkSpacingPx: 7,
              linkWidthPx: 5,
              linkHeightPx: 8,
              color: '#C0A888',
            }
          : undefined,
    };

    pushState({
      ...structure,
      nodes: [...structure.nodes, newNode],
    });
    setSelectedNodeId(id);
    setSelectedPointId(null);
  };

  // Add Attachment Point (Customer Charm Slot)
  const handleAddAttachmentPoint = (label: string, linkedKey = 'charm') => {
    const id = `point-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newPoint: IAttachmentPoint = {
      id,
      label,
      x: selectedNode ? selectedNode.x : 240,
      y: selectedNode ? selectedNode.y + selectedNode.height / 2 + 10 : 380,
      hangDirectionDeg: 90,
      isCustomerSelectable: true,
      linkedFieldKey: linkedKey,
      required: false,
      allowMultiple: false,
    };

    pushState({
      ...structure,
      attachmentPoints: [...structure.attachmentPoints, newPoint],
    });
    setSelectedPointId(id);
    setSelectedNodeId(null);
  };

  // Update Selected Node attributes
  const handleUpdateNode = (updated: Partial<IStructureNode>) => {
    if (!selectedNodeId) return;
    pushState({
      ...structure,
      nodes: structure.nodes.map((n) => (n.id === selectedNodeId ? { ...n, ...updated } : n)),
    });
  };

  // Update Selected Attachment Point
  const handleUpdatePoint = (updated: Partial<IAttachmentPoint>) => {
    if (!selectedPointId) return;
    pushState({
      ...structure,
      attachmentPoints: structure.attachmentPoints.map((p) =>
        p.id === selectedPointId ? { ...p, ...updated } : p
      ),
    });
  };

  // Delete Selected Entity
  const handleDeleteSelected = () => {
    if (selectedNodeId) {
      pushState({
        ...structure,
        nodes: structure.nodes.filter((n) => n.id !== selectedNodeId),
        connections: structure.connections.filter(
          (c) => c.fromNodeId !== selectedNodeId && c.toNodeId !== selectedNodeId
        ),
      });
      setSelectedNodeId(null);
    } else if (selectedPointId) {
      pushState({
        ...structure,
        attachmentPoints: structure.attachmentPoints.filter((p) => p.id !== selectedPointId),
      });
      setSelectedPointId(null);
    }
  };

  // One-click Preset: Crystal Bead Bracelet with Clasp, Jump Rings, Extension Chain & End Charm
  const handleApplyCrystalBeadPreset = () => {
    const preset: IBraceletStructure = {
      version: 1,
      updatedAt: new Date().toISOString(),
      canvas: { width: 480, height: 480, viewBox: '0 0 480 480' },
      baseType: 'circular_bead',
      baseConfig: { cordDiameterMm: 160, openGapAngleDeg: 28, rotationDeg: 0 },
      nodes: [
        {
          id: 'node-bead-ring',
          role: 'bracelet_base',
          displayName: 'Crystal Bead Core Ring',
          x: 240,
          y: 240,
          width: 320,
          height: 320,
          rotationDeg: 0,
          zIndex: 1,
          visible: true,
        },
        {
          id: 'node-jumpring-left',
          role: 'jump_ring',
          displayName: 'Left Endpoint Jump Ring',
          x: 200,
          y: 84,
          width: 14,
          height: 14,
          rotationDeg: 0,
          zIndex: 2,
          visible: true,
        },
        {
          id: 'node-clasp',
          role: 'lobster_clasp',
          displayName: 'Gold Lobster Clasp',
          x: 218,
          y: 80,
          width: 24,
          height: 36,
          rotationDeg: 80,
          zIndex: 3,
          visible: true,
        },
        {
          id: 'node-jumpring-right',
          role: 'jump_ring',
          displayName: 'Right Endpoint Jump Ring',
          x: 275,
          y: 84,
          width: 14,
          height: 14,
          rotationDeg: 0,
          zIndex: 2,
          visible: true,
        },
        {
          id: 'node-ext-chain',
          role: 'extension_chain',
          displayName: '50mm Extension Chain',
          x: 278,
          y: 92,
          width: 30,
          height: 90,
          rotationDeg: -12,
          zIndex: 2,
          visible: true,
          chainConfig: {
            lengthMm: 48,
            curvature: 20,
            linkSpacingPx: 7,
            linkWidthPx: 5,
            linkHeightPx: 8,
            color: '#C0A888',
          },
        },
      ],
      connections: [
        { id: 'c1', fromNodeId: 'node-bead-ring', toNodeId: 'node-jumpring-left', connectionType: 'endpoint' },
        { id: 'c2', fromNodeId: 'node-jumpring-left', toNodeId: 'node-clasp', connectionType: 'jump_ring' },
        { id: 'c3', fromNodeId: 'node-bead-ring', toNodeId: 'node-jumpring-right', connectionType: 'endpoint' },
        { id: 'c4', fromNodeId: 'node-jumpring-right', toNodeId: 'node-ext-chain', connectionType: 'chain_link' },
      ],
      attachmentPoints: [
        {
          id: 'slot-extension-end-charm',
          label: 'Extension End Charm',
          x: 288,
          y: 165,
          hangDirectionDeg: 90,
          isCustomerSelectable: true,
          linkedFieldKey: 'charm',
          required: false,
          allowMultiple: false,
        },
      ],
    };

    pushState(preset);
    setSelectedNodeId('node-ext-chain');
    setSelectedPointId(null);
    toast({
      title: 'Preset Applied',
      description: 'Loaded Crystal Bead Bracelet with Clasp, Extension Chain and End Charm.',
    });
  };

  // Save to Database
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        braceletStructure: {
          ...structure,
          version: (structure.version || 1) + 1,
          updatedAt: new Date().toISOString(),
        },
      };

      const res = await apiRequest('PATCH', `/api/v1/products/${productId}`, payload);
      const data = await res.json();

      if (res.ok && data.success) {
        setIsSaved(true);
        setStructure(data.data.braceletStructure || payload.braceletStructure);
        if (onSaveSuccess) onSaveSuccess(data.data.braceletStructure || payload.braceletStructure);
        if (onSave) onSave(data.data.braceletStructure || payload.braceletStructure);
        toast({
          title: 'Structure Saved',
          description: `Product visual structure successfully updated for ${productName}.`,
        });
      } else {
        throw new Error(data.message || 'Failed to save product structure');
      }
    } catch (err: any) {
      toast({
        title: 'Error Saving Structure',
        description: formatApiErrorMessage(err),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Canvas Mouse Dragging for Position
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!selectedNode || previewMode) return;
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: selectedNode.x,
      nodeY: selectedNode.y,
    };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !selectedNode) return;
      if (!canvasContainerRef.current) return;

      const rect = canvasContainerRef.current.getBoundingClientRect();
      const scaleX = 480 / rect.width;
      const scaleY = 480 / rect.height;

      const dx = (e.clientX - dragStartRef.current.mouseX) * scaleX;
      const dy = (e.clientY - dragStartRef.current.mouseY) * scaleY;

      const newX = Math.round(Math.max(10, Math.min(470, dragStartRef.current.nodeX + dx)));
      const newY = Math.round(Math.max(10, Math.min(470, dragStartRef.current.nodeY + dy)));

      setStructure((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === selectedNodeId ? { ...n, x: newX, y: newY } : n)),
      }));
      setIsSaved(false);
    },
    [isDragging, selectedNode, selectedNodeId]
  );

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] min-h-[640px] bg-[#FBF7F3] dark:bg-background border border-[#E6D8D0] dark:border-border rounded-2xl overflow-hidden shadow-lg select-none">
      {/* Top Header & Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-[#E6D8D0] dark:border-border bg-white dark:bg-card gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-playfair font-semibold text-lg text-[#342824] dark:text-foreground">
                Bracelet Structure Editor
              </h2>
              <Badge variant="outline" className="text-[10px] font-mono">
                {productSku}
              </Badge>
              {isSaved ? (
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                  <Check className="w-3 h-3 mr-1" /> Saved
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                  <AlertCircle className="w-3 h-3 mr-1" /> Unsaved Changes
                </Badge>
              )}
            </div>
            <p className="text-xs text-[#756861] dark:text-muted-foreground">{productName}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="h-8 px-2.5 text-xs gap-1"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Undo</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="h-8 px-2.5 text-xs gap-1"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Redo</span>
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

          <Button
            type="button"
            variant={previewMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className={`h-8 px-3 text-xs gap-1.5 ${
              previewMode ? 'bg-[#342824] text-white hover:bg-[#201815]' : ''
            }`}
          >
            {previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{previewMode ? 'Back to Editor' : 'Customer Preview'}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || isSaved}
            className="h-8 px-4 text-xs gap-1.5 bg-[#B66F72] hover:bg-[#95565A] text-white rounded-lg shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Structure'}</span>
          </Button>

          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-[#756861] hover:text-[#342824]"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Workspace: Left Palette, Center Canvas, Right Properties */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Drawer: Palette & Presets */}
        {!previewMode && (
          <div className="w-full md:w-64 border-r border-[#E6D8D0] dark:border-border bg-white dark:bg-card flex flex-col shrink-0">
            <div className="flex border-b border-[#E6D8D0] dark:border-border p-1 bg-[#FBF7F3] dark:bg-muted/30">
              <button
                type="button"
                onClick={() => setActiveTab('nodes')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'nodes' ? 'bg-white dark:bg-card shadow-xs text-[#342824]' : 'text-[#756861]'
                }`}
              >
                Components
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('points')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'points' ? 'bg-white dark:bg-card shadow-xs text-[#342824]' : 'text-[#756861]'
                }`}
              >
                Charm Slots
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('presets')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'presets' ? 'bg-white dark:bg-card shadow-xs text-[#342824]' : 'text-[#756861]'
                }`}
              >
                Presets
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'nodes' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground font-medium uppercase tracking-wider">
                    Add Assembly Parts
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddNode('lobster_clasp', 'Lobster Clasp')}
                      className="h-14 flex flex-col items-center justify-center gap-1 text-[11px] p-1 border-[#E6D8D0] hover:border-[#B66F72]"
                    >
                      <span className="text-base">🧷</span>
                      <span>Lobster Clasp</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddNode('jump_ring', 'Jump Ring')}
                      className="h-14 flex flex-col items-center justify-center gap-1 text-[11px] p-1 border-[#E6D8D0] hover:border-[#B66F72]"
                    >
                      <span className="text-base">⭕</span>
                      <span>Jump Ring</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddNode('extension_chain', 'Extension Chain')}
                      className="h-14 flex flex-col items-center justify-center gap-1 text-[11px] p-1 border-[#E6D8D0] hover:border-[#B66F72]"
                    >
                      <span className="text-base">⛓️</span>
                      <span>Extension Chain</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddNode('end_cap', 'End Cap')}
                      className="h-14 flex flex-col items-center justify-center gap-1 text-[11px] p-1 border-[#E6D8D0] hover:border-[#B66F72]"
                    >
                      <span className="text-base">🔒</span>
                      <span>Wire End Cap</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddNode('memory_wire', 'Memory Wire')}
                      className="h-14 flex flex-col items-center justify-center gap-1 text-[11px] p-1 border-[#E6D8D0] hover:border-[#B66F72]"
                    >
                      <span className="text-base">➰</span>
                      <span>Memory Wire</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddNode('bracelet_base', 'Bead Ring Base')}
                      className="h-14 flex flex-col items-center justify-center gap-1 text-[11px] p-1 border-[#E6D8D0] hover:border-[#B66F72]"
                    >
                      <span className="text-base">📿</span>
                      <span>Base Cord</span>
                    </Button>
                  </div>

                  {/* Layers Listing */}
                  <div className="pt-3 border-t border-border/60">
                    <p className="text-[11px] text-[#756861] dark:text-muted-foreground font-medium uppercase tracking-wider mb-2">
                      Layer Hierarchy ({structure.nodes.length})
                    </p>
                    <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                      {structure.nodes.map((node) => (
                        <div
                          key={node.id}
                          onClick={() => {
                            setSelectedNodeId(node.id);
                            setSelectedPointId(null);
                          }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
                            selectedNodeId === node.id
                              ? 'bg-[#B66F72] text-white font-medium'
                              : 'bg-muted/40 hover:bg-muted text-foreground'
                          }`}
                        >
                          <span className="truncate">{node.displayName}</span>
                          <span className="text-[10px] opacity-70">z:{node.zIndex}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'points' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground font-medium uppercase tracking-wider">
                    Customer Charm Slots
                  </p>
                  <p className="text-xs text-[#756861] leading-relaxed">
                    Create attachment points where customers can slot their chosen charms.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddAttachmentPoint('Extension End Charm', 'charm')}
                    className="w-full text-xs justify-start gap-2 border-[#E6D8D0]"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#B66F72]" />
                    <span>Add Extension End Charm Slot</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddAttachmentPoint('Center Drop Charm', 'charm')}
                    className="w-full text-xs justify-start gap-2 border-[#E6D8D0]"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#B66F72]" />
                    <span>Add Center Drop Charm Slot</span>
                  </Button>

                  <div className="space-y-1 pt-2">
                    {structure.attachmentPoints.map((pt) => (
                      <div
                        key={pt.id}
                        onClick={() => {
                          setSelectedPointId(pt.id);
                          setSelectedNodeId(null);
                        }}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer border ${
                          selectedPointId === pt.id
                            ? 'border-[#B66F72] bg-[#B66F72]/10 font-semibold'
                            : 'border-border bg-card'
                        }`}
                      >
                        <span className="truncate">{pt.label}</span>
                        <Badge variant="outline" className="text-[9px]">
                          {pt.linkedFieldKey || 'unlinked'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'presets' && (
                <div className="space-y-3">
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground font-medium uppercase tracking-wider">
                    Starting Presets
                  </p>
                  <div
                    onClick={handleApplyCrystalBeadPreset}
                    className="p-3 rounded-xl border border-[#E6D8D0] hover:border-[#B66F72] bg-[#FBF7F3] cursor-pointer transition-all space-y-1.5"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs text-[#342824]">
                      <Sparkles className="w-3.5 h-3.5 text-[#B66F72]" />
                      <span>Crystal Bead Clasp & Extension</span>
                    </div>
                    <p className="text-[11px] text-[#756861] leading-relaxed">
                      Complete layout with bead core, left/right jump rings, lobster clasp, hanging extension chain, and
                      end charm slot.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center Canvas Viewport */}
        <div
          ref={canvasContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="flex-1 bg-[#FAF6F0] dark:bg-muted/10 relative flex items-center justify-center p-4 overflow-hidden"
        >
          {/* Canvas Viewport Box */}
          <div className="relative aspect-square w-full max-w-[500px] bg-white dark:bg-card border border-[#E6D8D0] dark:border-border rounded-2xl shadow-sm overflow-hidden flex items-center justify-center">
            <BraceletStructureRenderer
              structure={structure}
              editorMode={!previewMode}
              selectedNodeId={selectedNodeId}
              selectedPointId={selectedPointId}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                setSelectedPointId(null);
              }}
              onSelectPoint={(id) => {
                setSelectedPointId(id);
                setSelectedNodeId(null);
              }}
              showConnections={showConnections}
            />

            {/* Hint overlay */}
            {!previewMode && (
              <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/60 text-white text-[10px] pointer-events-none">
                {selectedNode
                  ? `Selected: ${selectedNode.displayName} (X:${selectedNode.x}, Y:${selectedNode.y})`
                  : 'Click any component or point to select and drag'}
              </div>
            )}
          </div>
        </div>

        {/* Right Properties Panel */}
        {!previewMode && (
          <div className="w-full md:w-72 border-l border-[#E6D8D0] dark:border-border bg-white dark:bg-card flex flex-col shrink-0 overflow-y-auto p-4 space-y-4">
            {selectedNode ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div>
                    <h3 className="font-semibold text-xs text-[#342824] dark:text-foreground">
                      Component Properties
                    </h3>
                    <span className="text-[10px] text-[#756861] font-mono">{selectedNode.role}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteSelected}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Delete Component"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px]">Display Name</Label>
                  <Input
                    value={selectedNode.displayName}
                    onChange={(e) => handleUpdateNode({ displayName: e.target.value })}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>

                {/* Position X and Y */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Position X: {selectedNode.x}</Label>
                    <Slider
                      min={10}
                      max={470}
                      step={1}
                      value={[selectedNode.x]}
                      onValueChange={([val]) => handleUpdateNode({ x: val })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Position Y: {selectedNode.y}</Label>
                    <Slider
                      min={10}
                      max={470}
                      step={1}
                      value={[selectedNode.y]}
                      onValueChange={([val]) => handleUpdateNode({ y: val })}
                    />
                  </div>
                </div>

                {/* Width & Height */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Width: {selectedNode.width}px</Label>
                    <Slider
                      min={8}
                      max={360}
                      step={1}
                      value={[selectedNode.width]}
                      onValueChange={([val]) => handleUpdateNode({ width: val })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Height: {selectedNode.height}px</Label>
                    <Slider
                      min={8}
                      max={360}
                      step={1}
                      value={[selectedNode.height]}
                      onValueChange={([val]) => handleUpdateNode({ height: val })}
                    />
                  </div>
                </div>

                {/* Rotation */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <Label>Rotation: {selectedNode.rotationDeg || 0}°</Label>
                    <button
                      type="button"
                      onClick={() => handleUpdateNode({ rotationDeg: 0 })}
                      className="text-[10px] text-[#B66F72] hover:underline"
                    >
                      Reset 0°
                    </button>
                  </div>
                  <Slider
                    min={-180}
                    max={180}
                    step={5}
                    value={[selectedNode.rotationDeg || 0]}
                    onValueChange={([val]) => handleUpdateNode({ rotationDeg: val })}
                  />
                </div>

                {/* Stacking Z-Index */}
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Layer Z-Index: {selectedNode.zIndex}</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateNode({ zIndex: Math.max(1, (selectedNode.zIndex || 1) - 1) })}
                      className="h-7 text-xs flex-1"
                    >
                      Send Backward
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateNode({ zIndex: (selectedNode.zIndex || 1) + 1 })}
                      className="h-7 text-xs flex-1"
                    >
                      Bring Forward
                    </Button>
                  </div>
                </div>

                {/* Extension Chain Specific Parameters */}
                {selectedNode.role === 'extension_chain' && (
                  <div className="pt-3 border-t border-border/60 space-y-3">
                    <p className="text-[11px] font-semibold text-[#B66F72] uppercase tracking-wider">
                      Extension Chain Drape
                    </p>
                    <div className="space-y-1">
                      <Label className="text-[11px]">
                        Length: {selectedNode.chainConfig?.lengthMm || 45}mm
                      </Label>
                      <Slider
                        min={20}
                        max={90}
                        step={2}
                        value={[selectedNode.chainConfig?.lengthMm || 45]}
                        onValueChange={([val]) =>
                          handleUpdateNode({
                            chainConfig: { ...selectedNode.chainConfig!, lengthMm: val },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">
                        Drape Curvature: {selectedNode.chainConfig?.curvature || 20}
                      </Label>
                      <Slider
                        min={-40}
                        max={60}
                        step={2}
                        value={[selectedNode.chainConfig?.curvature || 20]}
                        onValueChange={([val]) =>
                          handleUpdateNode({
                            chainConfig: { ...selectedNode.chainConfig!, curvature: val },
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : selectedPoint ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <div>
                    <h3 className="font-semibold text-xs text-[#342824] dark:text-foreground">
                      Charm Slot Settings
                    </h3>
                    <span className="text-[10px] text-emerald-600 font-medium">Customer-Selectable</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteSelected}
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                    title="Delete Slot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px]">Slot Label</Label>
                  <Input
                    value={selectedPoint.label}
                    onChange={(e) => handleUpdatePoint({ label: e.target.value })}
                    className="h-8 text-xs rounded-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px]">Linked Category Customization Field</Label>
                  <Input
                    value={selectedPoint.linkedFieldKey || ''}
                    placeholder="e.g. charm or extension_charm"
                    onChange={(e) => handleUpdatePoint({ linkedFieldKey: e.target.value })}
                    className="h-8 text-xs rounded-lg font-mono"
                  />
                  <p className="text-[10px] text-[#756861]">
                    Matches options selected by customer under "Personalize This Piece".
                  </p>
                </div>

                {/* Position X and Y */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Anchor X: {selectedPoint.x}</Label>
                    <Slider
                      min={10}
                      max={470}
                      step={1}
                      value={[selectedPoint.x]}
                      onValueChange={([val]) => handleUpdatePoint({ x: val })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Anchor Y: {selectedPoint.y}</Label>
                    <Slider
                      min={10}
                      max={470}
                      step={1}
                      value={[selectedPoint.y]}
                      onValueChange={([val]) => handleUpdatePoint({ y: val })}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px]">Hanging Direction: {selectedPoint.hangDirectionDeg}°</Label>
                  <Slider
                    min={0}
                    max={360}
                    step={15}
                    value={[selectedPoint.hangDirectionDeg]}
                    onValueChange={([val]) => handleUpdatePoint({ hangDirectionDeg: val })}
                  />
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <HelpCircle className="w-8 h-8 text-[#E6D8D0] mx-auto" />
                <p className="text-xs font-medium text-[#342824] dark:text-foreground">Nothing Selected</p>
                <p className="text-[11px] leading-relaxed">
                  Click any component on the canvas or pick from the layer hierarchy to inspect and adjust properties.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductStructureEditor;
