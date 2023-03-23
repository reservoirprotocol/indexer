export type DailyApiUsageEntityParams = {
  day: string;
  route: string;
  api_calls_count: number;
  status_code: number;
  points: number;
  api_key: string;
};

export class DailyApiUsageEntity {
  day: string;
  route: string;
  apiCallsCount: number;
  statusCode: number;
  points: number;
  apiKey: string;

  constructor(params: DailyApiUsageEntityParams) {
    this.day = params.day;
    this.route = params.route;
    this.apiCallsCount = params.api_calls_count;
    this.statusCode = params.status_code;
    this.points = params.points;
    this.apiKey = params.api_key;
  }
}
