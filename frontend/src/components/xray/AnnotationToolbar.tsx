import {
  Upload,
  Square,
  Pencil,
  Circle,
  Type,
  Eraser,
  Undo2,
  Redo2,
  Save,
  MousePointer2,
  RotateCcw,
  Ruler,
  Slash,
  Crosshair,
  Triangle,
  Ellipsis
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AnnotationTool =
  | "select"
  | "marker"
  | "box"
  | "freehand"
  | "circle"
  | "ellipse"
  | "line"
  | "ruler"
  | "angle"
  | "text"
  | "eraser";

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  onUpload: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  hasImage: boolean;
}

interface ToolItemProps {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const ToolItem = ({ icon: Icon, label, shortcut, isActive, disabled, onClick }: ToolItemProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "group relative flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200",
      "hover:bg-accent focus-ring",
      isActive
        ? "bg-primary text-primary-foreground shadow-sm"
        : "text-foreground hover:text-accent-foreground",
      "disabled:opacity-40 disabled:pointer-events-none"
    )}
    title={shortcut ? `${label} (${shortcut})` : label}
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span className="text-sm font-medium flex-1 text-left">{label}</span>
    {shortcut && (
      <span className={cn(
        "text-[10px] font-mono px-1.5 py-0.5 rounded",
        isActive
          ? "bg-primary-foreground/20 text-primary-foreground"
          : "bg-muted text-muted-foreground"
      )}>
        {shortcut}
      </span>
    )}
  </button>
);

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="px-3 py-2">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  </div>
);

const Divider = () => <div className="h-px bg-border mx-2 my-1" />;

const AnnotationToolbar = ({
  activeTool,
  onToolChange,
  onUpload,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  hasImage,
}: AnnotationToolbarProps) => {
  const selectionTools = [
    { id: "select" as const, icon: MousePointer2, label: "Select", shortcut: "V" },
    { id: "eraser" as const, icon: Eraser, label: "Eraser", shortcut: "E" },
  ];

  const shapeTools = [
    { id: "marker" as const, icon: Crosshair, label: "Marker", shortcut: "P" },
    { id: "box" as const, icon: Square, label: "Rectangle", shortcut: "B" },
    { id: "circle" as const, icon: Circle, label: "Circle", shortcut: "C" },
    { id: "ellipse" as const, icon: Ellipsis, label: "Ellipse", shortcut: "O" },
    { id: "line" as const, icon: Slash, label: "Line", shortcut: "L" },
    { id: "freehand" as const, icon: Pencil, label: "Freehand", shortcut: "D" },
    { id: "text" as const, icon: Type, label: "Text", shortcut: "T" },
  ];

  const measureTools = [
    { id: "ruler" as const, icon: Ruler, label: "Ruler", shortcut: "M" },
    { id: "angle" as const, icon: Triangle, label: "Angle", shortcut: "A" },
  ];

  return (
    <aside className="w-52 bg-card border-r border-border flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="p-3 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold text-foreground">Annotation Tools</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">X-Ray Analysis Workspace</p>
      </div>

      {/* Upload Button */}
      <div className="p-2">
        <button
          onClick={onUpload}
          className={cn(
            "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "transition-all duration-200 focus-ring font-medium text-sm",
            "shadow-sm"
          )}
        >
          <Upload className="h-4 w-4" />
          <span>Upload Image</span>
        </button>
      </div>


      {/* Selection & Eraser */}
      <div>
        <SectionHeader>Selection</SectionHeader>
        <div className="px-2 pb-1 space-y-0.5">
          {selectionTools.map((tool) => (
            <ToolItem
              key={tool.id}
              icon={tool.icon}
              label={tool.label}
              shortcut={tool.shortcut}
              isActive={activeTool === tool.id}
              onClick={() => onToolChange(tool.id)}
              disabled={!hasImage && tool.id !== "select"}
            />
          ))}
        </div>
      </div>

      <Divider />

      {/* Shape Tools */}
      <div className="flex-1 overflow-y-auto">
        <SectionHeader>Shapes</SectionHeader>
        <div className="px-2 pb-1 space-y-0.5">
          {shapeTools.map((tool) => (
            <ToolItem
              key={tool.id}
              icon={tool.icon}
              label={tool.label}
              shortcut={tool.shortcut}
              isActive={activeTool === tool.id}
              onClick={() => onToolChange(tool.id)}
              disabled={!hasImage}
            />
          ))}
        </div>

        <Divider />

        {/* Measurement Tools */}
        <SectionHeader>Measure</SectionHeader>
        <div className="px-2 pb-2 space-y-0.5">
          {measureTools.map((tool) => (
            <ToolItem
              key={tool.id}
              icon={tool.icon}
              label={tool.label}
              shortcut={tool.shortcut}
              isActive={activeTool === tool.id}
              onClick={() => onToolChange(tool.id)}
              disabled={!hasImage}
            />
          ))}
        </div>
      </div>

      {/* Actions Footer */}
      <div className="p-2 border-t border-border bg-muted/30">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-md",
              "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              "transition-all duration-200 focus-ring disabled:opacity-40 text-sm"
            )}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Undo</span>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 rounded-md",
              "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              "transition-all duration-200 focus-ring disabled:opacity-40 text-sm"
            )}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
            <span>Redo</span>
          </button>
        </div>
      </div>
    </aside>
  );
};

export { AnnotationToolbar };
