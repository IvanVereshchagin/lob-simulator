import { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

const API_URL = "http://localhost:8000";
const MAX_HISTORY = 50;

const card = {
  background: "white",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  padding: "16px",
  marginBottom: "16px",
};

const sectionTitle = {
  margin: "0 0 12px 0",
  fontSize: "12px",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export default function App() {
  const [state, setState] = useState({ bestBid: -1, bestAsk: -1, bidDepth: [], askDepth: [], recentEvents: [] });
  const [isRunning, setIsRunning] = useState(false);
  const [modelType, setModelType] = useState("santa_fe");
  const [lam, setLam] = useState(2.0);
  const [mu, setMu] = useState(1.0);
  const [nu, setNu] = useState(0.5);
  const [phi0, setPhi0] = useState(1.0);
  const [branchingRatio, setBranchingRatio] = useState(0.7);
  const [decayRate, setDecayRate] = useState(0.5);
  const [rho, setRho] = useState(0.0);
  const [minPrice, setMinPrice] = useState(95);
  const [maxPrice, setMaxPrice] = useState(105);
  const [minVolume, setMinVolume] = useState(1);
  const [maxVolume, setMaxVolume] = useState(50);
  const [bidLevels, setBidLevels] = useState(10);
  const [askLevels, setAskLevels] = useState(10);
  const [latencyBreakdown, setLatencyBreakdown] = useState(null);
  const [avgLatency, setAvgLatency] = useState(null);
  const [history, setHistory] = useState([]);
  const [autocorrData, setAutocorrData] = useState([]);

  const [metaSide, setMetaSide] = useState("Buy");
  const [metaVolume, setMetaVolume] = useState(500);
  const [metaChildren, setMetaChildren] = useState(20);
  const [metaStatus, setMetaStatus] = useState({ active: false, lastCompleted: null });
  const [experimentLog, setExperimentLog] = useState([]);
  const lastLoggedRef = useRef(null);

  const intervalRef = useRef(null);
  const latencyHistoryRef = useRef([]);
  const stepCounterRef = useRef(0);

  const recordHistory = (data) => {
    if (data.bestBid === -1 || data.bestAsk === -1) return;
    const mid = (data.bestBid + data.bestAsk) / 2;
    const spreadValue = data.bestAsk - data.bestBid;
    stepCounterRef.current += 1;
    setHistory((prev) => {
      const next = [...prev, { step: stepCounterRef.current, mid, spread: spreadValue }];
      const trimmed = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      return trimmed.map((point, idx) => {
        const windowStart = Math.max(0, idx - 9);
        const window = trimmed.slice(windowStart, idx + 1);
        const spreadMA = window.reduce((sum, p) => sum + p.spread, 0) / window.length;
        return { ...point, spreadMA };
      });
    });
  };

  const fetchAutocorrelation = async () => {
    const res = await fetch(`${API_URL}/autocorrelation?maxLag=50`);
    const data = await res.json();
    setAutocorrData(data.points || []);
  };

  const fetchMetaStatus = async () => {
    const res = await fetch(`${API_URL}/metaorder/status`);
    const data = await res.json();
    setMetaStatus(data);

    if (data.lastCompleted && data.lastCompleted.impact != null) {
      const key = `${data.lastCompleted.decisionPrice}-${data.lastCompleted.finalPrice}-${data.lastCompleted.volume}-${data.lastCompleted.numChildren}`;
      if (lastLoggedRef.current !== key) {
        lastLoggedRef.current = key;
        setExperimentLog((prev) => [
          {
            volume: data.lastCompleted.volume,
            side: data.lastCompleted.side,
            children: data.lastCompleted.numChildren,
            impact: data.lastCompleted.impact,
            sqrtQ: Math.sqrt(data.lastCompleted.volume),
            absImpact: Math.abs(data.lastCompleted.impact),
          },
          ...prev,
        ]);
      }
    }
  };

  const step = async (n) => {
    const startTime = performance.now();
    const res = await fetch(`${API_URL}/step?n=${n}`, { method: "POST" });
    const data = await res.json();
    const endTime = performance.now();

    const totalLatency = endTime - startTime;
    const cppMs = data.serverTiming?.cppMs ?? null;
    const serializationMs = data.serverTiming?.serializationMs ?? null;
    const networkMs = cppMs !== null && serializationMs !== null ? totalLatency - cppMs - serializationMs : null;

    setLatencyBreakdown({ total: totalLatency, cpp: cppMs, serialization: serializationMs, network: networkMs });
    latencyHistoryRef.current.push(totalLatency);
    if (latencyHistoryRef.current.length > 20) latencyHistoryRef.current.shift();
    setAvgLatency(latencyHistoryRef.current.reduce((a, b) => a + b, 0) / latencyHistoryRef.current.length);

    recordHistory(data);
    setState(data);
    fetchMetaStatus();
    fetchAutocorrelation();
  };

  const reset = async () => {
    const res = await fetch(`${API_URL}/reset`, { method: "POST" });
    const data = await res.json();
    setState(data);
    setHistory([]);
    stepCounterRef.current = 0;
    latencyHistoryRef.current = [];
    setLatencyBreakdown(null);
    setAvgLatency(null);
    setMetaStatus({ active: false, lastCompleted: null });
    setAutocorrData([]);
  };

  const sendParams = async (overrides = {}) => {
    const payload = { modelType, lam, mu, nu, minPrice, maxPrice, minVolume, maxVolume, phi0, branchingRatio, decayRate, rho, ...overrides };
    await fetch(`${API_URL}/params`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const startMetaorder = async () => {
    await fetch(`${API_URL}/metaorder/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side: metaSide, volume: metaVolume, numChildren: metaChildren }),
    });
    fetchMetaStatus();
  };

  const removeExperiment = (idx) => {
    setExperimentLog((prev) => prev.filter((_, i) => i !== idx));
  };

  const clearExperimentLog = () => setExperimentLog([]);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => step(1), 300);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const spread = state.bestBid !== -1 && state.bestAsk !== -1 ? state.bestAsk - state.bestBid : null;
  const midPrice = state.bestBid !== -1 && state.bestAsk !== -1 ? (state.bestBid + state.bestAsk) / 2 : null;

  const bestBidVolume = state.bidDepth.length > 0 ? state.bidDepth[0][1] : 0;
  const bestAskVolume = state.askDepth.length > 0 ? state.askDepth[0][1] : 0;
  const imbalance = bestBidVolume + bestAskVolume > 0 ? bestBidVolume / (bestBidVolume + bestAskVolume) : null;

  const bidDepthLimited = state.bidDepth.slice(0, bidLevels);
  const askDepthLimited = state.askDepth.slice(0, askLevels);

  const asksWithVolume = askDepthLimited.map(([price, cum], idx) => {
    const prevCum = idx === 0 ? 0 : askDepthLimited[idx - 1][1];
    return { price, cum, volume: cum - prevCum };
  });
  const bidsWithVolume = bidDepthLimited.map(([price, cum], idx) => {
    const prevCum = idx === 0 ? 0 : bidDepthLimited[idx - 1][1];
    return { price, cum, volume: cum - prevCum };
  });
  const asksSorted = [...asksWithVolume].reverse();

  const bidChartData = [...bidDepthLimited].reverse().map(([price, cum]) => ({ price, bidCum: cum, askCum: null }));
  const askChartData = askDepthLimited.map(([price, cum]) => ({ price, bidCum: null, askCum: cum }));
  const chartData = [...bidChartData, ...askChartData];

  const volumeDistributionData = [...bidsWithVolume, ...asksSorted]
    .map((item) => ({ price: item.price, volume: item.volume, side: state.bidDepth.some(([p]) => p === item.price) ? "Bid" : "Ask" }))
    .sort((a, b) => a.price - b.price);

  const eventColor = (type) => ({ NewLimitOrder: "#2980b9", NewMarketOrder: "#e67e22", Cancel: "#7f8c8d", Metaorder: "#8e44ad" }[type] || "#333");
  const eventLabel = (type) => ({ NewLimitOrder: "LIMIT", NewMarketOrder: "MARKET", Cancel: "CANCEL", Metaorder: "META" }[type] || type);
  const imbalanceColor = imbalance === null ? "#888" : imbalance > 0.5 ? "#16a34a" : "#dc2626";

  const displayedPath = metaStatus.active ? metaStatus.path : metaStatus.lastCompleted?.path;
  const displayedDecisionPrice = metaStatus.active ? metaStatus.decisionPrice : metaStatus.lastCompleted?.decisionPrice;

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Consolas', monospace", background: "#f7f8fa", minHeight: "100vh", width: "100%", padding: "20px 24px", boxSizing: "border-box" }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 800, color: "#111827" }}>LOB Simulator</h1>
          <p style={{ margin: "2px 0 0", color: "#9ca3af", fontSize: "12px" }}>
            {modelType === "hawkes" ? "Hawkes self-exciting order flow" : "Santa Fe zero-intelligence order flow"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <Metric label="Mid-price" value={midPrice === null ? "—" : midPrice.toFixed(2)} />
          <Metric label="Spread" value={spread === null ? "—" : spread} />
          <Metric label="Imbalance" value={imbalance === null ? "—" : imbalance.toFixed(3)} color={imbalanceColor} />
        </div>
      </div>

      {/* CONTROL BAR */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", padding: "12px 16px" }}>
        <button
          onClick={() => setIsRunning(!isRunning)}
          style={{ background: isRunning ? "#dc2626" : "#16a34a", color: "white", fontWeight: 700, border: "none", padding: "8px 18px", borderRadius: "8px", cursor: "pointer" }}
        >
          {isRunning ? "■ Стоп" : "▶ Пуск"}
        </button>
        <button onClick={() => step(1)} style={btnStyle}>×1</button>
        <button onClick={() => step(20)} style={btnStyle}>×20</button>
        <button onClick={() => step(100)} style={btnStyle}>×100</button>
        <button onClick={reset} style={{ ...btnStyle, color: "#dc2626" }}>Reset</button>

        {metaStatus.active && (
          <div style={{ marginLeft: "8px", fontSize: "12px", color: "#8e44ad", fontWeight: 700 }}>
            ● Metaorder: {metaStatus.executed}/{metaStatus.total}
          </div>
        )}

        <div style={{ marginLeft: "auto", fontSize: "11px", color: "#9ca3af", textAlign: "right" }}>
          {avgLatency !== null && <div>avg latency {avgLatency.toFixed(1)}ms</div>}
          {latencyBreakdown && (
            <div>cpp {latencyBreakdown.cpp?.toFixed(2)}ms · ser {latencyBreakdown.serialization?.toFixed(2)}ms · net {latencyBreakdown.network?.toFixed(1)}ms</div>
          )}
        </div>
      </div>

      {/* MAIN GRID — 4 колонки */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 360px 320px minmax(360px, 1fr)", gap: "16px", alignItems: "start" }}>
        {/* COLUMN 1 — Metaorder + Модель потока + Видимость книги */}
        <div>
          <div style={{ ...card, background: "#fdf7ee", borderColor: "#f0d9a8" }}>
            <h3 style={{ ...sectionTitle, color: "#92600a" }}>Metaorder</h3>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <ModelToggle active={metaSide === "Buy"} onClick={() => setMetaSide("Buy")} label="Buy" accent="#16a34a" />
              <ModelToggle active={metaSide === "Sell"} onClick={() => setMetaSide("Sell")} label="Sell" accent="#dc2626" />
            </div>
            <Slider label="Объём Q" value={metaVolume} min={50} max={5000} step={50} isInt onChange={setMetaVolume} />
            <Slider label="Child-заявок N" value={metaChildren} min={1} max={100} step={1} isInt onChange={setMetaChildren} />
            <button
              onClick={startMetaorder}
              disabled={metaStatus.active}
              style={{ width: "100%", marginTop: "6px", background: metaStatus.active ? "#d1c4a8" : "#e67e22", color: "white", fontWeight: 700, border: "none", padding: "9px", borderRadius: "8px", cursor: metaStatus.active ? "default" : "pointer" }}
            >
              {metaStatus.active ? `Исполняется ${metaStatus.executed}/${metaStatus.total}...` : "▶ Запустить"}
            </button>
            <p style={{ fontSize: "10px", color: "#92600a", marginTop: "8px", marginBottom: 0 }}>
              По 1 child-заявке за Step. Жми Step/Пуск, чтобы продвигать исполнение.
            </p>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Модель потока</h3>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <ModelToggle active={modelType === "santa_fe"} onClick={() => { setModelType("santa_fe"); sendParams({ modelType: "santa_fe" }); }} label="Santa Fe" />
              <ModelToggle active={modelType === "hawkes"} onClick={() => { setModelType("hawkes"); sendParams({ modelType: "hawkes" }); }} label="Hawkes" />
            </div>

            {modelType === "santa_fe" ? (
              <>
                <Slider label="λ лимитки" value={lam} min={0.1} max={5} step={0.1} onChange={(v) => { setLam(v); sendParams({ lam: v }); }} />
                <Slider label="μ маркеты" value={mu} min={0.1} max={5} step={0.1} onChange={(v) => { setMu(v); sendParams({ mu: v }); }} />
                <Slider label="ν отмены" value={nu} min={0.1} max={5} step={0.1} onChange={(v) => { setNu(v); sendParams({ nu: v }); }} />
              </>
            ) : (
              <>
                <Slider label="φ₀ база" value={phi0} min={0.1} max={5} step={0.1} onChange={(v) => { setPhi0(v); sendParams({ phi0: v }); }} />
                <Slider label="g branching" value={branchingRatio} min={0.05} max={0.95} step={0.05} onChange={(v) => { setBranchingRatio(v); sendParams({ branchingRatio: v }); }} />
                <Slider label="ω decay" value={decayRate} min={0.1} max={5} step={0.1} onChange={(v) => { setDecayRate(v); sendParams({ decayRate: v }); }} />
              </>
            )}

            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #f0f0f0" }}>
              <Slider label="ρ память знака (DAR)" value={rho} min={0} max={0.95} step={0.05}
                onChange={(v) => { setRho(v); sendParams({ rho: v }); }} />
            </div>

            <div style={{ marginTop: "8px", paddingTop: "12px", borderTop: "1px solid #f0f0f0" }}>
              <RangeInputPair label="Цена" a={minPrice} b={maxPrice}
                onA={(v) => { setMinPrice(v); sendParams({ minPrice: v }); }}
                onB={(v) => { setMaxPrice(v); sendParams({ maxPrice: v }); }} />
              <RangeInputPair label="Объём" a={minVolume} b={maxVolume}
                onA={(v) => { setMinVolume(v); sendParams({ minVolume: v }); }}
                onB={(v) => { setMaxVolume(v); sendParams({ maxVolume: v }); }} />
            </div>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Видимость книги</h3>
            <Slider label="Bid levels" value={bidLevels} min={1} max={50} step={1} isInt onChange={setBidLevels} />
            <Slider label="Ask levels" value={askLevels} min={1} max={50} step={1} isInt onChange={setAskLevels} />
          </div>
        </div>

        {/* COLUMN 2 — Mid-price, Spread, Depth, Volume-by-level, Autocorrelation */}
        <div>
          <div style={card}>
            <h3 style={sectionTitle}>Mid-price</h3>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="mid" stroke="#2563eb" dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Spread &amp; MA(10)</h3>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis domain={[0, "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="spread" stroke="#d1d5db" dot={false} isAnimationActive={false} strokeWidth={1} />
                <Line type="monotone" dataKey="spreadMA" stroke="#e67e22" dot={false} isAnimationActive={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Depth (кумулятив)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="price" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="bidCum" stroke="#16a34a" fill="#16a34a" fillOpacity={0.25} connectNulls={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="askCum" stroke="#dc2626" fill="#dc2626" fillOpacity={0.25} connectNulls={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Объём по уровням</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={volumeDistributionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="price" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="volume" isAnimationActive={false}>
                  {volumeDistributionData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.side === "Bid" ? "#16a34a" : "#dc2626"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Автокорреляция знака сделок C(ℓ)</h3>
            {autocorrData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={autocorrData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="lag" scale="log" domain={["auto", "auto"]} type="number" label={{ value: "lag (log)", position: "insideBottom", offset: -5, fontSize: 10 }} />
                  <YAxis domain={["auto", "auto"]} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke="#e5e7eb" />
                  <Line type="monotone" dataKey="correlation" stroke="#dc2626" dot={false} isAnimationActive={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: "12px", color: "#9ca3af", fontSize: "12px" }}>Нужно больше исполненных market orders (двигай Step/Пуск)</div>
            )}
          </div>
        </div>

        {/* COLUMN 3 — Order Book + Order Flow */}
        <div>
          <div style={card}>
            <h3 style={sectionTitle}>Order Book</h3>
            <div style={{ maxHeight: "500px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "4px", color: "#9ca3af", fontWeight: 600 }}>Цена</th>
                    <th style={{ textAlign: "right", padding: "4px", color: "#9ca3af", fontWeight: 600 }}>Кол-во</th>
                    <th style={{ textAlign: "right", padding: "4px", color: "#9ca3af", fontWeight: 600 }}>Кумул.</th>
                  </tr>
                </thead>
                <tbody>
                  {asksSorted.map(({ price, cum, volume }) => (
                    <tr key={`ask-${price}`}>
                      <td style={{ padding: "3px 4px", color: "#dc2626", fontWeight: 700 }}>{price}</td>
                      <td style={{ padding: "3px 4px", textAlign: "right" }}>{volume}</td>
                      <td style={{ padding: "3px 4px", textAlign: "right", color: "#9ca3af" }}>{cum}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} style={{ padding: "6px", textAlign: "center", color: "#9ca3af", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb", fontSize: "11px" }}>
                      spread {spread === null ? "—" : spread}
                    </td>
                  </tr>
                  {bidsWithVolume.map(({ price, cum, volume }) => (
                    <tr key={`bid-${price}`}>
                      <td style={{ padding: "3px 4px", color: "#16a34a", fontWeight: 700 }}>{price}</td>
                      <td style={{ padding: "3px 4px", textAlign: "right" }}>{volume}</td>
                      <td style={{ padding: "3px 4px", textAlign: "right", color: "#9ca3af" }}>{cum}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Order Flow</h3>
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              {state.recentEvents.length === 0 && <div style={{ padding: "12px", color: "#9ca3af", fontSize: "12px" }}>Нет событий</div>}
              {state.recentEvents.map((e, idx) => (
                <div key={idx} style={{ padding: "6px 4px", borderBottom: "1px solid #f3f4f6", fontSize: "11px", display: "flex", justifyContent: "space-between", background: idx === 0 ? "#fffbea" : "transparent" }}>
                  <span style={{ color: eventColor(e.type), fontWeight: 700, width: "48px" }}>{eventLabel(e.type)}</span>
                  <span style={{ color: e.side === "Buy" ? "#16a34a" : "#dc2626", width: "36px" }}>{e.side}</span>
                  <span style={{ width: "40px", textAlign: "right" }}>{e.price > 0 ? e.price : "—"}</span>
                  <span style={{ width: "40px", textAlign: "right" }}>{e.volume > 0 ? e.volume : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COLUMN 4 — Impact Path + Square-root + Лог экспериментов */}
        <div>
          <div style={card}>
            <h3 style={sectionTitle}>Impact Path {metaStatus.active && <span style={{ color: "#8e44ad" }}>● live</span>}</h3>
            {displayedPath && displayedPath.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={displayedPath}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="step" label={{ value: "child #", position: "insideBottom", offset: -5, fontSize: 10 }} />
                    <YAxis domain={["auto", "auto"]} />
                    <Tooltip />
                    {displayedDecisionPrice != null && (
                      <ReferenceLine y={displayedDecisionPrice} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "decision", position: "insideTopLeft", fill: "#9ca3af", fontSize: 10 }} />
                    )}
                    <Line type="monotone" dataKey="mid" stroke="#8e44ad" dot={false} isAnimationActive={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
                {metaStatus.lastCompleted && !metaStatus.active && (
                  <div style={{ marginTop: "8px", fontSize: "11px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <span>decision <strong>{metaStatus.lastCompleted.decisionPrice?.toFixed(2)}</strong></span>
                    <span>final <strong>{metaStatus.lastCompleted.finalPrice?.toFixed(2)}</strong></span>
                    <span>
                      impact{" "}
                      <strong style={{ color: metaStatus.lastCompleted.impact >= 0 ? "#16a34a" : "#dc2626" }}>
                        {metaStatus.lastCompleted.impact >= 0 ? "+" : ""}{metaStatus.lastCompleted.impact?.toFixed(3)}
                      </strong>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: "12px", color: "#9ca3af", fontSize: "12px" }}>Запусти метаордер, чтобы увидеть impact path</div>
            )}
          </div>

          <div style={card}>
            <h3 style={sectionTitle}>Square-root law: |impact| vs √Q</h3>
            {experimentLog.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="sqrtQ"
                    type="number"
                    name="√Q"
                    domain={["auto", "auto"]}
                    label={{ value: "√Q", position: "insideBottom", offset: -5, fontSize: 10 }}
                  />
                  <YAxis dataKey="absImpact" type="number" name="|impact|" domain={["auto", "auto"]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter data={experimentLog} fill="#2563eb" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ padding: "12px", color: "#9ca3af", fontSize: "12px" }}>Нужно ≥2 эксперимента с разным Q</div>
            )}
          </div>

          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>Лог экспериментов</h3>
              {experimentLog.length > 0 && (
                <button onClick={clearExperimentLog} style={{ fontSize: "10px", color: "#9ca3af", background: "none", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "3px 8px", cursor: "pointer" }}>
                  очистить всё
                </button>
              )}
            </div>
            <div style={{ maxHeight: "260px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb", color: "#9ca3af" }}>
                    <th style={{ textAlign: "left", padding: "4px" }}>Q</th>
                    <th style={{ textAlign: "left", padding: "4px" }}>Side</th>
                    <th style={{ textAlign: "right", padding: "4px" }}>N</th>
                    <th style={{ textAlign: "right", padding: "4px" }}>Impact</th>
                    <th style={{ width: "22px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {experimentLog.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: "8px", color: "#9ca3af" }}>Пока нет запусков</td></tr>
                  )}
                  {experimentLog.map((exp, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "4px" }}>{exp.volume}</td>
                      <td style={{ padding: "4px", color: exp.side === "Buy" ? "#16a34a" : "#dc2626" }}>{exp.side}</td>
                      <td style={{ padding: "4px", textAlign: "right" }}>{exp.children}</td>
                      <td style={{ padding: "4px", textAlign: "right", fontWeight: 700 }}>{exp.impact?.toFixed(3)}</td>
                      <td style={{ padding: "4px" }}>
                        <button onClick={() => removeExperiment(idx)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: "13px", lineHeight: 1 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = { background: "white", border: "1px solid #e5e7eb", padding: "7px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, color: "#374151" };

function Metric({ label, value, color = "#111827" }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: "10px", color: "#9ca3af" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function ModelToggle({ active, onClick, label, accent = "#2563eb" }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "7px",
        borderRadius: "8px",
        border: active ? `2px solid ${accent}` : "1px solid #e5e7eb",
        background: active ? `${accent}14` : "white",
        color: active ? accent : "#6b7280",
        fontWeight: 700,
        cursor: "pointer",
        fontSize: "12px",
      }}
    >
      {label}
    </button>
  );
}

function Slider({ label, value, min, max, step, onChange, isInt = false }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6b7280", marginBottom: "2px" }}>
        <span>{label}</span>
        <strong style={{ color: "#111827" }}>{isInt ? value : value.toFixed(2)}</strong>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(isInt ? parseInt(e.target.value) : parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#2563eb" }}
      />
    </div>
  );
}

function RangeInputPair({ label, a, b, onA, onB }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "3px" }}>{label}: {a} — {b}</div>
      <div style={{ display: "flex", gap: "6px" }}>
        <input type="number" value={a} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) onA(v); }} style={inputStyle} />
        <input type="number" value={b} onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v)) onB(v); }} style={inputStyle} />
      </div>
    </div>
  );
}

const inputStyle = { width: "64px", padding: "4px", borderRadius: "6px", border: "1px solid #e5e7eb", fontSize: "11px" };