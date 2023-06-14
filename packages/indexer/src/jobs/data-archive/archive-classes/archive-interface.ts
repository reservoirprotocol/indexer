/**
 * In order to archive a table one need to write a class which implements this interface
 */
export interface ArchiveInterface {
  /**
   * Return a date string (YYYY-MM-DD HH:MM:SS) from which the next batch archive should start
   */
  getNextBatchStartTime(): Promise<string | null>;

  /**
   * Return a boolean response if there's more records to archive
   */
  continueArchive(): Promise<boolean>;

  /**
   * Return the table name to archive
   */
  getTableName(): string;

  /**
   * Return the max number of days for which we store records in the database for, anything older than that would be archived
   */
  getMaxAgeDay(): number;

  /**
   * Generate a JSON file from the records to archive
   * @param filename The JSON file name
   * @param startTime
   * @param endTime
   */
  generateJsonFile(filename: string, startTime: string, endTime: string): Promise<number>;

  /**
   * Delete records from the database table
   * @param startTime
   * @param endTime
   */
  deleteFromTable(startTime: string, endTime: string): Promise<void>;
}
