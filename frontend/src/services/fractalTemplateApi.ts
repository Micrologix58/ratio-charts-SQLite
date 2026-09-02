import type { FractalTemplate } from '../types/fractalTemplate';

interface FractalTemplateResponse {
    success: boolean;
    data: FractalTemplate[];
    error?: string;
}

interface SaveFractalTemplateResponse {
    success: boolean;
    data: FractalTemplate;
    error?: string;
}

export async function fetchFractalTemplates(): Promise<FractalTemplate[]> {
    const res = await fetch('/api/fractal-templates');

    if (!res.ok) {
        throw new Error(`Failed to fetch fractal templates: ${res.status}`);
    }

    const json: FractalTemplateResponse = await res.json();

    if (!json.success) {
        throw new Error(json.error || 'Fractal template request failed');
    }

    return json.data ?? [];
}

export async function saveFractalTemplate(template: FractalTemplate): Promise<FractalTemplate> {
    const res = await fetch('/api/fractal-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
    });

    if (!res.ok) {
        throw new Error(`Failed to save fractal template: ${res.status}`);
    }

    const json: SaveFractalTemplateResponse = await res.json();

    if (!json.success) {
        throw new Error(json.error || 'Save fractal template failed');
    }

    return json.data;
}

export async function deleteFractalTemplate(id: string): Promise<void> {
    const res = await fetch(`/api/fractal-templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });

    if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to delete fractal template: ${res.status}`);
    }
}
