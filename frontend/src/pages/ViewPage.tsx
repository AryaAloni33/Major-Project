import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { MedicalCard, MedicalCardHeader, MedicalCardTitle, MedicalCardContent } from "@/components/medical/MedicalCard";
import { MedicalButton } from "@/components/medical/MedicalButton";
import { MedicalBadge } from "@/components/medical/MedicalBadge";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowLeft, FileImage, Trash2, Eye, X, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { patientsApi, annotationsApi, type Patient } from "@/services/api";
import { toast } from "@/hooks/use-toast";

interface AnnotationRecord {
  id: string;
  patient_id: string;
  image_name: string;
  image_src: string;
  annotations: any[];
  created_at: string;
  updated_at?: string;
}

export default function ViewPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [records, setRecords] = useState<AnnotationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<AnnotationRecord | null>(null);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });

  useEffect(() => {
    patientsApi.list().then((res) => {
      setPatients(res.data.patients);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedPatient) {
      annotationsApi.getByPatient(selectedPatient).then((res) => {
        setRecords(res.data.records);
      }).catch(() => setRecords([]));
    }
  }, [selectedPatient]);

  const handleDeleteRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await annotationsApi.delete(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (selectedRecord?.id === id) setSelectedRecord(null);
      toast({ title: "Deleted", description: "Annotation record removed" });
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDims({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const renderAnnotation = (ann: any) => {
    const color = ann.color || "#22c55e"; // default to green if missing

    switch (ann.type) {
      case 'box':
        if (ann.points?.length < 2) return null;
        const [p0, p1] = ann.points;
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const w = Math.abs(p1.x - p0.x);
        const h = Math.abs(p1.y - p0.y);
        return (
          <g key={ann.id}>
            <rect
              x={x} y={y} width={w} height={h}
              fill={`${color}15`} stroke={color}
              strokeWidth="3"
            />
            <text x={x} y={y - 8} fill={color} className="text-[12px] font-bold uppercase select-none">{ann.text || 'Area'}</text>
          </g>
        );

      case 'marker':
        if (ann.points?.length < 1) return null;
        const [pt] = ann.points;
        return (
          <g key={ann.id}>
            <circle cx={pt.x} cy={pt.y} r="8" fill={color} stroke="white" strokeWidth="2" />
            <circle cx={pt.x} cy={pt.y} r="15" fill="none" stroke={color} strokeWidth="1.5" />
          </g>
        );

      case 'circle':
        if (ann.points?.length < 2) return null;
        const [c, e] = ann.points;
        const r = Math.sqrt(Math.pow(e.x - c.x, 2) + Math.pow(e.y - c.y, 2));
        return (
          <circle key={ann.id} cx={c.x} cy={c.y} r={r} fill={`${color}15`} stroke={color} strokeWidth="3" />
        );

      case 'line':
      case 'ruler':
        if (ann.points?.length < 2) return null;
        const [l0, l1] = ann.points;
        return (
          <line key={ann.id} x1={l0.x} y1={l0.y} x2={l1.x} y2={l1.y} stroke={color} strokeWidth="3" />
        );

      case 'angle':
        if (ann.points?.length < 3) return null;
        const [a0, a1, a2] = ann.points;
        return (
          <path
            key={ann.id}
            d={`M ${a0.x} ${a0.y} L ${a1.x} ${a1.y} L ${a2.x} ${a2.y}`}
            fill="none" stroke={color} strokeWidth="3"
          />
        );

      case 'freehand':
        if (ann.points?.length < 2) return null;
        const pathData = ann.points.reduce((acc: string, p: any, i: number) =>
          i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, "");
        return (
          <path key={ann.id} d={pathData} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        );

      case 'text':
        if (ann.points?.length < 2) return null;
        const [t0, t1] = ann.points;
        const tx = Math.min(t0.x, t1.x);
        const ty = Math.min(t0.y, t1.y);
        return (
          <g key={ann.id}>
            <text x={tx} y={ty + 20} fill={color} className="text-[16px] font-medium select-none">{ann.text}</text>
          </g>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />
      <Navbar onLogout={logout} />

      <main className="container px-4 py-6 md:px-6 lg:py-8 relative z-10">
        <MedicalButton
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          className="mb-4"
        >
          Back to Dashboard
        </MedicalButton>

        <div className="grid md:grid-cols-4 gap-6">
          {/* Patient List */}
          <MedicalCard variant="default" padding="md" className="md:col-span-1">
            <MedicalCardHeader>
              <MedicalCardTitle>Patients</MedicalCardTitle>
            </MedicalCardHeader>
            <MedicalCardContent>
              {loading ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded-lg" />)}
                </div>
              ) : patients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No patients record</p>
              ) : (
                <div className="space-y-1">
                  {patients.map((p) => (
                    <button
                      key={p.patient_id}
                      onClick={() => { setSelectedPatient(p.patient_id); setSelectedRecord(null); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${selectedPatient === p.patient_id
                        ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                        : "hover:bg-muted text-foreground"
                        }`}
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className={`text-xs ${selectedPatient === p.patient_id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {p.patient_id}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </MedicalCardContent>
          </MedicalCard>

          {/* Annotation Records */}
          <div className="md:col-span-3">
            <MedicalCard variant="default" padding="md">
              <MedicalCardHeader>
                <MedicalCardTitle className="flex items-center justify-between">
                  <span>{selectedPatient ? `History: ${selectedPatient}` : "Saved History"}</span>
                  {selectedPatient && <MedicalBadge variant="info">{records.length} Analyzed</MedicalBadge>}
                </MedicalCardTitle>
              </MedicalCardHeader>
              <MedicalCardContent>
                {!selectedPatient ? (
                  <div className="text-center py-24 opacity-40">
                    <FileImage className="h-20 w-20 mx-auto mb-4 stroke-1" />
                    <p className="text-xl font-medium">Select a patient to track analysis</p>
                  </div>
                ) : records.length === 0 ? (
                  <div className="text-center py-24 opacity-40">
                    <FileImage className="h-20 w-20 mx-auto mb-4 stroke-1" />
                    <p className="text-xl font-medium">No saved scans found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {records.map((rec) => (
                      <div
                        key={rec.id}
                        onClick={() => setSelectedRecord(rec)}
                        className="group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 cursor-pointer"
                      >
                        <div className="aspect-square bg-muted relative overflow-hidden">
                          {rec.image_src ? (
                            <img src={rec.image_src} alt={rec.image_name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground/30"><FileImage className="h-12 w-12" /></div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                            <div className="flex items-center gap-2 text-white font-bold text-sm">
                              <Eye className="h-4 w-4" /> View Full Analysis
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-card border-t border-border">
                          <p className="font-bold text-foreground truncate mb-1 text-base">{rec.image_name}</p>
                          <div className="flex flex-col gap-2 mt-2">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{new Date(rec.created_at).toLocaleDateString()} at {formatTime(rec.created_at)}</span>
                            </div>
                            {rec.updated_at && (
                              <div className="flex items-center gap-1.5 text-xs text-primary/80 font-medium">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Edited: {formatTime(rec.updated_at)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => handleDeleteRecord(rec.id, e)}
                            className="p-2 rounded-lg bg-destructive/90 text-white shadow-lg hover:bg-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </MedicalCardContent>
            </MedicalCard>
          </div>
        </div>

        {/* Modal View */}
        {selectedRecord && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/98 backdrop-blur-xl animate-fade-in p-2 sm:p-6" onClick={() => setSelectedRecord(null)}>
            <div className="relative w-full max-w-6xl max-h-[95vh] bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col scale-up-center" onClick={e => e.stopPropagation()}>
              <div className="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/20 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    <FileImage className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-foreground tracking-tight">{selectedRecord.image_name}</h2>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mt-0.5">
                      Patient: {selectedPatient} • {selectedRecord.annotations.length} Annotations
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedRecord(null)} className="p-2.5 hover:bg-muted rounded-full transition-all hover:rotate-90"><X className="h-6 w-6" /></button>
              </div>

              <div className="flex-1 overflow-auto bg-black flex items-center justify-center relative min-h-[400px]">
                <div className="relative inline-block overflow-hidden shadow-2xl">
                  <img
                    src={selectedRecord.image_src}
                    alt="Full Preview"
                    onLoad={handleImageLoad}
                    className="max-w-full max-h-[70vh] block select-none"
                  />

                  {imageDims.width > 0 && (
                    <svg
                      viewBox={`0 0 ${imageDims.width} ${imageDims.height}`}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ overflow: "visible" }}
                    >
                      {selectedRecord.annotations.map((ann: any) => renderAnnotation(ann))}
                    </svg>
                  )}
                </div>
              </div>

              <div className="px-8 py-6 border-t border-border bg-muted/20 flex flex-wrap justify-between items-center gap-4">
                <div className="flex gap-8">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-extrabold uppercase tracking-widest mb-1.5 opacity-60">Created Date</p>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <p className="text-sm font-bold">{new Date(selectedRecord.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {selectedRecord.updated_at && (
                    <div className="border-l border-border pl-8">
                      <p className="text-[10px] text-primary/60 font-extrabold uppercase tracking-widest mb-1.5">Last Edited</p>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <p className="text-sm font-bold">{formatTime(selectedRecord.updated_at)}</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <MedicalButton variant="outline" className="rounded-full px-6" onClick={() => setSelectedRecord(null)}>Close</MedicalButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
