# UV Card

A Home Assistant dashboard card that shows the current UV index and an hourly forecast.

## Installation

1. Copy `uv-card.js` to `/config/www/`.
2. Go to Settings > Dashboards > Resources and add `/local/uv-card.js` as a JavaScript module.

## Data source

The card works with any numeric UV sensor. The forecast needs a sensor with `time` and `uv_index` list attributes.

[`examples/open-meteo.yaml`](examples/open-meteo.yaml) creates both from Open-Meteo. No API key needed.

## Configuration

The card can be configured in the UI or in YAML.

```yaml
type: custom:uv-card
entity: sensor.uv_index
forecast_entity: sensor.uv_forecast
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `entity` | Yes | | Current UV sensor |
| `forecast_entity` | No | | Hourly forecast sensor |
| `name` | No | `UV Index` | Card title |
| `threshold` | No | `3` | UV level at which protection is advised |

## UV levels

| UV index | Level |
| --- | --- |
| 0 to 2 | Low |
| 3 to 5 | Moderate |
| 6 to 7 | High |
| 8 to 10 | Very high |
| 11+ | Extreme |
