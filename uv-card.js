const VERSION = "0.1.0";

const LEVELS = [
  { max: 2, label: "Low", color: "#289500" },
  { max: 5, label: "Moderate", color: "#F7E400" },
  { max: 7, label: "High", color: "#F85900" },
  { max: 10, label: "Very high", color: "#D8001D" },
  { max: Infinity, label: "Extreme", color: "#6B49C8" },
];

const levelFor = (uv) => LEVELS.find((l) => Math.round(uv) <= l.max);
const hhmm = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const HOUR = 3600000;

class UvCard extends HTMLElement {
  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { filter: { domain: "sensor" } } } },
        { name: "forecast_entity", selector: { entity: { filter: { domain: "sensor" } } } },
        {
          type: "grid",
          name: "",
          schema: [
            { name: "name", selector: { text: {} } },
            {
              name: "threshold",
              selector: { number: { min: 0, max: 11, step: 0.5, mode: "box" } },
            },
          ],
        },
      ],
      computeLabel: (s) =>
        ({
          entity: "Current UV sensor",
          forecast_entity: "Forecast sensor (optional)",
          name: "Title",
          threshold: "Protection threshold",
        })[s.name],
      computeHelper: (s) =>
        ({
          forecast_entity: "Sensor with 'time' and 'uv_index' list attributes, e.g. the Open-Meteo REST sensor",
          threshold: "UV level at which protection is advised. WHO guidance is 3",
        })[s.name],
    };
  }

  static getStubConfig(hass) {
    const ids = hass ? Object.keys(hass.states) : [];
    const uv = ids.filter((id) => id.startsWith("sensor.") && id.includes("uv"));
    return {
      entity: uv.find((id) => !id.includes("forecast")) || "",
      forecast_entity: uv.find((id) => id.includes("forecast")) || "",
    };
  }

  setConfig(config) {
    if (!config.entity) throw new Error("You need to define an entity");
    this._config = { ...config, threshold: config.threshold ?? 3 };
    this._dirty = true;
  }

  set hass(hass) {
    const cur = hass.states[this._config.entity];
    const fc = this._config.forecast_entity
      ? hass.states[this._config.forecast_entity]
      : undefined;

    // HA replaces a state object when it changes, so a reference check is enough
    if (!this._dirty && cur === this._cur && fc === this._fc) return;
    this._dirty = false;
    this._cur = cur;
    this._fc = fc;
    this._render();
  }

  connectedCallback() {
    // Keeps the "now" marker and today/tomorrow switch moving between sensor updates
    this._timer = setInterval(() => {
      if (this._config) this._render();
    }, 5 * 60 * 1000);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _build() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 16px; }
        .title { color: var(--secondary-text-color); font-size: 0.9rem; }
        .value { font-size: 3rem; font-weight: 700; color: var(--primary-text-color); line-height: 1.2; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 8px; color: #000; }
        .forecast { margin-top: 16px; }
        .summary { color: var(--primary-text-color); }
        .advice { color: var(--secondary-text-color); font-size: 0.9rem; margin: 2px 0 10px; }
        .bars { display: flex; gap: 3px; }
        .col { flex: 1; display: flex; flex-direction: column; }
        .bar-wrap { height: 60px; display: flex; align-items: flex-end; }
        .bar { width: 100%; border-radius: 3px 3px 0 0; }
        .hour { font-size: 0.65rem; text-align: center; color: var(--secondary-text-color); margin-top: 4px; }
        .col.now .bar { outline: 2px solid var(--primary-text-color); outline-offset: 1px; }
        .col.now .hour { color: var(--primary-text-color); font-weight: 700; }
      </style>
      <ha-card>
        <div class="title"></div>
        <div class="value"></div>
        <div class="badge"></div>
        <div class="forecast"></div>
      </ha-card>`;
  }

  _render() {
    if (!this.shadowRoot) this._build();
    const $ = (s) => this.shadowRoot.querySelector(s);

    $(".title").textContent = this._config.name || "UV Index";

    const uv = this._cur ? parseFloat(this._cur.state) : NaN;
    if (isNaN(uv)) {
      $(".value").textContent = "--";
      $(".badge").textContent = this._cur ? this._cur.state : "Entity not found";
      $(".badge").style.background = "var(--disabled-color, #999)";
    } else {
      const lvl = levelFor(uv);
      $(".value").textContent = uv.toFixed(1);
      $(".badge").textContent = lvl.label;
      $(".badge").style.background = lvl.color;
    }

    this._renderForecast($(".forecast"));
  }

  _renderForecast(el) {
    const a = this._fc?.attributes;
    if (!a || !Array.isArray(a.time) || !Array.isArray(a.uv_index)) {
      el.hidden = true;
      return;
    }
    el.hidden = false;

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const points = a.time.map((t, i) => ({
      date: new Date(t),
      uv: Number(a.uv_index[i]) || 0,
    }));
    const onDay = (d) => points.filter((p) => p.date.toDateString() === d.toDateString());

    const today = onDay(now);
    const tmr = onDay(tomorrow);
    const uvLeftToday = today.some((p) => p.date.getTime() + HOUR > now && p.uv > 0);
    const showTomorrow = !uvLeftToday && tmr.length > 0;
    const day = showTomorrow ? tmr : today;
    const dayLabel = showTomorrow ? "Tomorrow" : "Today";

    const first = day.findIndex((p) => p.uv > 0);
    if (first === -1) {
      el.innerHTML = `<div class="summary">${dayLabel}: no UV expected</div>`;
      return;
    }
    let last = day.length - 1;
    while (day[last].uv <= 0) last--;
    const slice = day.slice(Math.max(0, first - 1), last + 2);

    const peak = slice.reduce((m, p) => (p.uv > m.uv ? p : m));
    const t = this._config.threshold;
    const above = slice.filter((p) => p.uv >= t);
    const advice = above.length
      ? `Protection needed ${hhmm(above[0].date)} to ${hhmm(new Date(above[above.length - 1].date.getTime() + HOUR))}`
      : "No protection needed";

    // Scale floor stops a low winter peak filling the chart
    const scale = Math.max(peak.uv, t * 2);
    const bars = slice
      .map((p) => {
        const isNow = !showTomorrow && p.date <= now && now - p.date < HOUR;
        const height = Math.max(2, (p.uv / scale) * 100);
        const color = p.uv > 0 ? levelFor(p.uv).color : "var(--divider-color)";
        return `
          <div class="col${isNow ? " now" : ""}" title="${hhmm(p.date)}: ${p.uv.toFixed(2)}">
            <div class="bar-wrap"><div class="bar" style="height:${height}%;background:${color}"></div></div>
            <div class="hour">${p.date.getHours()}</div>
          </div>`;
      })
      .join("");

    el.innerHTML = `
      <div class="summary">${dayLabel}: peak <strong>${peak.uv.toFixed(1)}</strong> at ${hhmm(peak.date)}</div>
      <div class="advice">${advice}</div>
      <div class="bars">${bars}</div>`;
  }

  getCardSize() {
    return this._config?.forecast_entity ? 4 : 2;
  }
}

customElements.define("uv-card", UvCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "uv-card", name: "UV Card", description: "UV index with hourly forecast" });

console.info(`%c UV-CARD %c v${VERSION} `, "background:#F85900;color:#000", "background:#333;color:#fff");
