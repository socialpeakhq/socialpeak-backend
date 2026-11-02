export type MetaPostInsightsData = {
  id: string;
  name: string;
  period: string;
  title: string;
  description: string;
  values: { value: number | Record<string, number> }[];
};

export type MetaPostInsightsResponse = {
  data: MetaPostInsightsData[];
};

export type TargetAnalyticsStatus =
  | 'value'
  | 'collecting'
  | 'unavailable'
  | 'not_published';

export type MetricBaseline = {
  typical: number;
  sample: number;
  compared_at_day: number;
};

export type MetricAnalytics = {
  metric: string;
  value: number;
  series: { date: string; value: number }[];
  baseline: MetricBaseline | null;
};

export type TargetAnalytics = {
  target_id: number;
  platform: string;
  status: TargetAnalyticsStatus;
  age_days: number | null;
  metrics: MetricAnalytics[];
};

export type SinglePostAnalyticsResponse = {
  post: {
    id: number;
    type: string;
    caption: string;
    media_urls: string[];
    published_at: Date | null;
  };
  period_days: number;
  targets: TargetAnalytics[];
};
