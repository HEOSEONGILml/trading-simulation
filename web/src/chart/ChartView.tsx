import { useEffect, useRef, useState } from 'react';
import { dispose, init, type Chart, type DataLoaderSubscribeBarParams, type KLineData, type Period } from 'klinecharts';
import { aggregate, bucketStart, lastAggregated, TIMEFRAMES } from '../engine/aggregate.ts';
import { MINUTE, type Candle, type Fill } from '../engine/types.ts';
import type { Game } from '../game/game.ts';
import { formatNumber } from '../format.ts';
import type { ViewSettings } from '../settings.ts';
import { DrawingBar } from './DrawingBar.tsx';
import { registerExtensions, type FillMarkerData, type TradeLineData } from './overlays.ts';
import { chartStyles, COLORS } from './theme.ts';

const MAIN_PANE = 'candle_pane';
export const MAIN_INDICATORS = ['MA', 'EMA', 'BOLL', 'SAR'];
export const SUB_INDICATORS = ['VOL', 'MACD', 'RSI', 'KDJ', 'OBV', 'CCI', 'WR', 'DMI'];

export const PRICE_LINES = [
  { key: 'entry', label: '진입' },
  { key: 'takeProfit', label: '익절' },
  { key: 'stopLoss', label: '손절' },
  { key: 'liquidation', label: '청산가' },
  { key: 'orders', label: '지정가 주문' },
  { key: 'fills', label: 'B/S 마커' },
];

const TRADE_GROUP = 'trade';
const FILL_GROUP = 'fills';
const DRAWING_GROUP = 'drawings';

