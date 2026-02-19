import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { AnnotationToolbar, type AnnotationTool } from "@/components/xray/AnnotationToolbar";
import { ImageCanvas, type Annotation } from "@/components/xray/ImageCanvas";
import { ImageAdjustments } from "@/components/xray/ImageAdjustments";
import { ShapeDimensions } from "@/components/xray/ShapeDimensions";
import { MedicalButton } from "@/components/medical/MedicalButton";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "@/hooks/use-toast";
import { annotationsApi } from "@/services/api";

const XRayAnnotation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Router state data
  const stateData = location.state as { imageSrc?: string; imageName?: string; patientId?: string } | null;

  // Image state
  const [imageSrc, setImageSrc] = useState<string | null>(stateData?.imageSrc || null);
  const [imageName, setImageName] = useState<string>(stateData?.imageName || "");
  const [patientId, setPatientId] = useState<string>(stateData?.patientId || "");

  // Tool state
  const [activeTool, setActiveTool] = useState<AnnotationTool>("select");
  const [isPanning, setIsPanning] = useState(false);

  // View state
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Initialize view when image is loaded from state
  useEffect(() => {
    if (stateData?.imageSrc) {
      const img = new Image();
      img.onload = () => {
        const containerWidth = window.innerWidth - 320;
        const containerHeight = window.innerHeight - 150;
        const scaleX = containerWidth / img.naturalWidth;
        const scaleY = containerHeight / img.naturalHeight;
        const fitZoom = Math.min(scaleX, scaleY, 1) * 0.85;

        setZoom(fitZoom);
        const centeredX = (containerWidth - img.naturalWidth * fitZoom) / 2;
        const centeredY = (containerHeight - img.naturalHeight * fitZoom) / 2;
        setPosition({ x: Math.max(20, centeredX), y: Math.max(20, centeredY) });
      };
      img.src = stateData.imageSrc;
    }
  }, [stateData]);

  // Callback for wheel zoom
  const handleWheelZoom = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Image filter state
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    gamma: 100,
    invert: false,
  });

  const resetFilters = useCallback(() => {
    setFilters({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      hue: 0,
      gamma: 100,
      invert: false,
    });
  }, []);

  // Get selected annotation object
  const getSelectedAnnotationObject = (): Annotation | null => {
    if (!selectedAnnotation) return null;
    return annotations.find((a) => a.id === selectedAnnotation) || null;
  };

  // Handle tool change - clear panning when switching to a non-pan tool
  const handleToolChange = useCallback((tool: AnnotationTool) => {
    setActiveTool(tool);
    // When switching to select or any drawing tool, ensure panning is disabled
    if (tool !== "select") {
      setIsPanning(false);
    }
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "v":
          handleToolChange("select");
          break;
        case "p":
          handleToolChange("marker");
          break;
        case "b":
          handleToolChange("box");
          break;
        case "c":
          handleToolChange("circle");
          break;
        case "o":
          handleToolChange("ellipse");
          break;
        case "l":
          handleToolChange("line");
          break;
        case "d":
          handleToolChange("freehand");
          break;
        case "m":
          handleToolChange("ruler");
          break;
        case "a":
          handleToolChange("angle");
          break;
        case "t":
          handleToolChange("text");
          break;
        case "e":
          handleToolChange("eraser");
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
        case " ":
          e.preventDefault();
          setIsPanning(true);
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case "delete":
        case "backspace":
          if (selectedAnnotation) {
            e.preventDefault();
            setAnnotations((prev) => prev.filter((a) => a.id !== selectedAnnotation));
            setSelectedAnnotation(null);
          }
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [historyIndex, history, selectedAnnotation]);

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload an image file (JPEG, PNG, DICOM, etc.)",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const imgData = event.target?.result as string;

        const img = new Image();
        img.onload = () => {
          const containerWidth = window.innerWidth - 320;
          const containerHeight = window.innerHeight - 150;

          const scaleX = containerWidth / img.naturalWidth;
          const scaleY = containerHeight / img.naturalHeight;
          const fitZoom = Math.min(scaleX, scaleY, 1) * 0.85;

          setImageSrc(imgData);
          setImageName(file.name);
          setZoom(fitZoom);
          const centeredX = (containerWidth - img.naturalWidth * fitZoom) / 2;
          const centeredY = (containerHeight - img.naturalHeight * fitZoom) / 2;
          setPosition({ x: Math.max(20, centeredX), y: Math.max(20, centeredY) });
          setAnnotations([]);
          setSelectedAnnotation(null);
          setHistory([[]]);
          setHistoryIndex(0);
          toast({
            title: "Image loaded",
            description: `${file.name} loaded at ${Math.round(fitZoom * 100)}% zoom.`,
          });
        };
        img.src = imgData;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev / 1.2, 0.2));
  }, []);

  const handleAnnotationsChange = useCallback(
    (newAnnotations: Annotation[], skipHistory = false) => {
      setAnnotations(newAnnotations);
      if (!skipHistory) {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newAnnotations);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
    },
    [history, historyIndex]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setAnnotations(history[newIndex]);
      setSelectedAnnotation(null);
    }
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setAnnotations(history[newIndex]);
      setSelectedAnnotation(null);
    }
  }, [historyIndex, history]);

  const handleSave = useCallback(async () => {
    if (!imageSrc) return;

    try {
      await annotationsApi.save({
        patient_id: patientId,
        image_name: imageName,
        image_src: imageSrc,
        annotations: annotations
      });

      toast({
        title: "Annotations saved",
        description: `${annotations.length} annotation(s) saved for ${imageName}.`,
      });
      // Optionally navigate to view page to see the saved record
      navigate("/view");
    } catch {
      toast({
        title: "Error",
        description: "Failed to save annotations.",
        variant: "destructive"
      });
    }
  }, [imageSrc, annotations, patientId, imageName, navigate]);

  const handlePanToggle = useCallback(() => {
    setIsPanning((prev) => !prev);
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <MedicalButton
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </MedicalButton>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-lg font-semibold text-foreground">X-Ray Annotation</h1>
          {imageName && (
            <>
              <div className="h-6 w-px bg-border" />
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                {imageName}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:block">
            {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
          </span>
          <MedicalButton
            variant="success"
            size="sm"
            onClick={handleSave}
            disabled={!imageSrc}
          >
            Save Annotations
          </MedicalButton>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors focus-ring"
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Toolbar */}
        <AnnotationToolbar
          activeTool={activeTool}
          onToolChange={handleToolChange}
          onUpload={handleUpload}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onPan={handlePanToggle}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          isPanning={isPanning}
          hasImage={!!imageSrc}
        />

        {/* Canvas */}
        <ImageCanvas
          imageSrc={imageSrc}
          activeTool={activeTool}
          zoom={zoom}
          position={position}
          isPanning={isPanning}
          annotations={annotations}
          filters={filters}
          onAnnotationsChange={handleAnnotationsChange}
          onPositionChange={setPosition}
          onZoomChange={handleWheelZoom}
          selectedAnnotation={selectedAnnotation}
          onSelectedAnnotationChange={setSelectedAnnotation}
        />

        {/* Right Panel - Image Adjustments + Shape Dimensions */}
        <div className="flex flex-col h-full shrink-0">
          <ImageAdjustments
            brightness={filters.brightness}
            contrast={filters.contrast}
            saturation={filters.saturation}
            hue={filters.hue}
            gamma={filters.gamma}
            invert={filters.invert}
            onBrightnessChange={(v) => setFilters((f) => ({ ...f, brightness: v }))}
            onContrastChange={(v) => setFilters((f) => ({ ...f, contrast: v }))}
            onSaturationChange={(v) => setFilters((f) => ({ ...f, saturation: v }))}
            onHueChange={(v) => setFilters((f) => ({ ...f, hue: v }))}
            onGammaChange={(v) => setFilters((f) => ({ ...f, gamma: v }))}
            onInvertChange={(v) => setFilters((f) => ({ ...f, invert: v }))}
            onReset={resetFilters}
            hasImage={!!imageSrc}
          />
          <ShapeDimensions selectedAnnotation={getSelectedAnnotationObject()} />
        </div>
      </div>

      {/* Status Bar */}
      <footer className="h-8 border-t border-border bg-card flex items-center justify-between px-4 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <span>
            Tool: <strong className="text-foreground">{activeTool}</strong>
          </span>
          {isPanning && <span className="text-primary">Panning mode</span>}
          {selectedAnnotation && (
            <span className="text-primary">Shape selected (Delete to remove)</span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>
            Shortcuts: V=Select, P=Marker, B=Box, C=Circle, O=Ellipse, A=Angle, Space=Pan
          </span>
        </div>
      </footer>
    </div>
  );
};

export default XRayAnnotation;
