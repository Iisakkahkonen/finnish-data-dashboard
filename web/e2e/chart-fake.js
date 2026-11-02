export const registerables = [];
export class Chart {
  static register() {}
  constructor(canvas, config) { this.config = config; this.plugins = config.plugins || []; this.ctx = canvas.getContext("2d"); (window.__charts ||= []).push(config); }
  destroy() {}
  getDatasetMeta() { return { data: [] }; }
}
