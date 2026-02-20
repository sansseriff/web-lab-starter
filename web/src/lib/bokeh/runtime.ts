export type BokehNamespace = any;

declare global {
  interface Window {
    Bokeh?: BokehNamespace;
  }
}

export const REQUIRED_BOKEH_FILES = [
  "bokeh-3.8.2.min.js",
  "bokeh-gl-3.8.2.min.js",
  "bokeh-widgets-3.8.2.min.js",
  "bokeh-tables-3.8.2.min.js",
  "bokeh-mathjax-3.8.2.min.js",
  "bokeh-api-3.8.2.min.js",
];

const scriptPromises = new Map<string, Promise<void>>();
let bokehPromise: Promise<BokehNamespace> | null = null;

export function getBokehAssetBases(): string[] {
  const { protocol, hostname, port } = window.location;
  const currentBase = `${protocol}//${hostname}${port ? `:${port}` : ""}/assets`;
  const bases = [currentBase];

  const isViteDevPort = port === "5173" || port === "4173";
  if (isViteDevPort) {
    bases.push("http://localhost:8000/assets");
  }
  return bases;
}

export function loadScriptOnce(src: string): Promise<void> {
  const existing = scriptPromises.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const current = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (current) {
      if ((current as any).__loaded) {
        resolve();
        return;
      }
      current.addEventListener("load", () => resolve(), { once: true });
      current.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      (script as any).__loaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

export async function loadBokeh(): Promise<BokehNamespace> {
  if (window.Bokeh?.ColumnDataSource && window.Bokeh?.Plotting) {
    return window.Bokeh;
  }

  if (!bokehPromise) {
    bokehPromise = (async () => {
      let lastError: unknown = null;
      for (const base of getBokehAssetBases()) {
        try {
          for (const file of REQUIRED_BOKEH_FILES) {
            await loadScriptOnce(`${base}/${file}`);
          }

          const Bokeh = window.Bokeh;
          if (!Bokeh?.ColumnDataSource || !Bokeh?.Plotting) {
            throw new Error("Bokeh namespace is missing required constructors");
          }
          return Bokeh;
        } catch (error) {
          lastError = error;
        }
      }

      throw (
        lastError ?? new Error("Unable to load BokehJS from known asset locations")
      );
    })();
  }

  return bokehPromise;
}

export function createLineSource(Bokeh: BokehNamespace): any {
  return new Bokeh.ColumnDataSource({
    data: { x: [], y: [] },
  });
}

export function appendRollingPoint(
  source: any,
  x: number,
  y: number,
  maxPoints: number
): void {
  source.data.x.push(x);
  source.data.y.push(y);

  while (source.data.x.length > maxPoints) {
    source.data.x.shift();
    source.data.y.shift();
  }

  source.change.emit();
}
