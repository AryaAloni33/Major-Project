import { useRef, useState, MouseEvent, useEffect, WheelEvent } from "react";
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";
import type { AnnotationTool } from "./AnnotationToolbar";

interface Annotation {
  id: string;
  type: AnnotationTool;
  points: { x: number; y: number }[];
  color: string;
  text?: string;
  label?: string;
  locked?: boolean;
}

interface ImageFilters {
  brightness: number;
  contrast: number;
  gamma: number;
  invert: boolean;
}

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | null;

interface ImageCanvasProps {
  imageSrc: string | null;
  activeTool: AnnotationTool;
  zoom: number;
  position: { x: number; y: number };
  isPanning: boolean;
  annotations: Annotation[];
  filters: ImageFilters;
  onAnnotationsChange: (annotations: Annotation[], skipHistory?: boolean) => void;
  onPositionChange: (position: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  selectedAnnotation: string | null;
  onSelectedAnnotationChange: (id: string | null) => void;
  onToolChange: (tool: AnnotationTool) => void;
}

// Theme-aware annotation colors - high contrast for both modes
const ANNOTATION_COLORS = {
  marker: "#f43f5e",
  box: "#22c55e",
  circle: "#3b82f6",
  ellipse: "#ec4899",
  line: "#f59e0b",
  freehand: "#ef4444",
  ruler: "#8b5cf6",
  angle: "#06b6d4",
  text: "#a855f7",
  select: "#60a5fa",
  eraser: "#60a5fa",
};

// Selection/UI colors that work on both themes
const UI_COLORS = {
  selection: "#60a5fa",
  selectionBg: "rgba(96, 165, 250, 0.15)",
  handle: "#60a5fa",
  handleStroke: "#1e3a5f",
};

const ImageCanvas = ({
  imageSrc,
  activeTool,
  zoom,
  position,
  isPanning,
  annotations,
  filters,
  onAnnotationsChange,
  onPositionChange,
  onZoomChange,
  selectedAnnotation,
  onSelectedAnnotationChange,
  onToolChange,
}: ImageCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number } | null>(null);
  const [resizeAnchor, setResizeAnchor] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; width: number; height: number; value: string } | null>(null);
  const [textBoxStart, setTextBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [angleStep, setAngleStep] = useState<number>(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Use a ref for currentAnnotation to avoid stale closures during event handling
  const currentAnnotationRef = useRef<Annotation | null>(null);
  const isDrawingRef = useRef(false);

  const updateCurrentAnnotation = (ann: Annotation | null) => {
    currentAnnotationRef.current = ann;
    setCurrentAnnotation(ann);
  };

  // Focus text input when it appears
  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  const getRelativePosition = (e: MouseEvent | { clientX: number, clientY: number }): { x: number; y: number } => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - position.x) / zoom,
      y: (e.clientY - rect.top - position.y) / zoom,
    };
  };

  // Calculate bounding box for an annotation
  const getAnnotationBounds = (annotation: Annotation) => {
    const { type, points } = annotation;
    if (points.length < 1) return null;

    switch (type) {
      case "marker":
        return {
          minX: points[0].x - 15,
          maxX: points[0].x + 15,
          minY: points[0].y - 15,
          maxY: points[0].y + 15,
        };
      case "box":
      case "text":
      case "ellipse":
      case "circle":
        if (points.length < 2) return null;
        return {
          minX: Math.min(points[0].x, points[1].x),
          maxX: Math.max(points[0].x, points[1].x),
          minY: Math.min(points[0].y, points[1].y),
          maxY: Math.max(points[0].y, points[1].y),
        };
      case "line":
      case "ruler":
        if (points.length < 2) return null;
        return {
          minX: Math.min(points[0].x, points[1].x),
          maxX: Math.max(points[0].x, points[1].x),
          minY: Math.min(points[0].y, points[1].y),
          maxY: Math.max(points[0].y, points[1].y),
        };
      case "angle":
        if (points.length < 2) return null;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        points.forEach((p) => {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        });
        return { minX, maxX, minY, maxY };
      case "freehand":
        if (points.length < 1) return null;
        let fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity, fMaxY = -Infinity;
        points.forEach((p) => {
          fMinX = Math.min(fMinX, p.x);
          fMaxX = Math.max(fMaxX, p.x);
          fMinY = Math.min(fMinY, p.y);
          fMaxY = Math.max(fMaxY, p.y);
        });
        return { minX: fMinX, maxX: fMaxX, minY: fMinY, maxY: fMaxY };
      default:
        return null;
    }
  };

  // Check if a point is near an annotation for eraser or selection
  const isPointNearAnnotation = (pos: { x: number; y: number }, annotation: Annotation): boolean => {
    const threshold = 15 / zoom;

    switch (annotation.type) {
      case "marker":
        if (annotation.points.length < 1) return false;
        const markerDist = Math.sqrt(
          Math.pow(annotation.points[0].x - pos.x, 2) +
          Math.pow(annotation.points[0].y - pos.y, 2)
        );
        return markerDist < threshold + 15;

      case "box":
        if (annotation.points.length < 2) return false;
        const [boxStart, boxEnd] = annotation.points;
        const minX = Math.min(boxStart.x, boxEnd.x);
        const maxX = Math.max(boxStart.x, boxEnd.x);
        const minY = Math.min(boxStart.y, boxEnd.y);
        const maxY = Math.max(boxStart.y, boxEnd.y);
        // Check if inside the box or near any edge
        const insideBox = pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
        const nearLeftEdge = Math.abs(pos.x - minX) < threshold && pos.y >= minY - threshold && pos.y <= maxY + threshold;
        const nearRightEdge = Math.abs(pos.x - maxX) < threshold && pos.y >= minY - threshold && pos.y <= maxY + threshold;
        const nearTopEdge = Math.abs(pos.y - minY) < threshold && pos.x >= minX - threshold && pos.x <= maxX + threshold;
        const nearBottomEdge = Math.abs(pos.y - maxY) < threshold && pos.x >= minX - threshold && pos.x <= maxX + threshold;
        return insideBox || nearLeftEdge || nearRightEdge || nearTopEdge || nearBottomEdge;

      case "circle":
        if (annotation.points.length < 2) return false;
        const [c0, c1] = annotation.points;
        const cCx = (c0.x + c1.x) / 2;
        const cCy = (c0.y + c1.y) / 2;
        const cR = Math.max(Math.abs(c1.x - c0.x), Math.abs(c1.y - c0.y)) / 2;
        const distFromCCtr = Math.sqrt(Math.pow(pos.x - cCx, 2) + Math.pow(pos.y - cCy, 2));
        return Math.abs(distFromCCtr - cR) < threshold || distFromCCtr <= cR;

      case "ellipse":
        if (annotation.points.length < 2) return false;
        const [e0, e1] = annotation.points;
        const ecx = (e0.x + e1.x) / 2;
        const ecy = (e0.y + e1.y) / 2;
        const erx = Math.abs(e1.x - e0.x) / 2;
        const ery = Math.abs(e1.y - e0.y) / 2;
        if (erx === 0 || ery === 0) return false;
        const edx = (pos.x - ecx) / erx;
        const edy = (pos.y - ecy) / ery;
        const eDist = Math.sqrt(edx * edx + edy * edy);
        return eDist <= 1 + (threshold / Math.min(erx, ery));

      case "line":
      case "ruler":
        if (annotation.points.length < 2) return false;
        const [lineStart, lineEnd] = annotation.points;
        const lineLen = Math.sqrt(
          Math.pow(lineEnd.x - lineStart.x, 2) +
          Math.pow(lineEnd.y - lineStart.y, 2)
        );
        if (lineLen === 0) return false;
        const t = Math.max(0, Math.min(1,
          ((pos.x - lineStart.x) * (lineEnd.x - lineStart.x) +
            (pos.y - lineStart.y) * (lineEnd.y - lineStart.y)) / (lineLen * lineLen)
        ));
        const projX = lineStart.x + t * (lineEnd.x - lineStart.x);
        const projY = lineStart.y + t * (lineEnd.y - lineStart.y);
        const distToLine = Math.sqrt(Math.pow(pos.x - projX, 2) + Math.pow(pos.y - projY, 2));
        return distToLine < threshold;

      case "angle":
        if (annotation.points.length < 2) return false;
        for (let i = 0; i < annotation.points.length - 1; i++) {
          const start = annotation.points[i];
          const end = annotation.points[i + 1];
          const len = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
          if (len === 0) continue;
          const t = Math.max(0, Math.min(1,
            ((pos.x - start.x) * (end.x - start.x) + (pos.y - start.y) * (end.y - start.y)) / (len * len)
          ));
          const projX = start.x + t * (end.x - start.x);
          const projY = start.y + t * (end.y - start.y);
          const dist = Math.sqrt(Math.pow(pos.x - projX, 2) + Math.pow(pos.y - projY, 2));
          if (dist < threshold) return true;
        }
        return false;

      case "freehand":
        if (annotation.points.length < 1) return false;
        return annotation.points.some(
          (p) => Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2)) < threshold
        );

      case "text":
        if (annotation.points.length < 2) return false;
        const [textStart, textEnd] = annotation.points;
        const tMinX = Math.min(textStart.x, textEnd.x);
        const tMaxX = Math.max(textStart.x, textEnd.x);
        const tMinY = Math.min(textStart.y, textEnd.y);
        const tMaxY = Math.max(textStart.y, textEnd.y);
        return pos.x >= tMinX - threshold && pos.x <= tMaxX + threshold &&
          pos.y >= tMinY - threshold && pos.y <= tMaxY + threshold;

      default:
        return false;
    }
  };

  // Move annotation by offset
  const moveAnnotation = (annotation: Annotation, deltaX: number, deltaY: number): Annotation => {
    if (annotation.locked) return annotation;
    return {
      ...annotation,
      points: annotation.points.map((p) => ({
        x: p.x + deltaX,
        y: p.y + deltaY,
      })),
    };
  };

  // Resize annotation based on handle
  const resizeAnnotation = (
    annotation: Annotation,
    handle: ResizeHandle,
    newPos: { x: number; y: number },
    startPos: { x: number; y: number }
  ): Annotation => {
    if (!handle || annotation.points.length < 2 || annotation.locked) return annotation;

    // Damping factor to reduce resizing speed/sensitivity (0.7 reduces jitter)
    const damping = 0.7;
    const dampedX = startPos.x + (newPos.x - startPos.x) * damping;
    const dampedY = startPos.y + (newPos.y - startPos.y) * damping;

    // For Box/Text/Line/Circle/Ellipse, we use a stable anchor (the corner opposite to the handle)
    // to prevent the "snap back/flip" issue.
    const anchor = resizeAnchor || annotation.points[0];
    let newP1 = { x: dampedX, y: dampedY };
    let newP0 = { ...anchor };

    // Maintain dimensions on the non-dragged axis for pure N/S/E/W handles
    if (handle === "n" || handle === "s") {
      newP1.x = (annotation.points[0].x === anchor.x) ? annotation.points[1].x : annotation.points[0].x;
      newP0.x = anchor.x;
    }
    if (handle === "e" || handle === "w") {
      newP1.y = (annotation.points[0].y === anchor.y) ? annotation.points[1].y : annotation.points[0].y;
      newP0.y = anchor.y;
    }

    return { ...annotation, points: [newP0, newP1] };
  };

  // Check if point is on a resize handle
  const getResizeHandleAtPoint = (pos: { x: number; y: number }, annotation: Annotation): ResizeHandle => {
    if (!annotation || annotation.points.length < 2) return null;
    if (!["box", "ellipse", "text", "circle", "line", "ruler"].includes(annotation.type)) return null;

    const handleSize = 8 / zoom;
    const bounds = getAnnotationBounds(annotation);
    if (!bounds) return null;

    const { minX, maxX, minY, maxY } = bounds;

    // Corner handles
    if (Math.abs(pos.x - minX) < handleSize && Math.abs(pos.y - minY) < handleSize) return "nw";
    if (Math.abs(pos.x - maxX) < handleSize && Math.abs(pos.y - minY) < handleSize) return "ne";
    if (Math.abs(pos.x - minX) < handleSize && Math.abs(pos.y - maxY) < handleSize) return "sw";
    if (Math.abs(pos.x - maxX) < handleSize && Math.abs(pos.y - maxY) < handleSize) return "se";

    // Edge handles
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    if (Math.abs(pos.x - midX) < handleSize && Math.abs(pos.y - minY) < handleSize) return "n";
    if (Math.abs(pos.x - midX) < handleSize && Math.abs(pos.y - maxY) < handleSize) return "s";
    if (Math.abs(pos.x - minX) < handleSize && Math.abs(pos.y - midY) < handleSize) return "w";
    if (Math.abs(pos.x - maxX) < handleSize && Math.abs(pos.y - midY) < handleSize) return "e";

    return null;
  };

  const handleWheel = (e: WheelEvent) => {
    if (!imageSrc) return;
    e.preventDefault();

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.1), 10);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newX = mouseX - (mouseX - position.x) * (newZoom / zoom);
      const newY = mouseY - (mouseY - position.y) * (newZoom / zoom);

      onPositionChange({ x: newX, y: newY });
    }

    onZoomChange(newZoom);
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (!imageSrc) return;
    e.preventDefault();

    const pos = getRelativePosition(e);

    // Handle panning
    if (isPanning) {
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      return;
    }

    // 1. Check if clicking on a resize handle of the currently selected annotation
    if (selectedAnnotation) {
      const selectedAnn = annotations.find((a) => a.id === selectedAnnotation);
      if (selectedAnn && !selectedAnn.locked) {
        const handle = getResizeHandleAtPoint(pos, selectedAnn);
        if (handle) {
          setIsResizing(true);
          setResizeHandle(handle);
          setResizeStart(pos);

          // Determine anchor point based on handle
          const bounds = getAnnotationBounds(selectedAnn);
          if (bounds) {
            const { minX, maxX, minY, maxY } = bounds;
            let anchor = { x: minX, y: minY };
            if (handle.includes("n")) anchor.y = maxY;
            if (handle.includes("s")) anchor.y = minY;
            if (handle.includes("w")) anchor.x = maxX;
            if (handle.includes("e")) anchor.x = minX;
            setResizeAnchor(anchor);
          }
          return;
        }
      }
    }

    // 2. Check if clicking on any existing annotation (unless using eraser)
    // In select mode, we allow clicking any annotation to select and drag it.
    // In drawing modes, we prioritize drawing a new shape over selecting existing ones,
    // though resizing handles of the currently selected shape (Step 1) still work.
    if (activeTool === "select") {
      const clickedAnnotation = annotations.find((ann) => isPointNearAnnotation(pos, ann));
      if (clickedAnnotation) {
        onSelectedAnnotationChange(clickedAnnotation.id);
        if (!clickedAnnotation.locked) {
          setIsDragging(true);
          setDragOffset({ x: pos.x, y: pos.y });
        }
        return;
      }
    }

    // 3. If Select tool is active and we clicked empty space, handle as panning
    if (activeTool === "select") {
      onSelectedAnnotationChange(null);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      return;
    }

    // 4. Clear selection if we start drawing a new shape on empty space
    onSelectedAnnotationChange(null);

    // Handle other tools
    if (activeTool === "eraser") {
      setIsErasing(true);
      const annotationToRemove = annotations.find((ann) => isPointNearAnnotation(pos, ann) && !ann.locked);
      if (annotationToRemove) {
        onAnnotationsChange(annotations.filter((a) => a.id !== annotationToRemove.id));
      }
      return;
    }

    if (activeTool === "text") {
      setTextBoxStart(pos);
      setIsDrawing(true);
      setCurrentAnnotation({
        id: Date.now().toString(),
        type: "text",
        points: [pos, pos],
        color: ANNOTATION_COLORS.text,
        label: `Text ${annotations.filter(a => a.type === "text").length + 1}`,
      });
      return;
    }

    if (activeTool === "marker") {
      const markerAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "marker",
        points: [pos],
        color: ANNOTATION_COLORS.marker,
        label: `Marker ${annotations.filter(a => a.type === "marker").length + 1}`,
      };
      onAnnotationsChange([...annotations, markerAnnotation]);
      onSelectedAnnotationChange(markerAnnotation.id);
      onToolChange("select");
      return;
    }

    if (activeTool === "angle") {
      if (angleStep === 0) {
        const ann: Annotation = {
          id: Date.now().toString(),
          type: "angle",
          points: [pos, pos], // Start with two points at same spot
          color: ANNOTATION_COLORS.angle,
          label: `Angle ${annotations.filter(a => a.type === "angle").length + 1}`,
        };
        updateCurrentAnnotation(ann);
        setAngleStep(1);
      } else if (angleStep === 1 && currentAnnotationRef.current) {
        updateCurrentAnnotation({ ...currentAnnotationRef.current, points: [currentAnnotationRef.current.points[0], pos, pos] });
        setAngleStep(2);
      } else if (angleStep === 2 && currentAnnotationRef.current) {
        const completedAngle: Annotation = { ...currentAnnotationRef.current, points: [currentAnnotationRef.current.points[0], currentAnnotationRef.current.points[1], pos] };
        onAnnotationsChange([...annotations, completedAngle]);
        onSelectedAnnotationChange(completedAngle.id);
        onToolChange("select");
        updateCurrentAnnotation(null);
        setAngleStep(0);
      }
      return;
    }

    isDrawingRef.current = true;
    setIsDrawing(true);
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: activeTool,
      points: [pos, pos], // Initialize with two points for all shapes
      color: ANNOTATION_COLORS[activeTool],
      label: `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} ${annotations.filter(a => a.type === activeTool).length + 1}`,
    };
    updateCurrentAnnotation(newAnnotation);
  };

  const handleMouseMove = (e: MouseEvent | { clientX: number, clientY: number }) => {
    const pos = getRelativePosition(e);
    setMousePos(pos);

    // Handle panning
    if (dragStart) {
      onPositionChange({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    // Handle resizing
    if (isResizing && selectedAnnotation && resizeHandle && resizeStart) {
      const selectedAnn = annotations.find((a) => a.id === selectedAnnotation);
      if (selectedAnn) {
        const resizedAnn = resizeAnnotation(selectedAnn, resizeHandle, pos, resizeStart);
        onAnnotationsChange(annotations.map((ann) => ann.id === selectedAnnotation ? resizedAnn : ann), true);
        setResizeStart(pos);
      }
      return;
    }

    // Check for resize handles while hovering in select mode to show cursors
    if (!isDrawing && !isDragging && activeTool === "select" && selectedAnnotation) {
      const selectedAnn = annotations.find((a) => a.id === selectedAnnotation);
      if (selectedAnn) {
        const handle = getResizeHandleAtPoint(pos, selectedAnn);
        if (handle !== resizeHandle) {
          setResizeHandle(handle);
        }
      }
    } else if (!isResizing && resizeHandle) {
      setResizeHandle(null);
    }

    // Handle dragging
    if (isDragging && selectedAnnotation && dragOffset) {
      const deltaX = pos.x - dragOffset.x;
      const deltaY = pos.y - dragOffset.y;
      onAnnotationsChange(annotations.map((ann) => ann.id === selectedAnnotation ? moveAnnotation(ann, deltaX, deltaY) : ann), true);
      setDragOffset({ x: pos.x, y: pos.y });
      return;
    }

    // Handle erasing
    if (isErasing && activeTool === "eraser") {
      const annotationToRemove = annotations.find((ann) => isPointNearAnnotation(pos, ann));
      if (annotationToRemove) {
        onAnnotationsChange(annotations.filter((a) => a.id !== annotationToRemove.id));
      }
      return;
    }

    // Handle drawing previews
    if (activeTool === "angle" && currentAnnotationRef.current && angleStep > 0) {
      if (angleStep === 1) {
        updateCurrentAnnotation({ ...currentAnnotationRef.current, points: [currentAnnotationRef.current.points[0], pos] });
      } else if (angleStep === 2 && currentAnnotationRef.current.points.length >= 2) {
        updateCurrentAnnotation({ ...currentAnnotationRef.current, points: [currentAnnotationRef.current.points[0], currentAnnotationRef.current.points[1], pos] });
      }
      return;
    }

    if (isDrawingRef.current && currentAnnotationRef.current) {
      if (currentAnnotationRef.current.type === "freehand") {
        updateCurrentAnnotation({ ...currentAnnotationRef.current, points: [...currentAnnotationRef.current.points, pos] });
      } else {
        updateCurrentAnnotation({ ...currentAnnotationRef.current, points: [currentAnnotationRef.current.points[0], pos] });
      }
    }
  };

  // Add global mouse event handlers for more reliable drawing/panning
  useEffect(() => {
    const handleWindowMouseMove = (e: any) => {
      if (dragStart || isDragging || isResizing || isErasing || isDrawing) {
        handleMouseMove(e);
      }
    };

    const handleWindowMouseUp = () => {
      if (dragStart || isDragging || isResizing || isErasing || isDrawing) {
        handleMouseUp();
      }
    };

    if (dragStart || isDragging || isResizing || isErasing || isDrawing) {
      window.addEventListener("mousemove", handleWindowMouseMove);
      window.addEventListener("mouseup", handleWindowMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [dragStart, isDragging, isResizing, isErasing, isDrawing]);

  const handleMouseUp = () => {
    if (dragStart) {
      setDragStart(null);
      return;
    }

    if (isResizing) {
      setIsResizing(false);
      setResizeHandle(null);
      setResizeStart(null);
      setResizeAnchor(null);
      onAnnotationsChange(annotations);
      return;
    }

    if (isDragging) {
      setIsDragging(false);
      setDragOffset(null);
      onAnnotationsChange(annotations);
      return;
    }

    if (isErasing) {
      setIsErasing(false);
      return;
    }

    if (isDrawing && currentAnnotation) {
      if (activeTool === "text" && textBoxStart) {
        const endPos = currentAnnotation.points[1] || textBoxStart;
        const width = Math.abs(endPos.x - textBoxStart.x);
        const height = Math.abs(endPos.y - textBoxStart.y);
        if (width > 20 && height > 15) {
          setTextInput({
            x: Math.min(textBoxStart.x, endPos.x),
            y: Math.min(textBoxStart.y, endPos.y),
            width: Math.max(width, 100),
            height: Math.max(height, 30),
            value: "",
          });
        }
        setIsDrawing(false);
        isDrawingRef.current = false;
        setTextBoxStart(null);
        updateCurrentAnnotation(null);
        return;
      }

      if (currentAnnotation.type !== "angle" && currentAnnotation.type !== "text") {
        onAnnotationsChange([...annotations, currentAnnotation]);
        onSelectedAnnotationChange(currentAnnotation.id); // Auto-select after drawing
        onToolChange("select"); // Reset tool to select mode
      }
      setIsDrawing(false);
      isDrawingRef.current = false;
      if (currentAnnotation.type !== "angle") {
        updateCurrentAnnotation(null);
      }
    }
  };

  const handleTextSubmit = () => {
    if (textInput && textInput.value.trim()) {
      const textAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "text",
        points: [{ x: textInput.x, y: textInput.y }, { x: textInput.x + textInput.width, y: textInput.y + textInput.height }],
        color: ANNOTATION_COLORS.text,
        text: textInput.value.trim(),
        label: `Text ${annotations.filter(a => a.type === "text").length + 1}`,
      };
      onAnnotationsChange([...annotations, textAnnotation]);
      onSelectedAnnotationChange(textAnnotation.id); // Auto-select after text submit
      onToolChange("select"); // Reset tool to select mode
    }
    setTextInput(null);
  };

  const calculateAngle = (points: { x: number; y: number }[]): number => {
    if (points.length < 3) return 0;
    const [start, vertex, end] = points;
    const v1 = { x: start.x - vertex.x, y: start.y - vertex.y };
    const v2 = { x: end.x - vertex.x, y: end.y - vertex.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return (Math.acos(cosAngle) * 180) / Math.PI;
  };

  const renderAnnotation = (annotation: Annotation, isTemp = false) => {
    const { type, points, color, id, text, label } = annotation;
    const opacity = isTemp ? 0.7 : 1;
    const isSelected = selectedAnnotation === id;

    if (points.length < 1) return null;

    const renderLabel = () => {
      if (!label || isTemp || !isSelected) return null;
      const bounds = getAnnotationBounds(annotation);
      if (!bounds) return null;

      const labelWidth = (label.length * 7 + (annotation.locked ? 25 : 10)) / zoom;
      const labelHeight = 16 / zoom;
      const labelX = bounds.maxX + 8 / zoom;
      const labelY = bounds.minY;

      return (
        <g className="pointer-events-none select-none transition-opacity duration-200" style={{ opacity: isSelected ? 1 : 0.8 }}>
          <rect x={labelX} y={labelY} width={labelWidth} height={labelHeight} fill={color} rx={2 / zoom} opacity={0.9} />
          <text x={labelX + 5 / zoom} y={labelY + 12 / zoom} fill="white" fontSize={11 / zoom} fontWeight="bold">
            {label}
          </text>
          {annotation.locked && (
            <path
              d={`M ${labelX + labelWidth - 14 / zoom} ${labelY + 4 / zoom} h 8 v 8 h -8 z M ${labelX + labelWidth - 12 / zoom} ${labelY + 4 / zoom} v -1.5 a 2 2 0 0 1 4 0 v 1.5`}
              fill="none"
              stroke="white"
              strokeWidth={1.5 / zoom}
              strokeLinecap="round"
            />
          )}
        </g>
      );
    };

    const renderSelectionHighlight = () => {
      if (!isSelected && !isTemp) return null;
      const bounds = getAnnotationBounds(annotation);
      if (!bounds) return null;
      const padding = 5 / zoom;
      const handleSize = 8 / zoom;
      const { minX, maxX, minY, maxY } = bounds;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      const showResizeHandles = !isTemp && !annotation.locked && ["box", "ellipse", "text", "circle", "line", "ruler"].includes(type);

      return (
        <g>
          {!["angle", "circle"].includes(type) && (
            <rect x={minX - padding} y={minY - padding} width={maxX - minX + padding * 2} height={maxY - minY + padding * 2} fill="none" stroke={isTemp ? color : UI_COLORS.selection} strokeWidth={isTemp ? 1 / zoom : 2 / zoom} strokeDasharray={`${4 / zoom} ${2 / zoom}`} opacity={isTemp ? 0.5 : 1} />
          )}
          {showResizeHandles && (
            <>
              {/* Corner handles */}
              <rect x={minX - handleSize / 2} y={minY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "nwse-resize", pointerEvents: "auto" }} />
              <rect x={maxX - handleSize / 2} y={minY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "nesw-resize", pointerEvents: "auto" }} />
              <rect x={minX - handleSize / 2} y={maxY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "nesw-resize", pointerEvents: "auto" }} />
              <rect x={maxX - handleSize / 2} y={maxY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "nwse-resize", pointerEvents: "auto" }} />

              {/* Edge handles */}
              <rect x={midX - handleSize / 2} y={minY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "ns-resize", pointerEvents: "auto" }} />
              <rect x={midX - handleSize / 2} y={maxY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "ns-resize", pointerEvents: "auto" }} />
              <rect x={minX - handleSize / 2} y={midY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "ew-resize", pointerEvents: "auto" }} />
              <rect x={maxX - handleSize / 2} y={midY - handleSize / 2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1 / zoom} style={{ cursor: "ew-resize", pointerEvents: "auto" }} />
            </>
          )}
        </g>
      );
    };

    switch (type) {
      case "marker":
        return (
          <g key={id} opacity={opacity}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <circle cx={points[0].x} cy={points[0].y} r={12 / zoom} stroke={color} strokeWidth={2 / zoom} fill="none" />
            <circle cx={points[0].x} cy={points[0].y} r={6 / zoom} stroke={color} strokeWidth={1.5 / zoom} fill="none" />
            <circle cx={points[0].x} cy={points[0].y} r={2 / zoom} fill={color} />
            <line x1={points[0].x - 18 / zoom} y1={points[0].y} x2={points[0].x - 14 / zoom} y2={points[0].y} stroke={color} strokeWidth={2 / zoom} />
            <line x1={points[0].x + 14 / zoom} y1={points[0].y} x2={points[0].x + 18 / zoom} y2={points[0].y} stroke={color} strokeWidth={2 / zoom} />
            <line x1={points[0].x} y1={points[0].y - 18 / zoom} x2={points[0].x} y2={points[0].y - 14 / zoom} stroke={color} strokeWidth={2 / zoom} />
            <line x1={points[0].x} y1={points[0].y + 14 / zoom} x2={points[0].x} y2={points[0].y + 18 / zoom} stroke={color} strokeWidth={2 / zoom} />
          </g>
        );
      case "box":
        const [boxStart, boxEnd] = points;
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <rect x={Math.min(boxStart.x, boxEnd.x)} y={Math.min(boxStart.y, boxEnd.y)} width={Math.abs(boxEnd.x - boxStart.x)} height={Math.abs(boxEnd.y - boxStart.y)} stroke={color} strokeWidth={2 / zoom} fill={isSelected ? UI_COLORS.selectionBg : "none"} opacity={opacity} />
          </g>
        );
      case "circle":
        const [c0_r, c1_r] = points;
        const cCx_r = (c0_r.x + c1_r.x) / 2;
        const cCy_r = (c0_r.y + c1_r.y) / 2;
        const cR_r = Math.max(Math.abs(c1_r.x - c0_r.x), Math.abs(c1_r.y - c0_r.y)) / 2;
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <circle cx={cCx_r} cy={cCy_r} r={cR_r} stroke={color} strokeWidth={2 / zoom} fill={isSelected ? UI_COLORS.selectionBg : "none"} opacity={opacity} />
          </g>
        );
      case "ellipse":
        const [e0_r, e1_r] = points;
        const eCx_r = (e0_r.x + e1_r.x) / 2;
        const eCy_r = (e0_r.y + e1_r.y) / 2;
        const eRx_r = Math.abs(e1_r.x - e0_r.x) / 2;
        const eRy_r = Math.abs(e1_r.y - e0_r.y) / 2;
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <ellipse
              cx={eCx_r}
              cy={eCy_r}
              rx={eRx_r}
              ry={eRy_r}
              stroke={color}
              strokeWidth={2 / zoom}
              fill={isSelected ? UI_COLORS.selectionBg : "none"}
              opacity={opacity}
            />
          </g>
        );
      case "line":
      case "ruler":
        const [lStart, lEnd] = points;
        const dist = Math.sqrt(Math.pow(lEnd.x - lStart.x, 2) + Math.pow(lEnd.y - lStart.y, 2)).toFixed(1);
        return (
          <g key={id} opacity={opacity}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <line x1={lStart.x} y1={lStart.y} x2={lEnd.x} y2={lEnd.y} stroke={color} strokeWidth={2 / zoom} />
            {type === "ruler" && (
              <g>
                <line x1={lStart.x} y1={lStart.y - 6 / zoom} x2={lStart.x} y2={lStart.y + 6 / zoom} stroke={color} strokeWidth={2 / zoom} />
                <line x1={lEnd.x} y1={lEnd.y - 6 / zoom} x2={lEnd.x} y2={lEnd.y + 6 / zoom} stroke={color} strokeWidth={2 / zoom} />
                <rect x={(lStart.x + lEnd.x) / 2 - 25 / zoom} y={(lStart.y + lEnd.y) / 2 - 20 / zoom} width={50 / zoom} height={16 / zoom} fill="rgba(0,0,0,0.7)" rx={3 / zoom} />
                <text x={(lStart.x + lEnd.x) / 2} y={(lStart.y + lEnd.y) / 2 - 8 / zoom} fill="white" fontSize={11 / zoom} textAnchor="middle" fontFamily="monospace">{dist}px</text>
              </g>
            )}
          </g>
        );
      case "angle":
        const ang = points.length === 3 ? calculateAngle(points) : 0;
        const renderAngleArc = () => {
          if (points.length < 3) return null;
          const p0 = points[0];
          const p1 = points[1]; // Vertex
          const p2 = points[2];

          const a1 = Math.atan2(p0.y - p1.y, p0.x - p1.x);
          const a2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);

          const arcRadius = 25 / zoom;
          const x1 = p1.x + Math.cos(a1) * arcRadius;
          const y1 = p1.y + Math.sin(a1) * arcRadius;
          const x2 = p1.x + Math.cos(a2) * arcRadius;
          const y2 = p1.y + Math.sin(a2) * arcRadius;

          let arcAngle = a2 - a1;
          while (arcAngle < 0) arcAngle += Math.PI * 2;
          while (arcAngle > Math.PI * 2) arcAngle -= Math.PI * 2;

          const largeArcFlag = arcAngle > Math.PI ? 1 : 0;

          return (
            <path
              d={`M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`}
              fill="none"
              stroke={color}
              strokeWidth={1.5 / zoom}
              opacity={0.6}
            />
          );
        };

        return (
          <g key={id} opacity={opacity}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke={color} strokeWidth={2 / zoom} />
            {points.length >= 3 && (
              <g>
                <line x1={points[1].x} y1={points[1].y} x2={points[2].x} y2={points[2].y} stroke={color} strokeWidth={2 / zoom} />
                {renderAngleArc()}
                <rect x={points[1].x + 20 / zoom} y={points[1].y - 25 / zoom} width={45 / zoom} height={18 / zoom} fill="rgba(0,0,0,0.8)" rx={3 / zoom} />
                <text x={points[1].x + 42 / zoom} y={points[1].y - 12 / zoom} fill="white" fontSize={12 / zoom} textAnchor="middle" fontFamily="monospace" fontWeight="bold">{ang.toFixed(1)}°</text>
              </g>
            )}
            <circle cx={points[1].x} cy={points[1].y} r={4 / zoom} fill={color} />
          </g>
        );
      case "freehand":
        const pathData = points.reduce((acc, point, index) => index === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`, "");
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <path d={pathData} stroke={color} strokeWidth={2 / zoom} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
          </g>
        );
      case "text":
        const [textStart, textEnd] = points;
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            {renderLabel()}
            <rect x={Math.min(textStart.x, textEnd.x)} y={Math.min(textStart.y, textEnd.y)} width={Math.abs(textEnd.x - textStart.x)} height={Math.abs(textEnd.y - textStart.y)} fill="rgba(168, 85, 247, 0.1)" stroke={color} strokeWidth={1 / zoom} strokeDasharray={isTemp ? `${4 / zoom} ${2 / zoom}` : "none"} opacity={opacity} />
            {text && <text x={Math.min(textStart.x, textEnd.x) + 4 / zoom} y={Math.min(textStart.y, textEnd.y) + 16 / zoom} fill={color} fontSize={14 / zoom} fontWeight="500">{text}</text>}
          </g>
        );
      default: return null;
    }
  };

  const getCursor = () => {
    if (dragStart) return "cursor-grabbing";
    if (isPanning) return "cursor-grab";
    if (resizeHandle) {
      if (["nw", "se"].includes(resizeHandle)) return "cursor-nwse-resize";
      if (["ne", "sw"].includes(resizeHandle)) return "cursor-nesw-resize";
      if (["n", "s"].includes(resizeHandle)) return "cursor-ns-resize";
      if (["e", "w"].includes(resizeHandle)) return "cursor-ew-resize";
    }
    if (activeTool === "select" && selectedAnnotation) return "cursor-move";
    return "cursor-crosshair";
  };

  const gammaValue = filters.gamma / 100;

  return (
    <div
      ref={containerRef}
      className={cn("flex-1 bg-muted/50 overflow-hidden relative", getCursor())}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="gamma-filter">
            <feComponentTransfer>
              <feFuncR type="gamma" amplitude="1" exponent={gammaValue} offset="0" />
              <feFuncG type="gamma" amplitude="1" exponent={gammaValue} offset="0" />
              <feFuncB type="gamma" amplitude="1" exponent={gammaValue} offset="0" />
            </feComponentTransfer>
          </filter>
        </defs>
      </svg>

      {imageSrc ? (
        <div className="absolute" style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>
          <img src={imageSrc} alt="X-ray" className="max-w-none select-none" draggable={false} style={{ filter: `brightness(${filters.brightness / 100}) contrast(${filters.contrast / 100}) ${filters.invert ? 'invert(1)' : ''} url(#gamma-filter)` }} />
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
            {annotations.map((ann) => renderAnnotation(ann))}
            {currentAnnotation && renderAnnotation(currentAnnotation, true)}

            {/* Start point marker while drawing */}
            {isDrawing && currentAnnotation && currentAnnotation.points[0] && (
              <g opacity={0.6}>
                <circle
                  cx={currentAnnotation.points[0].x}
                  cy={currentAnnotation.points[0].y}
                  r={3 / zoom}
                  fill={currentAnnotation.color}
                />
              </g>
            )}
          </svg>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          <ImageIcon className="h-24 w-24 mb-4 opacity-30" />
          <p className="text-lg font-medium">No X-ray image loaded</p>
        </div>
      )}

      {textInput && (
        <div className="absolute" style={{ left: position.x + textInput.x * zoom, top: position.y + textInput.y * zoom, width: textInput.width * zoom, height: textInput.height * zoom }}>
          <textarea ref={textInputRef} value={textInput.value} onChange={(e) => setTextInput({ ...textInput, value: e.target.value })} onBlur={handleTextSubmit} className="w-full h-full bg-card border-2 border-primary rounded px-2 py-1 text-sm outline-none resize-none" placeholder="Enter text..." />
        </div>
      )}

    </div>
  );
};

export { ImageCanvas, type Annotation };
