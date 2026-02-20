<script lang="ts">
  import { onMount } from "svelte";
  import {
    appendRollingPoint,
    createLineSource,
    loadBokeh,
    type BokehNamespace,
  } from "../bokeh/runtime";
  import type { Sensor } from "../state/sensor.svelte";

  type PlotSeriesConfig = {
    key: string;
    sensor: Sensor | null;
    color?: string;
    lineWidth?: number;
    valueAccessor?: (sensor: Sensor) => number;
  };

  let {
    sensor = null,
    series = [],
    title = "Realtime Sensor Plot",
    maxPoints = 300,
    height = 280,
    xAxisLabel = "sample",
    yAxisLabel = "value",
    outputBackend = "webgl",
    defaultLineColor = "#2f7dd6",
  }: {
    sensor?: Sensor | null;
    series?: PlotSeriesConfig[];
    title?: string;
    maxPoints?: number;
    height?: number;
    xAxisLabel?: string;
    yAxisLabel?: string;
    outputBackend?: "canvas" | "webgl";
    defaultLineColor?: string;
  } = $props();

  const fallbackSeries = $derived(
    sensor
      ? [
          {
            key: "primary",
            sensor,
            color: defaultLineColor,
            lineWidth: 2,
          } satisfies PlotSeriesConfig,
        ]
      : []
  );

  const activeSeries = $derived(
    series.length > 0 ? series : (fallbackSeries as PlotSeriesConfig[])
  );

  let container = $state<HTMLDivElement | null>(null);
  let bokeh = $state<BokehNamespace | null>(null);
  let source = $state<any>(null);
  let plot = $state<any>(null);
  let bokehError = $state<string | null>(null);
  let disposed = false;
  const sourceByKey = new Map<string, any>();
  const rendererByKey = new Map<string, any>();
  const unsubscribeByKey = new Map<string, () => void>();
  const lastSeenUpdateByKey = new Map<string, number>();
  const sampleIndexByKey = new Map<string, number>();

  function detachAllSubscriptions() {
    for (const unsubscribe of unsubscribeByKey.values()) {
      unsubscribe();
    }
    unsubscribeByKey.clear();
  }

  function pruneRemovedSeries(configs: PlotSeriesConfig[]) {
    if (!plot) return;
    const activeKeys = new Set(configs.map((config) => config.key));

    for (const [key, renderer] of rendererByKey) {
      if (activeKeys.has(key)) continue;
      plot.renderers = plot.renderers.filter((r: any) => r !== renderer);
      rendererByKey.delete(key);
      sourceByKey.delete(key);
      lastSeenUpdateByKey.delete(key);
      sampleIndexByKey.delete(key);
    }
  }

  function ensureSeriesGlyphs(configs: PlotSeriesConfig[]) {
    if (!plot || !bokeh) return;

    pruneRemovedSeries(configs);

    for (const config of configs) {
      if (sourceByKey.has(config.key)) continue;

      const lineSource = createLineSource(bokeh);
      sourceByKey.set(config.key, lineSource);

      const renderer = plot.line(
        { field: "x" },
        { field: "y" },
        {
          source: lineSource,
          line_color: config.color ?? defaultLineColor,
          line_width: config.lineWidth ?? 2,
        }
      );
      rendererByKey.set(config.key, renderer);
    }
  }

  function pushSeriesPoint(config: PlotSeriesConfig, value: number) {
    const lineSource = sourceByKey.get(config.key);
    if (!lineSource) return;

    const nextIndex = sampleIndexByKey.get(config.key) ?? 0;
    appendRollingPoint(lineSource, nextIndex, value, maxPoints);
    sampleIndexByKey.set(config.key, nextIndex + 1);
  }

  function handleSeriesUpdate(config: PlotSeriesConfig, updatedSensor: Sensor) {
    const updatedMs = updatedSensor.lastUpdated.getTime();
    const previousMs = lastSeenUpdateByKey.get(config.key);
    if (previousMs !== undefined && updatedMs <= previousMs) return;
    lastSeenUpdateByKey.set(config.key, updatedMs);

    const value = config.valueAccessor
      ? config.valueAccessor(updatedSensor)
      : updatedSensor.value;
    pushSeriesPoint(config, value);
  }

  function syncSeriesSubscriptions(configs: PlotSeriesConfig[]) {
    detachAllSubscriptions();

    for (const config of configs) {
      if (!config.sensor || !sourceByKey.has(config.key)) continue;

      const listener = (updatedSensor: Sensor) => {
        handleSeriesUpdate(config, updatedSensor);
      };
      unsubscribeByKey.set(config.key, config.sensor.subscribe(listener));
      listener(config.sensor);
    }
  }

  onMount(() => {
    void (async () => {
      try {
        const loadedBokeh = await loadBokeh();
        if (disposed || !container || !loadedBokeh) return;

        bokeh = loadedBokeh;
        plot = loadedBokeh.Plotting.figure({
          tools: "pan,xwheel_zoom,box_zoom,reset,save",
          active_scroll: "xwheel_zoom",
          sizing_mode: "stretch_width",
          height,
          output_backend: outputBackend,
          x_axis_label: xAxisLabel,
          y_axis_label: yAxisLabel,
        });

        plot.toolbar.logo = null;

        const doc = new loadedBokeh.Document();
        doc.add_root(plot);
        loadedBokeh.embed.add_document_standalone(doc, container);

        source = sourceByKey;
      } catch (error) {
        bokehError = `BokehJS unavailable: ${String(error)}`;
      }
    })();

    return () => {
      disposed = true;
      if (container) {
        container.innerHTML = "";
      }
      detachAllSubscriptions();
      sourceByKey.clear();
      rendererByKey.clear();
      lastSeenUpdateByKey.clear();
      sampleIndexByKey.clear();
      source = null;
      plot = null;
      bokeh = null;
    };
  });

  // Lightweight wiring effect: only rebind when series identities change.
  $effect(() => {
    if (!plot || !bokeh) return;
    const configs = activeSeries;
    ensureSeriesGlyphs(configs);
    syncSeriesSubscriptions(configs);
    return () => {
      detachAllSubscriptions();
    };
  });
</script>

<div class="chart-card">
  <h3>{title}</h3>
  {#if bokehError}
    <div class="chart-error">{bokehError}</div>
  {:else}
    <div class="chart-container" bind:this={container}></div>
  {/if}
</div>

<style>
  .chart-card {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 15px;
    margin: 10px 0;
  }

  .chart-card h3 {
    margin: 0 0 12px 0;
  }

  .chart-container {
    width: 100%;
    min-height: 280px;
  }

  .chart-error {
    padding: 12px;
    background: #fff3e0;
    color: #8a4b00;
    border-radius: 4px;
    font-size: 0.9em;
  }
</style>
