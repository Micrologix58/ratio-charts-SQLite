export type AnnotationTool = 'select' | 'trendline';
export type AnnotationType = 'trendline';

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

export type Annotation = TrendlineAnnotation;

export interface AnnotationResponse {
    success: boolean;
    data: Annotation[];
    error?: string;
    message?: string;
}
