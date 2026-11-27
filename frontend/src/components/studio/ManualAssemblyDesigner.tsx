import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { getAssetUrl } from "@/lib/queryClient";
import {
  fetchAssemblyStructure,
  saveAssemblyStructure,
  fetchComponentTypes,
  IStudioComponentType,
} from "@/lib/studio/independentStudioApi";
import type {
  IStudioCategory,
  IStudioConstructionMethod,
  IStudioAssemblyStructure,
} from "@/types/studio.types";
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
  Circle,
  HelpCircle,
  ChevronDown,
  Info,
} from "lucide-react";

interface ManualAssemblyDesignerProps {
  categories: IStudioCategory[];
  methods: IStudioConstructionMethod[];
  selectedCategoryId?: string;
  selectedSubcategoryId?: string;
  selectedMethodId?: string;
  onStructureSaved?: (saved: IStudioAssemblyStructure) => void;
}

const DEFAULT_BLANK_STRUCTURE: IStudioAssemblyStructure = {
  id: "",
  name: "New Blank Assembly",
  subcategoryId: null,
  constructionMethodId: "",
  canvasConfig: { width: 500, height: 500, viewBox: "0 0 500 500" },
  nodes: [], // Starts completely blank! No auto-generated bead patterns or clasps.
  connections: [],
  attachmentPoints: [],
  endpointA: { x: 180, y: 80, hangDirectionDeg: 90, assembly: null },
  endpointB: { x: 320, y: 80, hangDirectionDeg: 90, assembly: null },
  isPublished: false,
  isActive: true,
};

