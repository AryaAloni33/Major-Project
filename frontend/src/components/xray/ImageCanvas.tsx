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
}

interface ImageFilters {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
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
}: ImageCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [angleStep, setAngleStep] = useState<number>(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; width: number; height: number; value: string } | null>(null);
  const [textBoxStart, setTextBoxStart] = useState<{ x: number; y: number } | null>(null);

  // Focus text input when it appears
  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  const getRelativePosition = (e: MouseEvent): { x: number; y: number } => {
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
      case "ellipse":
      case "text":
        if (points.length < 2) return null;
        return {
          minX: Math.min(points[0].x, points[1].x),
          maxX: Math.max(points[0].x, points[1].x),
          minY: Math.min(points[0].y, points[1].y),
          maxY: Math.max(points[0].y, points[1].y),
        };
      case "circle":
        if (points.length < 2) return null;
        const radius = Math.sqrt(
          Math.pow(points[1].x - points[0].x, 2) +
          Math.pow(points[1].y - points[0].y, 2)
        );
        return {
          minX: points[0].x - radius,
          maxX: points[0].x + radius,
          minY: points[0].y - radius,
          maxY: points[0].y + radius,
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
        const [circleCenter, circleEdge] = annotation.points;
        const radius = Math.sqrt(
          Math.pow(circleEdge.x - circleCenter.x, 2) +
          Math.pow(circleEdge.y - circleCenter.y, 2)
        );
        const distFromCenter = Math.sqrt(
          Math.pow(pos.x - circleCenter.x, 2) +
          Math.pow(pos.y - circleCenter.y, 2)
        );
        return distFromCenter <= radius + threshold;

      case "ellipse":
        if (annotation.points.length < 2) return false;
        const [ellipseStart, ellipseEnd] = annotation.points;
        const cx = (ellipseStart.x + ellipseEnd.x) / 2;
        const cy = (ellipseStart.y + ellipseEnd.y) / 2;
        const rx = Math.abs(ellipseEnd.x - ellipseStart.x) / 2;
        const ry = Math.abs(ellipseEnd.y - ellipseStart.y) / 2;
        if (rx === 0 || ry === 0) return false;
        const dx = (pos.x - cx) / rx;
        const dy = (pos.y - cy) / ry;
        const ellipseDist = Math.sqrt(dx * dx + dy * dy);
        return ellipseDist <= 1 + (threshold / Math.min(rx, ry));

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
    if (!handle || annotation.points.length < 2) return annotation;

    const deltaX = newPos.x - startPos.x;
    const deltaY = newPos.y - startPos.y;
    const [p0, p1] = annotation.points;
    let newPoints = [...annotation.points];

    // Special handling for circle - resize radius from center
    if (annotation.type === "circle") {
      const center = p0;
      const currentRadius = Math.sqrt(
        Math.pow(p1.x - center.x, 2) + Math.pow(p1.y - center.y, 2)
      );
      
      // Calculate distance from new position to center
      const newRadius = Math.sqrt(
        Math.pow(newPos.x - center.x, 2) + Math.pow(newPos.y - center.y, 2)
      );
      
      // Update the edge point to maintain the new radius
      const angle = Math.atan2(newPos.y - center.y, newPos.x - center.x);
      newPoints = [
        center,
        { x: center.x + newRadius * Math.cos(angle), y: center.y + newRadius * Math.sin(angle) }
      ];
      return { ...annotation, points: newPoints };
    }

    // Get current bounds
    const minX = Math.min(p0.x, p1.x);
    const maxX = Math.max(p0.x, p1.x);
    const minY = Math.min(p0.y, p1.y);
    const maxY = Math.max(p0.y, p1.y);

    // Apply resize based on handle
    switch (handle) {
      case "nw":
        newPoints = [
          { x: minX + deltaX, y: minY + deltaY },
          { x: maxX, y: maxY }
        ];
        break;
      case "ne":
        newPoints = [
          { x: minX, y: minY + deltaY },
          { x: maxX + deltaX, y: maxY }
        ];
        break;
      case "sw":
        newPoints = [
          { x: minX + deltaX, y: minY },
          { x: maxX, y: maxY + deltaY }
        ];
        break;
      case "se":
        newPoints = [
          { x: minX, y: minY },
          { x: maxX + deltaX, y: maxY + deltaY }
        ];
        break;
      case "n":
        newPoints = [
          { x: minX, y: minY + deltaY },
          { x: maxX, y: maxY }
        ];
        break;
      case "s":
        newPoints = [
          { x: minX, y: minY },
          { x: maxX, y: maxY + deltaY }
        ];
        break;
      case "w":
        newPoints = [
          { x: minX + deltaX, y: minY },
          { x: maxX, y: maxY }
        ];
        break;
      case "e":
        newPoints = [
          { x: minX, y: minY },
          { x: maxX + deltaX, y: maxY }
        ];
        break;
    }

    return { ...annotation, points: newPoints };
  };

  // Check if point is on a resize handle
  const getResizeHandleAtPoint = (pos: { x: number; y: number }, annotation: Annotation): ResizeHandle => {
    if (!annotation || annotation.points.length < 2) return null;
    if (!["box", "ellipse", "text", "circle"].includes(annotation.type)) return null;

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

  // Mouse wheel zoom handler
  const handleWheel = (e: WheelEvent) => {
    if (!imageSrc) return;
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.1), 10);
    
    // Zoom towards mouse position
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

    const pos = getRelativePosition(e);

    // Handle panning
    if (isPanning) {
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      return;
    }

    // Handle select tool - click to select, resize handles, or drag to move
    if (activeTool === "select") {
      // First check if clicking on a resize handle of selected annotation
      if (selectedAnnotation) {
        const selectedAnn = annotations.find((a) => a.id === selectedAnnotation);
        if (selectedAnn) {
          const handle = getResizeHandleAtPoint(pos, selectedAnn);
          if (handle) {
            setIsResizing(true);
            setResizeHandle(handle);
            setResizeStart(pos);
            return;
          }
        }
      }

      const clickedAnnotation = annotations.find((ann) => isPointNearAnnotation(pos, ann));
      if (clickedAnnotation) {
        onSelectedAnnotationChange(clickedAnnotation.id);
        setIsDragging(true);
        setDragOffset({ x: pos.x, y: pos.y });
      } else {
        onSelectedAnnotationChange(null);
      }
      return;
    }

    // Clear selection when using other tools
    onSelectedAnnotationChange(null);

    // Handle eraser
    if (activeTool === "eraser") {
      setIsErasing(true);
      const annotationToRemove = annotations.find((ann) => isPointNearAnnotation(pos, ann));
      if (annotationToRemove) {
        onAnnotationsChange(annotations.filter((a) => a.id !== annotationToRemove.id));
      }
      return;
    }

    // Handle text tool - drag to create text box area
    if (activeTool === "text") {
      setTextBoxStart(pos);
      setIsDrawing(true);
      setCurrentAnnotation({
        id: Date.now().toString(),
        type: "text",
        points: [pos, pos],
        color: ANNOTATION_COLORS.text,
      });
      return;
    }

    // Handle marker
    if (activeTool === "marker") {
      const markerAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "marker",
        points: [pos],
        color: ANNOTATION_COLORS.marker,
      };
      onAnnotationsChange([...annotations, markerAnnotation]);
      return;
    }

    // Handle angle tool
    if (activeTool === "angle") {
      if (angleStep === 0) {
        setCurrentAnnotation({
          id: Date.now().toString(),
          type: "angle",
          points: [pos],
          color: ANNOTATION_COLORS.angle,
        });
        setAngleStep(1);
      } else if (angleStep === 1 && currentAnnotation) {
        setCurrentAnnotation({
          ...currentAnnotation,
          points: [currentAnnotation.points[0], pos],
        });
        setAngleStep(2);
      } else if (angleStep === 2 && currentAnnotation) {
        const completedAngle: Annotation = {
          ...currentAnnotation,
          points: [currentAnnotation.points[0], currentAnnotation.points[1], pos],
        };
        onAnnotationsChange([...annotations, completedAngle]);
        setCurrentAnnotation(null);
        setAngleStep(0);
      }
      return;
    }

    setIsDrawing(true);
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: activeTool,
      points: [pos],
      color: ANNOTATION_COLORS[activeTool],
    };
    setCurrentAnnotation(newAnnotation);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const pos = getRelativePosition(e);
    setMousePos(pos);

    // Handle panning
    if (isPanning && dragStart) {
      onPositionChange({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    // Handle resizing selected annotation
    if (isResizing && selectedAnnotation && resizeHandle && resizeStart) {
      const selectedAnn = annotations.find((a) => a.id === selectedAnnotation);
      if (selectedAnn) {
        const resizedAnn = resizeAnnotation(selectedAnn, resizeHandle, pos, resizeStart);
        const updatedAnnotations = annotations.map((ann) =>
          ann.id === selectedAnnotation ? resizedAnn : ann
        );
        onAnnotationsChange(updatedAnnotations, true); // Skip history during resize drag
        setResizeStart(pos);
      }
      return;
    }

    // Handle dragging selected annotation
    if (isDragging && selectedAnnotation && dragOffset) {
      const deltaX = pos.x - dragOffset.x;
      const deltaY = pos.y - dragOffset.y;
      
      const updatedAnnotations = annotations.map((ann) =>
        ann.id === selectedAnnotation ? moveAnnotation(ann, deltaX, deltaY) : ann
      );
      onAnnotationsChange(updatedAnnotations, true); // Skip history during drag
      setDragOffset({ x: pos.x, y: pos.y });
      return;
    }

    // Real-time erasing
    if (isErasing && activeTool === "eraser") {
      const annotationToRemove = annotations.find((ann) => isPointNearAnnotation(pos, ann));
      if (annotationToRemove) {
        onAnnotationsChange(annotations.filter((a) => a.id !== annotationToRemove.id));
      }
      return;
    }

    // Live protractor preview
    if (activeTool === "angle" && currentAnnotation && angleStep > 0) {
      if (angleStep === 1) {
        setCurrentAnnotation({
          ...currentAnnotation,
          points: [currentAnnotation.points[0], pos],
        });
      } else if (angleStep === 2 && currentAnnotation.points.length >= 2) {
        setCurrentAnnotation({
          ...currentAnnotation,
          points: [currentAnnotation.points[0], currentAnnotation.points[1], pos],
        });
      }
      return;
    }

    // Text box preview while dragging
    if (isDrawing && activeTool === "text" && textBoxStart && currentAnnotation) {
      setCurrentAnnotation({
        ...currentAnnotation,
        points: [textBoxStart, pos],
      });
      return;
    }

    if (!isDrawing || !currentAnnotation) return;

    if (currentAnnotation.type === "freehand") {
      setCurrentAnnotation({
        ...currentAnnotation,
        points: [...currentAnnotation.points, pos],
      });
    } else {
      setCurrentAnnotation({
        ...currentAnnotation,
        points: [currentAnnotation.points[0], pos],
      });
    }
  };

  const handleMouseUp = () => {
    if (dragStart) {
      setDragStart(null);
      return;
    }

    // Stop resizing
    if (isResizing) {
      setIsResizing(false);
      setResizeHandle(null);
      setResizeStart(null);
      // Save to history after resize complete
      onAnnotationsChange(annotations);
      return;
    }

    // Stop dragging
    if (isDragging) {
      setIsDragging(false);
      setDragOffset(null);
      // Save to history after drag complete
      onAnnotationsChange(annotations);
      return;
    }

    // Stop erasing
    if (isErasing) {
      setIsErasing(false);
      return;
    }

    // Finish text box and show input
    if (isDrawing && activeTool === "text" && textBoxStart && currentAnnotation) {
      const endPos = currentAnnotation.points[1] || textBoxStart;
      const width = Math.abs(endPos.x - textBoxStart.x);
      const height = Math.abs(endPos.y - textBoxStart.y);
      
      // Minimum size for text box
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
      setTextBoxStart(null);
      setCurrentAnnotation(null);
      return;
    }

    if (isDrawing && currentAnnotation && currentAnnotation.points.length >= 1) {
      if (currentAnnotation.type !== "angle" && currentAnnotation.type !== "text") {
        onAnnotationsChange([...annotations, currentAnnotation]);
      }
    }
    setIsDrawing(false);
    if (currentAnnotation?.type !== "angle") {
      setCurrentAnnotation(null);
    }
  };

  const handleTextSubmit = () => {
    if (textInput && textInput.value.trim()) {
      const textAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "text",
        points: [
          { x: textInput.x, y: textInput.y },
          { x: textInput.x + textInput.width, y: textInput.y + textInput.height },
        ],
        color: ANNOTATION_COLORS.text,
        text: textInput.value.trim(),
      };
      onAnnotationsChange([...annotations, textAnnotation]);
    }
    setTextInput(null);
  };

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setTextInput(null);
    }
    // Ctrl+Enter to submit
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleTextSubmit();
    }
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
    const angleRad = Math.acos(cosAngle);
    return (angleRad * 180) / Math.PI;
  };

  const renderAnnotation = (annotation: Annotation, isTemp = false) => {
    const { type, points, color, id, text } = annotation;
    const opacity = isTemp ? 0.7 : 1;
    const isSelected = selectedAnnotation === id;

    if (points.length < 1) return null;

    // Selection highlight with resize handles for all shapes
    const renderSelectionHighlight = () => {
      if (!isSelected) return null;
      const bounds = getAnnotationBounds(annotation);
      if (!bounds) return null;
      const padding = 5 / zoom;
      const handleSize = 8 / zoom;
      const { minX, maxX, minY, maxY } = bounds;
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      const showResizeHandles = ["box", "ellipse", "text", "circle"].includes(type);

      return (
        <g>
          {/* Selection border */}
          <rect
            x={minX - padding}
            y={minY - padding}
            width={maxX - minX + padding * 2}
            height={maxY - minY + padding * 2}
            fill="none"
            stroke={UI_COLORS.selection}
            strokeWidth={2 / zoom}
            strokeDasharray={`${4 / zoom} ${2 / zoom}`}
          />
          {/* Resize handles for resizable shapes */}
          {showResizeHandles && (
            <>
              {/* Corner handles */}
              <rect x={minX - handleSize/2} y={minY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "nwse-resize" }} />
              <rect x={maxX - handleSize/2} y={minY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "nesw-resize" }} />
              <rect x={minX - handleSize/2} y={maxY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "nesw-resize" }} />
              <rect x={maxX - handleSize/2} y={maxY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "nwse-resize" }} />
              {/* Edge handles */}
              <rect x={midX - handleSize/2} y={minY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "ns-resize" }} />
              <rect x={midX - handleSize/2} y={maxY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "ns-resize" }} />
              <rect x={minX - handleSize/2} y={midY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "ew-resize" }} />
              <rect x={maxX - handleSize/2} y={midY - handleSize/2} width={handleSize} height={handleSize} fill={UI_COLORS.handle} stroke={UI_COLORS.handleStroke} strokeWidth={1/zoom} style={{ cursor: "ew-resize" }} />
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
            {/* Outer circle */}
            <circle
              cx={points[0].x}
              cy={points[0].y}
              r={12 / zoom}
              stroke={color}
              strokeWidth={2 / zoom}
              fill="none"
            />
            {/* Inner circle */}
            <circle
              cx={points[0].x}
              cy={points[0].y}
              r={6 / zoom}
              stroke={color}
              strokeWidth={1.5 / zoom}
              fill="none"
            />
            {/* Center dot */}
            <circle
              cx={points[0].x}
              cy={points[0].y}
              r={2 / zoom}
              fill={color}
            />
            {/* Crosshair lines */}
            <line
              x1={points[0].x - 18 / zoom}
              y1={points[0].y}
              x2={points[0].x - 14 / zoom}
              y2={points[0].y}
              stroke={color}
              strokeWidth={2 / zoom}
            />
            <line
              x1={points[0].x + 14 / zoom}
              y1={points[0].y}
              x2={points[0].x + 18 / zoom}
              y2={points[0].y}
              stroke={color}
              strokeWidth={2 / zoom}
            />
            <line
              x1={points[0].x}
              y1={points[0].y - 18 / zoom}
              x2={points[0].x}
              y2={points[0].y - 14 / zoom}
              stroke={color}
              strokeWidth={2 / zoom}
            />
            <line
              x1={points[0].x}
              y1={points[0].y + 14 / zoom}
              x2={points[0].x}
              y2={points[0].y + 18 / zoom}
              stroke={color}
              strokeWidth={2 / zoom}
            />
          </g>
        );

      case "box":
        if (points.length < 2) return null;
        const [boxStart, boxEnd] = points;
        const boxWidth = Math.abs(boxEnd.x - boxStart.x);
        const boxHeight = Math.abs(boxEnd.y - boxStart.y);
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            <rect
              x={Math.min(boxStart.x, boxEnd.x)}
              y={Math.min(boxStart.y, boxEnd.y)}
              width={boxWidth}
              height={boxHeight}
              stroke={color}
              strokeWidth={2 / zoom}
              fill={isSelected ? UI_COLORS.selectionBg : "none"}
              opacity={opacity}
            />
          </g>
        );

      case "circle":
        if (points.length < 2) return null;
        const [circleStart, circleEnd] = points;
        const radius = Math.sqrt(
          Math.pow(circleEnd.x - circleStart.x, 2) +
          Math.pow(circleEnd.y - circleStart.y, 2)
        );
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            <circle
              cx={circleStart.x}
              cy={circleStart.y}
              r={radius}
              stroke={color}
              strokeWidth={2 / zoom}
              fill={isSelected ? UI_COLORS.selectionBg : "none"}
              opacity={opacity}
            />
          </g>
        );

      case "ellipse":
        if (points.length < 2) return null;
        const [ellipseStart, ellipseEnd] = points;
        const ellipseCx = (ellipseStart.x + ellipseEnd.x) / 2;
        const ellipseCy = (ellipseStart.y + ellipseEnd.y) / 2;
        const ellipseRx = Math.abs(ellipseEnd.x - ellipseStart.x) / 2;
        const ellipseRy = Math.abs(ellipseEnd.y - ellipseStart.y) / 2;
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            <ellipse
              cx={ellipseCx}
              cy={ellipseCy}
              rx={ellipseRx}
              ry={ellipseRy}
              stroke={color}
              strokeWidth={2 / zoom}
              fill={isSelected ? UI_COLORS.selectionBg : "none"}
              opacity={opacity}
            />
          </g>
        );

      case "line":
      case "ruler":
        if (points.length < 2) return null;
        const [lineStart, lineEnd] = points;
        const distance = Math.sqrt(
          Math.pow(lineEnd.x - lineStart.x, 2) +
          Math.pow(lineEnd.y - lineStart.y, 2)
        ).toFixed(1);
        return (
          <g key={id} opacity={opacity}>
            {renderSelectionHighlight()}
            <line
              x1={lineStart.x}
              y1={lineStart.y}
              x2={lineEnd.x}
              y2={lineEnd.y}
              stroke={color}
              strokeWidth={2 / zoom}
            />
            {type === "ruler" && (
              <>
                <line
                  x1={lineStart.x}
                  y1={lineStart.y - 6 / zoom}
                  x2={lineStart.x}
                  y2={lineStart.y + 6 / zoom}
                  stroke={color}
                  strokeWidth={2 / zoom}
                />
                <line
                  x1={lineEnd.x}
                  y1={lineEnd.y - 6 / zoom}
                  x2={lineEnd.x}
                  y2={lineEnd.y + 6 / zoom}
                  stroke={color}
                  strokeWidth={2 / zoom}
                />
                <rect
                  x={(lineStart.x + lineEnd.x) / 2 - 25 / zoom}
                  y={(lineStart.y + lineEnd.y) / 2 - 20 / zoom}
                  width={50 / zoom}
                  height={16 / zoom}
                  fill="rgba(0,0,0,0.7)"
                  rx={3 / zoom}
                />
                <text
                  x={(lineStart.x + lineEnd.x) / 2}
                  y={(lineStart.y + lineEnd.y) / 2 - 8 / zoom}
                  fill="white"
                  fontSize={11 / zoom}
                  textAnchor="middle"
                  fontFamily="monospace"
                >
                  {distance}px
                </text>
              </>
            )}
          </g>
        );

      case "angle":
        if (points.length < 2) return null;
        const angle = points.length === 3 ? calculateAngle(points) : 0;
        return (
          <g key={id} opacity={opacity}>
            {renderSelectionHighlight()}
            <line
              x1={points[0].x}
              y1={points[0].y}
              x2={points[1].x}
              y2={points[1].y}
              stroke={color}
              strokeWidth={2 / zoom}
            />
            {points.length >= 3 && (
              <>
                <line
                  x1={points[1].x}
                  y1={points[1].y}
                  x2={points[2].x}
                  y2={points[2].y}
                  stroke={color}
                  strokeWidth={2 / zoom}
                />
                {(() => {
                  const arcRadius = 25 / zoom;
                  const startAngle = Math.atan2(points[0].y - points[1].y, points[0].x - points[1].x);
                  const endAngle = Math.atan2(points[2].y - points[1].y, points[2].x - points[1].x);
                  const startX = points[1].x + arcRadius * Math.cos(startAngle);
                  const startY = points[1].y + arcRadius * Math.sin(startAngle);
                  const endX = points[1].x + arcRadius * Math.cos(endAngle);
                  const endY = points[1].y + arcRadius * Math.sin(endAngle);
                  const largeArc = angle > 180 ? 1 : 0;
                  const sweep = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI) > Math.PI ? 0 : 1;
                  return (
                    <path
                      d={`M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArc} ${sweep} ${endX} ${endY}`}
                      stroke={color}
                      strokeWidth={1.5 / zoom}
                      fill="none"
                    />
                  );
                })()}
                <rect
                  x={points[1].x + 20 / zoom}
                  y={points[1].y - 25 / zoom}
                  width={45 / zoom}
                  height={18 / zoom}
                  fill="rgba(0,0,0,0.8)"
                  rx={3 / zoom}
                />
                <text
                  x={points[1].x + 42 / zoom}
                  y={points[1].y - 12 / zoom}
                  fill="white"
                  fontSize={12 / zoom}
                  textAnchor="middle"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {angle.toFixed(1)}°
                </text>
              </>
            )}
            <circle
              cx={points[1].x}
              cy={points[1].y}
              r={4 / zoom}
              fill={color}
            />
          </g>
        );

      case "freehand":
        if (points.length < 2) return null;
        const pathData = points.reduce((acc, point, index) => {
          return index === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`;
        }, "");
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            <path
              d={pathData}
              stroke={color}
              strokeWidth={2 / zoom}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={opacity}
            />
          </g>
        );

      case "text":
        if (points.length < 2) return null;
        const [tStart, tEnd] = points;
        const textWidth = Math.abs(tEnd.x - tStart.x);
        const textHeight = Math.abs(tEnd.y - tStart.y);
        return (
          <g key={id}>
            {renderSelectionHighlight()}
            <rect
              x={Math.min(tStart.x, tEnd.x)}
              y={Math.min(tStart.y, tEnd.y)}
              width={textWidth}
              height={textHeight}
              fill="rgba(168, 85, 247, 0.1)"
              stroke={color}
              strokeWidth={1 / zoom}
              strokeDasharray={isTemp ? `${4 / zoom} ${2 / zoom}` : "none"}
              opacity={opacity}
            />
            {text && (
              <text
                x={Math.min(tStart.x, tEnd.x) + 4 / zoom}
                y={Math.min(tStart.y, tEnd.y) + 16 / zoom}
                fill={color}
                fontSize={14 / zoom}
                fontWeight="500"
              >
                {text}
              </text>
            )}
          </g>
        );

      default:
        return null;
    }
  };

  // Calculate gamma-corrected filter (CSS doesn't have gamma, so we simulate with SVG filter)
  const gammaValue = filters.gamma / 100;

  // Get cursor style based on current state
  const getCursor = () => {
    if (isPanning) return "cursor-grab active:cursor-grabbing";
    if (isResizing) {
      switch (resizeHandle) {
        case "nw":
        case "se":
          return "cursor-nwse-resize";
        case "ne":
        case "sw":
          return "cursor-nesw-resize";
        case "n":
        case "s":
          return "cursor-ns-resize";
        case "e":
        case "w":
          return "cursor-ew-resize";
      }
    }
    if (activeTool === "select" && selectedAnnotation) return "cursor-move";
    if (activeTool === "eraser") return "cursor-crosshair";
    return "cursor-crosshair";
  };

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
      {/* SVG filter for gamma correction */}
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
        <div
          className="absolute"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          <img
            src={imageSrc}
            alt="X-ray"
            className="max-w-none select-none"
            draggable={false}
            style={{
              filter: `brightness(${filters.brightness / 100}) contrast(${filters.contrast / 100}) saturate(${filters.saturation / 100}) hue-rotate(${filters.hue}deg) ${filters.invert ? 'invert(1)' : ''} url(#gamma-filter)`,
            }}
          />
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: "visible" }}
          >
            {annotations.map((ann) => renderAnnotation(ann))}
            {currentAnnotation && renderAnnotation(currentAnnotation, true)}
          </svg>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          <ImageIcon className="h-24 w-24 mb-4 opacity-30" />
          <p className="text-lg font-medium">No X-ray image loaded</p>
          <p className="text-sm mt-1">Click "Upload Image" to load an image</p>
        </div>
      )}

      {/* Text area input overlay */}
      {textInput && (
        <div
          className="absolute"
          style={{
            left: position.x + textInput.x * zoom,
            top: position.y + textInput.y * zoom,
            width: textInput.width * zoom,
            height: textInput.height * zoom,
          }}
        >
          <textarea
            ref={textInputRef}
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={handleTextKeyDown}
            onBlur={handleTextSubmit}
            className="w-full h-full bg-card border-2 border-primary rounded px-2 py-1 text-sm outline-none resize-none"
            placeholder="Enter text... (Ctrl+Enter to submit)"
            style={{ fontSize: 14 }}
          />
        </div>
      )}

      {/* Zoom indicator */}
      {imageSrc && (
        <div className="absolute bottom-4 right-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm">
          {Math.round(zoom * 100)}%
        </div>
      )}

      {/* Tool indicator */}
      {imageSrc && activeTool === "angle" && angleStep > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2 text-sm font-medium shadow-sm">
          Click {angleStep === 1 ? "vertex point" : "end point"} ({angleStep}/2)
        </div>
      )}

      {/* Text tool hint */}
      {imageSrc && activeTool === "text" && !textInput && !isDrawing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2 text-sm font-medium shadow-sm">
          Drag to create text area
        </div>
      )}
    </div>
  );
};

export { ImageCanvas, type Annotation };
