/**
 * WMO 天气代码 → 中文描述 + 图标。
 * 代码含义见 Open-Meteo 文档（WMO Weather interpretation codes）。
 */

const CODES = {
  0: { icon: '☀️', label: '晴' },
  1: { icon: '🌤️', label: '大部晴朗' },
  2: { icon: '⛅', label: '多云' },
  3: { icon: '☁️', label: '阴' },
  45: { icon: '🌫️', label: '有雾' },
  48: { icon: '🌫️', label: '雾凇' },
  51: { icon: '🌦️', label: '毛毛雨' },
  53: { icon: '🌦️', label: '小雨' },
  55: { icon: '🌧️', label: '中雨' },
  56: { icon: '🌧️', label: '冻毛毛雨' },
  57: { icon: '🌧️', label: '冻雨' },
  61: { icon: '🌦️', label: '小雨' },
  63: { icon: '🌧️', label: '中雨' },
  65: { icon: '🌧️', label: '大雨' },
  66: { icon: '🌧️', label: '冻雨' },
  67: { icon: '🌧️', label: '强冻雨' },
  71: { icon: '🌨️', label: '小雪' },
  73: { icon: '🌨️', label: '中雪' },
  75: { icon: '❄️', label: '大雪' },
  77: { icon: '❄️', label: '米雪' },
  80: { icon: '🌦️', label: '阵雨' },
  81: { icon: '🌧️', label: '强阵雨' },
  82: { icon: '⛈️', label: '暴雨' },
  85: { icon: '🌨️', label: '阵雪' },
  86: { icon: '❄️', label: '强阵雪' },
  95: { icon: '⛈️', label: '雷阵雨' },
  96: { icon: '⛈️', label: '雷阵雨伴冰雹' },
  99: { icon: '⛈️', label: '雷暴伴冰雹' }
}

const UNKNOWN = { icon: '🌡️', label: '未知天气' }

export function describeWeather(code) {
  if (code === null || code === undefined) return UNKNOWN
  return CODES[code] || UNKNOWN
}
