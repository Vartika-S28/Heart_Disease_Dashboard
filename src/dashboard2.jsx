// src/Dashboard.jsx
import React, { useEffect, useState } from "react";
import Papa from "papaparse";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

const AGE_BIN_SIZE = 5;
function ageBinLabel(age) {
  const low = Math.floor(age / AGE_BIN_SIZE) * AGE_BIN_SIZE;
  return `${low}-${low + AGE_BIN_SIZE - 1}`;
}
function parseHeartRisk(raw) {
  if (raw === undefined || raw === null) return 0;
  const s = String(raw).trim().toLowerCase();
  if (s === "") return 0;
  if (["1", "true", "yes", "y", "high", "risk"].includes(s)) return 1;
  if (["0", "false", "no", "n", "low", "none"].includes(s)) return 0;
  const n = Number(s);
  if (!Number.isNaN(n)) return n === 1 ? 1 : 0;
  return 0;
}
function parseBloodPressure(bpRaw) {
  if (bpRaw === undefined || bpRaw === null) return null;
  const s = String(bpRaw).trim();
  if (s === "") return null;
  const asNum = Number(s);
  if (!Number.isNaN(asNum)) return asNum;
  const parts = s.split(/[^0-9.]+/).filter(Boolean);
  if (parts.length >= 2) {
    const n1 = Number(parts[0]),
      n2 = Number(parts[1]);
    if (!Number.isNaN(n1) && !Number.isNaN(n2)) return (n1 + n2) / 2;
  }
  const m = s.match(/(\d+(\.\d+)?)/);
  if (m) return Number(m[0]);
  return null;
}

/* Updated color palette using your specified colors */
const COLORS = {
  // area chart: avg BMI (blue-500) and avg BP (purple-500)
  areaBMI: "oklch(62.3% .214 259.815)",      // --color-blue-500
  areaBP: "oklch(62.7% .265 303.9)",         // --color-purple-500

  // stacked risk: noRisk (teal-600) and atRisk (pink-400)
  riskNo: "oklch(60% .118 184.704)",         // --color-teal-600
  riskAt: "oklch(71.8% .202 349.761)",       // --color-pink-400

  // cholesterol bars (blue-600)
  cholBar: "oklch(54.6% .245 262.881)",      // --color-blue-600

  // pie slices
  pieSlice1: "oklch(71.4% .203 305.504)",    // --color-purple-400
  pieSlice2: "oklch(70.7% .165 254.624)",    // --color-blue-400

  // scatter distinct colors (blue-700 + indigo-700)
  scatterNo: "oklch(48.8% .243 264.376)",    // --color-blue-700 with transparency
  scatterAt: "oklch(45.7% .240 293.267)",    // --color-indigo-700 with transparency

  // legend solid boxes
  scatterNoBox: "oklch(48.8% .243 264.376)", // blue-700
  scatterAtBox: "oklch(45.7% .240 293.267)", // indigo-700

  // text / card background
  textMuted: "#1e293b",
  cardBg: "rgba(255,255,255,0.98)",
  accentRed: "#dc2626",
};

