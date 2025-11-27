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

/* Responsive dashboard with friendlier axis ticks and formatting.
   Place public/heart.csv in your project.
*/

const AGE_BIN_SIZE = 5;
function ageBinLabel(age) {
  const low = Math.floor(age / AGE_BIN_SIZE) * AGE_BIN_SIZE;
  return `${low}-${low + AGE_BIN_SIZE - 1}`;
}
function parseHeartRisk(raw) {
  if (!raw && raw !== 0) return 0;
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
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/* Colors (your OKLCH / tokens) */
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

function CustomLegend({ payload }) {
  if (!payload || !payload.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, paddingTop: 8 }}>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 12, height: 12, background: entry.color || "#ccc", borderRadius: 3 }} />
          <span style={{ fontSize: 13, color: COLORS.textMuted }}>{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

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
        if (!r.ok) throw new Error("Place heart.csv in public/");
        return r.text();
      })
      .then((csv) => {
        Papa.parse(csv, {
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
      Age: Number(row["Age"] || row["age"] || row["Age(years)"]) || 0,
      BMI: Number(row["BMI"] || row["bmi"]) || 0,
      BloodPressure: parseBloodPressure(row["BloodPressure"] || row["blood_pressure"] || row["Blood Pressure"]) || 0,
      HeartRate: Number(row["Heart Rate"] || row["heartrate"] || row["HeartRate"]) || 0,
      Cholesterol: Number(row["Cholesterol"] || row["cholesterol"] || row["chol"]) || 0,
      HeartRisk: parseHeartRisk(row["Heart Attack Risk"] || row["HeartRisk"] || row["risk"]),
    }));

    const valid = cleaned.filter((r) => r.Age > 0 || r.BMI > 0 || r.HeartRate > 0 || r.Cholesterol > 0);
    if (!valid.length) {
      setError("No usable rows found");
      setLoading(false);
      return;
    }

    const total = valid.length;
    const atRisk = valid.reduce((acc, r) => acc + (r.HeartRisk === 1 ? 1 : 0), 0);
    setSummary({ total, atRisk });

    // bins
    const bins = {};
    valid.forEach((r) => {
      const bin = ageBinLabel(r.Age || 0);
      if (!bins[bin]) bins[bin] = { bin, bmiSum: 0, bpSum: 0, cholSum: 0, count: 0, r0: 0, r1: 0 };
      bins[bin].bmiSum += r.BMI;
      bins[bin].bpSum += r.BloodPressure;
      bins[bin].cholSum += r.Cholesterol;
      bins[bin].count += 1;
      if (r.HeartRisk === 1) bins[bin].r1++; else bins[bin].r0++;
    });
    const sorted = Object.values(bins).sort((a, b) => Number(a.bin.split("-")[0]) - Number(b.bin.split("-")[0]));
    setAgeAgg(sorted.map((b) => ({ date: b.bin, avgBMI: +(b.bmiSum / b.count).toFixed(1), avgBP: +(b.bpSum / b.count).toFixed(1) })));
    setRiskStack(sorted.map((b) => ({ ageBin: b.bin, noRisk: b.r0, atRisk: b.r1 })));
    setCholByAge(sorted.map((b) => ({ date: b.bin, chol: +(b.cholSum / b.count).toFixed(1) })));

    const pts0 = [], pts1 = [];
    valid.forEach((r) => {
      if (!r.BMI || !r.HeartRate) return;
      const p = { BMI: r.BMI, HeartRate: r.HeartRate, Cholesterol: r.Cholesterol };
      if (r.HeartRisk === 1) pts1.push(p);
      else pts0.push(p);
    });

    const sample = (arr, n) => {
      if (arr.length <= n) return arr.slice();
      const step = arr.length / n;
      return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
    };
    setScatterRisk0(sample(pts0, 220));
    setScatterRisk1(sample(pts1, 220));

    setLoading(false);
  }

  if (loading) return <div style={{ padding: 18 }}>Loading…</div>;
  if (error) return <div style={{ padding: 18, color: "crimson" }}>Error: {error}</div>;

  const percentAtRisk = Math.round((summary.atRisk / (summary.total || 1)) * 1000) / 10;
  const pieData = [{ name: "At Risk", value: summary.atRisk }, { name: "No Risk", value: Math.max(0, summary.total - summary.atRisk) }];
  const PIE_COLORS = [COLORS.pieSlice1, COLORS.pieSlice2];

  // embedded responsive CSS
  const embeddedStyles = `
    .dash-wrapper { max-width:1400px; margin:0 auto; padding:0 20px; box-sizing:border-box; }
    .header-center { text-align:center; margin-bottom:22px; }
    .scatter-card { background:${COLORS.cardBg}; border-radius:16px; padding:22px; box-shadow:0 14px 36px rgba(2,6,23,0.06); width:100%; max-width:980px; margin:0 auto 18px; box-sizing:border-box;}
    .cards-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:28px; align-items:start; margin-top:18px; }
    .card { background:${COLORS.cardBg}; border-radius:16px; padding:20px; box-shadow:0 14px 36px rgba(2,6,23,0.06); box-sizing:border-box; }
    .chart-large { height:420px; }
    .chart-medium { height:300px; }
    .chart-small { height:220px; }
    @media (max-width:600px) {
      .cards-grid { grid-template-columns: 1fr; gap:16px; padding:0 8px; }
      .card { padding:14px; border-radius:14px; }
      .scatter-card { padding:14px; max-width:100%; margin-bottom:12px; }
      .chart-large { height:260px; }
      .chart-medium { height:220px; }
      .chart-small { height:180px; }
      .header-center h1 { font-size:26px; }
    }
    @media (min-width:601px) and (max-width:1024px) {
      .cards-grid { grid-template-columns: repeat(2, 1fr); gap:20px; }
      .chart-large { height:360px; }
      .chart-medium { height:260px; }
      .chart-small { height:200px; }
    }
  `;

  // helper tick formatters
  const roundTick = (v) => {
    if (v === null || v === undefined) return "";
    if (Math.abs(v) >= 1000) return Math.round(v); // preserve integer for big numbers
    // if nearly integer, show integer
    if (Math.abs(v - Math.round(v)) < 0.01) return Math.round(v);
    return Number(v.toFixed(0)); // integer-ish
  };
  const oneDec = (v) => (typeof v === "number" ? Number(v.toFixed(1)) : v);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#f1f5f9,#eef3f8)" }}>
      <style>{embeddedStyles}</style>

      <div className="dash-wrapper">
        <div className="header-center">
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, color: COLORS.textMuted }}>Heart Disease Data Dashboard</h1>
          <div style={{ marginTop: 6, color: "#475569" }}>Using Age, BMI, Blood Pressure, Heart Rate, Cholesterol & Risk</div>
          <div style={{ marginTop: 12, fontSize: 15, color: COLORS.textMuted }}>
            <strong>Total records:</strong> {summary.total} &nbsp;&nbsp;•&nbsp;&nbsp;
            <strong style={{ color: COLORS.accentRed }}>At risk: {summary.atRisk} ({percentAtRisk}%)</strong>
          </div>
        </div>

        {/* Large centered scatter */}
        <div className="scatter-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textMuted }}>Heart Rate vs BMI (bubble = Cholesterol)</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>X = BMI • Y = Heart Rate • Bubble = Cholesterol</div>
          </div>

          <div className="chart-large">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, left: 40, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                <XAxis
                  type="number"
                  dataKey="BMI"
                  tick={{ fill: COLORS.textMuted, fontSize: 12 }}
                  tickFormatter={roundTick}
                  domain={["dataMin - 1", "dataMax + 1"]}
                  label={{ value: "BMI (kg/m²)", position: "bottom", offset: 6 }}
                />
                <YAxis
                  type="number"
                  dataKey="HeartRate"
                  tick={{ fill: COLORS.textMuted, fontSize: 12 }}
                  tickFormatter={roundTick}
                  domain={["dataMin - 5", "dataMax + 5"]}
                  label={{ value: "Heart Rate (bpm)", angle: -90, position: "insideLeft", offset: -8 }}
                />
                <ZAxis dataKey="Cholesterol" range={[40, 140]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Legend
                  content={() => (
                    <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 12, height: 12, background: COLORS.scatterNoBox }} /> <span style={{ color: COLORS.textMuted }}>No Risk</span></div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 12, height: 12, background: COLORS.scatterAtBox }} /> <span style={{ color: COLORS.textMuted }}>At Risk</span></div>
                    </div>
                  )}
                />
                <Scatter name="No Risk" data={scatterRisk0} fill={COLORS.scatterNo} />
                <Scatter name="At Risk" data={scatterRisk1} fill={COLORS.scatterAt} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div style={{ marginTop: 12, color: "#64748b", fontSize: 13 }}>Bubble size represents cholesterol — larger bubble = higher cholesterol.</div>
        </div>

        {/* three smaller charts */}
        <div className="cards-grid">
          {/* Area BMI/BP */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Avg BMI & Blood Pressure by Age</div>
            </div>
            <div className="chart-medium">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ageAgg} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                  <XAxis dataKey="date" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} tickFormatter={oneDec} />
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <Tooltip />
                  <Legend content={CustomLegend} verticalAlign="bottom" />
                  <Area type="monotone" dataKey="avgBMI" stroke={COLORS.areaBMI} fill="url(#g1)" name="Avg BMI" strokeWidth={2} />
                  <Area type="monotone" dataKey="avgBP" stroke={COLORS.areaBP} fill="url(#g2)" name="Avg Blood Pressure" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Stacked risk */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Heart Attack Risk by Age Bin</div>
            </div>
            <div className="chart-medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskStack} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="ageBin" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} tickFormatter={roundTick} tickCount={6} />
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <Tooltip />
                  <Legend content={CustomLegend} />
                  <Bar dataKey="noRisk" stackId="a" name="No Risk" fill={COLORS.riskNo} />
                  <Bar dataKey="atRisk" stackId="a" name="At Risk" fill={COLORS.riskAt} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cholesterol (bar or pie) */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{rightView === "bar" ? "Avg Cholesterol by Age" : "Overall Risk Distribution"}</div>
              <button onClick={() => setRightView((v) => (v === "bar" ? "pie" : "bar"))} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: COLORS.pieSlice2, color: "white", fontWeight: 700, cursor: "pointer" }}>
                View: {rightView === "bar" ? "Pie" : "Bar"}
              </button>
            </div>
            <div className="chart-medium">
              {rightView === "bar" ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={cholByAge} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                    <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} tickFormatter={roundTick} tickCount={6} />
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <Tooltip />
                    <Legend content={CustomLegend} />
                    <Bar dataKey="chol" barSize={18} fill={COLORS.cholBar} name="Avg Cholesterol" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Legend content={CustomLegend} />
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={44} outerRadius={72} label>
                      <Cell fill={PIE_COLORS[0]} />
                      <Cell fill={PIE_COLORS[1]} />
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
