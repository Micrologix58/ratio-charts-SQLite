export type AnnotationTool = 'select' | 'trendline' | 'rectangle' | 'horizontalline' | 'fibonacci';
export type AnnotationType = 'trendline' | 'rectangle' | 'horizontalline' | 'fibonacci';

export interface ChartKey {
    mode: 'R' | 'S';
    timeframe: 'D' | 'W' | 'M';
    symbol?: string;
    expression?: string;
}

export interface TimePricePoint {
    time: string;
    price: number;
}

export interface AnnotationStyle {
    color: string;
    lineWidth: number;
    lineStyle: 'solid' | 'dashed' | 'dotted';
    extendLeft?: boolean;
    extendRight?: boolean;
}

export interface TrendlineAnnotation {
    id: string;
    type: 'trendline';
    chartKey: ChartKey;
    points: [TimePricePoint, TimePricePoint];
    style: AnnotationStyle;
    locked?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface RectangleAnnotation {
    id: string;
    type: 'rectangle';
    chartKey: ChartKey;
    points: [TimePricePoint, TimePricePoint]; // opposite corners, in either order
    style: AnnotationStyle;
    locked?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface HorizontalLineAnnotation {
    id: string;
    type: 'horizontalline';
    chartKey: ChartKey;
    points: [TimePricePoint, TimePricePoint]; // both carry the same price; time values are cosmetic
    style: AnnotationStyle;
    locked?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface FibonacciAnnotation {
    id: string;
    type: 'fibonacci';
    chartKey: ChartKey;
    points: [TimePricePoint, TimePricePoint]; // anchor 1 = 0% level, anchor 2 = 100% level
    style: AnnotationStyle;
    locked?: boolean;
    createdAt: string;
    updatedAt: string;
}

export type Annotation = TrendlineAnnotation | RectangleAnnotation | HorizontalLineAnnotation | FibonacciAnnotation;

export interface AnnotationResponse {
    success: boolean;
    data: Annotation[];
    error?: string;
    message?: string;
}