function CustomLegend({ payload }) {
  if (!payload || !payload.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 8 }}>
      {payload.map((entry, i) => {
        const color = entry.color || (entry.payload && entry.payload.fill) || "#ccc";
        const label = entry.value ?? (entry.payload && entry.payload.name) ?? "";
        return (
          <div key={`legend-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                background: color,
                borderRadius: 3,
                display: "inline-block",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.04) inset",
              }}
            />
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [ageAgg, setAgeAgg] = useState([]);
  const [riskStack, setRiskStack] = useState([]);
  const [cholByAge, setCholByAge] = useState([]);
  const [summary, setSummary] = useState({ total: 0, atRisk: 0 });
  const [error, setError] = useState(null);
  const [rightView, setRightView] = useState("bar");
  const [scatterRisk0, setScatterRisk0] = useState([]);
  const [scatterRisk1, setScatterRisk1] = useState([]);

  useEffect(() => {
    fetch("/heart.csv")
      .then((r) => {
        if (!r.ok) throw new Error("Could not fetch /heart.csv — ensure file is in public/");
        return r.text();
      })
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const header = results.meta.fields || [];
            const detected = detectColumns(header);

            const rows = results.data.map((row) => {
              const getVal = (h) => (h ? row[h] : undefined);

              let bpVal = null;
              const bpRaw = getVal(detected.bp);
              if (bpRaw !== undefined && bpRaw !== null && String(bpRaw).trim() !== "") bpVal = parseBloodPressure(bpRaw);
              else {
                const sRaw = getVal(detected.systolic),
                  dRaw = getVal(detected.diastolic);
                const sNum = sRaw !== undefined ? Number(String(sRaw).trim()) : NaN;
                const dNum = dRaw !== undefined ? Number(String(dRaw).trim()) : NaN;
                if (!Number.isNaN(sNum) && !Number.isNaN(dNum)) bpVal = (sNum + dNum) / 2;
              }

              const ageRaw = getVal(detected.age) ?? getVal(detected.ageAlt);
              const bmiRaw = getVal(detected.bmi);
              const hrRaw = getVal(detected.hr);
              const cholRaw = getVal(detected.chol);
              const riskRaw = getVal(detected.risk);

              return {
                Age: Number(ageRaw) || 0,
                BMI: Number(bmiRaw) || 0,
                BloodPressure: bpVal === null || bpVal === undefined || Number.isNaN(bpVal) ? 0 : Number(bpVal),
                HeartRate: Number(hrRaw) || 0,
                Cholesterol: Number(cholRaw) || 0,
                HeartRisk: parseHeartRisk(riskRaw),
              };
            });

            processData(rows);
          },
          error: (err) => {
            setError("Error parsing CSV: " + String(err));
            setLoading(false);
          },
        });
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  function detectColumns(fields) {
    const norm = fields.map((f) => ({ orig: f, key: f, norm: (f || "").toString().toLowerCase().trim() }));
    const findExact = (candidates) => {
      for (const cand of candidates) {
        const lower = cand.toLowerCase();
        const match = norm.find((n) => n.norm === lower);
        if (match) return match.key;
      }
      return null;
    };
    const findContains = (substrings) => {
      for (const n of norm) {
        for (const s of substrings) {
          if (n.norm.includes(s)) return n.key;
        }
      }
      return null;
    };
    const age = findExact(["age", "age_years", "age (years)"]) || findContains(["age"]);
    const bmi = findExact(["bmi", "body_mass_index", "body mass index"]) || findContains(["bmi"]);
    const chol = findExact(["cholesterol", "chol", "cholestrol"]) || findContains(["chol"]);
    const hr = findExact(["heartrate", "heart_rate", "heart rate", "hr"]) || findContains(["heart rate", "heartrate", "hr"]);
    const bp = findExact(["bloodpressure", "blood_pressure", "blood pressure"]) || findContains(["blood pressure", "bloodpressure", " bp", "systolic"]);
    const systolic = findExact(["systolic", "systolic_bp", "sbp"]) || findContains(["systolic", "sbp"]);
    const diastolic = findExact(["diastolic", "diastolic_bp", "dbp"]) || findContains(["diastolic", "dbp"]);
    const risk =
      findExact(["heart attack risk", "heartattack", "heart_risk", "heartattackrisk", "risk", "target"]) ||
      findContains(["heart attack", "heartattack", "risk", "target"]);
    return { age, ageAlt: null, bmi, chol, hr, bp, systolic, diastolic, risk };
  }

  function processData(rows) {
    const filtered = rows.filter((r) => r && (r.Age > 0 || r.BMI > 0 || r.BloodPressure > 0 || r.Cholesterol > 0));
    if (filtered.length === 0) {
      setError("No usable rows found. Check column names and data in CSV.");
      setLoading(false);
      return;
    }

    const total = filtered.length;
    const atRisk = filtered.reduce((acc, r) => acc + (r.HeartRisk === 1 ? 1 : 0), 0);
    setSummary({ total, atRisk });

    const binMap = {};
    filtered.forEach((r) => {
      const bin = ageBinLabel(r.Age || 0);
      if (!binMap[bin]) binMap[bin] = { bin, bmiSum: 0, bpSum: 0, cholSum: 0, count: 0, risk0: 0, risk1: 0 };
      binMap[bin].bmiSum += Number(r.BMI || 0);
      binMap[bin].bpSum += Number(r.BloodPressure || 0);
      binMap[bin].cholSum += Number(r.Cholesterol || 0);
      binMap[bin].count += 1;
      if (r.HeartRisk === 1) binMap[bin].risk1 += 1;
      else binMap[bin].risk0 += 1;
    });
    const bins = Object.values(binMap).sort((a, b) => Number(a.bin.split("-")[0]) - Number(b.bin.split("-")[0]));
    setAgeAgg(
      bins.map((b) => ({
        date: b.bin,
        avgBMI: Math.round((b.bmiSum / b.count) * 10) / 10,
        avgBP: Math.round((b.bpSum / b.count) * 10) / 10,
      }))
    );
    setRiskStack(bins.map((b) => ({ ageBin: b.bin, noRisk: b.risk0, atRisk: b.risk1, total: b.count })));
    setCholByAge(bins.map((b) => ({ date: b.bin, chol: Math.round((b.cholSum / b.count) * 10) / 10 })));

    const ptsNo = [];
    const ptsYes = [];
    filtered.forEach((r) => {
      if (!r.BMI || !r.HeartRate) return;
      const p = { BMI: Number(r.BMI), HeartRate: Number(r.HeartRate), Cholesterol: Number(r.Cholesterol || 0) };
      if (r.HeartRisk === 1) ptsYes.push(p);
      else ptsNo.push(p);
    });

    const MAX_POINTS = 300;
    function sampleArray(arr, max) {
      if (arr.length <= max) return arr.slice();
      const step = arr.length / max;
      const out = [];
      for (let i = 0; i < max; i++) {
        const idx = Math.floor(i * step);
        out.push(arr[idx]);
      }
      return out;
    }
    setScatterRisk0(sampleArray(ptsNo, Math.floor(MAX_POINTS / 2)));
    setScatterRisk1(sampleArray(ptsYes, Math.ceil(MAX_POINTS / 2)));

    setLoading(false);
  }

  if (loading) return <div style={{ padding: 18 }}>Loading…</div>;
  if (error) return <div style={{ padding: 18, color: "crimson" }}>Error: {error}</div>;

  const percentAtRisk = Math.round((summary.atRisk / (summary.total || 1)) * 1000) / 10;

  const pieData = [
    { name: "At Risk", value: summary.atRisk },
    { name: "No Risk", value: Math.max(0, summary.total - summary.atRisk) },
  ];
  const PIE_COLORS = [COLORS.pieSlice1, COLORS.pieSlice2];

  const SMALL_CARD_W = 380;
  const MID_CARD_W = 480;
  const page = {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f1f5f9, #e2e8f0)",
    fontFamily: "Inter, Roboto, sans-serif",
    color: "#1e293b",
    padding: "32px 0",
    boxSizing: "border-box",
  };
  const wrapper = { maxWidth: 1440, margin: "0 auto", padding: "0 48px", boxSizing: "border-box" };
  const headerRow = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 12 };
  const summaryBox = { textAlign: "right", minWidth: 220 };

  const cardsRow = {
    display: "flex",
    gap: 28,
    alignItems: "flex-start",
    flexWrap: "nowrap",
    overflowX: "auto",
    paddingBottom: 6,
    justifyContent: "center",
    paddingLeft: 12,
    paddingRight: 12,
  };

  const card = {
    background: COLORS.cardBg,
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 14px 36px rgba(2,6,23,0.06)",
    width: SMALL_CARD_W,
    boxSizing: "border-box",
    flex: "0 0 auto",
  };
  const cardLarge = { ...card, width: MID_CARD_W };

  return (
    <div style={page}>
      <div style={wrapper}>
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: COLORS.textMuted }}>Heart Disease Data Dashboard</h1>
            <div style={{ marginTop: 6, color: COLORS.textMuted }}>Using Age, BMI, Blood Pressure, Heart Rate, Cholesterol & Risk</div>
          </div>

          <div style={summaryBox}>
            <div style={{ fontSize: 12, color: "#64748b" }}>Total records</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{summary.total}</div>
            <div style={{ marginTop: 8, color: COLORS.textMuted }}>
              At risk: <span style={{ color: COLORS.accentRed, fontWeight: 800 }}>{summary.atRisk}</span> ({percentAtRisk}%)
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ ...card, width: "100%", padding: 18, boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", wordBreak: "break-word" }}>Heart Rate vs BMI (bubble = Cholesterol)</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>X = BMI • Y = Heart Rate • Bubble = Cholesterol</div>
            </div>

            <div style={{ height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis type="number" dataKey="BMI" name="BMI" tick={{ fontSize: 12, fill: COLORS.textMuted }} domain={["auto", "auto"]} label={{ value: "BMI (kg/m²)", position: "bottom", offset: 0, fill: COLORS.textMuted }} />
                  <YAxis type="number" dataKey="HeartRate" name="Heart Rate" tick={{ fontSize: 12, fill: COLORS.textMuted }} domain={["auto", "auto"]} label={{ value: "Heart Rate (bpm)", angle: -90, position: "insideLeft", fill: COLORS.textMuted }} />
                  <ZAxis dataKey="Cholesterol" range={[30, 140]} name="Cholesterol" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value, name) => [value, name]} labelFormatter={(label) => `BMI: ${label}`} />
                  <Legend
                    content={() => (
                      <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 12, height: 12, background: COLORS.scatterNoBox, borderRadius: 2 }} />
                          <span style={{ color: COLORS.textMuted, fontSize: 13 }}>No Risk</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 12, height: 12, background: COLORS.scatterAtBox, borderRadius: 2 }} />
                          <span style={{ color: COLORS.textMuted, fontSize: 13 }}>At Risk</span>
                        </div>
                      </div>
                    )}
                  />
                  <Scatter name="No Risk" data={scatterRisk0} fill={COLORS.scatterNo} fillOpacity={0.7} />
                  <Scatter name="At Risk" data={scatterRisk1} fill={COLORS.scatterAt} fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <div style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>
              Bubble size represents cholesterol — larger bubble = higher cholesterol.
            </div>
          </div>
        </div>

        <div style={cardsRow}>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", wordBreak: "break-word" }}>Avg BMI & Blood Pressure by Age</div>
            </div>

            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ageAgg} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.areaBMI} stopOpacity={0.45} />
                      <stop offset="95%" stopColor={COLORS.areaBMI} stopOpacity={0.08} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.areaBP} stopOpacity={0.45} />
                      <stop offset="95%" stopColor={COLORS.areaBP} stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                  <YAxis tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <Tooltip />
                  <Legend content={CustomLegend} verticalAlign="bottom" />
                  <Area type="monotone" dataKey="avgBMI" stroke={COLORS.areaBMI} fill="url(#g1)" name="Avg BMI" strokeWidth={2} />
                  <Area type="monotone" dataKey="avgBP" stroke={COLORS.areaBP} fill="url(#g2)" name="Avg Blood Pressure" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={cardLarge}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", wordBreak: "break-word" }}>Heart Attack Risk by Age Bin</div>
            </div>
            <div style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskStack} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <XAxis dataKey="ageBin" tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                  <YAxis tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <Tooltip />
                  <Legend content={CustomLegend} />
                  <Bar dataKey="noRisk" stackId="a" name="No Risk" fill={COLORS.riskNo} />
                  <Bar dataKey="atRisk" stackId="a" name="At Risk" fill={COLORS.riskAt} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b", wordBreak: "break-word" }}>{rightView === "bar" ? "Avg Cholesterol by Age" : "Overall Risk Distribution"}</div>
              <div>
                <button
                  onClick={() => setRightView((v) => (v === "bar" ? "pie" : "bar"))}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "none",
                    background: "oklch(70.7% .165 254.624)",
                    color: "white",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  View: {rightView === "bar" ? "Pie" : "Bar"}
                </button>
              </div>
            </div>

            <div style={{ height: 320 }}>
              {rightView === "bar" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={cholByAge} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                    <YAxis tick={{ fontSize: 12, fill: COLORS.textMuted }} />
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <Tooltip />
                    <Legend content={CustomLegend} />
                    <Bar dataKey="chol" barSize={20} fill={COLORS.cholBar} name="Avg Cholesterol" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Legend content={CustomLegend} />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius={48}
                      outerRadius={84}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}