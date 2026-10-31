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
