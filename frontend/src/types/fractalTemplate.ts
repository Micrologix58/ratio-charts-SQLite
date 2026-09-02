export interface FractalTemplate {
    id: string;
    name: string;
    points: { x: number; y: number }[]; // relative path, x/y each 0..1, in draw order
}
