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

/* ---------- helpers ---------- */
const AGE_BIN_SIZE = 5;
function ageBinLabel(age) {
  const low = Math.floor(age / AGE_BIN_SIZE) * AGE_BIN_SIZE;
  return `${low}-${low + AGE_BIN_SIZE - 1}`;
}
function parseHeartRisk(raw) {
  if (!raw) return 0;
  const s = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "high"].includes(s)) return 1;
  return 0;
}
function parseBloodPressure(bpRaw) {
  if (!bpRaw) return null;
  const s = String(bpRaw).trim();
  const parts = s.split(/[^0-9.]+/).filter(Boolean);
  if (parts.length >= 2) {
    const n1 = Number(parts[0]), n2 = Number(parts[1]);
    if (!isNaN(n1) && !isNaN(n2)) return (n1 + n2) / 2;
  }
  return Number(s) || null;
}

/* ---------- colors ---------- */
const COLORS = {
  areaBMI: "oklch(62.3% .214 259.815)",
  areaBP: "oklch(62.7% .265 303.9)",
  riskNo: "oklch(60% .118 184.704)",
  riskAt: "oklch(71.8% .202 349.761)",
  cholBar: "oklch(54.6% .245 262.881)",
  pieSlice1: "oklch(71.4% .203 305.504)",
  pieSlice2: "oklch(70.7% .165 254.624)",
  scatterNo: "oklch(48.8% .243 264.376)",
  scatterAt: "oklch(45.7% .240 293.267)",
  scatterNoBox: "oklch(48.8% .243 264.376)",
  scatterAtBox: "oklch(45.7% .240 293.267)",
  textMuted: "#1e293b",
  cardBg: "rgba(255,255,255,0.98)",
  accentRed: "#dc2626",
};

