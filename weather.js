/* ===== Mini Feed · 今日卡片：所在地 / 当前时间 / 天气 =====
 * 数据来源（均免 Key、支持跨域）：
 *   1. https://ipwho.is/                      → IP 定位，取经纬度
 *   2. https://api.bigdatacloud.net/...       → 反向地理编码，取中文地名
 *   3. https://api.open-meteo.com/v1/forecast → 实时天气
 * 网络异常时读取本地缓存；完全不可用时展示占位与提示，不影响发布功能。
 */
(function () {
  "use strict";

  var CACHE_KEY = "minifeed.weather.v1";
  var GEO_KEY = "minifeed.geo.v1";
  var GEO_TTL = 12 * 60 * 60 * 1000; // 定位缓存 12 小时
  var WEATHER_TTL = 20 * 60 * 1000;  // 天气缓存 20 分钟

  /* WMO 天气代码 → [中文描述, 图标] */
  var WMO = {
    0: ["晴", "☀️"],
    1: ["晴间多云", "🌤️"],
    2: ["多云", "⛅"],
    3: ["阴", "☁️"],
    45: ["有雾", "🌫️"],
    48: ["雾凇", "🌫️"],
    51: ["毛毛雨", "🌦️"],
    53: ["毛毛雨", "🌦️"],
    55: ["毛毛雨", "🌦️"],
    56: ["冻毛毛雨", "🌧️"],
    57: ["冻毛毛雨", "🌧️"],
    61: ["小雨", "🌧️"],
    63: ["中雨", "🌧️"],
    65: ["大雨", "🌧️"],
    66: ["冻雨", "🌧️"],
    67: ["冻雨", "🌧️"],
    71: ["小雪", "🌨️"],
    73: ["中雪", "🌨️"],
    75: ["大雪", "❄️"],
    77: ["霰", "🌨️"],
    80: ["阵雨", "🌦️"],
    81: ["强阵雨", "🌧️"],
    82: ["暴雨", "⛈️"],
    85: ["阵雪", "🌨️"],
    86: ["强阵雪", "❄️"],
    95: ["雷阵雨", "⛈️"],
    96: ["雷阵雨伴冰雹", "⛈️"],
    99: ["雷阵雨伴冰雹", "⛈️"]
  };

  /* ---------- 本地缓存（localStorage 不可用时静默跳过） ---------- */

  function readJSON(key) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* 忽略：存储不可用不影响展示 */
    }
  }

  /* ---------- DOM ---------- */

  var card = document.getElementById("weather-card");
  var iconEl = document.getElementById("weather-icon");
  var tempEl = document.getElementById("weather-temp");
  var descEl = document.getElementById("weather-desc");
  var locationEl = document.getElementById("weather-location");
  var timeEl = document.getElementById("weather-time");
  var refreshBtn = document.getElementById("weather-refresh");

  if (!card || !timeEl) return;

  var loading = false;

  /* ---------- 时间 ---------- */

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function updateClock() {
    var d = new Date();
    var weeks = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    timeEl.textContent =
      (d.getMonth() + 1) + "月" + d.getDate() + "日 " +
      weeks[d.getDay()] + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  /* ---------- 网络请求（带超时） ---------- */

  function fetchJSON(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (typeof window.fetch !== "function") {
        reject(new Error("当前浏览器不支持网络请求"));
        return;
      }
      var ctrl = typeof window.AbortController === "function" ? new window.AbortController() : null;
      var timer = window.setTimeout(function () {
        if (ctrl) ctrl.abort();
        reject(new Error("请求超时"));
      }, timeoutMs || 9000);

      window.fetch(url, ctrl ? { signal: ctrl.signal } : {})
        .then(function (res) {
          window.clearTimeout(timer);
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(resolve)
        .catch(function (err) {
          window.clearTimeout(timer);
          reject(err);
        });
    });
  }

  /* ---------- 定位 ---------- */

  function localizePlace(geo) {
    var url = "https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=zh" +
      "&latitude=" + geo.lat + "&longitude=" + geo.lon;

    return fetchJSON(url, 7000)
      .then(function (res) {
        if (res && res.city) {
          geo.city = res.city;
          geo.region = res.principalSubdivision || geo.region;
          geo.country = res.countryName || geo.country;
        }
        return geo;
      })
      .catch(function () {
        return geo; // 反查失败时沿用英文地名
      });
  }

  function locate(skipCache) {
    var cached = readJSON(GEO_KEY);
    if (!skipCache && cached && typeof cached.lat === "number" && (Date.now() - cached.at) < GEO_TTL) {
      return Promise.resolve(cached);
    }
    return locateWithProvider(0).catch(function (err) {
      if (cached && typeof cached.lat === "number") return cached; // 位置缓存兜底
      throw err;
    });
  }

  /* 多源定位：主源被限流时自动切换备源 */
  var GEO_PROVIDERS = [
    {
      name: "ipinfo.io",
      url: "https://ipinfo.io/json",
      parse: function (d) {
        if (!d || typeof d.loc !== "string") return null;
        var parts = d.loc.split(",");
        if (parts.length !== 2) return null;
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) return null;
        return { lat: lat, lon: lon, city: d.city || "", region: d.region || "", country: d.country || "" };
      }
    },
    {
      name: "ipwho.is",
      url: "https://ipwho.is/",
      parse: function (d) {
        if (!d || d.success === false || typeof d.latitude !== "number") return null;
        return {
          lat: d.latitude,
          lon: d.longitude,
          city: d.city || "",
          region: d.region || "",
          country: d.country || ""
        };
      }
    }
  ];

  function locateWithProvider(index) {
    if (index >= GEO_PROVIDERS.length) {
      return Promise.reject(new Error("定位服务暂不可用"));
    }
    var provider = GEO_PROVIDERS[index];

    return fetchJSON(provider.url, 6000)
      .then(function (data) {
        var geo = provider.parse(data);
        if (!geo) throw new Error("返回数据异常");
        geo.at = Date.now();
        return localizePlace(geo).then(function (g) {
          writeJSON(GEO_KEY, g);
          return g;
        });
      })
      .catch(function (err) {
        console.warn("[Mini Feed] 定位源 " + provider.name + " 失败：", err && err.message);
        return locateWithProvider(index + 1);
      });
  }

  /* ---------- 天气 ---------- */

  function fetchWeather(geo) {
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + geo.lat +
      "&longitude=" + geo.lon +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code" +
      "&timezone=auto";

    return fetchJSON(url, 9000).then(function (res) {
      if (!res || !res.current || typeof res.current.temperature_2m !== "number") {
        throw new Error("天气数据异常");
      }
      var c = res.current;
      return {
        temp: Math.round(c.temperature_2m),
        feels: Math.round(c.apparent_temperature),
        humidity: c.relative_humidity_2m,
        code: c.weather_code,
        city: geo.city,
        region: geo.region,
        country: geo.country,
        updatedAt: Date.now()
      };
    });
  }

  /* ---------- 渲染 ---------- */

  function placeText(city, region) {
    if (city && region && city !== region) return "📍 " + city + " · " + region;
    if (city) return "📍 " + city;
    return "📍 位置未知";
  }

  function render(data, isCached) {
    var wmo = WMO[data.code] || ["未知天气", "🌡️"];

    iconEl.textContent = wmo[1];
    tempEl.textContent = data.temp + "°";
    descEl.textContent = wmo[0] +
      " · 体感 " + data.feels + "°" +
      (typeof data.humidity === "number" ? " · 湿度 " + data.humidity + "%" : "");

    locationEl.textContent = placeText(data.city, data.region);

    var stamp = new Date(data.updatedAt);
    descEl.title = (isCached ? "缓存数据，更新于 " : "更新于 ") +
      pad(stamp.getHours()) + ":" + pad(stamp.getMinutes());

    card.classList.remove("is-loading", "is-error");
  }

  function renderLoading() {
    card.classList.add("is-loading");
    card.classList.remove("is-error");
    descEl.textContent = "天气刷新中…";
  }

  function renderError(message) {
    card.classList.remove("is-loading");
    card.classList.add("is-error");
    if (tempEl.textContent === "--°") {
      iconEl.textContent = "🌡️";
      descEl.textContent = "天气暂不可用，点右上角重试";
    } else {
      descEl.textContent = "刷新失败，显示上次数据";
    }
    descEl.title = message || "";
    if (locationEl.textContent === "📍 定位中…") {
      locationEl.textContent = "📍 位置未知";
    }
  }

  /* ---------- 刷新流程 ---------- */

  function refresh(force) {
    if (loading) return;
    loading = true;
    refreshBtn.classList.add("is-spinning");

    if (force) renderLoading();

    locate(!!force)
      .then(function (geo) {
        return fetchWeather(geo).then(function (data) {
          writeJSON(CACHE_KEY, data);
          render(data, false);
        });
      })
      .catch(function (err) {
        console.warn("[Mini Feed] 天气加载失败：", err && err.message);
        var cached = readJSON(CACHE_KEY);
        if (cached && typeof cached.temp === "number") {
          render(cached, true);
          descEl.textContent += "（离线缓存）";
        } else {
          renderError(err && err.message);
        }
      })
      .then(function () {
        loading = false;
        refreshBtn.classList.remove("is-spinning");
      });
  }

  /* ---------- 启动 ---------- */

  updateClock();
  window.setInterval(updateClock, 1000);

  var cachedWeather = readJSON(CACHE_KEY);
  if (cachedWeather && typeof cachedWeather.temp === "number") {
    render(cachedWeather, true);
  }

  refreshBtn.addEventListener("click", function () {
    refresh(true);
  });

  if (!cachedWeather || (Date.now() - cachedWeather.updatedAt) > WEATHER_TTL) {
    refresh(false);
  }
})();