function toPeriod(minutes: number): Period {
  if (minutes >= 1440) return { type: 'day', span: minutes / 1440 };
  if (minutes >= 60) return { type: 'hour', span: minutes / 60 };
  return { type: 'minute', span: minutes };
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const toKLine = (c: Candle): KLineData => ({ timestamp: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });

const markerTime = (f: Fill) => (f.reason === 'market' || f.reason === 'round_end' ? f.time - MINUTE : f.time);

interface Props {
  game: Game;
  version: number;
  view: ViewSettings;
  onViewChange: (view: ViewSettings) => void;
  /** 모바일: 그리기 도구를 접어두고 가로 막대로 펼친다 */
  mobile?: boolean;
}

export function ChartView({ game, version, view, onViewChange, mobile = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const timeframeRef = useRef(view.timeframe);
  const subscriptionRef = useRef<DataLoaderSubscribeBarParams | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [magnet, setMagnet] = useState(false);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const [indicatorMenu, setIndicatorMenu] = useState(false);
  const [lineMenu, setLineMenu] = useState(false);
  const [chartVersion, setChartVersion] = useState(0);
  const [drawingOpen, setDrawingOpen] = useState(false);

  // 차트 생성
  useEffect(() => {
    registerExtensions();
    const chart = init(containerRef.current!, {
      locale: 'ko-KR',
      styles: chartStyles,
      formatter: {
        formatExtendText: () => {
          if (!game.exchange || game.phase === 'setup' || game.phase === 'loading') return '';
          const minutes = timeframeRef.current;
          const now = game.simTime();
          const end = bucketStart(now - 1, minutes) + minutes * MINUTE;
          return formatCountdown(((end - now) / MINUTE) * game.intervalMs);
        },
      },
    })!;
    chartRef.current = chart;
    chart.setOffsetRightDistance(mobile ? 40 : 80);
    // 모바일은 화면이 좁아 시고저종 정보는 차트를 누를 때만 표시
    if (mobile) chart.setStyles({ candle: { tooltip: { showRule: 'follow_cross' } } });
    chart.setDataLoader({
      getBars: ({ type, callback }) => {
        if (type !== 'init') return callback([], false);
        callback(aggregate(game.candles, timeframeRef.current).map(toKLine), false);
      },
      subscribeBar: (params) => {
        subscriptionRef.current = params;
      },
      unsubscribeBar: () => {
        subscriptionRef.current = null;
      },
    });

    const offCandle = game.onCandle(() => {
      const bar = lastAggregated(game.candles, timeframeRef.current);
      if (bar) subscriptionRef.current?.callback(toKLine(bar));
    });
    const offReset = game.onReset(() => {
      chart.removeOverlay({ groupId: DRAWING_GROUP });
      chart.removeOverlay({ groupId: TRADE_GROUP });
      chart.removeOverlay({ groupId: FILL_GROUP });
      chart.setSymbol({ ticker: `BTCUSDT-${game.round!.roundId}`, pricePrecision: game.round!.pricePrecision, volumePrecision: 3 });
      chart.resetData();
      setChartVersion((v) => v + 1);
    });

    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(containerRef.current!);

    if (game.round) {
      chart.setSymbol({ ticker: `BTCUSDT-${game.round.roundId}`, pricePrecision: game.round.pricePrecision, volumePrecision: 3 });
    }
    chart.setPeriod(toPeriod(timeframeRef.current));

    return () => {
      offCandle();
      offReset();
      resize.disconnect();
      dispose(chart);
      chartRef.current = null;
    };
  }, [game]);

  // 타임프레임
  useEffect(() => {
    timeframeRef.current = view.timeframe;
    chartRef.current?.setPeriod(toPeriod(view.timeframe));
    setChartVersion((v) => v + 1);
  }, [view.timeframe]);

  // 지표
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const name of MAIN_INDICATORS) {
      const exists = chart.getIndicators({ paneId: MAIN_PANE, name }).length > 0;
      const wanted = view.mainIndicators.includes(name);
      if (wanted && !exists) chart.createIndicator({ name, paneId: MAIN_PANE }, true);
      if (!wanted && exists) chart.removeIndicator({ paneId: MAIN_PANE, name });
    }
    for (const name of SUB_INDICATORS) {
      const existing = chart.getIndicators({ name }).filter((i) => i.paneId !== MAIN_PANE);
      const wanted = view.subIndicators.includes(name);
      if (wanted && existing.length === 0) chart.createIndicator(name);
      if (!wanted) existing.forEach((i) => chart.removeIndicator({ id: i.id }));
    }
  }, [view.mainIndicators, view.subIndicators]);

  // 포지션, 주문, 손절/익절 가격선
  useEffect(() => {
    const chart = chartRef.current;
    const ex = game.exchange;
    if (!chart) return;
    chart.removeOverlay({ groupId: TRADE_GROUP });
    const data = chart.getDataList();
    if (!ex || data.length === 0) return;
    const timestamp = data[data.length - 1].timestamp;
    const precision = game.round?.pricePrecision ?? 1;
    const lines: { value: number; data: TradeLineData }[] = [];
    const p = ex.position;
    const shown = (key: string) => !view.hiddenLines.includes(key);
    if (p) {
      const color = p.side === 'long' ? COLORS.up : COLORS.down;
      const pnl = ex.unrealizedPnl();
      if (shown('entry')) lines.push({
        value: p.entryPrice,
        data: {
          label: `${p.side === 'long' ? '롱' : '숏'} ${formatNumber(p.qty, 4)}  ${pnl >= 0 ? '+' : ''}${formatNumber(pnl)} USDT`,
          color,
          priceText: formatNumber(p.entryPrice, precision),
          dashed: false,
        },
      });
      const liq = ex.liquidationPrice();
      if (shown('liquidation') && liq && liq > 0) {
        lines.push({ value: liq, data: { label: '청산가', color: '#E8A33D', priceText: formatNumber(liq, precision), dashed: true } });
      }
      if (shown('takeProfit') && p.takeProfit !== null) {
        lines.push({ value: p.takeProfit, data: { label: '익절', color: COLORS.up, priceText: formatNumber(p.takeProfit, precision), dashed: true } });
      }
      if (shown('stopLoss') && p.stopLoss !== null) {
        lines.push({ value: p.stopLoss, data: { label: '손절', color: COLORS.down, priceText: formatNumber(p.stopLoss, precision), dashed: true } });
      }
    }
    for (const o of shown('orders') ? ex.orders : []) {
      const color = o.side === 'buy' ? COLORS.up : COLORS.down;
      lines.push({
        value: o.price,
        data: {
          label: `지정가 ${o.side === 'buy' ? '매수' : '매도'} ${formatNumber(o.qty, 4)}${o.reduceOnly ? ' (감소)' : ''}`,
          color,
          priceText: formatNumber(o.price, precision),
          dashed: true,
        },
      });
    }
    if (lines.length > 0) {
      chart.createOverlay(
        lines.map((l) => ({
          name: 'tradeLine',
          groupId: TRADE_GROUP,
          lock: true,
          zLevel: 10,
          points: [{ timestamp, value: l.value }],
          extendData: l.data,
        })),
      );
    }
  }, [game, version, chartVersion, view.hiddenLines]);

  // 체결 표시
  const fillCount = game.exchange?.fills.length ?? 0;
  useEffect(() => {
    const chart = chartRef.current;
    const ex = game.exchange;
    if (!chart) return;
    chart.removeOverlay({ groupId: FILL_GROUP });
    if (!ex || ex.fills.length === 0 || view.hiddenLines.includes('fills')) return;
    chart.createOverlay(
      ex.fills.map((f) => ({
        name: 'fillMarker',
        groupId: FILL_GROUP,
        lock: true,
        // 시장가 체결은 직전 캔들 종가 기준이므로 그 캔들에 표시
        points: [{ timestamp: bucketStart(markerTime(f), timeframeRef.current), value: f.price }],
        extendData: { side: f.side } satisfies FillMarkerData,
      })),
    );
  }, [game, fillCount, chartVersion, view.hiddenLines]);

  // 그리기
  const startDrawing = (name: string) => {
    const chart = chartRef.current;
    if (!chart) return;
    setActiveTool(name);
    setDrawingsHidden(false);
    chart.overrideOverlay({ groupId: DRAWING_GROUP, visible: true });
    chart.createOverlay({
      name,
      groupId: DRAWING_GROUP,
      mode: magnet ? 'weak_magnet' : 'normal',
      onDrawEnd: () => setActiveTool(null),
    });
  };

  const toggleHidden = () => {
    const next = !drawingsHidden;
    setDrawingsHidden(next);
    chartRef.current?.overrideOverlay({ groupId: DRAWING_GROUP, visible: !next });
  };

  const toggleIndicator = (kind: 'mainIndicators' | 'subIndicators', name: string) => {
    const list = view[kind];
    onViewChange({ ...view, [kind]: list.includes(name) ? list.filter((n) => n !== name) : [...list, name] });
  };

  const toggleLine = (key: string) => {
    const hidden = view.hiddenLines;
    onViewChange({ ...view, hiddenLines: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key] });
  };

  return (
    <div className={`chart-panel ${mobile ? 'mobile' : ''}`}>
      <div className="chart-toolbar">
        <div className="tf-scroll">
          {!mobile && <span className="toolbar-label">시간</span>}
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.minutes}
              className={`tf-btn ${view.timeframe === tf.minutes ? 'active' : ''}`}
              onClick={() => onViewChange({ ...view, timeframe: tf.minutes })}
            >
              {tf.label}
            </button>
          ))}
        </div>
        <div className="toolbar-sep" />
        <div className="dropdown">
          <button className={`tf-btn ${indicatorMenu ? 'active' : ''}`} onClick={() => setIndicatorMenu((v) => !v)}>
            지표 ▾
          </button>
          {indicatorMenu && (
            <div className="dropdown-menu" onMouseLeave={() => setIndicatorMenu(false)}>
              <div className="dropdown-title">메인 차트</div>
              {MAIN_INDICATORS.map((name) => (
                <label key={name} className="dropdown-item">
                  <input
                    type="checkbox"
                    checked={view.mainIndicators.includes(name)}
                    onChange={() => toggleIndicator('mainIndicators', name)}
                  />
                  {name}
                </label>
              ))}
              <div className="dropdown-title">보조 지표</div>
              {SUB_INDICATORS.map((name) => (
                <label key={name} className="dropdown-item">
                  <input
                    type="checkbox"
                    checked={view.subIndicators.includes(name)}
                    onChange={() => toggleIndicator('subIndicators', name)}
                  />
                  {name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="dropdown">
          <button className={`tf-btn ${lineMenu ? 'active' : ''}`} onClick={() => setLineMenu((v) => !v)}>
            표시 ▾
          </button>
          {lineMenu && (
            <div className="dropdown-menu" onMouseLeave={() => setLineMenu(false)}>
              {PRICE_LINES.map((l) => (
                <label key={l.key} className="dropdown-item">
                  <input type="checkbox" checked={!view.hiddenLines.includes(l.key)} onChange={() => toggleLine(l.key)} />
                  {l.label}
                </label>
              ))}
            </div>
          )}
        </div>
        {mobile && (
          <button className={`tf-btn ${drawingOpen ? 'active' : ''}`} onClick={() => setDrawingOpen((v) => !v)}>
            그리기
          </button>
        )}
      </div>
      <div className="chart-body">
        {(!mobile || drawingOpen) && (
          <DrawingBar
            horizontal={mobile}
            active={activeTool}
            magnet={magnet}
            hidden={drawingsHidden}
            onSelect={startDrawing}
            onToggleMagnet={() => setMagnet((m) => !m)}
            onToggleHidden={toggleHidden}
            onClear={() => chartRef.current?.removeOverlay({ groupId: DRAWING_GROUP })}
          />
        )}
        <div ref={containerRef} className="chart-container" />
      </div>
    </div>
  );
}
