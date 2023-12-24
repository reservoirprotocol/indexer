// A unique ID that identify the current machine for the time it lives
import { randomUUID } from "crypto";

const machineId = randomUUID();

export function getMachineId() {
  return machineId;
}
