import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { MedicalCard, MedicalCardHeader, MedicalCardTitle, MedicalCardContent } from "@/components/medical/MedicalCard";
import { MedicalButton } from "@/components/medical/MedicalButton";
import { MedicalInput } from "@/components/medical/MedicalInput";
import { MedicalTable } from "@/components/medical/MedicalTable";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { ArrowLeft, Plus, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { patientsApi, type Patient, type PatientCreate } from "@/services/api";
import { toast } from "@/hooks/use-toast";

export default function PatientsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  const [form, setForm] = useState<PatientCreate>({
    name: "",
    age: 0,
    gender: "Male",
    phone: "",
    email: "",
    blood_type: "",
    medical_history: "",
  });

  const fetchPatients = async () => {
    try {
      const res = await patientsApi.list();
      setPatients(res.data.patients);
    } catch (err) {
      toast({ title: "Error", description: "Failed to load patients", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.age) {
      toast({ title: "Error", description: "Name and age are required", variant: "destructive" });
      return;
    }
    try {
      if (editingPatient) {
        await patientsApi.update(editingPatient.patient_id, form);
        toast({ title: "Updated", description: "Patient updated successfully" });
      } else {
        await patientsApi.create(form);
        toast({ title: "Created", description: "Patient added successfully" });
      }
      setShowForm(false);
      setEditingPatient(null);
      setForm({ name: "", age: 0, gender: "Male", phone: "", email: "", blood_type: "", medical_history: "" });
      fetchPatients();
    } catch (err: any) {
      toast({ title: "Error", description: err.response?.data?.detail || "Failed to save", variant: "destructive" });
    }
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setForm({
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone || "",
      email: patient.email || "",
      blood_type: patient.blood_type || "",
      medical_history: patient.medical_history || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (patientId: string) => {
    try {
      await patientsApi.delete(patientId);
      toast({ title: "Deleted", description: "Patient removed" });
      fetchPatients();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.patient_id.toLowerCase().includes(search.toLowerCase())
  );

  const columns: { key: string; header: string; render?: (item: Record<string, unknown>) => React.ReactNode }[] = [
    { key: "patient_id", header: "ID" },
    { key: "name", header: "Name" },
    { key: "age", header: "Age" },
    { key: "gender", header: "Gender" },
    {
      key: "actions",
      header: "",
      render: (item: Record<string, unknown>) => {
        const p = item as unknown as Patient;
        return (
          <div className="flex gap-2">
            <MedicalButton variant="ghost" size="sm" onClick={() => navigate(`/patient/${p.patient_id}`)}>
              View
            </MedicalButton>
            <MedicalButton variant="ghost" size="sm" onClick={() => handleEdit(p)}>
              Edit
            </MedicalButton>
            <MedicalButton variant="ghost" size="sm" onClick={() => handleDelete(p.patient_id)}>
              Delete
            </MedicalButton>
          </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />
      <Navbar onLogout={logout} />

      <main className="container px-4 py-6 md:px-6 lg:py-8">
        <MedicalButton
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          className="mb-4"
        >
          Back to Dashboard
        </MedicalButton>

        <MedicalCard variant="default" padding="md">
          <MedicalCardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <MedicalCardTitle>Patients</MedicalCardTitle>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    placeholder="Search patients..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <MedicalButton
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setEditingPatient(null);
                    setForm({ name: "", age: 0, gender: "Male", phone: "", email: "", blood_type: "", medical_history: "" });
                    setShowForm(true);
                  }}
                >
                  Add Patient
                </MedicalButton>
              </div>
            </div>
          </MedicalCardHeader>
          <MedicalCardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading patients...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <User className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No patients found. Add  patient!</p>
              </div>
            ) : (
              <MedicalTable columns={columns} data={filtered as unknown as Record<string, unknown>[]} />
            )}
          </MedicalCardContent>
        </MedicalCard>

        {/* Add/Edit Patient Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
            <MedicalCard variant="elevated" padding="lg" className="w-full max-w-md mx-4 animate-fade-in" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  {editingPatient ? "Edit Patient" : "Add Patient"}
                </h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <MedicalInput
                  label="Full Name"
                  placeholder="Patient name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <MedicalInput
                    label="Age"
                    placeholder="e.g. 25"
                    value={form.age === 0 ? "" : String(form.age)}
                    onChange={(e) => setForm((f) => ({ ...f, age: parseInt(e.target.value) || 0 }))}
                  />
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Gender</label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                      className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
                <MedicalInput
                  label="Phone"
                  placeholder="+1 (555) 000-0000"
                  value={form.phone || ""}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <MedicalInput
                  label="Blood Type"
                  placeholder="O+, A-, etc."
                  value={form.blood_type || ""}
                  onChange={(e) => setForm((f) => ({ ...f, blood_type: e.target.value }))}
                />
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Medical History</label>
                  <textarea
                    value={form.medical_history || ""}
                    onChange={(e) => setForm((f) => ({ ...f, medical_history: e.target.value }))}
                    placeholder="Any relevant medical history..."
                    rows={3}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <MedicalButton type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                    Cancel
                  </MedicalButton>
                  <MedicalButton type="submit" variant="primary" className="flex-1">
                    {editingPatient ? "Update" : "Add Patient"}
                  </MedicalButton>
                </div>
              </form>
            </MedicalCard>
          </div>
        )}
      </main>
    </div>
  );
}