export const ManualAssemblyDesigner: React.FC<ManualAssemblyDesignerProps> = ({
  categories,
  methods,
  selectedCategoryId: initialCatId,
  selectedSubcategoryId: initialSubcatId,
  selectedMethodId: initialMethodId,
  onStructureSaved,
}) => {
  const { toast } = useToast();

  // Selection states
  const [subcategoryId, setSubcategoryId] = useState<string>(initialSubcatId || "");
  const [methodId, setMethodId] = useState<string>(initialMethodId || "");

  // Structure & Editor states
  const [activeComponentTypes, setActiveComponentTypes] = useState<IStudioComponentType[]>([]);
  const [structure, setStructure] = useState<IStudioAssemblyStructure>(DEFAULT_BLANK_STRUCTURE);
  const [history, setHistory] = useState<IStudioAssemblyStructure[]>([]);
  const [redoStack, setRedoStack] = useState<IStudioAssemblyStructure[]>([]);
  const [isSaved, setIsSaved] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Active selection inside canvas
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<"A" | "B" | null>(null);

  // Dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [nodeDragStart, setNodeDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Push state to history
  const pushState = useCallback((next: IStudioAssemblyStructure) => {
    setHistory((prev) => [...prev.slice(-30), JSON.parse(JSON.stringify(structure))]);
    setRedoStack([]);
    setStructure(next);
    setIsSaved(false);
  }, [structure]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoStack((r) => [JSON.parse(JSON.stringify(structure)), ...r]);
    setHistory((h) => h.slice(0, -1));
    setStructure(prev);
    setIsSaved(false);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory((h) => [...h, JSON.parse(JSON.stringify(structure))]);
    setRedoStack((r) => r.slice(1));
    setStructure(next);
    setIsSaved(false);
  };

  // Load active component types from database
  useEffect(() => {
    fetchComponentTypes(true)
      .then((types) => setActiveComponentTypes(types))
      .catch((err) => console.error("Failed to fetch active component types:", err));
  }, []);

  // Load structure whenever method or subcategory changes
  useEffect(() => {
    if (!methodId) {
      setStructure(DEFAULT_BLANK_STRUCTURE);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const loaded = await fetchAssemblyStructure(methodId, subcategoryId || undefined);
        if (loaded) {
          setStructure(loaded);
          setIsSaved(true);
        } else {
          // Initialize a clean blank structure for this method
          const currentMethod = methods.find((m) => m.id === methodId);
          setStructure({
            ...DEFAULT_BLANK_STRUCTURE,
            id: "",
            name: `${currentMethod?.name || "Method"} Visual Assembly`,
            subcategoryId: subcategoryId || null,
            constructionMethodId: methodId,
            nodes: [], // completely blank initial canvas!
            connections: [],
            attachmentPoints: [],
          });
          setIsSaved(true);
        }
      } catch (err: any) {
        toast({
          title: "Error loading structure",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [methodId, subcategoryId, methods, toast]);

  // Selected item references
  const selectedNode = useMemo(
    () => structure.nodes.find((n) => n.id === selectedNodeId) || null,
    [structure.nodes, selectedNodeId]
  );

  const selectedPoint = useMemo(
    () => structure.attachmentPoints.find((p) => p.id === selectedPointId) || null,
    [structure.attachmentPoints, selectedPointId]
  );

  // Current method info
  const activeMethod = useMemo(
    () => methods.find((m) => m.id === methodId) || null,
    [methods, methodId]
  );

  // Add component node to canvas
  const handleAddComponent = (role: string, label: string) => {
    const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let width = 24;
    let height = 24;
    let defaultX = 250;
    let defaultY = 250;

    let chainConfig = undefined;
    if (role === "extension_chain") {
      width = 30;
      height = 70;
      defaultX = 320;
      defaultY = 120;
      chainConfig = {
        lengthMm: 50,
        curvature: 22,
        linkSpacingPx: 7,
        linkWidthPx: 5,
        linkHeightPx: 9,
        color: "#C0A888",
      };
    } else if (role === "lobster_clasp") {
      width = 24;
      height = 36;
      defaultX = 180;
      defaultY = 80;
    } else if (role === "jump_ring") {
      width = 14;
      height = 14;
      defaultX = 200;
      defaultY = 80;
    } else if (role === "bracelet_base") {
      width = 320;
      height = 320;
      defaultX = 250;
      defaultY = 250;
    }

    const newNode = {
      id,
      role,
      displayName: label,
      x: defaultX,
      y: defaultY,
      width,
      height,
      rotationDeg: 0,
      zIndex: structure.nodes.length + 1,
      visible: true,
      chainConfig,
    };

    pushState({
      ...structure,
      nodes: [...structure.nodes, newNode],
    });
    setSelectedNodeId(id);
    setSelectedPointId(null);
    setSelectedEndpoint(null);
  };

  // Add attachment point (charm slot)
  const handleAddAttachmentPoint = () => {
    const id = `point-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newPoint = {
      id,
      label: "Customer Charm Slot",
      parentNodeId: selectedNodeId || null,
      x: selectedNode ? selectedNode.x : 250,
      y: selectedNode ? selectedNode.y + selectedNode.height / 2 + 15 : 320,
      hangDirectionDeg: 90,
      isCustomerSelectable: true,
      linkedFieldKey: "charm",
      required: false,
    };

    pushState({
      ...structure,
      attachmentPoints: [...structure.attachmentPoints, newPoint],
    });
    setSelectedPointId(id);
    setSelectedNodeId(null);
  };

  // Dragging interaction
  const handleMouseDownNode = (e: React.MouseEvent, nodeId: string) => {
    if (previewMode) return;
    e.stopPropagation();
    const node = structure.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    setSelectedNodeId(nodeId);
    setSelectedPointId(null);
    setSelectedEndpoint(null);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setNodeDragStart({ x: node.x, y: node.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedNode) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    const updatedNodes = structure.nodes.map((n) =>
      n.id === selectedNode.id
        ? {
            ...n,
            x: Math.round(nodeDragStart.x + dx),
            y: Math.round(nodeDragStart.y + dy),
          }
        : n
    );

    setStructure((prev) => ({ ...prev, nodes: updatedNodes }));
    setIsSaved(false);
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      pushState(structure);
    }
  };

  // Save structure to backend
  const handleSave = async () => {
    if (!methodId) {
      toast({ title: "Select a method", description: "Please select a construction method first." });
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<IStudioAssemblyStructure> = {
        ...structure,
        constructionMethodId: methodId,
        subcategoryId: subcategoryId || null,
      };

      const saved = await saveAssemblyStructure(payload);
      setStructure(saved);
      setIsSaved(true);
      if (onStructureSaved) onStructureSaved(saved);
      toast({
        title: "Visual Structure Saved",
        description: `Manual visual layout persisted for ${activeMethod?.name || "method"}.`,
      });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.message || "Failed to save visual assembly structure",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete selected entity
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

  // Clear entire canvas to blank state
  const handleClearCanvas = () => {
    if (confirm("Reset visual assembly canvas to completely blank?")) {
      pushState({
        ...structure,
        nodes: [],
        connections: [],
        attachmentPoints: [],
      });
      setSelectedNodeId(null);
      setSelectedPointId(null);
      setSelectedEndpoint(null);
    }
  };

  // Calculate Bézier curve points for parametric extension chain links
  const renderParametricChain = (node: any) => {
    const cfg = node.chainConfig || { lengthMm: 50, curvature: 22, color: "#C0A888" };
    const p0 = { x: node.x, y: node.y };
    const hangLen = Math.max(30, (cfg.lengthMm || 50) * 1.3);
    const rad = ((node.rotationDeg || 0) * Math.PI) / 180;
    const p2 = {
      x: node.x + Math.sin(rad) * hangLen * 0.4,
      y: node.y + Math.cos(rad) * hangLen,
    };
    const curvature = cfg.curvature ?? 20;
    const p1 = {
      x: (p0.x + p2.x) / 2 + curvature * 0.5,
      y: (p0.y + p2.y) / 2 + Math.abs(curvature) * 0.7,
    };

    const linkSpacing = cfg.linkSpacingPx || 7;
    const chord = Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const linkCount = Math.max(4, Math.round(chord / linkSpacing));
    const links = [];

    for (let i = 0; i <= linkCount; i++) {
      const t = i / linkCount;
      const lx = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const ly = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      const isAlt = i % 2 === 0;

      links.push(
        <ellipse
          key={`chain-link-${i}`}
          cx={lx}
          cy={ly}
          rx={isAlt ? 3.5 : 2}
          ry={isAlt ? 5.5 : 4}
          fill="none"
          stroke={cfg.color || "#C0A888"}
          strokeWidth="1.5"
        />
      );
    }

    return (
      <g key={node.id}>
        <path
          d={`M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`}
          fill="none"
          stroke="rgba(192, 168, 136, 0.25)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        {links}
      </g>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Header & Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-card p-4 rounded-2xl border border-[#E6D8D0] dark:border-border shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <Label className="text-[11px] font-semibold uppercase text-[#756861] dark:text-muted-foreground">
              Construction Method
            </Label>
            <select
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
              className="mt-1 block w-56 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background px-3 py-2 text-xs font-medium text-[#342824] dark:text-foreground focus:outline-none focus:ring-1 focus:ring-[#B66F72]"
            >
              <option value="">Select Construction Method...</option>
              {methods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.baseMaterialType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-[11px] font-semibold uppercase text-[#756861] dark:text-muted-foreground">
              Subcategory (Optional)
            </Label>
            <select
              value={subcategoryId}
              onChange={(e) => setSubcategoryId(e.target.value)}
              className="mt-1 block w-52 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background px-3 py-2 text-xs font-medium text-[#342824] dark:text-foreground focus:outline-none focus:ring-1 focus:ring-[#B66F72]"
            >
              <option value="">Generic / All Subcategories</option>
              {categories
                .flatMap((c) => c.subcategories || [])
                .map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className={`text-xs gap-1.5 rounded-xl border-[#E6D8D0] ${
              previewMode ? "bg-[#342824] text-white" : ""
            }`}
          >
            {previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{previewMode ? "Exit Preview" : "Customer Preview"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearCanvas}
            className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 rounded-xl"
          >
            Clear Canvas
          </Button>

          <Button
            type="button"
            disabled={!methodId || isSaving}
            onClick={handleSave}
            className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs px-4 rounded-xl gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? "Saving..." : isSaved ? "Saved" : "Save Assembly"}</span>
          </Button>
        </div>
      </div>

      {/* Main Designer Area: Palette | Canvas | Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Toolbar / Component Palette */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="pb-3 border-b border-[#E6D8D0]/60">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#756861] dark:text-muted-foreground flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-[#B66F72]" />
                Manual Components
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 space-y-2">
              <p className="text-[11px] text-[#756861] dark:text-muted-foreground mb-2">
                Click a component to place it manually onto the blank canvas:
              </p>

              {/* Structural Base */}
              <button
                type="button"
                onClick={() => handleAddComponent("bracelet_base", "Base Wire / Cord Path")}
                className="w-full text-left px-3 py-2 rounded-xl border border-[#E6D8D0] hover:border-[#B66F72] bg-[#FBF7F3] hover:bg-[#F5ECE5] text-xs font-medium text-[#342824] dark:text-foreground transition-all flex items-center justify-between"
              >
                <span>Circular Base Strand</span>
                <Circle className="w-3.5 h-3.5 text-[#B66F72]" />
              </button>

              {/* Dynamic Database-backed Active Component Types */}
              {activeComponentTypes.length > 0 ? (
                activeComponentTypes.map((t) => (
                  <button
                    key={t.typeId}
                    type="button"
                    onClick={() => handleAddComponent(t.typeId, `${t.displayName} Placement Slot`)}
                    className="w-full text-left px-3 py-2 rounded-xl border border-[#E6D8D0] hover:border-[#B66F72] bg-[#FBF7F3] hover:bg-[#F5ECE5] text-xs font-medium text-[#342824] dark:text-foreground transition-all flex items-center justify-between"
                  >
                    <span>{t.displayName} Slot</span>
                    <span className="text-[10px] text-[#B0A0A0]">{t.typeId}</span>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => handleAddComponent("bead", "Bead Placement Slot")}
                  className="w-full text-left px-3 py-2 rounded-xl border border-[#E6D8D0] hover:border-[#B66F72] bg-[#FBF7F3] hover:bg-[#F5ECE5] text-xs font-medium text-[#342824] dark:text-foreground transition-all flex items-center justify-between"
                >
                  <span>Bead Slot</span>
                  <span className="text-[10px] text-[#B0A0A0]">bead</span>
                </button>
              )}

              {/* Customer Charm Attachment Slot */}
              <button
                type="button"
                onClick={handleAddAttachmentPoint}
                className="w-full text-left px-3 py-2 rounded-xl border border-[#B66F72]/40 bg-[#B66F72]/5 hover:bg-[#B66F72]/10 text-xs font-medium text-[#B66F72] transition-all flex items-center justify-between"
              >
                <span>+ Customer Charm Slot</span>
                <Sparkles className="w-3.5 h-3.5 text-[#B66F72]" />
              </button>
            </CardContent>
          </Card>

          {/* Memory Wire Independent Endpoints */}
          {activeMethod?.baseMaterialType === "memory_wire" && (
            <Card className="border border-[#B66F72]/30 bg-white dark:bg-card rounded-2xl shadow-xs overflow-hidden">
              <CardHeader className="pb-2 border-b border-[#E6D8D0]/60">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#95565A] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Independent Wire Endpoints
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-2 text-xs">
                <div
                  onClick={() => {
                    setSelectedEndpoint("A");
                    setSelectedNodeId(null);
                    setSelectedPointId(null);
                  }}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selectedEndpoint === "A"
                      ? "border-[#B66F72] bg-[#B66F72]/10 font-semibold text-[#342824]"
                      : "border-[#E6D8D0] bg-[#FBF7F3] hover:border-[#B66F72]/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Endpoint A (Left End)</span>
                    <Badge variant="outline" className="text-[9px]">
                      Configurable
                    </Badge>
                  </div>
                  <p className="text-[10px] text-[#756861] mt-0.5">
                    Position: ({structure.endpointA?.x ?? 180}, {structure.endpointA?.y ?? 80})
                  </p>
                </div>

                <div
                  onClick={() => {
                    setSelectedEndpoint("B");
                    setSelectedNodeId(null);
                    setSelectedPointId(null);
                  }}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selectedEndpoint === "B"
                      ? "border-[#B66F72] bg-[#B66F72]/10 font-semibold text-[#342824]"
                      : "border-[#E6D8D0] bg-[#FBF7F3] hover:border-[#B66F72]/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>Endpoint B (Right End)</span>
                    <Badge variant="outline" className="text-[9px]">
                      Configurable
                    </Badge>
                  </div>
                  <p className="text-[10px] text-[#756861] mt-0.5">
                    Position: ({structure.endpointB?.x ?? 320}, {structure.endpointB?.y ?? 80})
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Center: Interactive Manual Canvas */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full bg-[#FAF9F6] dark:bg-[#1A1615] rounded-3xl border border-[#E6D8D0] dark:border-border/80 p-4 shadow-sm relative overflow-hidden flex flex-col items-center justify-center">
            {/* Canvas Header & Undo/Redo */}
            <div className="w-full flex items-center justify-between mb-2 px-2 text-xs text-[#756861]">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={history.length === 0}
                  onClick={handleUndo}
                  className="h-7 w-7 p-0 rounded-lg text-[#756861]"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={redoStack.length === 0}
                  onClick={handleRedo}
                  className="h-7 w-7 p-0 rounded-lg text-[#756861]"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <span className="font-mono text-[10px] uppercase text-[#B0A0A0]">
                {structure.nodes.length} Components placed
              </span>

              {previewMode && (
                <Badge className="bg-emerald-600 text-white text-[10px]">Preview Mode Active</Badge>
              )}
            </div>

            {/* SVG Visual Canvas */}
            <svg
              ref={svgRef}
              viewBox={structure.canvasConfig.viewBox || "0 0 500 500"}
              className="w-full max-w-[480px] aspect-square rounded-2xl bg-white dark:bg-card border border-[#E6D8D0]/60 dark:border-border select-none"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={() => {
                setSelectedNodeId(null);
                setSelectedPointId(null);
                setSelectedEndpoint(null);
              }}
            >
              {/* Subtle Grid Guides (hidden in preview mode) */}
              {!previewMode && (
                <g className="opacity-15 pointer-events-none">
                  <circle cx="250" cy="250" r="160" fill="none" stroke="#756861" strokeDasharray="3 3" />
                  <circle cx="250" cy="250" r="100" fill="none" stroke="#756861" strokeDasharray="3 3" />
                  <line x1="250" y1="50" x2="250" y2="450" stroke="#756861" strokeDasharray="3 3" />
                  <line x1="50" y1="250" x2="450" y2="250" stroke="#756861" strokeDasharray="3 3" />
                </g>
              )}

              {/* Blank Canvas Placeholder */}
              {structure.nodes.length === 0 && structure.attachmentPoints.length === 0 && (
                <g className="pointer-events-none select-none">
                  <circle cx="250" cy="210" r="28" fill="#F4EBE6" stroke="#D8C8BF" strokeWidth="1" strokeDasharray="3 3" />
                  <text
                    x="250"
                    y="215"
                    textAnchor="middle"
                    fill="#9E8E85"
                    fontSize="20"
                  >
                    +
                  </text>
                  <text
                    x="250"
                    y="262"
                    textAnchor="middle"
                    fill="#5C4D44"
                    fontSize="13"
                    fontWeight="600"
                  >
                    Your assembly canvas is empty.
                  </text>
                  <text
                    x="250"
                    y="282"
                    textAnchor="middle"
                    fill="#8C7D74"
                    fontSize="11"
                  >
                    Add the components you want to construct your jewellery.
                  </text>
                </g>
              )}

              {/* Memory Wire Endpoints Markers */}
              {!previewMode && activeMethod?.baseMaterialType === "memory_wire" && (
                <>
                  <g
                    transform={`translate(${structure.endpointA?.x ?? 180}, ${structure.endpointA?.y ?? 80})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEndpoint("A");
                      setSelectedNodeId(null);
                      setSelectedPointId(null);
                    }}
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r="12"
                      fill={selectedEndpoint === "A" ? "#B66F72" : "rgba(182, 111, 114, 0.2)"}
                      stroke="#B66F72"
                      strokeWidth="1.5"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill={selectedEndpoint === "A" ? "#FFF" : "#B66F72"}
                    >
                      A
                    </text>
                  </g>

                  <g
                    transform={`translate(${structure.endpointB?.x ?? 320}, ${structure.endpointB?.y ?? 80})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEndpoint("B");
                      setSelectedNodeId(null);
                      setSelectedPointId(null);
                    }}
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r="12"
                      fill={selectedEndpoint === "B" ? "#B66F72" : "rgba(182, 111, 114, 0.2)"}
                      stroke="#B66F72"
                      strokeWidth="1.5"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill={selectedEndpoint === "B" ? "#FFF" : "#B66F72"}
                    >
                      B
                    </text>
                  </g>
                </>
              )}

              {/* Render Placed Nodes */}
              {structure.nodes.map((node) => {
                const isSelected = selectedNodeId === node.id && !previewMode;

                // Parametric Extension Chain
                if (node.role === "extension_chain") {
                  return (
                    <g
                      key={node.id}
                      className="cursor-move"
                      onMouseDown={(e) => handleMouseDownNode(e, node.id)}
                    >
                      {renderParametricChain(node)}
                      {isSelected && (
                        <circle cx={node.x} cy={node.y} r="6" fill="#B66F72" />
                      )}
                    </g>
                  );
                }

                // Base Strand
                if (node.role === "bracelet_base") {
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      className="cursor-move"
                      onMouseDown={(e) => handleMouseDownNode(e, node.id)}
                    >
                      <circle
                        cx="0"
                        cy="0"
                        r={node.width / 2}
                        fill="none"
                        stroke="#D4BAA8"
                        strokeWidth="3"
                        strokeDasharray={isSelected ? "4 2" : "none"}
                      />
                      {isSelected && (
                        <circle cx="0" cy="0" r={node.width / 2 + 6} fill="none" stroke="#B66F72" strokeWidth="1" strokeDasharray="3 3" />
                      )}
                    </g>
                  );
                }

                // Standard Component (Bead, Clasp, Jump Ring)
                const halfW = node.width / 2;
                const halfH = node.height / 2;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y}) rotate(${node.rotationDeg || 0})`}
                    className="cursor-move"
                    onMouseDown={(e) => handleMouseDownNode(e, node.id)}
                  >
                    {node.role === "lobster_clasp" ? (
                      <path
                        d={`M ${-halfW * 0.6} ${halfH * 0.7} 
                           C ${-halfW * 0.9} ${halfH * 0.3}, ${-halfW * 0.9} ${-halfH * 0.4}, ${-halfW * 0.4} ${-halfH * 0.8}
                           C ${halfW * 0.3} ${-halfH * 0.9}, ${halfW * 0.9} ${-halfH * 0.3}, ${halfW * 0.7} ${halfH * 0.4}
                           C ${halfW * 0.5} ${halfH * 0.9}, ${-halfW * 0.1} ${halfH * 0.9}, ${-halfW * 0.6} ${halfH * 0.7} Z`}
                        fill="#D4BF90"
                        stroke="#9E7E5A"
                        strokeWidth="1.2"
                      />
                    ) : node.role === "jump_ring" ? (
                      <ellipse
                        cx="0"
                        cy="0"
                        rx={halfW}
                        ry={halfH}
                        fill="none"
                        stroke="#C0A888"
                        strokeWidth="2.5"
                      />
                    ) : (
                      <circle
                        cx="0"
                        cy="0"
                        r={halfW}
                        fill={node.beadConfig?.color || "#F4B0C0"}
                        stroke="rgba(255, 255, 255, 0.7)"
                        strokeWidth="1"
                      />
                    )}

                    {/* Selection Box */}
                    {isSelected && (
                      <rect
                        x={-halfW - 3}
                        y={-halfH - 3}
                        width={node.width + 6}
                        height={node.height + 6}
                        fill="none"
                        stroke="#B66F72"
                        strokeWidth="1.5"
                        strokeDasharray="3 2"
                        rx="3"
                      />
                    )}
                  </g>
                );
              })}

              {/* Render Customer Charm Attachment Slots */}
              {structure.attachmentPoints.map((pt) => {
                const isSelected = selectedPointId === pt.id && !previewMode;
                return (
                  <g
                    key={pt.id}
                    transform={`translate(${pt.x}, ${pt.y})`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPointId(pt.id);
                      setSelectedNodeId(null);
                      setSelectedEndpoint(null);
                    }}
                  >
                    <circle
                      cx="0"
                      cy="0"
                      r="10"
                      fill={isSelected ? "#B66F72" : "rgba(182, 111, 114, 0.15)"}
                      stroke="#B66F72"
                      strokeWidth="1.5"
                    />
                    <Sparkles
                      x="-5"
                      y="-5"
                      width="10"
                      height="10"
                      className={isSelected ? "text-white" : "text-[#B66F72]"}
                    />
                    {isSelected && (
                      <text x="0" y="20" textAnchor="middle" fontSize="9" fill="#B66F72" fontWeight="600">
                        {pt.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Right Inspector & Node Details */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="pb-3 border-b border-[#E6D8D0]/60">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-[#756861] dark:text-muted-foreground flex items-center justify-between">
                <span>Properties Inspector</span>
                {(selectedNodeId || selectedPointId) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteSelected}
                    className="h-6 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[11px]"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 text-xs space-y-3">
              {/* Selected Node Properties */}
              {selectedNode ? (
                <>
                  <div>
                    <Label className="text-[10px] uppercase font-semibold text-[#B0A0A0]">
                      Component Name
                    </Label>
                    <Input
                      value={selectedNode.displayName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStructure((prev) => ({
                          ...prev,
                          nodes: prev.nodes.map((n) =>
                            n.id === selectedNode.id ? { ...n, displayName: val } : n
                          ),
                        }));
                      }}
                      className="h-8 text-xs rounded-xl mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase font-semibold text-[#B0A0A0]">X Pos</Label>
                      <Input
                        type="number"
                        value={selectedNode.x}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStructure((prev) => ({
                            ...prev,
                            nodes: prev.nodes.map((n) =>
                              n.id === selectedNode.id ? { ...n, x: val } : n
                            ),
                          }));
                        }}
                        className="h-8 text-xs rounded-xl mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-semibold text-[#B0A0A0]">Y Pos</Label>
                      <Input
                        type="number"
                        value={selectedNode.y}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStructure((prev) => ({
                            ...prev,
                            nodes: prev.nodes.map((n) =>
                              n.id === selectedNode.id ? { ...n, y: val } : n
                            ),
                          }));
                        }}
                        className="h-8 text-xs rounded-xl mt-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase font-semibold text-[#B0A0A0]">Width</Label>
                      <Input
                        type="number"
                        value={selectedNode.width}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStructure((prev) => ({
                            ...prev,
                            nodes: prev.nodes.map((n) =>
                              n.id === selectedNode.id ? { ...n, width: val } : n
                            ),
                          }));
                        }}
                        className="h-8 text-xs rounded-xl mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-semibold text-[#B0A0A0]">Rotation</Label>
                      <Input
                        type="number"
                        value={selectedNode.rotationDeg || 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStructure((prev) => ({
                            ...prev,
                            nodes: prev.nodes.map((n) =>
                              n.id === selectedNode.id ? { ...n, rotationDeg: val } : n
                            ),
                          }));
                        }}
                        className="h-8 text-xs rounded-xl mt-1"
                      />
                    </div>
                  </div>

                  {/* Parametric Extension Chain Properties */}
                  {selectedNode.role === "extension_chain" && (
                    <div className="pt-2 border-t border-[#E6D8D0]/60 space-y-2">
                      <Label className="text-[10px] uppercase font-semibold text-[#95565A]">
                        Extension Chain Length (mm)
                      </Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          min={20}
                          max={100}
                          step={5}
                          value={[selectedNode.chainConfig?.lengthMm || 50]}
                          onValueChange={([val]) => {
                            setStructure((prev) => ({
                              ...prev,
                              nodes: prev.nodes.map((n) =>
                                n.id === selectedNode.id
                                  ? {
                                      ...n,
                                      chainConfig: { ...n.chainConfig!, lengthMm: val },
                                    }
                                  : n
                              ),
                            }));
                          }}
                          className="flex-1"
                        />
                        <span className="font-mono text-xs w-10 text-right">
                          {selectedNode.chainConfig?.lengthMm || 50}mm
                        </span>
                      </div>

                      <Label className="text-[10px] uppercase font-semibold text-[#95565A]">
                        Gravitational Drape Curvature
                      </Label>
                      <div className="flex items-center gap-2">
                        <Slider
                          min={-40}
                          max={50}
                          step={2}
                          value={[selectedNode.chainConfig?.curvature ?? 22]}
                          onValueChange={([val]) => {
                            setStructure((prev) => ({
                              ...prev,
                              nodes: prev.nodes.map((n) =>
                                n.id === selectedNode.id
                                  ? {
                                      ...n,
                                      chainConfig: { ...n.chainConfig!, curvature: val },
                                    }
                                  : n
                              ),
                            }));
                          }}
                          className="flex-1"
                        />
                        <span className="font-mono text-xs w-10 text-right">
                          {selectedNode.chainConfig?.curvature ?? 22}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : selectedPoint ? (
                /* Selected Attachment Point Properties */
                <>
                  <div>
                    <Label className="text-[10px] uppercase font-semibold text-[#B0A0A0]">
                      Slot Label
                    </Label>
                    <Input
                      value={selectedPoint.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStructure((prev) => ({
                          ...prev,
                          attachmentPoints: prev.attachmentPoints.map((p) =>
                            p.id === selectedPoint.id ? { ...p, label: val } : p
                          ),
                        }));
                      }}
                      className="h-8 text-xs rounded-xl mt-1"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="customerSelectable"
                      checked={selectedPoint.isCustomerSelectable}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setStructure((prev) => ({
                          ...prev,
                          attachmentPoints: prev.attachmentPoints.map((p) =>
                            p.id === selectedPoint.id ? { ...p, isCustomerSelectable: val } : p
                          ),
                        }));
                      }}
                      className="rounded accent-[#B66F72]"
                    />
                    <label htmlFor="customerSelectable" className="text-xs font-medium cursor-pointer">
                      Customer Selectable Charm
                    </label>
                  </div>
                </>
              ) : selectedEndpoint ? (
                /* Memory Wire Endpoint Configuration */
                <div className="space-y-2">
                  <Badge className="bg-[#B66F72]/15 text-[#95565A]">
                    Endpoint {selectedEndpoint} Settings
                  </Badge>
                  <p className="text-[11px] text-[#756861]">
                    Configure physical finishing for Endpoint {selectedEndpoint} of the Memory Wire.
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-[#B0A0A0]">
                  <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Click on any placed component or charm slot to inspect its properties.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
