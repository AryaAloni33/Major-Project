import { Trash2, MousePointer2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Annotation } from "./ImageCanvas";

interface AnnotationListProps {
    annotations: Annotation[];
    selectedAnnotation: string | null;
    onSelect: (id: string | null) => void;
    onDelete: (id: string) => void;
    onToggleLock: (id: string) => void;
}

const AnnotationList = ({
    annotations,
    selectedAnnotation,
    onSelect,
    onDelete,
    onToggleLock,
}: AnnotationListProps) => {
    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-3 border-b border-border bg-muted/30">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MousePointer2 className="h-4 w-4 text-muted-foreground" />
                    Annotation Labels
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                    {annotations.length} items drawn
                </p>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {annotations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 opacity-40">
                        <p className="text-[10px] text-muted-foreground text-center">
                            No annotations yet.
                        </p>
                    </div>
                ) : (
                    annotations.map((ann) => (
                        <div
                            key={ann.id}
                            onClick={() => onSelect(ann.id)}
                            className={cn(
                                "group flex items-center justify-between p-2 rounded-md text-xs transition-all cursor-pointer",
                                selectedAnnotation === ann.id
                                    ? "bg-primary/10 border border-primary/20"
                                    : "hover:bg-muted border border-transparent",
                                ann.locked && "opacity-80"
                            )}
                        >
                            <div className="flex items-center gap-2 overflow-hidden flex-1">
                                <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: ann.color }}
                                />
                                <span className={cn(
                                    "truncate font-medium",
                                    selectedAnnotation === ann.id ? "text-primary" : "text-foreground",
                                    ann.locked && "italic text-muted-foreground"
                                )}>
                                    {ann.label || ann.type}
                                    {ann.locked && " (Locked)"}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onToggleLock(ann.id);
                                    }}
                                    className={cn(
                                        "p-1 rounded transition-colors",
                                        ann.locked
                                            ? "text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 opacity-100"
                                            : "hover:bg-muted-foreground/10 text-muted-foreground"
                                    )}
                                    title={ann.locked ? "Unlock" : "Lock"}
                                >
                                    {ann.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(ann.id);
                                    }}
                                    className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all text-muted-foreground"
                                    title="Delete"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export { AnnotationList };
