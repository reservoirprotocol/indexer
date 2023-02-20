export abstract class BaseDataSource {
  public abstract getSequenceData(
    cursor: Record<string, unknown> | null,
    limit: number
  ): Promise<getSequenceDataResult>;
}

export type getSequenceDataResult = {
  data: Record<string, unknown>[];
  nextCursor: Record<string, unknown> | null;
};
