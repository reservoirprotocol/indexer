import { MetadataStatus } from "@/models/metadata-status";

export class MetadataReenabledEvent {
  public static async handleEvent(message: string) {
    const parsedMessage = JSON.parse(message);
    for (const id of parsedMessage.ids) {
      delete MetadataStatus.disabled[id];
    }
  }
}