/* ---------- legend ---------- */
function CustomLegend({ payload }) {
  if (!payload || !payload.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 8 }}>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 12, height: 12, background: entry.color, borderRadius: 3 }} />
          <span style={{ fontSize: 13, color: COLORS.textMuted }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- main ---------- */
export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [ageAgg, setAgeAgg] = useState([]);
  const [riskStack, setRiskStack] = useState([]);
  const [cholByAge, setCholByAge] = useState([]);
  const [summary, setSummary] = useState({ total: 0, atRisk: 0 });
  const [rightView, setRightView] = useState("bar");
  const [scatterRisk0, setScatterRisk0] = useState([]);
  const [scatterRisk1, setScatterRisk1] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/heart.csv")
      .then((r) => {
        if (!r.ok) throw new Error("Place heart.csv inside public/ folder");
        return r.text();
      })
      .then((text) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => processData(res.data),
          error: (err) => setError(String(err)),
        });
      })
      .catch((e) => setError(String(e)));
  }, []);

  function processData(rows) {
    const cleaned = rows.map((row) => ({
      Age: Number(row.Age) || 0,
      BMI: Number(row.BMI) || 0,
      BloodPressure: parseBloodPressure(row.BloodPressure) || 0,
      Cholesterol: Number(row.Cholesterol) || 0,
      HeartRate: Number(row["Heart Rate"]) || 0,
      HeartRisk: parseHeartRisk(row["Heart Attack Risk"]),
    }));

    const valid = cleaned.filter(
      (r) => r.Age > 0 || r.BMI > 0 || r.HeartRate > 0 || r.Cholesterol > 0 || r.BloodPressure > 0
    );

    if (!valid.length) {
      setError("No valid rows found");
      setLoading(false);
      return;
    }

    const total = valid.length;
    const atRisk = valid.reduce((acc, r) => acc + (r.HeartRisk === 1 ? 1 : 0), 0);
    setSummary({ total, atRisk });

    // group by age bins
    const map = {};
    valid.forEach((r) => {
      const bin = ageBinLabel(r.Age);
      if (!map[bin]) map[bin] = { bin, bmi: 0, bp: 0, chol: 0, c: 0, r0: 0, r1: 0 };
      map[bin].bmi += r.BMI;
      map[bin].bp += r.BloodPressure;
      map[bin].chol += r.Cholesterol;
      map[bin].c++;
      if (r.HeartRisk === 1) map[bin].r1++;
      else map[bin].r0++;
    });

    const bins = Object.values(map).sort((a, b) => Number(a.bin.split("-")[0]) - Number(b.bin.split("-")[0]));

    setAgeAgg(bins.map((b) => ({ date: b.bin, avgBMI: +(b.bmi / b.c).toFixed(1), avgBP: +(b.bp / b.c).toFixed(1) })));
    setRiskStack(bins.map((b) => ({ ageBin: b.bin, noRisk: b.r0, atRisk: b.r1 })));
    setCholByAge(bins.map((b) => ({ date: b.bin, chol: +(b.chol / b.c).toFixed(1) })));

    // scatter samples
    const pts0 = [], pts1 = [];
    valid.forEach((r) => {
      if (!r.BMI || !r.HeartRate) return;
      const p = { BMI: r.BMI, HeartRate: r.HeartRate, Cholesterol: r.Cholesterol };
      if (r.HeartRisk === 1) pts1.push(p);
      else pts0.push(p);
    });
    setScatterRisk0(pts0.slice(0, 220));
    setScatterRisk1(pts1.slice(0, 220));

    setLoading(false);
  }

  // layout helpers: ensure the top scatter fits inside wrapper precisely
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1400;
  const isMobile = viewportW < 768;
  const isDesktop = viewportW >= 1024;

  // wrapper (center content) — keep maxWidth stable
  const wrapper = { maxWidth: 1400, margin: "0 auto", padding: "0 20px", boxSizing: "border-box" };

  // TOP wide scatter card: use a safe max width slightly less than wrapper to avoid overflow
  // 1100 works well for most laptop widths and matches your screenshot behavior
  const scatterCard = {
    background: COLORS.cardBg,
    borderRadius: 16,
    padding: 22,
    boxShadow: "0 14px 36px rgba(2,6,23,0.06)",
    width: "100%",
    maxWidth: 1100, // IMPORTANT: prevents overflow at 100% zoom
    margin: "18px auto",
    boxSizing: "border-box",
  };

  // bottom row: keep fixed widths on desktop (left small, mid bigger, right small)
  const cardsRow = {
    display: "flex",
    gap: 28,
    justifyContent: "center",
    alignItems: "flex-start",
    flexWrap: isMobile ? "wrap" : "nowrap",
    marginTop: 24,
  };
  const leftW = isDesktop ? 360 : isMobile ? "100%" : "48%";
  const midW = isDesktop ? 520 : isMobile ? "100%" : "48%";
  const rightW = isDesktop ? 360 : isMobile ? "100%" : "100%";

  const cardBase = (w) => ({
    background: COLORS.cardBg,
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 14px 36px rgba(2,6,23,0.06)",
    width: w,
    boxSizing: "border-box",
  });

  if (loading) return <div style={{ padding: 18 }}>Loading…</div>;
  if (error) return <div style={{ padding: 18, color: "crimson" }}>Error: {error}</div>;

  const percentAtRisk = Math.round((summary.atRisk / (summary.total || 1)) * 1000) / 10;
  const pieData = [{ name: "At Risk", value: summary.atRisk }, { name: "No Risk", value: Math.max(0, summary.total - summary.atRisk) }];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f1f5f9,#eef3f8)" }}>
      <div style={wrapper}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, color: "#0f172a" }}>Heart Disease Dashboard</h1>
            <div style={{ marginTop: 6, color: "#475569" }}>Using Age, BMI, Blood Pressure, Heart Rate, Cholesterol & Risk</div>
          </div>

          <div style={{ textAlign: "right", minWidth: 180 }}>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>Total records</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{summary.total}</div>
            <div style={{ marginTop: 8, color: "#475569" }}>
              At risk: <span style={{ color: COLORS.accentRed, fontWeight: 800 }}>{summary.atRisk}</span> ({percentAtRisk}%)
            </div>
          </div>
        </div>

        {/* TOP WIDE SCATTER CARD */}
        <div style={scatterCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Heart Rate vs BMI (bubble = Cholesterol)</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>X = BMI • Y = Heart Rate • Bubble = Cholesterol</div>
          </div>

          {/* IMPORTANT: chart margins adjusted so axis ticks/labels don't overflow */}
          <div style={{ height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 22, left: 48, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                <XAxis
                  type="number"
                  dataKey="BMI"
                  tick={{ fill: COLORS.textMuted }}
                  label={{ value: "BMI (kg/m²)", position: "bottom", offset: 6 }}
                  domain={["dataMin - 1", "dataMax + 1"]}
                />
                <YAxis
                  type="number"
                  dataKey="HeartRate"
                  tick={{ fill: COLORS.textMuted }}
                  label={{ value: "Heart Rate (bpm)", angle: -90, position: "insideLeft", offset: -6 }}
                  domain={["dataMin - 5", "dataMax + 5"]}
                />
                <ZAxis dataKey="Cholesterol" range={[40, 140]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Legend
                  content={() => (
                    <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ width: 12, height: 12, background: COLORS.scatterNoBox }} />
                        <span style={{ color: COLORS.textMuted }}>No Risk</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ width: 12, height: 12, background: COLORS.scatterAtBox }} />
                        <span style={{ color: COLORS.textMuted }}>At Risk</span>
                      </div>
                    </div>
                  )}
                />
                <Scatter data={scatterRisk0} fill={COLORS.scatterNo} />
                <Scatter data={scatterRisk1} fill={COLORS.scatterAt} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>Bubble size represents cholesterol — larger bubble = higher cholesterol.</div>
        </div>

        {/* BOTTOM THREE CARDS (fixed widths on desktop to avoid stretched look) */}
        <div style={cardsRow}>
          <div style={cardBase(leftW)}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Avg BMI & Blood Pressure by Age</div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ageAgg} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
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
                  <XAxis dataKey="date" tick={{ fill: COLORS.textMuted }} />
                  <YAxis tick={{ fill: COLORS.textMuted }} />
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <Tooltip />
                  <Area dataKey="avgBMI" stroke={COLORS.areaBMI} fill="url(#g1)" name="Avg BMI" />
                  <Area dataKey="avgBP" stroke={COLORS.areaBP} fill="url(#g2)" name="Avg BP" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "#64748b" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, background: COLORS.areaBMI, borderRadius: 3 }} /> Avg BMI</span>
              {"  "}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: 14 }}><span style={{ width: 12, height: 12, background: COLORS.areaBP, borderRadius: 3 }} /> Avg Blood Pressure</span>
            </div>
          </div>

          <div style={cardBase(midW)}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Heart Attack Risk by Age Bin</div>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskStack} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="ageBin" tick={{ fill: COLORS.textMuted }} />
                  <YAxis tick={{ fill: COLORS.textMuted }} />
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <Tooltip />
                  <Legend content={CustomLegend} />
                  <Bar dataKey="noRisk" stackId="a" fill={COLORS.riskNo} name="No Risk" />
                  <Bar dataKey="atRisk" stackId="a" fill={COLORS.riskAt} name="At Risk" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={cardBase(rightW)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{rightView === "bar" ? "Avg Cholesterol by Age" : "Overall Risk Distribution"}</div>
              <button onClick={() => setRightView((v) => (v === "bar" ? "pie" : "bar"))} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: COLORS.pieSlice2, color: "white", fontWeight: 700, cursor: "pointer" }}>
                View: {rightView === "bar" ? "Pie" : "Bar"}
              </button>
            </div>
            <div style={{ height: 260 }}>
              {rightView === "bar" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={cholByAge}>
                    <XAxis dataKey="date" tick={{ fill: COLORS.textMuted }} />
                    <YAxis tick={{ fill: COLORS.textMuted }} />
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <Tooltip />
                    <Legend content={CustomLegend} />
                    <Bar dataKey="chol" fill={COLORS.cholBar} name="Avg Cholesterol" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Legend content={CustomLegend} />
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={44} outerRadius={72} label>
                      <Cell fill={COLORS.pieSlice1} />
                      <Cell fill={COLORS.pieSlice2} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div style={{ marginTop: 8, color: "#64748b", fontSize: 13 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, background: COLORS.cholBar, borderRadius: 3 }} /> Avg Cholesterol</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
