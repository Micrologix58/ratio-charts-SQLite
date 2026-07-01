import type { Annotation, AnnotationResponse, ChartKey } from '../types/annotations';

interface SaveAnnotationResponse {
    success: boolean;
    data: Annotation;
    error?: string;
}

export async function fetchAnnotations(chartKey?: ChartKey): Promise<Annotation[]> {
    const url = new URL('/api/annotations', window.location.origin);

    if (chartKey) {
        if (chartKey.mode)      url.searchParams.set('mode',      chartKey.mode.toUpperCase());
        if (chartKey.timeframe) url.searchParams.set('timeframe', chartKey.timeframe.toUpperCase());
        if (chartKey.symbol)    url.searchParams.set('symbol',    chartKey.symbol.toUpperCase().trim());
        if (chartKey.expression) url.searchParams.set('expression', chartKey.expression.toUpperCase().trim());
    }

    const res = await fetch(url.pathname + url.search);

    if (!res.ok) {
        throw new Error(`Failed to fetch annotations: ${res.status}`);
    }

    const json: AnnotationResponse = await res.json();

    if (!json.success) {
        throw new Error(json.error || 'Annotation request failed');
    }

    return json.data ?? [];
}

export async function saveAnnotation(annotation: Annotation): Promise<Annotation> {
    const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annotation),
    });

    if (!res.ok) {
        throw new Error(`Failed to save annotation: ${res.status}`);
    }

    const json: SaveAnnotationResponse = await res.json();

    if (!json.success) {
        throw new Error(json.error || 'Save annotation failed');
    }

    return json.data;
}

export async function deleteAnnotation(id: string): Promise<void> {
    const res = await fetch(`/api/annotations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });

    if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to delete annotation: ${res.status}`);
    }
}
